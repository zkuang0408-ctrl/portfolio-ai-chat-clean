// @vitest-environment node

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));

const expectedEnvironmentExample = [
  'DEEPSEEK_API_KEY=',
  'DEEPSEEK_BASE_URL=https://api.deepseek.com',
  'DEEPSEEK_MODEL=deepseek-v4-flash',
  'RATE_LIMIT_KV_URL=',
  'RATE_LIMIT_KV_TOKEN=',
  'RATE_LIMIT_SALT=',
  'CHAT_ENABLED=true',
  'CHAT_SITE_DAILY_LIMIT=300',
  'CHAT_VISITOR_DAILY_LIMIT=30',
  'CHAT_VISITOR_MINUTE_LIMIT=6',
  'CHAT_COOLDOWN_SECONDS=3',
  'CHAT_MAX_OUTPUT_TOKENS=700',
  'CHAT_UPSTREAM_TIMEOUT_MS=45000',
].join('\n') + '\n';

function pathsFromGitLsFiles(output: string): readonly string[] {
  return output.split('\0').filter((path) => path.length > 0);
}

function trackedFiles(): readonly string[] {
  const tracked = execFileSync('git', ['ls-files', '-z'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  return pathsFromGitLsFiles(tracked)
    .map((path) => resolve(projectRoot, path));
}

function isIgnored(path: string): boolean {
  const result = spawnSync(
    'git',
    ['check-ignore', '--no-index', '--quiet', path],
    { cwd: projectRoot, encoding: 'utf8' },
  );
  if (result.status !== 0 && result.status !== 1) {
    throw new Error('git check-ignore failed');
  }
  return result.status === 0;
}

const deepSeekSecretPatternSource = `${['s', 'k', '-'].join('')}[A-Za-z0-9_-]{20,}`;

function findSecretBearingPaths(
  files: readonly string[],
  root: string,
  readBytes: (path: string) => Uint8Array,
): readonly string[] {
  const secretPattern = new RegExp(deepSeekSecretPatternSource, 'u');
  const redactionPattern = new RegExp(deepSeekSecretPatternSource, 'gu');
  const matches: string[] = [];
  for (const path of files) {
    const normalizedPath = relative(root, path).replaceAll('\\', '/');
    const content = Buffer.from(readBytes(path)).toString('latin1');
    if (secretPattern.test(normalizedPath) || secretPattern.test(content)) {
      matches.push(
        normalizedPath.replace(redactionPattern, '[redacted-secret]'),
      );
    }
  }
  return matches;
}

function importedModules(filePath: string): readonly string[] {
  const source = readFileSync(filePath, 'utf8');
  const patterns = [
    /(?:import|export)\s+(?:[^;]*?\s+from\s+)?["']([^"']+)["']/g,
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

function nodeEsmImportGraph(entryPath: string): readonly string[] {
  const visited = new Set<string>();
  const pending = [entryPath];

  while (pending.length > 0) {
    const current = pending.pop()!;
    if (visited.has(current) || !existsSync(current)) continue;
    visited.add(current);

    for (const modulePath of importedModules(current)) {
      if (!modulePath.startsWith('.')) continue;
      const base = resolve(dirname(current), modulePath);
      const candidates = [
        base,
        `${base}.ts`,
        `${base}.js`,
        modulePath.endsWith('.js')
          ? `${base.slice(0, -'.js'.length)}.ts`
          : '',
        resolve(base, 'index.ts'),
        resolve(base, 'index.js'),
      ].filter((candidate) => candidate.length > 0);
      const source = candidates.find((candidate) => existsSync(candidate));
      if (source && /\.(?:ts|js)$/u.test(source)) pending.push(source);
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
  it('ignores local environment files while keeping the safe example tracked', () => {
    expect(isIgnored('.env')).toBe(true);
    expect(isIgnored('.env.production')).toBe(true);
    expect(isIgnored('.env.example')).toBe(false);
  });

  it('routes only API traffic through Cloudflare Functions', () => {
    const routes = JSON.parse(
      readFileSync(resolve(projectRoot, 'public/_routes.json'), 'utf8'),
    );

    expect(routes).toEqual({
      version: 1,
      include: ['/api/*'],
      exclude: [],
    });
  });

  it('declares the Cloudflare AI binding and public subrequest routing', () => {
    const config = readFileSync(
      resolve(projectRoot, 'wrangler.toml'),
      'utf8',
    );

    expect(config).toContain('name = "portfolio-ai-chat-clean"');
    expect(config).toContain('pages_build_output_dir = "dist"');
    expect(config).toContain(
      'compatibility_flags = ["global_fetch_strictly_public"]',
    );
    expect(config).toMatch(/\[ai\]\r?\nbinding = "AI"/u);
    expect(config).toMatch(
      /\[env\.production\.ai\]\r?\nbinding = "AI"/u,
    );
  });

  it('ignores Cloudflare local secret files', () => {
    expect(isIgnored('.dev.vars')).toBe(true);
    expect(isIgnored('.dev.vars.production')).toBe(true);
  });

  it('keeps every git-tracked path in secret-scan scope', () => {
    const listedPaths = [
      'src/main.ts',
      'private/resume.pdf',
      'scripts/audit.py',
      'dist/tracked-output.bin',
    ];

    expect(pathsFromGitLsFiles(`${listedPaths.join('\0')}\0`)).toEqual(
      listedPaths,
    );
  });

  it('detects extended DeepSeek secret shapes in paths and bytes without exposing them', () => {
    const fixtureRoot = resolve(projectRoot, 'secret-scan-fixture');
    const secret = ['s', 'k', '-', 'a'.repeat(20), '_-'].join('');
    const pathMatch = resolve(
      fixtureRoot,
      'private',
      `credential-${secret}.txt`,
    );
    const contentMatch = resolve(fixtureRoot, 'archive.pdf');
    const safePath = resolve(fixtureRoot, 'safe.py');

    const matches = findSecretBearingPaths(
      [pathMatch, contentMatch, safePath],
      fixtureRoot,
      (path) =>
        Buffer.from(path === contentMatch ? `payload:${secret}` : 'safe'),
    );

    expect(matches).toEqual([
      'private/credential-[redacted-secret].txt',
      'archive.pdf',
    ]);
    expect(matches.some((path) => path.includes(secret))).toBe(false);
  });

  it('exposes a lazy Vercel Web Handler for portfolio chat', async () => {
    const handle = vi.fn(async () => new Response(null, { status: 204 }));
    const createVercelRuntime = vi.fn(() => ({ enabled: true, handle }));
    vi.resetModules();
    vi.doMock('./chat/server/vercel-runtime', () => ({ createVercelRuntime }));

    try {
      const route = await import('../api/chat');

      expect(route.default).toEqual({ fetch: expect.any(Function) });
      expect(createVercelRuntime).not.toHaveBeenCalled();

      const request = new Request('https://portfolio.example/api/chat');
      await route.default.fetch(request);
      await route.default.fetch(request);

      expect(createVercelRuntime).toHaveBeenCalledTimes(1);
      expect(handle).toHaveBeenNthCalledWith(1, request);
      expect(handle).toHaveBeenNthCalledWith(2, request);
    } finally {
      vi.doUnmock('./chat/server/vercel-runtime');
      vi.resetModules();
    }
  });

  it('documents only the approved server configuration names and safe defaults', () => {
    const environmentExample = readFileSync(
      resolve(projectRoot, '.env.example'),
      'utf8',
    );

    expect(environmentExample).toBe(expectedEnvironmentExample);
  });

  it('keeps DeepSeek-style secret values out of every tracked file', () => {
    const matchingPaths = findSecretBearingPaths(
      trackedFiles(),
      projectRoot,
      (path) => readFileSync(path),
    );

    // Report paths only so a failed check never prints the matched credential.
    expect(matchingPaths).toEqual([]);
  });

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
      'pdfjs-dist': '6.1.200',
      'tesseract.js': '7.0.0',
    });
    expect(Object.hasOwn(packageJson.dependencies, 'pdfjs-dist')).toBe(false);
    expect(Object.hasOwn(packageJson.dependencies, 'openai')).toBe(false);
    expect(Object.hasOwn(packageJson.devDependencies, 'openai')).toBe(false);
    expect(tsconfig.include).toEqual([
      'src',
      'api',
      'functions',
      'scripts',
      'vite.config.ts',
      'vitest.config.ts',
      'playwright.config.ts',
      'tests',
    ]);
  });

  it('provides the CommonJS TypeScript system API required by Vercel Functions', () => {
    const compatibilityCheck = spawnSync(
      process.execPath,
      [
        '-e',
        [
          'const ts = require("typescript");',
          'if (typeof ts.sys?.readFile !== "function") process.exit(1);',
        ].join(' '),
      ],
      { cwd: projectRoot, encoding: 'utf8' },
    );

    expect(compatibilityCheck.status).toBe(0);
  });

  it('uses explicit Node ESM extensions throughout the Vercel Function graph', () => {
    const apiEntry = resolve(projectRoot, 'api/chat.ts');
    const invalidSpecifiers = nodeEsmImportGraph(apiEntry).flatMap((path) =>
      importedModules(path)
        .filter((modulePath) => modulePath.startsWith('.'))
        .filter((modulePath) => !/\.(?:js|json)$/u.test(modulePath))
        .map(
          (modulePath) =>
            `${relative(projectRoot, path).replaceAll('\\', '/')}: ${modulePath}`,
        ),
    );

    expect(invalidSpecifiers).toEqual([]);
  });

  it('keeps the Cloudflare Function graph free of Node built-in modules', () => {
    const functionEntry = resolve(projectRoot, 'functions/api/chat.ts');
    const nodeImports = nodeEsmImportGraph(functionEntry).flatMap((path) =>
      importedModules(path)
        .filter((modulePath) => modulePath.startsWith('node:'))
        .map(
          (modulePath) =>
            `${relative(projectRoot, path).replaceAll('\\', '/')}: ${modulePath}`,
        ),
    );

    expect(nodeImports).toEqual([]);
  });

  it('declares the knowledge index JSON type for the Node ESM runtime', () => {
    const runtimeSource = readFileSync(
      resolve(projectRoot, 'src/chat/server/runtime.ts'),
      'utf8',
    );

    expect(runtimeSource).toContain(
      'from "../knowledge/generated-index.json" with { type: "json" };',
    );
  });

  it('verifies the committed knowledge index before every production build', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts).toMatchObject({
      'knowledge:generate': 'tsx scripts/build-knowledge-index.ts --generate',
      'knowledge:verify': 'tsx scripts/build-knowledge-index.ts --verify',
      'portfolio-pages:generate': 'python tools/render_project_pages.py',
      'portfolio-pages:verify': 'tsx scripts/verify-project-page-assets.ts',
      prebuild:
        'npm run knowledge:verify && npm run portfolio-pages:verify',
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

  it('keeps the legacy PDF reader out of the browser import graph', () => {
    const sourceRoot = fileURLToPath(new URL('.', import.meta.url));
    const graph = browserImportGraph(resolve(sourceRoot, 'main.ts'));
    const relativeGraph = graph.map((path) =>
      relative(projectRoot, path).replaceAll('\\', '/'),
    );

    expect(relativeGraph.some((path) => path.endsWith('/pdf-runtime.ts'))).toBe(
      false,
    );
    expect(relativeGraph.some((path) => path.endsWith('/pdf-reader.ts'))).toBe(
      false,
    );
  });

  it('defines immutable Cloudflare caching for generated portfolio pages', () => {
    const headers = readFileSync(
      resolve(projectRoot, 'public/_headers'),
      'utf8',
    );

    expect(headers).toContain('/assets/*\n  Cache-Control: public, max-age=31536000, immutable');
    expect(headers).toContain(
      '/projects/pages/*\n  Cache-Control: public, max-age=31536000, immutable',
    );
    expect(headers).toContain(
      '/projects/pdfs/*\n  Cache-Control: public, max-age=86400, s-maxage=31536000',
    );
    expect(headers).toContain('X-Content-Type-Options: nosniff');
    expect(headers).toContain('X-Frame-Options: DENY');
    expect(headers).toContain(
      'Referrer-Policy: strict-origin-when-cross-origin',
    );
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
