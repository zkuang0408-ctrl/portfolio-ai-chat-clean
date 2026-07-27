// @vitest-environment node

import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, test } from "vitest";

import {
  buildScfPackage,
  verifyScfPackage,
} from "./build-scf-package";

const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryPaths.splice(0).map((path) =>
      rm(path, { force: true, recursive: true })),
  );
});

test(
  "builds a deterministic verified SCF package",
  async () => {
    const nonce = `${process.pid}-${Date.now()}`;
    const root = join(tmpdir(), `portfolio-scf-${nonce}`);
    const buildDirectory = join(root, "build");
    const outputZip = join(root, "portfolio-chat-scf.zip");
    temporaryPaths.push(root);

    await buildScfPackage({ buildDirectory, outputZip });
    await verifyScfPackage(outputZip);
    const first = await readFile(outputZip);

    await buildScfPackage({ buildDirectory, outputZip });
    await verifyScfPackage(outputZip);
    const second = await readFile(outputZip);

    expect(second).toEqual(first);
    expect(second.byteLength).toBeGreaterThan(10_000);
  },
  20_000,
);

test("rejects an absent package instead of reporting success", async () => {
  const outputZip = join(
    tmpdir(),
    `missing-portfolio-scf-${process.pid}-${Date.now()}.zip`,
  );
  await expect(verifyScfPackage(outputZip)).rejects.toThrow(
    "SCF package verification failed",
  );
});
