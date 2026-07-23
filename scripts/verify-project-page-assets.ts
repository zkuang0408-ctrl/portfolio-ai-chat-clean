import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

export interface ProjectPageAsset {
  readonly page: number;
  readonly mobile: string;
  readonly desktop: string;
}

export interface ProjectPageManifestEntry {
  readonly id: string;
  readonly source: string;
  readonly sourceHash: string;
  readonly pageCount: number;
  readonly pages: readonly ProjectPageAsset[];
}

export interface ProjectPageManifest {
  readonly version: number;
  readonly projects: readonly ProjectPageManifestEntry[];
}

const expectedProjects = [
  ["inkseat", 18],
  ["emovue", 19],
  ["evolution-fruit", 25],
  ["atempo", 20],
  ["urosense", 25],
  ["first-fly", 28],
] as const;

function publicPath(publicRoot: string, urlPath: string): string {
  if (!urlPath.startsWith("/")) {
    throw new Error(`Invalid public asset path: ${urlPath}`);
  }
  const root = resolve(publicRoot);
  const path = resolve(root, `.${urlPath}`);
  if (path !== root && !path.startsWith(`${root}\\`) && !path.startsWith(`${root}/`)) {
    throw new Error(`Public asset escapes root: ${urlPath}`);
  }
  return path;
}

async function requireNonEmptyFile(path: string, description: string): Promise<void> {
  let details;
  try {
    details = await stat(path);
  } catch {
    throw new Error(`Missing ${description}: ${path}`);
  }
  if (!details.isFile() || details.size <= 0) {
    throw new Error(`Empty ${description}: ${path}`);
  }
}

async function sha256(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

export async function verifyProjectPageAssets(
  manifest: ProjectPageManifest,
  publicRoot: string,
): Promise<void> {
  if (manifest.version !== 1) {
    throw new Error(`Unsupported project page manifest version: ${manifest.version}`);
  }

  for (const project of manifest.projects) {
    if (project.pages.length !== project.pageCount) {
      throw new Error(`Page count mismatch for ${project.id}`);
    }
    for (const [index, page] of project.pages.entries()) {
      const expectedPage = index + 1;
      if (page.page !== expectedPage) {
        throw new Error(`Page sequence mismatch for ${project.id}`);
      }
      if (!page.mobile.endsWith("-960.webp")) {
        throw new Error(`Invalid mobile page asset for ${project.id}`);
      }
      if (!page.desktop.endsWith("-1800.webp")) {
        throw new Error(`Invalid desktop page asset for ${project.id}`);
      }
      await requireNonEmptyFile(
        publicPath(publicRoot, page.mobile),
        "page asset",
      );
      await requireNonEmptyFile(
        publicPath(publicRoot, page.desktop),
        "page asset",
      );
    }

    const source = publicPath(publicRoot, project.source);
    await requireNonEmptyFile(source, "source PDF");
    if (!(await sha256(source)).startsWith(project.sourceHash)) {
      throw new Error(`Source hash mismatch for ${project.id}`);
    }
  }

  const actualSummary = manifest.projects.map(({ id, pageCount }) => [
    id,
    pageCount,
  ]);
  if (JSON.stringify(actualSummary) !== JSON.stringify(expectedProjects)) {
    throw new Error("Project order or page counts do not match portfolio content");
  }
}

async function main(): Promise<void> {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const manifestPath = resolve(
    projectRoot,
    "src/portfolio/generated-project-pages.json",
  );
  const manifest = JSON.parse(
    await readFile(manifestPath, "utf8"),
  ) as ProjectPageManifest;
  await verifyProjectPageAssets(manifest, resolve(projectRoot, "public"));
  const pageCount = manifest.projects.reduce(
    (total, project) => total + project.pageCount,
    0,
  );
  console.log(
    `Verified project page assets: projects=${manifest.projects.length} pages=${pageCount}`,
  );
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
  await main();
}
