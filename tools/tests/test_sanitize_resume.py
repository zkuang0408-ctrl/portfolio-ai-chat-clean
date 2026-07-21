import hashlib
from pathlib import Path
import tempfile
import unittest

import fitz

from tools.sanitize_resume import (
    PRIVATE_CONTACT_RECT,
    audit_public_resume,
    sanitize_resume,
)


SYNTHETIC_PRIVATE_EMAIL = "private.person@example.invalid"
SYNTHETIC_PRIVATE_PHONE = "+1 555 010 2048"
SYNTHETIC_PRIVATE_ADDRESS = "42 Example Lane, Testville"
PUBLIC_EMAIL = "zkuang0408@gmail.com"
EXPERIENCE_TEXT = "Product designer at Example Studio, 2021-2024"
SYNTHETIC_STRUCTURE_MARKER = "synthetic-structure-private-marker"
SYNTHETIC_HIDDEN_MARKER = "synthetic-hidden-private-marker.invalid"
SYNTHETIC_HIDDEN_PHONE = "+1 555 010 2048 synthetic.invalid"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def all_pdf_payload(document: fitz.Document) -> bytes:
    payload = bytearray()
    for xref in range(1, document.xref_length()):
        payload.extend(document.xref_object(xref, compressed=False).encode())
        if document.xref_is_stream(xref):
            payload.extend(document.xref_stream(xref))
    payload.extend(str(document.metadata).encode())
    return bytes(payload)


def add_hidden_payload(
    document: fitz.Document,
    page: fitz.Page,
    marker: str,
) -> None:
    document.set_metadata({"title": marker, "author": marker})
    document.embfile_add("synthetic.invalid", marker.encode(), filename="synthetic.invalid")
    page.add_text_annot((300, 300), marker)

    widget = fitz.Widget()
    widget.field_name = "synthetic_private_field"
    widget.field_type = fitz.PDF_WIDGET_TYPE_TEXT
    widget.field_value = marker
    widget.rect = fitz.Rect(300, 320, 500, 350)
    page.add_widget(widget)

    document.set_toc([[1, marker, 1]])
    action_xref = document.get_new_xref()
    document.update_object(
        action_xref,
        f"<< /S /JavaScript /JS ({marker}) >>",
    )
    document.xref_set_key(
        document.pdf_catalog(),
        "OpenAction",
        f"{action_xref} 0 R",
    )
    document.xref_set_key(document.pdf_catalog(), "MarkInfo", "<< /Marked true >>")

    structure_element = document.get_new_xref()
    structure_root = document.get_new_xref()
    document.update_object(
        structure_element,
        f"<< /Type /StructElem /S /Span /ActualText ({marker}) /Alt ({marker}) >>",
    )
    document.update_object(
        structure_root,
        f"<< /Type /StructTreeRoot /K {structure_element} 0 R >>",
    )
    document.xref_set_key(
        document.pdf_catalog(),
        "StructTreeRoot",
        f"{structure_root} 0 R",
    )

    marked_content_xref = document.get_new_xref()
    document.update_object(marked_content_xref, "<<>>")
    document.update_stream(
        marked_content_xref,
        f"/Span << /ActualText ({marker}) /Alt ({marker}) >> BDC EMC".encode(),
    )
    content_xrefs = page.get_contents()
    page.parent.xref_set_key(
        page.xref,
        "Contents",
        "[" + " ".join(f"{xref} 0 R" for xref in [*content_xrefs, marked_content_xref]) + "]",
    )


