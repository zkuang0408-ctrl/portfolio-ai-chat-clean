// @vitest-environment node

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function importedModules(filePath: string): readonly string[] {
  const source = readFileSync(filePath, 'utf8');
  const patterns = [
    /(?:import|export)\s+(?:[^;\n]*?\s+from\s+)?["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\.meta\.glob(?:Eager)?\s*\(\s*["']([^"']+)["']/g,
  ];
  return patterns.flatMap((pattern) =>
    Array.from(source.matchAll(pattern), (match) => match[1]!),
  );
}

function browserImportGraph(entryPath: string): readonly string[] {
  const visited = new Set<string>();
  const pending = [entryPath];
  const sourceRoot = dirname(entryPath);

  while (pending.length > 0) {
    const current = pending.pop()!;
    if (visited.has(current) || !existsSync(current)) continue;
    visited.add(current);

    for (const modulePath of importedModules(current)) {
      if (!modulePath.startsWith('.') && !modulePath.startsWith('@/')) continue;
      const base = modulePath.startsWith('@/')
        ? resolve(sourceRoot, modulePath.slice(2))
        : resolve(dirname(current), modulePath);
      if (base.includes('*')) {
        const globDirectory = dirname(base);
        if (!existsSync(globDirectory)) continue;
        const escapedName = dirname(base) === base
          ? base
          : base.slice(globDirectory.length + 1);
        const matcher = new RegExp(
          `^${escapedName
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
            .replaceAll('*', '.*')}$`,
        );
        for (const entry of readdirSync(globDirectory, { withFileTypes: true })) {
          if (entry.isFile() && matcher.test(entry.name)) {
            pending.push(resolve(globDirectory, entry.name));
          }
        }
        continue;
      }
      for (const candidate of [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        `${base}.js`,
        `${base}.mjs`,
        `${base}.json`,
        resolve(base, 'index.ts'),
        resolve(base, 'index.tsx'),
        resolve(base, 'index.js'),
        resolve(base, 'index.mjs'),
      ]) {
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
      : /\.(?:ts|tsx|js|mjs)$/u.test(entry.name)
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
      build: 'tsc --noEmit && vite build && tsx scripts/check-client-bundle.ts',
    });
    expect(
      existsSync(new URL('../scripts/check-client-bundle.ts', import.meta.url)),
    ).toBe(true);
  });

  it('follows literal dynamic imports, globs, and browser source extensions', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'browser-graph-'));
    const pages = join(directory, 'pages');
    const sensitive = join(directory, 'generated-index.json');
    const { mkdirSync } = await import('node:fs');
    mkdirSync(pages);
    writeFileSync(
      join(directory, 'main.ts'),
      `void import('./view.tsx');\nconst pages = import.meta.glob('./pages/*.mjs');\n`,
      'utf8',
    );
    writeFileSync(join(directory, 'view.tsx'), `import './bridge.js';\n`, 'utf8');
    writeFileSync(join(directory, 'bridge.js'), `import './generated-index.json';\n`, 'utf8');
    writeFileSync(join(pages, 'lazy.mjs'), `export const value = 1;\n`, 'utf8');
    writeFileSync(sensitive, '{}\n', 'utf8');

    try {
      const graph = browserImportGraph(join(directory, 'main.ts'));
      expect(graph).toContain(resolve(directory, 'view.tsx'));
      expect(graph).toContain(resolve(directory, 'bridge.js'));
      expect(graph).toContain(resolve(directory, 'generated-index.json'));
      expect(graph).toContain(resolve(pages, 'lazy.mjs'));
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
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
