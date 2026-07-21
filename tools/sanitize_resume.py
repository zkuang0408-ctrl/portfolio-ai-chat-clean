"""Create and audit a privacy-safe public resume PDF."""

from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path
import re
import tempfile

import fitz


PRIVATE_CONTACT_RECT = fitz.Rect(0, 420, 154, 630)
SIDEBAR_GRAY = (0.23, 0.23, 0.23)
APPROVED_PUBLIC_EMAIL = "zkuang0408@gmail.com"
APPROVED_SOURCE_SHA256 = "A964335B8E8FC2AC475A850381B0A8346F4F63CF50F15652030C477D7A7368BA"
A4_WIDTH = 595.0
A4_HEIGHT = 842.0
A4_TOLERANCE = 2.0
RENDER_SCALE = 3

EMAIL_PATTERN = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE_PATTERN = re.compile(r"(?<!\d)\+?\d(?:[ ()-]*\d){7,}(?!\d)")
PDF_STRING_PATTERN = re.compile(rb"\((?:\\.|[^\\()])*\)")
FORBIDDEN_CATALOG_KEYS = (
    "StructTreeRoot",
    "MarkInfo",
    "Metadata",
    "Names",
    "OpenAction",
    "AA",
    "AcroForm",
    "Outlines",
)
FORBIDDEN_PDF_NAME_PATTERN = re.compile(
    rb"/(?:ActualText|Alt|EmbeddedFile|Filespec|JavaScript|JS|OpenAction|"
    rb"AA|AcroForm|Widget|Annot|StructTreeRoot|MarkInfo|Metadata|Names|"
    rb"Outlines|Action|Launch|URI|GoTo|SubmitForm|ResetForm|ImportData|"
    rb"Rendition|RichMedia|Sound|Movie|FileAttachment)"
    rb"(?=[\x00\x09\x0A\x0C\x0D <>\[\]()/]|$)"
)
DOCUMENT_INFO_FIELDS = (
    "title",
    "author",
    "subject",
    "keywords",
    "creator",
    "producer",
    "creationDate",
    "modDate",
    "trapped",
)


def _is_a4(page: fitz.Page) -> bool:
    return (
        abs(page.rect.width - A4_WIDTH) <= A4_TOLERANCE
        and abs(page.rect.height - A4_HEIGHT) <= A4_TOLERANCE
    )


def _pdf_payload(document: fitz.Document, raw_bytes: bytes) -> bytes:
    payload = bytearray(raw_bytes)
    for xref in range(1, document.xref_length()):
        payload.extend(document.xref_object(xref, compressed=False).encode())
        if document.xref_is_stream(xref):
            payload.extend(document.xref_stream(xref))
    payload.extend(document[0].get_text().encode())
    return bytes(payload)


def _phone_search_payload(document: fitz.Document) -> str:
    page_content_xrefs = {
        xref
        for page_number in range(document.page_count)
        for xref in document[page_number].get_contents()
    }
    image_xrefs = {
        image[0]
        for page_number in range(document.page_count)
        for image in document[page_number].get_images(full=True)
    }
    payload = bytearray()
    for xref in range(1, document.xref_length()):
        object_bytes = document.xref_object(xref, compressed=False).encode()
        for pdf_string in PDF_STRING_PATTERN.findall(object_bytes):
            payload.extend(pdf_string)
        if not document.xref_is_stream(xref) or xref in image_xrefs:
            continue
        stream = document.xref_stream(xref)
        if xref in page_content_xrefs:
            for pdf_string in PDF_STRING_PATTERN.findall(stream):
                payload.extend(pdf_string)
        else:
            payload.extend(stream)
    for page_number in range(document.page_count):
        payload.extend(document[page_number].get_text().encode())
    return payload.decode("latin-1", errors="ignore")


