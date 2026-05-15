---
name: pdf
description: Extract text, metadata, and page counts from PDF files using common CLI tools.
---

# PDF Processing

## Quick checks

Always inspect a PDF before extracting:

```bash
pdfinfo input.pdf            # page count, encryption, producer
file input.pdf               # confirm it's actually a PDF
```

## Text extraction

In order of preference:

1. **`pdftotext`** (poppler-utils, fastest, preserves layout reasonably well)
   ```bash
   pdftotext -layout input.pdf -    # stdout
   pdftotext input.pdf out.txt      # to file
   ```

2. **Python `pypdf`** (when poppler is unavailable)
   ```bash
   python3 -c "from pypdf import PdfReader; print('\n'.join(p.extract_text() for p in PdfReader('input.pdf').pages))"
   ```

3. **OCR fallback** (scanned PDFs with no embedded text)
   ```bash
   pdftoppm -r 300 input.pdf page -png    # rasterize at 300dpi
   for f in page-*.png; do tesseract "$f" "${f%.png}"; done
   cat page-*.txt > extracted.txt
   ```

## Common pitfalls

- **Empty output from `pdftotext`** usually means the PDF is image-based — fall back to OCR.
- **Encrypted PDFs**: try `qpdf --decrypt input.pdf out.pdf` first.
- **Two-column layouts**: use `pdftotext -layout` (without `-layout` columns get interleaved).