class SanitizeResumeTests(unittest.TestCase):
    def test_redaction_rect_ends_at_sidebar_boundary(self) -> None:
        self.assertEqual(PRIVATE_CONTACT_RECT, fitz.Rect(0, 420, 154, 630))

    def test_rejects_unapproved_or_multiline_public_email(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            input_path = Path(temp_dir) / "source.pdf"
            output_path = Path(temp_dir) / "public.pdf"
            document = fitz.open()
            document.new_page(width=595, height=842)
            document.save(input_path)
            document.close()

            for public_email in (
                "alternate.contact@example.invalid",
                f"{PUBLIC_EMAIL}\nmalicious@example.invalid",
                f"{PUBLIC_EMAIL}\x00",
                f"{'x' * 200}@example.invalid",
            ):
                with self.subTest(public_email=public_email):
                    with self.assertRaisesRegex(ValueError, "approved public email"):
                        sanitize_resume(
                            input_path,
                            output_path,
                            public_email,
                            expected_sha256=sha256(input_path),
                        )

    def test_rejects_unapproved_source_digest(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            input_path = Path(temp_dir) / "source.pdf"
            output_path = Path(temp_dir) / "public.pdf"
            document = fitz.open()
            document.new_page(width=595, height=842)
            document.save(input_path)
            document.close()

            with self.assertRaisesRegex(ValueError, "SHA-256"):
                sanitize_resume(
                    input_path,
                    output_path,
                    PUBLIC_EMAIL,
                    expected_sha256="0" * 64,
                )

    def test_rejects_non_a4_source_page(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            input_path = Path(temp_dir) / "letter.pdf"
            output_path = Path(temp_dir) / "public.pdf"
            document = fitz.open()
            document.new_page(width=612, height=792)
            document.save(input_path)
            document.close()

            with self.assertRaisesRegex(ValueError, "A4"):
                sanitize_resume(
                    input_path,
                    output_path,
                    PUBLIC_EMAIL,
                    expected_sha256=sha256(input_path),
                )

    def test_rejects_using_source_as_output(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            source_path = Path(temp_dir) / "source.pdf"
            document = fitz.open()
            document.new_page(width=595, height=842)
            document.save(source_path)
            document.close()
            source_bytes = source_path.read_bytes()

            with self.assertRaisesRegex(ValueError, "different paths"):
                sanitize_resume(
                    source_path,
                    source_path,
                    PUBLIC_EMAIL,
                    expected_sha256=sha256(source_path),
                )

            self.assertEqual(source_path.read_bytes(), source_bytes)

    def test_removes_private_contact_details_and_preserves_visible_experience(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            input_path = Path(temp_dir) / "source.pdf"
            output_path = Path(temp_dir) / "public.pdf"
            document = fitz.open()
            page = document.new_page(width=595, height=842)
            page.insert_text((20, 450), SYNTHETIC_PRIVATE_EMAIL)
            page.insert_text((20, 475), SYNTHETIC_PRIVATE_PHONE)
            page.insert_text((20, 500), SYNTHETIC_PRIVATE_ADDRESS)
            page.insert_text((200, 450), EXPERIENCE_TEXT)
            document.save(input_path)
            document.close()

            sanitize_resume(
                input_path,
                output_path,
                PUBLIC_EMAIL,
                expected_sha256=sha256(input_path),
            )

            with fitz.open(output_path) as sanitized:
                text = sanitized[0].get_text()
                experience_region = sanitized[0].get_pixmap(
                    clip=fitz.Rect(190, 430, 520, 470),
                    colorspace=fitz.csRGB,
                    alpha=False,
                )

            dark_experience_pixels = sum(
                1
                for offset in range(0, len(experience_region.samples), experience_region.n)
                if max(experience_region.samples[offset : offset + 3]) < 180
            )

            self.assertNotIn(SYNTHETIC_PRIVATE_EMAIL, text)
            self.assertNotIn(SYNTHETIC_PRIVATE_PHONE, text)
            self.assertNotIn(SYNTHETIC_PRIVATE_ADDRESS, text)
            self.assertIn(PUBLIC_EMAIL, text)
            self.assertGreater(dark_experience_pixels, 50)

    def test_removes_private_structure_payload_from_pdf_objects_and_bytes(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            input_path = Path(temp_dir) / "tagged-source.pdf"
            output_path = Path(temp_dir) / "public.pdf"
            document = fitz.open()
            page = document.new_page(width=595, height=842)
            page.insert_text((200, 450), EXPERIENCE_TEXT)
            structure_element = document.get_new_xref()
            structure_root = document.get_new_xref()
            document.update_object(
                structure_element,
                f"<< /Type /StructElem /S /Span /ActualText ({SYNTHETIC_STRUCTURE_MARKER}) >>",
            )
            document.update_object(
                structure_root,
                f"<< /Type /StructTreeRoot /K {structure_element} 0 R >>",
            )
            document.xref_set_key(
                document.pdf_catalog(),
                "StructTreeRoot",
                f"{structure_root} 0 R",
            )
            document.save(input_path)
            document.close()

            sanitize_resume(
                input_path,
                output_path,
                PUBLIC_EMAIL,
                expected_sha256=sha256(input_path),
            )

            output_bytes = output_path.read_bytes()
            with fitz.open(output_path) as sanitized:
                object_text = "\n".join(
                    sanitized.xref_object(xref, compressed=False)
                    for xref in range(1, sanitized.xref_length())
                )
                extracted_text = sanitized[0].get_text()

            self.assertNotIn(SYNTHETIC_STRUCTURE_MARKER.encode(), output_bytes)
            self.assertNotIn(SYNTHETIC_STRUCTURE_MARKER, object_text)
            self.assertNotIn(SYNTHETIC_STRUCTURE_MARKER, extracted_text)

    def test_reconstructs_without_hidden_source_payload_channels(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            input_path = Path(temp_dir) / "hostile-source.pdf"
            output_path = Path(temp_dir) / "public.pdf"
            document = fitz.open()
            page = document.new_page(width=595, height=842)
            page.insert_text((200, 450), EXPERIENCE_TEXT)
            add_hidden_payload(document, page, SYNTHETIC_HIDDEN_MARKER)
            document.save(input_path)
            document.close()

            sanitize_resume(
                input_path,
                output_path,
                PUBLIC_EMAIL,
                expected_sha256=sha256(input_path),
            )

            with fitz.open(output_path) as sanitized:
                payload = all_pdf_payload(sanitized)
                catalog = sanitized.pdf_catalog()
                forbidden_catalog_keys = (
                    "StructTreeRoot",
                    "MarkInfo",
                    "Metadata",
                    "Names",
                    "OpenAction",
                    "AA",
                    "AcroForm",
                    "Outlines",
                )
                self.assertEqual(sanitized.embfile_count(), 0)
                self.assertEqual(sanitized.get_toc(), [])
                self.assertIsNone(sanitized[0].first_annot)
                self.assertIsNone(sanitized[0].first_widget)
                self.assertTrue(
                    all(
                        sanitized.xref_get_key(catalog, key)[0] == "null"
                        for key in forbidden_catalog_keys
                    )
                )

            self.assertNotIn(SYNTHETIC_HIDDEN_MARKER.encode(), output_path.read_bytes())
            self.assertNotIn(SYNTHETIC_HIDDEN_MARKER.encode(), payload)

    def test_erases_private_raster_pixels_via_full_page_reconstruction(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            input_path = Path(temp_dir) / "raster-source.pdf"
            output_path = Path(temp_dir) / "public.pdf"
            document = fitz.open()
            page = document.new_page(width=595, height=842)
            page.insert_text((200, 450), EXPERIENCE_TEXT)
            private_image = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 60, 60), False)
            private_image.set_rect(private_image.irect, (238, 0, 238))
            page.insert_image(fitz.Rect(20, 520, 80, 580), pixmap=private_image)
            document.save(input_path)
            document.close()

            sanitize_resume(
                input_path,
                output_path,
                PUBLIC_EMAIL,
                expected_sha256=sha256(input_path),
            )

            with fitz.open(output_path) as sanitized:
                images = sanitized[0].get_images(full=True)
                self.assertEqual(len(images), 1)
                page_image = fitz.Pixmap(sanitized, images[0][0])
                self.assertGreaterEqual(page_image.width, 1785)
                self.assertGreaterEqual(page_image.height, 2526)
                rendered = sanitized[0].get_pixmap(colorspace=fitz.csRGB, alpha=False)

            private_color_pixels = sum(
                1
                for y in range(rendered.height)
                for x in range(rendered.width)
                if (
                    rendered.pixel(x, y)[0] > 200
                    and rendered.pixel(x, y)[1] < 80
                    and rendered.pixel(x, y)[2] > 200
                )
            )
            self.assertEqual(private_color_pixels, 0)

    def test_audit_rejects_phone_like_value_in_hidden_object(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            input_path = Path(temp_dir) / "source.pdf"
            clean_path = Path(temp_dir) / "clean.pdf"
            tainted_path = Path(temp_dir) / "tainted.pdf"
            document = fitz.open()
            document.new_page(width=595, height=842)
            document.save(input_path)
            document.close()
            sanitize_resume(
                input_path,
                clean_path,
                PUBLIC_EMAIL,
                expected_sha256=sha256(input_path),
            )

            with fitz.open(clean_path) as clean_document:
                hidden_xref = clean_document.get_new_xref()
                clean_document.update_object(
                    hidden_xref,
                    f"<< /SyntheticPrivatePhone ({SYNTHETIC_HIDDEN_PHONE}) >>",
                )
                clean_document.save(tainted_path, garbage=0)

            with self.assertRaisesRegex(ValueError, "phone-like"):
                audit_public_resume(tainted_path)


if __name__ == "__main__":
    unittest.main()
