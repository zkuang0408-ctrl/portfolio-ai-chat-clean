// @vitest-environment node

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";

import { verifyProjectPageAssets } from "./verify-project-page-assets";

test("rejects a manifest whose page asset is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "project-pages-"));
  const manifest = {
    version: 1,
    projects: [
      {
        id: "inkseat",
        source: "/projects/pdfs/inkseat.pdf",
        sourceHash: "a1b2c3d4e5f6",
        pageCount: 1,
        pages: [
          {
            page: 1,
            mobile:
              "/projects/pages/inkseat/a1b2c3d4e5f6/01-960.webp",
            desktop:
              "/projects/pages/inkseat/a1b2c3d4e5f6/01-1800.webp",
          },
        ],
      },
    ],
  };
  await writeFile(join(root, "manifest.json"), JSON.stringify(manifest));

  await expect(
    verifyProjectPageAssets(manifest, root),
  ).rejects.toThrow(/missing page asset/i);
});
