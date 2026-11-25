/**
 * @file pdfParser.ts
 * @package @verisphere/forensics-engine
 * @purpose Parses a PDF document into raw text, decompressed hyperlink annotations, and metadata.
 */

import { PDFParse } from "pdf-parse";

export interface ParsedPDFLayout {
  rawText: string;
  links: string[];
  metadata: {
    pageCount: number;
    pdfVersion: string;
    charCount: number;
  };
  sections: {
    skillsBlock?: string;
    experienceBlock?: string;
    educationBlock?: string;
    projectsBlock?: string;
  };
}

/**
 * Parses a raw PDF file buffer and returns structured layout text, extracted hyperlink
 * annotations (even from FlateDecode-compressed LaTeX/Overleaf/Chrome PDFs), and metadata.
 *
 * IMPORTANT: Calls getInfo({ parsePageInfo: true }) and getText() SEQUENTIALLY on the
 * PDFParse instance (never in Promise.all) to avoid detaching the underlying Uint8Array
 * ArrayBuffer or racing on pdf.js page.cleanup().
 */
export async function parsePdfBuffer(pdfBuffer: Buffer): Promise<ParsedPDFLayout> {
  if (!pdfBuffer || pdfBuffer.length === 0) {
    throw new Error("Invalid input: pdfBuffer is empty or undefined.");
  }

  // Copy into a dedicated Uint8Array so pdf.js worker transfer never mutates the caller's Buffer
  const uint8Copy = new Uint8Array(pdfBuffer.length);
  uint8Copy.set(pdfBuffer);

  const parser = new PDFParse({ data: uint8Copy });
  try {
    // 1. Extract metadata + decompressed page hyperlink annotations FIRST
    let infoResult: any = { total: 1, info: {}, pages: [] };
    try {
      infoResult = await parser.getInfo({ parsePageInfo: true });
    } catch (infoErr: any) {
      console.warn("[pdfParser] getInfo(parsePageInfo) warning:", infoErr?.message || infoErr);
    }

    // 2. Extract full text AFTER getInfo completes (safe sequential reuse of loaded doc)
    const rawTextObj = await parser.getText();
    const rawText = typeof rawTextObj === "string" ? rawTextObj : (rawTextObj as any).text || "";
    const lowerText = rawText.toLowerCase();

    // 3. Collect all clickable hyperlink URLs from decompressed PDF page annotations
    const linkSet = new Set<string>();
    const pages = Array.isArray(infoResult?.pages) ? infoResult.pages : [];
    for (const page of pages) {
      if (Array.isArray(page?.links)) {
        for (const linkObj of page.links) {
          if (typeof linkObj?.url === "string" && linkObj.url.trim()) {
            linkSet.add(linkObj.url.trim());
          }
        }
      }
    }

    const skillsIdx = lowerText.indexOf("skills");
    const expIdx = lowerText.indexOf("experience");
    const edIdx = lowerText.indexOf("education");

    return {
      rawText: rawText.trim(),
      links: Array.from(linkSet),
      metadata: {
        pageCount: infoResult?.total || 1,
        pdfVersion: infoResult?.info?.PDFFormatVersion || "1.4",
        charCount: rawText.length,
      },
      sections: {
        skillsBlock: skillsIdx !== -1 ? rawText.substring(skillsIdx, skillsIdx + 500) : "",
        experienceBlock: expIdx !== -1 ? rawText.substring(expIdx, expIdx + 1000) : "",
        educationBlock: edIdx !== -1 ? rawText.substring(edIdx, edIdx + 500) : "",
        projectsBlock: "",
      },
    };
  } catch (err: any) {
    throw new Error(`Failed to parse PDF content: ${err.message}`);
  } finally {
    await parser.destroy().catch(() => {});
  }
}
