import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Vercel deployment configuration', () => {
  it('builds the Vite site into dist with clean URLs', () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'),
    );

    expect(config).toEqual({
      $schema: 'https://openapi.vercel.sh/vercel.json',
      framework: 'vite',
      buildCommand: 'npm run build',
      outputDirectory: 'dist',
      cleanUrls: true,
    });
  });
});
