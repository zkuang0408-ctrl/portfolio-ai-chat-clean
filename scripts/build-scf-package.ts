import { execFileSync } from "node:child_process";
import { readFile, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const defaultBuildDirectory = resolve(projectRoot, ".scf-build");
const defaultOutputZip = resolve(
  projectRoot,
  "output/portfolio-chat-scf.zip",
);
const secretEnvironmentNames = [
  "TENCENT_TOKENHUB_API_KEY",
  "DEEPSEEK_API_KEY",
  "CLOUDFLARE_AI_GATEWAY_TOKEN",
  "RATE_LIMIT_KV_TOKEN",
  "RATE_LIMIT_SALT",
] as const;

export interface ScfPackageOptions {
  readonly buildDirectory: string;
  readonly outputZip: string;
}

function pythonCommand(): string {
  return process.env.PYTHON?.trim() || "python";
}

function runPackager(args: readonly string[]): void {
  try {
    execFileSync(
      pythonCommand(),
      [resolve(projectRoot, "tools/package_scf.py"), ...args],
      {
        cwd: projectRoot,
        encoding: "utf8",
        stdio: "pipe",
      },
    );
  } catch {
    throw new Error("SCF package verification failed");
  }
}

async function verifyBundleSecrets(bundlePath: string): Promise<void> {
  const bundle = await readFile(bundlePath);
  for (const name of secretEnvironmentNames) {
    const value = process.env[name];
    if (
      value &&
      value.length >= 8 &&
      bundle.includes(Buffer.from(value, "utf8"))
    ) {
      throw new Error(
        `SCF bundle contains configured secret from ${name}`,
      );
    }
  }
}

export async function verifyScfPackage(
  outputZip = defaultOutputZip,
): Promise<void> {
  runPackager(["--verify", outputZip]);
}

export async function buildScfPackage(
  options: ScfPackageOptions = {
    buildDirectory: defaultBuildDirectory,
    outputZip: defaultOutputZip,
  },
): Promise<void> {
  await rm(options.buildDirectory, { force: true, recursive: true });
  await mkdir(options.buildDirectory, { recursive: true });
  const bundlePath = resolve(options.buildDirectory, "index.mjs");
  await build({
    entryPoints: [resolve(projectRoot, "scf/index.ts")],
    outfile: bundlePath,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    sourcemap: false,
    legalComments: "none",
    logLevel: "silent",
  });
  await verifyBundleSecrets(bundlePath);
  runPackager([
    "--bundle",
    bundlePath,
    "--bootstrap",
    resolve(projectRoot, "scf/scf_bootstrap"),
    "--output",
    options.outputZip,
  ]);
}

const isDirectRun =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  if (process.argv.slice(2).includes("--verify")) {
    await verifyScfPackage();
  } else {
    await buildScfPackage();
  }
}
