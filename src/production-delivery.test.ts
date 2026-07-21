// @vitest-environment node

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('production document assets', () => {
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
