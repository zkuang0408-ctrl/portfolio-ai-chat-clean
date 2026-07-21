// @vitest-environment node

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('production document assets', () => {
  it('declares the server and OCR tooling required for portfolio chat delivery', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const tsconfig = JSON.parse(
      readFileSync(new URL('../tsconfig.json', import.meta.url), 'utf8'),
    ) as { include: string[] };

    expect(packageJson.dependencies).toMatchObject({
      '@upstash/redis': '1.38.0',
      '@vercel/functions': '3.7.5',
    });
    expect(packageJson.devDependencies).toMatchObject({
      tsx: '4.23.1',
      '@napi-rs/canvas': '1.0.2',
      'tesseract.js': '7.0.0',
    });
    expect(tsconfig.include).toEqual([
      'src',
      'api',
      'scripts',
      'vite.config.ts',
      'vitest.config.ts',
      'playwright.config.ts',
      'tests',
    ]);
  });

  it('declares a valid SVG favicon that ships from the public root', () => {
    const faviconUrl = new URL('../public/favicon.svg', import.meta.url);
    expect(() => readFileSync(faviconUrl, 'utf8')).not.toThrow();

    const indexHtml = readFileSync(
      new URL('../index.html', import.meta.url),
      'utf8',
    );
    const favicon = readFileSync(faviconUrl, 'utf8');

    expect(indexHtml).toContain(
      '<link rel="icon" href="/favicon.svg" type="image/svg+xml" />',
    );
    expect(favicon).toMatch(/^<svg[\s\S]*<\/svg>\s*$/);
  });
});
