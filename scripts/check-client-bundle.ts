import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface BundleBoundaryOptions {
  readonly buildDirectory: string;
  readonly indexPath: string;
}

interface BundleSentinel {
  readonly hash: string;
  readonly value: string;
}

const MINIMUM_TEXT_SENTINEL_CODE_POINTS = 80;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sentinelHash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function readSentinels(candidate: unknown): readonly BundleSentinel[] {
  if (
    !isRecord(candidate) ||
    !isRecord(candidate.sourceDigests) ||
    !Array.isArray(candidate.chunks)
  ) {
    throw new Error("Invalid knowledge index for client bundle inspection");
  }

  const values = new Set<string>();
  for (const digest of Object.values(candidate.sourceDigests)) {
    if (typeof digest !== "string") {
      throw new Error("Invalid knowledge index for client bundle inspection");
    }
    values.add(digest);
  }
  for (const chunk of candidate.chunks) {
    if (
      !isRecord(chunk) ||
      typeof chunk.id !== "string" ||
      typeof chunk.text !== "string"
    ) {
      throw new Error("Invalid knowledge index for client bundle inspection");
    }
    values.add(chunk.id);
    if (Array.from(chunk.text).length >= MINIMUM_TEXT_SENTINEL_CODE_POINTS) {
      values.add(chunk.text);
    }
  }
  return [...values].map((value) => ({ value, hash: sentinelHash(value) }));
}

async function bundleFiles(root: string): Promise<readonly string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) files.push(...(await bundleFiles(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

export async function verifyClientBundleBoundary(
  options: BundleBoundaryOptions,
): Promise<void> {
  let buildStats;
  try {
    buildStats = await stat(options.buildDirectory);
  } catch {
    throw new Error("Client build directory does not exist");
  }
  if (!buildStats.isDirectory()) {
    throw new Error("Client build directory does not exist");
  }

  const candidate = JSON.parse(await readFile(options.indexPath, "utf8")) as unknown;
  const sentinels = readSentinels(candidate);
  const leakingHashes = new Set<string>();
  const leakingFiles = new Set<string>();
  for (const file of await bundleFiles(options.buildDirectory)) {
    const contents = await readFile(file);
    for (const sentinel of sentinels) {
      if (contents.includes(Buffer.from(sentinel.value, "utf8"))) {
        leakingHashes.add(sentinel.hash);
        leakingFiles.add(file);
      }
    }
  }

  if (leakingHashes.size > 0) {
    throw new Error(
      `Client bundle contains ${leakingHashes.size} forbidden knowledge sentinels in ${leakingFiles.size} file(s); sentinel SHA-256: ${[...leakingHashes].sort().join(",")}`,
    );
  }
}

const isDirectRun =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  await verifyClientBundleBoundary({
    buildDirectory: resolve(repositoryRoot, "dist"),
    indexPath: resolve(
      repositoryRoot,
      "src/chat/knowledge/generated-index.json",
    ),
  });
  console.log("Verified client bundle boundary");
}
