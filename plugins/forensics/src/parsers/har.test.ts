import { HarParser } from './har';
import { ParsedCapture } from './types';

const SAMPLE_HAR = {
  log: {
    version: '1.2',
    creator: { name: 'test', version: '1.0' },
    entries: [
      {
        request: {
          method: 'GET',
          url: 'https://api.example.com/users?page=1&limit=10',
          headers: [
            { name: 'Authorization', value: 'Bearer abc123' },
            { name: 'Content-Type', value: 'application/json' },
          ],
          queryString: [
            { name: 'page', value: '1' },
            { name: 'limit', value: '10' },
          ],
        },
        response: {
          status: 200,
          content: {
            mimeType: 'application/json',
            text: '{"users":[{"id":1}]}',
          },
          headers: [],
        },
        timings: {
          wait: 50,
          receive: 100,
        },
      },
      {
        request: {
          method: 'POST',
          url: 'https://api.example.com/users',
          headers: [
            { name: 'Authorization', value: 'Bearer abc123' },
            { name: 'Content-Type', value: 'application/json' },
          ],
          queryString: [],
          postData: {
            mimeType: 'application/json',
            text: '{"name":"John"}',
          },
        },
        response: {
          status: 201,
          content: {
            mimeType: 'application/json',
            text: '{"id":2,"name":"John"}',
          },
          headers: [],
        },
        timings: {
          wait: 30,
          receive: 50,
        },
      },
    ],
  },
};

describe('HarParser', () => {
  let parser: HarParser;

  beforeEach(() => {
    parser = new HarParser();
  });

  describe('parse', () => {
    it('should extract endpoints with correct method and path', () => {
      const result = parser.parse(JSON.stringify(SAMPLE_HAR));

      expect(result.endpoints).toHaveLength(2);
      expect(result.endpoints[0].method).toBe('GET');
      expect(result.endpoints[0].path).toBe('/users');
      expect(result.endpoints[1].method).toBe('POST');
      expect(result.endpoints[1].path).toBe('/users');
    });

    it('should detect bearer auth pattern', () => {
      const result = parser.parse(JSON.stringify(SAMPLE_HAR));

      expect(result.authPatterns).toContainEqual({
        type: 'bearer',
        location: 'header',
        headerName: 'Authorization',
      });
    });

    it('should extract query parameters', () => {
      const result = parser.parse(JSON.stringify(SAMPLE_HAR));

      expect(result.endpoints[0].queryParams).toEqual({
        page: '1',
        limit: '10',
      });
    });

    it('should parse request and response bodies', () => {
      const result = parser.parse(JSON.stringify(SAMPLE_HAR));

      expect(result.endpoints[1].requestBody).toEqual({ name: 'John' });
      expect(result.endpoints[1].responseBody).toEqual({ id: 2, name: 'John' });
    });

    it('should identify base URL', () => {
      const result = parser.parse(JSON.stringify(SAMPLE_HAR));

      expect(result.baseUrl).toBe('https://api.example.com');
    });

    it('should generate summary', () => {
      const result = parser.parse(JSON.stringify(SAMPLE_HAR));

      expect(result.summary).toContain('2 endpoints');
      expect(result.summary).toContain('api.example.com');
    });

    it('should set source to har', () => {
      const result = parser.parse(JSON.stringify(SAMPLE_HAR));

      expect(result.source).toBe('har');
    });

    it('should extract timing information', () => {
      const result = parser.parse(JSON.stringify(SAMPLE_HAR));

      expect(result.endpoints[0].timing).toEqual({
        wait: 50,
        receive: 100,
        total: 150,
      });
    });

    it('should extract content type', () => {
      const result = parser.parse(JSON.stringify(SAMPLE_HAR));

      expect(result.endpoints[0].contentType).toBe('application/json');
    });
  });

  describe('error handling', () => {
    it('should throw on invalid JSON', () => {
      expect(() => parser.parse('not json')).toThrow('Invalid HAR content');
    });

    it('should throw on missing log property', () => {
      expect(() => parser.parse('{}')).toThrow('Invalid HAR format');
    });

    it('should throw on missing entries', () => {
      expect(() => parser.parse('{"log":{}}')).toThrow('Invalid HAR format');
    });
  });

  describe('auth pattern detection', () => {
    it('should detect basic auth', () => {
      const harWithBasic = {
        log: {
          entries: [
            {
              request: {
                method: 'GET',
                url: 'https://api.example.com/test',
                headers: [{ name: 'Authorization', value: 'Basic dXNlcjpwYXNz' }],
                queryString: [],
              },
              response: { status: 200, content: {}, headers: [] },
            },
          ],
        },
      };

      const result = parser.parse(JSON.stringify(harWithBasic));
      expect(result.authPatterns).toContainEqual({
        type: 'basic',
        location: 'header',
        headerName: 'Authorization',
      });
    });

    it('should detect api-key auth in header', () => {
      const harWithApiKey = {
        log: {
          entries: [
            {
              request: {
                method: 'GET',
                url: 'https://api.example.com/test',
                headers: [{ name: 'X-API-Key', value: 'secret123' }],
                queryString: [],
              },
              response: { status: 200, content: {}, headers: [] },
            },
          ],
        },
      };

      const result = parser.parse(JSON.stringify(harWithApiKey));
      expect(result.authPatterns).toContainEqual({
        type: 'api-key',
        location: 'header',
        headerName: 'X-API-Key',
      });
    });

    it('should detect cookie auth', () => {
      const harWithCookie = {
        log: {
          entries: [
            {
              request: {
                method: 'GET',
                url: 'https://api.example.com/test',
                headers: [{ name: 'Cookie', value: 'session=abc123' }],
                queryString: [],
              },
              response: { status: 200, content: {}, headers: [] },
            },
          ],
        },
      };

      const result = parser.parse(JSON.stringify(harWithCookie));
      expect(result.authPatterns).toContainEqual({
        type: 'cookie',
        location: 'header',
        headerName: 'Cookie',
      });
    });

    it('should detect api key in query string', () => {
      const harWithQueryApiKey = {
        log: {
          entries: [
            {
              request: {
                method: 'GET',
                url: 'https://api.example.com/test?api_key=secret',
                headers: [],
                queryString: [{ name: 'api_key', value: 'secret' }],
              },
              response: { status: 200, content: {}, headers: [] },
            },
          ],
        },
      };

      const result = parser.parse(JSON.stringify(harWithQueryApiKey));
      expect(result.authPatterns).toContainEqual({
        type: 'api-key',
        location: 'query',
      });
    });
  });
});