def audit_public_resume(
    pdf_path: Path,
    public_email: str = APPROVED_PUBLIC_EMAIL,
) -> None:
    """Reject a public PDF that exposes hidden or unapproved payload channels."""
    if public_email != APPROVED_PUBLIC_EMAIL:
        raise ValueError("Only the approved public email may be audited.")

    path = Path(pdf_path)
    raw_bytes = path.read_bytes()
    with fitz.open(stream=raw_bytes, filetype="pdf") as document:
        if document.page_count != 1 or not _is_a4(document[0]):
            raise ValueError("The public resume must be exactly one A4 page.")

        catalog = document.pdf_catalog()
        populated_keys = [
            key
            for key in FORBIDDEN_CATALOG_KEYS
            if document.xref_get_key(catalog, key)[0] != "null"
        ]
        if populated_keys:
            raise ValueError("The public resume contains a forbidden catalog payload.")

        if document.embfile_count() or document.get_toc() or document.is_form_pdf:
            raise ValueError("The public resume contains attachments, outlines, or forms.")

        page = document[0]
        if page.first_annot is not None or page.first_widget is not None or page.get_links():
            raise ValueError("The public resume contains annotations, widgets, or actions.")

        metadata = document.metadata
        if any(metadata.get(field) for field in DOCUMENT_INFO_FIELDS):
            raise ValueError("The public resume contains document-info metadata.")

        payload = _pdf_payload(document, raw_bytes)
        if FORBIDDEN_PDF_NAME_PATTERN.search(payload):
            raise ValueError("The public resume contains a forbidden hidden PDF token.")

        payload_text = payload.decode("latin-1", errors="ignore")
        emails = set(EMAIL_PATTERN.findall(payload_text))
        if emails != {APPROVED_PUBLIC_EMAIL}:
            raise ValueError("The public resume email set is not approved.")

        phone_payload = _phone_search_payload(document).replace(APPROVED_PUBLIC_EMAIL, "")
        if PHONE_PATTERN.search(phone_payload):
            raise ValueError("The public resume contains a phone-like contact value.")

        images = page.get_images(full=True)
        if len(images) != 1:
            raise ValueError("The public resume must contain one flattened page image.")
        page_image = fitz.Pixmap(document, images[0][0])
        if (
            page_image.width < round(A4_WIDTH * RENDER_SCALE)
            or page_image.height < round(A4_HEIGHT * RENDER_SCALE)
        ):
            raise ValueError("The flattened page image is below the required resolution.")


def _build_public_document(source_page: fitz.Page, public_email: str) -> fitz.Document:
    matrix = fitz.Matrix(RENDER_SCALE, RENDER_SCALE)
    page_image = source_page.get_pixmap(
        matrix=matrix,
        colorspace=fitz.csRGB,
        alpha=False,
        annots=False,
    )
    redaction_pixels = (PRIVATE_CONTACT_RECT * matrix).irect
    gray_pixels = tuple(round(channel * 255) for channel in SIDEBAR_GRAY)
    page_image.set_rect(redaction_pixels, gray_pixels)

    public_document = fitz.open()
    page = public_document.new_page(
        width=source_page.rect.width,
        height=source_page.rect.height,
    )
    page.insert_image(page.rect, stream=page_image.tobytes("png"))

    email_width = fitz.get_text_length(public_email, fontname="helv", fontsize=8)
    if email_width > PRIVATE_CONTACT_RECT.width - 32:
        public_document.close()
        raise ValueError("The approved public email does not fit the contact block.")

    page.insert_text((16, 450), "CONTACT", fontsize=9, fontname="helv", color=(1, 1, 1))
    page.insert_text((16, 478), "Email:", fontsize=8, fontname="helv", color=(1, 1, 1))
    page.insert_text((16, 494), public_email, fontsize=8, fontname="helv", color=(1, 1, 1))
    public_document.set_metadata({})
    public_document.del_xml_metadata()
    return public_document


def sanitize_resume(
    input_path: Path,
    output_path: Path,
    public_email: str,
    *,
    expected_sha256: str = APPROVED_SOURCE_SHA256,
) -> None:
    """Reconstruct a public resume from sanitized visible pixels and approved text."""
    source = Path(input_path)
    destination = Path(output_path)

    if public_email != APPROVED_PUBLIC_EMAIL:
        raise ValueError("Only the approved public email may be published.")

    if source.resolve() == destination.resolve():
        raise ValueError("The source and output must use different paths.")

    source_bytes = source.read_bytes()
    actual_sha256 = hashlib.sha256(source_bytes).hexdigest().upper()
    if actual_sha256 != expected_sha256.upper():
        raise ValueError("The source PDF SHA-256 does not match the approved digest.")

    with fitz.open(stream=source_bytes, filetype="pdf") as source_document:
        if source_document.page_count != 1:
            raise ValueError("The resume source must contain exactly one page.")
        if not _is_a4(source_document[0]):
            raise ValueError("The resume source must use an A4 page size.")
        public_document = _build_public_document(source_document[0], public_email)

    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            dir=destination.parent,
            prefix=f".{destination.stem}-",
            suffix=".pdf",
            delete=False,
        ) as temporary_file:
            temporary_path = Path(temporary_file.name)
        public_document.save(
            temporary_path,
            garbage=4,
            clean=True,
            deflate=True,
        )
        public_document.close()
        audit_public_resume(temporary_path, public_email)
        os.replace(temporary_path, destination)
        temporary_path = None
    finally:
        if not public_document.is_closed:
            public_document.close()
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--public-email")
    parser.add_argument("--audit", action="store_true")
    args = parser.parse_args()

    if args.audit:
        audit_public_resume(args.input)
        return
    if args.output is None or args.public_email is None:
        parser.error("--output and --public-email are required unless --audit is used")
    sanitize_resume(args.input, args.output, args.public_email)


if __name__ == "__main__":
    main()
