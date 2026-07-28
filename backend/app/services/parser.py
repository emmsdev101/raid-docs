"""Text extraction from user-uploaded files.

Kept intentionally free of framework/DB imports so the same helpers can
be reused from Celery workers, one-off scripts, and tests.
"""

from __future__ import annotations

from pathlib import Path


class UnsupportedFileType(ValueError):
    """Raised when the parser doesn't know how to handle a file extension."""


def parse_document(path: str | Path) -> str:
    """Extract raw text from `path` based on its extension."""
    p = Path(path)
    suffix = p.suffix.lower()

    if suffix == ".pdf":
        return _parse_pdf(p)
    if suffix in {".docx"}:
        return _parse_docx(p)
    if suffix in {".txt", ".md"}:
        return p.read_text(encoding="utf-8", errors="ignore")

    raise UnsupportedFileType(f"Unsupported file type: {suffix}")


def _parse_pdf(path: Path) -> str:
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    return "\n\n".join((page.extract_text() or "") for page in reader.pages)


def _parse_docx(path: Path) -> str:
    import docx  # python-docx

    document = docx.Document(str(path))
    return "\n".join(p.text for p in document.paragraphs)
