// @vitest-environment node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function importedModules(filePath: string): readonly string[] {
  const source = readFileSync(filePath, 'utf8');
  return Array.from(
    source.matchAll(/(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g),
    (match) => match[1]!,
  );
}

function browserImportGraph(entryPath: string): readonly string[] {
  const visited = new Set<string>();
  const pending = [entryPath];

  while (pending.length > 0) {
    const current = pending.pop()!;
    if (visited.has(current) || !existsSync(current)) continue;
    visited.add(current);

    for (const modulePath of importedModules(current)) {
      if (!modulePath.startsWith('.')) continue;
      const base = resolve(dirname(current), modulePath);
      for (const candidate of [base, `${base}.ts`, `${base}.json`, resolve(base, 'index.ts')]) {
        if (existsSync(candidate)) {
          pending.push(candidate);
          break;
        }
      }
    }
  }

  return [...visited];
}

function sourceFiles(rootPath: string): readonly string[] {
  if (!existsSync(rootPath)) return [];
  if (statSync(rootPath).isFile()) return [rootPath];
  return readdirSync(rootPath, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(rootPath, entry.name);
    return entry.isDirectory()
      ? sourceFiles(path)
      : entry.name.endsWith('.ts')
        ? [path]
        : [];
  });
}

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
    expect(Object.hasOwn(packageJson.dependencies, 'openai')).toBe(false);
    expect(Object.hasOwn(packageJson.devDependencies, 'openai')).toBe(false);
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

  it('verifies the committed knowledge index before every production build', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts).toMatchObject({
      'knowledge:generate': 'tsx scripts/build-knowledge-index.ts --generate',
      'knowledge:verify': 'tsx scripts/build-knowledge-index.ts --verify',
      prebuild: 'npm run knowledge:verify',
      build: 'tsc --noEmit && vite build',
    });
  });

  it('keeps the generated knowledge index server-only', () => {
    const sourceRoot = fileURLToPath(new URL('.', import.meta.url));
    const indexPath = resolve(sourceRoot, 'chat/knowledge/generated-index.json');
    expect(existsSync(indexPath)).toBe(true);

    const browserEntry = resolve(sourceRoot, 'main.ts');
    const graph = browserImportGraph(browserEntry);
    expect(graph.some((path) => path.endsWith('generated-index.json'))).toBe(false);

    for (const clientRoot of ['main.ts', 'hero', 'portfolio', 'chat/client']) {
      const files = sourceFiles(resolve(sourceRoot, clientRoot));
      expect(
        files.some((path) =>
          importedModules(path).some((modulePath) =>
            modulePath.endsWith('generated-index.json'),
          ),
        ),
      ).toBe(false);
    }
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
