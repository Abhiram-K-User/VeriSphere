/**
 * @file pdfParser.ts
 * @package @verisphere/forensics-engine
 * @purpose Parses a PDF document into raw text and structured logical layouts (sections).
 * @dependencies @verisphere/shared-types, pdfjs-dist or pdf-parse (future runtime dependencies)
 * @security Ensure files are parsed in sandboxed/limited CPU environments to mitigate zip-bomb or PDF-specific remote code executions.
 * @future_implementation Use standard pdf-parse or pdfjs-dist libraries to extract text blocks, sorting by text coordinates to maintain visual reading order.
 */

import { ResumeData } from "@verisphere/shared-types";

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

import { PDFParse } from "pdf-parse";

/**
 * Parses a raw PDF file buffer and returns structured layout text, extracted hyperlink
 * annotations (even from FlateDecode-compressed LaTeX/Overleaf PDFs), and metadata.
 */
export async function parsePdfBuffer(pdfBuffer: Buffer): Promise<ParsedPDFLayout> {
  if (!pdfBuffer || pdfBuffer.length === 0) {
    throw new Error("Invalid input: pdfBuffer is empty or undefined.");
  }

  const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });
  try {
    const [rawTextObj, infoResult] = await Promise.all([
      parser.getText(),
      parser.getInfo({ parsePageInfo: true }).catch(() => ({ total: 1, info: {}, pages: [] } as any)),
    ]);

    const rawText = typeof rawTextObj === "string" ? rawTextObj : (rawTextObj as any).text || "";
    const lowerText = rawText.toLowerCase();

    // Collect all clickable hyperlink URLs from decompressed PDF page annotations
    const linkSet = new Set<string>();
    const pages = Array.isArray((infoResult as any)?.pages) ? (infoResult as any).pages : [];
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
        pageCount: (infoResult as any)?.total || 1,
        pdfVersion: (infoResult as any)?.info?.PDFFormatVersion || "1.4",
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
