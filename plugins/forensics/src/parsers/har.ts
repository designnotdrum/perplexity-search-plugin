import { ParsedCapture, ParsedEndpoint } from './types';

interface HarHeader {
  name: string;
  value: string;
}

interface HarQueryParam {
  name: string;
  value: string;
}

interface HarEntry {
  request: {
    method: string;
    url: string;
    headers: HarHeader[];
    queryString: HarQueryParam[];
    postData?: {
      mimeType?: string;
      text?: string;
    };
  };
  response: {
    status: number;
    content: {
      mimeType?: string;
      text?: string;
    };
    headers: HarHeader[];
  };
  timings?: {
    wait: number;
    receive: number;
  };
}

interface HarLog {
  log: {
    entries: HarEntry[];
  };
}

export class HarParser {
  parse(harContent: string): ParsedCapture {
    let har: HarLog;

    try {
      har = JSON.parse(harContent);
    } catch {
      throw new Error('Invalid HAR content: failed to parse JSON');
    }

    if (!har.log || !Array.isArray(har.log.entries)) {
      throw new Error('Invalid HAR format: missing log.entries');
    }

    const endpoints = har.log.entries.map((entry) => this.parseEntry(entry));
    const authPatterns = this.detectAuthPatterns(har.log.entries);
    const baseUrl = this.extractBaseUrl(endpoints);
    const summary = this.generateSummary(endpoints, baseUrl);

    return {
      source: 'har',
      endpoints,
      authPatterns,
      baseUrl,
      summary,
    };
  }

  private parseEntry(entry: HarEntry): ParsedEndpoint {
    const url = new URL(entry.request.url);
    const headers = this.headersToObject(entry.request.headers);
    const queryParams = this.queryParamsToObject(entry.request.queryString);

    const endpoint: ParsedEndpoint = {
      method: entry.request.method,
      url: entry.request.url,
      path: url.pathname,
      queryParams,
      headers,
      responseStatus: entry.response.status,
    };

    // Parse request body
    if (entry.request.postData?.text) {
      endpoint.requestBody = this.parseBody(
        entry.request.postData.text,
        entry.request.postData.mimeType
      );
    }

    // Parse response body
    if (entry.response.content?.text) {
      endpoint.responseBody = this.parseBody(
        entry.response.content.text,
        entry.response.content.mimeType
      );
    }

    // Extract content type from response
    if (entry.response.content?.mimeType) {
      endpoint.contentType = entry.response.content.mimeType;
    }

    // Extract timing
    if (entry.timings) {
      const wait = entry.timings.wait || 0;
      const receive = entry.timings.receive || 0;
      endpoint.timing = {
        wait,
        receive,
        total: wait + receive,
      };
    }

    return endpoint;
  }

  private headersToObject(headers: HarHeader[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (const header of headers || []) {
      result[header.name] = header.value;
    }
    return result;
  }

  private queryParamsToObject(params: HarQueryParam[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (const param of params || []) {
      result[param.name] = param.value;
    }
    return result;
  }

  private parseBody(text: string, mimeType?: string): unknown {
    if (!text) return undefined;

    // Try to parse as JSON if it looks like JSON
    if (mimeType?.includes('json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }

    return text;
  }

  private detectAuthPatterns(
    entries: HarEntry[]
  ): ParsedCapture['authPatterns'] {
    const patterns: ParsedCapture['authPatterns'] = [];
    const seenPatterns = new Set<string>();

    for (const entry of entries) {
      // Check headers for auth patterns
      for (const header of entry.request.headers || []) {
        const headerName = header.name.toLowerCase();
        const value = header.value;

        // Bearer token
        if (headerName === 'authorization' && value.startsWith('Bearer ')) {
          const key = 'bearer-header-Authorization';
          if (!seenPatterns.has(key)) {
            seenPatterns.add(key);
            patterns.push({
              type: 'bearer',
              location: 'header',
              headerName: 'Authorization',
            });
          }
        }

        // Basic auth
        if (headerName === 'authorization' && value.startsWith('Basic ')) {
          const key = 'basic-header-Authorization';
          if (!seenPatterns.has(key)) {
            seenPatterns.add(key);
            patterns.push({
              type: 'basic',
              location: 'header',
              headerName: 'Authorization',
            });
          }
        }

        // API Key in header
        if (
          headerName.includes('api-key') ||
          headerName.includes('apikey') ||
          headerName === 'x-api-key'
        ) {
          const key = `api-key-header-${header.name}`;
          if (!seenPatterns.has(key)) {
            seenPatterns.add(key);
            patterns.push({
              type: 'api-key',
              location: 'header',
              headerName: header.name,
            });
          }
        }

        // Cookie
        if (headerName === 'cookie') {
          const key = 'cookie-header-Cookie';
          if (!seenPatterns.has(key)) {
            seenPatterns.add(key);
            patterns.push({
              type: 'cookie',
              location: 'header',
              headerName: 'Cookie',
            });
          }
        }
      }

      // Check query params for auth patterns
      for (const param of entry.request.queryString || []) {
        const paramName = param.name.toLowerCase();
        if (
          paramName.includes('api_key') ||
          paramName.includes('apikey') ||
          paramName === 'key' ||
          paramName === 'token' ||
          paramName === 'access_token'
        ) {
          const key = `api-key-query`;
          if (!seenPatterns.has(key)) {
            seenPatterns.add(key);
            patterns.push({
              type: 'api-key',
              location: 'query',
            });
          }
        }
      }
    }

    return patterns;
  }

  private extractBaseUrl(endpoints: ParsedEndpoint[]): string | undefined {
    if (endpoints.length === 0) return undefined;

    try {
      const url = new URL(endpoints[0].url);
      return `${url.protocol}//${url.host}`;
    } catch {
      return undefined;
    }
  }

  private generateSummary(
    endpoints: ParsedEndpoint[],
    baseUrl?: string
  ): string {
    const methods = new Map<string, number>();
    for (const endpoint of endpoints) {
      methods.set(endpoint.method, (methods.get(endpoint.method) || 0) + 1);
    }

    const methodsSummary = Array.from(methods.entries())
      .map(([method, count]) => `${count} ${method}`)
      .join(', ');

    const host = baseUrl ? new URL(baseUrl).host : 'unknown host';

    return `Captured ${endpoints.length} endpoints (${methodsSummary}) from ${host}`;
  }
}
