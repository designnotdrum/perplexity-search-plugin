import { checkConfig, ConfigStatus } from './startup';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

jest.mock('fs/promises');
jest.mock('os', () => ({
  ...jest.requireActual('os'),
  homedir: jest.fn(() => '/mock/home'),
}));

describe('checkConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.PERPLEXITY_API_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns configured when config file exists with API key', async () => {
    (fs.readFile as jest.Mock).mockResolvedValue(
      JSON.stringify({ apiKey: 'pplx-test123' })
    );

    const result = await checkConfig();

    expect(result.status).toBe('configured');
    expect(result.apiKey).toBe('pplx-test123');
  });

  it('returns missing when config file does not exist', async () => {
    (fs.readFile as jest.Mock).mockRejectedValue({ code: 'ENOENT' });

    const result = await checkConfig();

    expect(result.status).toBe('missing');
    expect(result.apiKey).toBeUndefined();
  });

  it('returns configured when env var is set', async () => {
    (fs.readFile as jest.Mock).mockRejectedValue({ code: 'ENOENT' });
    process.env.PERPLEXITY_API_KEY = 'pplx-envkey';

    const result = await checkConfig();

    expect(result.status).toBe('configured');
    expect(result.apiKey).toBe('pplx-envkey');
  });
});
