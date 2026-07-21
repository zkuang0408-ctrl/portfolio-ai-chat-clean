// @vitest-environment node

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { verifyClientBundleBoundary } from "../scripts/check-client-bundle";

const directories: string[] = [];

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "client-bundle-boundary-"));
  directories.push(root);
  const buildDirectory = join(root, "dist");
  const assetDirectory = join(buildDirectory, "assets");
  const indexPath = join(root, "generated-index.json");
  const digest = "a".repeat(64);
  const passage =
    "Synthetic knowledge passage that is deliberately long enough to be a bundle sentinel without containing private data.";
  await mkdir(assetDirectory, { recursive: true });
  await writeFile(
    indexPath,
    JSON.stringify({
      version: 1,
      sourceDigests: { synthetic: digest },
      chunks: [
        {
          id: "synthetic:p1:c0",
          text: passage,
        },
      ],
    }),
    "utf8",
  );
  return { assetDirectory, buildDirectory, digest, indexPath, passage };
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe("fresh client bundle boundary", () => {
  test("accepts a clean nested build tree", async () => {
    const { assetDirectory, buildDirectory, indexPath } = await fixture();
    await writeFile(join(assetDirectory, "app.js"), "console.log('clean')", "utf8");

    await expect(
      verifyClientBundleBoundary({ buildDirectory, indexPath }),
    ).resolves.toBeUndefined();
  });

  test("rejects digest, chunk-ID, and long-text sentinels without echoing text", async () => {
    const { assetDirectory, buildDirectory, digest, indexPath, passage } =
      await fixture();
    await writeFile(
      join(assetDirectory, "leak.js"),
      `const leaked = ${JSON.stringify([digest, "synthetic:p1:c0", passage])};`,
      "utf8",
    );

    let thrown: unknown;
    try {
      await verifyClientBundleBoundary({ buildDirectory, indexPath });
    } catch (error: unknown) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(
      /^Client bundle contains 3 forbidden knowledge sentinels in 1 file/u,
    );
    expect((thrown as Error).message).not.toContain(passage);
    expect((thrown as Error).message).not.toContain(digest);
    expect((thrown as Error).message).not.toContain("synthetic:p1:c0");
    expect((thrown as Error).message).toMatch(/[a-f0-9]{64}/u);
  });

  test("rejects a missing build directory instead of treating it as clean", async () => {
    const { buildDirectory, indexPath } = await fixture();
    await rm(buildDirectory, { force: true, recursive: true });

    await expect(
      verifyClientBundleBoundary({ buildDirectory, indexPath }),
    ).rejects.toThrow("Client build directory does not exist");
  });
});
