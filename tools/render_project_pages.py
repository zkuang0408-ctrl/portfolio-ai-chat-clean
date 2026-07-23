from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

import fitz
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
OUTPUT = PUBLIC / "projects" / "pages"
MANIFEST = ROOT / "src" / "portfolio" / "generated-project-pages.json"
WIDTHS = (960, 1800)
QUALITY = 88
PROJECTS = (
    ("inkseat", "inkseat.pdf"),
    ("emovue", "emovue.pdf"),
    ("evolution-fruit", "fruit-evolution.pdf"),
    ("atempo", "atempo.pdf"),
    ("urosense", "urosense.pdf"),
    ("first-fly", "first-fly.pdf"),
)


def source_digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:12]


def asset_paths(project_id: str, digest: str, page: int) -> tuple[Path, Path]:
    base = Path("projects") / "pages" / project_id / digest
    page_name = f"{page:02d}"
    return base / f"{page_name}-960.webp", base / f"{page_name}-1800.webp"


def render_page(page: fitz.Page, width: int, destination: Path) -> None:
    scale = width / page.rect.width
    pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
    image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, "WEBP", quality=QUALITY, method=6)


def render_projects() -> dict:
    manifest_projects = []
    output_root = OUTPUT.resolve()

    for project_id, filename in PROJECTS:
        source = PUBLIC / "projects" / "pdfs" / filename
        digest = source_digest(source)
        project_output = (OUTPUT / project_id).resolve()
        if output_root not in project_output.parents:
            raise RuntimeError(f"Unsafe output path: {project_output}")
        if project_output.exists():
            shutil.rmtree(project_output)

        pages = []
        with fitz.open(source) as document:
            for index, page in enumerate(document, start=1):
                relative_mobile, relative_desktop = asset_paths(
                    project_id,
                    digest,
                    index,
                )
                render_page(page, WIDTHS[0], PUBLIC / relative_mobile)
                render_page(page, WIDTHS[1], PUBLIC / relative_desktop)
                pages.append(
                    {
                        "page": index,
                        "mobile": f"/{relative_mobile.as_posix()}",
                        "desktop": f"/{relative_desktop.as_posix()}",
                    }
                )

        manifest_projects.append(
            {
                "id": project_id,
                "source": f"/projects/pdfs/{filename}",
                "sourceHash": digest,
                "pageCount": len(pages),
                "pages": pages,
            }
        )

    return {"version": 1, "projects": manifest_projects}


if __name__ == "__main__":
    manifest = render_projects()
    MANIFEST.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        "Rendered "
        f"{sum(project['pageCount'] for project in manifest['projects'])} "
        f"pages for {len(manifest['projects'])} projects."
    )
