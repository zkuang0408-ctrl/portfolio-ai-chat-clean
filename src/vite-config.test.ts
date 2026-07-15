// @vitest-environment node

import { describe, expect, it } from 'vitest';
import viteConfig from '../vite.config';

describe('Vite production configuration', () => {
  it('does not publish JavaScript source maps', () => {
    expect(viteConfig).toMatchObject({
      build: { sourcemap: false },
    });
  });
});
