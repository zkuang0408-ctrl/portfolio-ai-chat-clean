// @vitest-environment node

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Vercel deployment configuration', () => {
  it('builds the Vite site into dist with clean URLs and hardened delivery headers', () => {
    const config = JSON.parse(
      readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'),
    );

    expect(config).toMatchObject({
      $schema: 'https://openapi.vercel.sh/vercel.json',
      framework: 'vite',
      buildCommand: 'npm run build',
      outputDirectory: 'dist',
      cleanUrls: true,
    });
    expect(config).not.toHaveProperty('routes');

    const securityHeaders = config.headers?.find(
      (rule: { source?: string }) => rule.source === '/(.*)',
    );
    expect(securityHeaders).toMatchObject({
      headers: expect.arrayContaining([
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        {
          key: 'Referrer-Policy',
          value: 'strict-origin-when-cross-origin',
        },
        { key: 'X-Frame-Options', value: 'DENY' },
      ]),
    });

    const assetHeaders = config.headers?.find(
      (rule: { source?: string }) => rule.source === '/assets/(.*)',
    );
    expect(assetHeaders).toMatchObject({
      headers: expect.arrayContaining([
        {
          key: 'Cache-Control',
          value: 'public, max-age=31536000, immutable',
        },
      ]),
    });
  });
});
