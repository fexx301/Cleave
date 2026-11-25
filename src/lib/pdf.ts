// 100% Client-Side PDF Text Extraction via pdfjs-dist.
// Raw PDF bytes stay strictly in browser memory — never passed as inlineData to PREFER_ON_DEVICE
// (which would silently upload raw PDFs to Google Cloud).

import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface LocalPdfExtractionResult {
  text: string;
  pageCount: number;
  byteLength: number;
  fileName: string;
}

export async function extractPdfTextLocally(file: File): Promise<LocalPdfExtractionResult> {
  const buffer = await file.arrayBuffer();
  const loadingTask = getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;

  const pageTexts: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const lines: string[] = [];
    let currentLine = "";

    for (const item of content.items) {
      if (!("str" in item)) continue;
      const textItem = item as { str: string; hasEOL?: boolean };
      currentLine += textItem.str;
      if (textItem.hasEOL) {
        lines.push(currentLine.trim());
        currentLine = "";
      } else {
        currentLine += " ";
      }
    }
    if (currentLine.trim()) lines.push(currentLine.trim());
    pageTexts.push(lines.filter(Boolean).join("\n"));
  }

  const combined = pageTexts.join("\n\n").trim();
  if (!combined) {
    throw new Error(
      "This PDF appears to contain scanned images without selectable text. Copy/paste the text or use a text-based PDF."
    );
  }

  return {
    text: combined,
    pageCount: pdf.numPages,
    byteLength: buffer.byteLength,
    fileName: file.name
  };
}
