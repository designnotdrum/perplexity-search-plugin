export interface ParsedEndpoint {
  method: string;
  url: string;
  path: string;
  queryParams: Record<string, string>;
  headers: Record<string, string>;
  requestBody?: unknown;
  responseStatus: number;
  responseBody?: unknown;
  contentType?: string;
  timing?: {
    wait: number;
    receive: number;
    total: number;
  };
}

export interface ParsedCapture {
  source: 'har' | 'curl' | 'raw';
  endpoints: ParsedEndpoint[];
  authPatterns: {
    type: 'bearer' | 'basic' | 'api-key' | 'cookie' | 'unknown';
    location: 'header' | 'query' | 'body';
    headerName?: string;
  }[];
  baseUrl?: string;
  summary: string;
}
