import hashlib
import tempfile
import unittest
from pathlib import Path

from tools.render_project_pages import asset_paths, source_digest


class RenderProjectPagesTests(unittest.TestCase):
    def test_source_digest_uses_first_twelve_sha256_characters(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "sample.pdf"
            source.write_bytes(b"portfolio-pdf")
            expected = hashlib.sha256(b"portfolio-pdf").hexdigest()[:12]

            self.assertEqual(source_digest(source), expected)

    def test_asset_paths_include_project_hash_page_and_width(self):
        mobile, desktop = asset_paths("inkseat", "a1b2c3d4e5f6", 1)

        self.assertEqual(
            mobile.as_posix(),
            "projects/pages/inkseat/a1b2c3d4e5f6/01-960.webp",
        )
        self.assertEqual(
            desktop.as_posix(),
            "projects/pages/inkseat/a1b2c3d4e5f6/01-1800.webp",
        )


if __name__ == "__main__":
    unittest.main()
