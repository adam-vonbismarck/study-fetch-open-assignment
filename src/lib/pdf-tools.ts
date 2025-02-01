import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';
import fs from 'fs';
import { PDFDocument, rgb } from 'pdf-lib';
import path from 'path';

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextPosition {
  text: string;
  page: number;
  bbox: BBox;
  charCount: number;
}

export interface Passage {
  page_content: string;
  metadata: {
    title: string;
    pid: string;
    annotations: string; // JSON-encoded array of annotation objects
  };
  type: string;
}

/**
 * Extracts text spans and their position information from a PDF.
 * Uses pdfjs-dist to get the text content for each page.
 *
 * Each text span is represented as a TextPosition object.
 *
 * @param pdfData A Uint8Array containing the PDF data.
 * @returns An array of TextPosition objects.
 */
export async function extractTextWithPositions(
  pdfData: Uint8Array
): Promise<TextPosition[]> {
  const loadingTask = pdfjsLib.getDocument({ data: pdfData });
  const pdfDoc = await loadingTask.promise;
  const textPositions: TextPosition[] = [];
  const numPages = pdfDoc.numPages;

  // Iterate through each page.
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    // Get the viewport to know the page height (origin is bottom-left)
    const viewport = page.getViewport({ scale: 1 });
    const pageHeight = viewport.height;
    const textContent = await page.getTextContent();

    // Each item represents a text span.
    for (const item of textContent.items) {
      // Ensure we have non-empty text; pdf.js items should have a "str" property.
      if (typeof item.str !== 'string' || !item.str.trim()) continue;
      // Use the transform array to determine the position.
      // transform: [a, b, c, d, e, f] where (e, f) is the translation.
      const transform = item.transform as number[];
      const x = transform[4];
      const y = transform[5];
      const width = item.width || 0;
      const height = item.height || 0;
      textPositions.push({
        text: item.str,
        page: pageNum,
        bbox: {
          x,
          y: y,
          width,
          height,
        },
        charCount: item.str.length,
      });
    }
  }
  return textPositions;
}

/**
 * Creates passages from the extracted text positions.
 *
 * This function groups text spans (in reading order) until the cumulative
 * character count exceeds a threshold (charsPerPassage). For each passage,
 * it also accumulates the bounding box information (annotations) that can later be
 * used to highlight the text.
 *
 * @param textPositions Array of TextPosition objects.
 * @param charsPerPassage Threshold for cumulative characters per passage (default: 1000).
 * @returns An array of Passage objects.
 */
export function createPassages(
  textPositions: TextPosition[],
  charsPerPassage = 1000
): Passage[] {
  const passages: Passage[] = [];
  let currentPassage = "";
  let currentAnnotations: Array<{
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
  }> = [];
  let charCount = 0;

  for (const { text, page, bbox, charCount: spanCharCount } of textPositions) {
    // Add one for the space that will be added between spans.
    const newCharCount = charCount + spanCharCount + 1;
    if (newCharCount > charsPerPassage && currentPassage) {
      const passage: Passage = {
        page_content: currentPassage.trim(),
        metadata: {
          title: "",
          pid: String(passages.length),
          annotations: JSON.stringify(currentAnnotations),
        },
        type: "Document",
      };
      passages.push(passage);

      // Start a new passage with the current text span.
      currentPassage = text + " ";
      currentAnnotations = [
        {
          page,
          x: bbox.x,
          y: bbox.y,
          width: bbox.width,
          height: bbox.height,
          color: "#FFFF00",
        },
      ];
      charCount = spanCharCount + 1;
    } else {
      currentPassage += text + " ";
      currentAnnotations.push({
        page,
        x: bbox.x,
        y: bbox.y,
        width: bbox.width,
        height: bbox.height,
        color: "#FFFF00",
      });
      charCount = newCharCount;
    }
  }

  // Add any remaining text as a final passage.
  if (currentPassage.trim()) {
    const passage: Passage = {
      page_content: currentPassage.trim(),
      metadata: {
        title: "",
        pid: String(passages.length),
        annotations: JSON.stringify(currentAnnotations),
      },
      type: "Document",
    };
    passages.push(passage);
  }

  return passages;
}

/**
 * Highlights the annotations from the first passage in the PDF and saves a new PDF file.
 *
 * This function uses pdf-lib to load the original PDF, draw semi-transparent
 * yellow rectangles over each annotation in the first passage, and then save the modified PDF.
 *
 * @param passages An array of Passage objects (as produced by createPassages).
 * @param inputPdfData The original PDF data as a Uint8Array.
 * @param outputPath Path where the highlighted PDF should be saved.
 */
export async function highlightPassages(
  passages: Passage[],
  inputPdfData: Uint8Array,
  outputPath: string
): Promise<void> {
  // Load the PDF with pdf-lib.
  const pdfDoc = await PDFDocument.load(inputPdfData);
  const pages = pdfDoc.getPages();

  if (passages.length === 0) {
    console.error("No passages to highlight.");
    return;
  }

  // For testing, we highlight only the first passage.
  const firstPassage = passages[0];
  // Parse the annotations JSON string.
  const annotations: Array<{
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
  }> = JSON.parse(firstPassage.metadata.annotations);

  // For each annotation, add a highlight (a rectangle with yellow border).
  for (const annotation of annotations) {
    const pageIndex = annotation.page - 1;
    if (pageIndex < 0 || pageIndex >= pages.length) continue;
    const page = pages[pageIndex];

    page.drawRectangle({
      x: annotation.x,
      y: annotation.y,
      width: annotation.width,
      height: annotation.height,
      color: rgb(1, 1, 0), // Yellow fill.
      opacity: 0.5, // Semi-transparent.
    });
  }

  // TODO write this to the bucket instead of the local file system
  const modifiedPdfBytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, modifiedPdfBytes);
}

async function main() {
  const testPDFBuffer = fs.readFileSync('/Users/adamvonbismarck/Study' +
    ' Fetch/study-fetch-open-assignment/src/lib/blstm_crf_paper.pdf');

  const pdfUint8Array = new Uint8Array(testPDFBuffer);
  const textPositions = await extractTextWithPositions(pdfUint8Array);
  const passages = createPassages(textPositions, 1000);
  console.log("First passage:", JSON.stringify(passages[0], null, 4));

  await highlightPassages(passages, pdfUint8Array, "/Users/adamvonbismarck/Study" +
    " Fetch/study-fetch-open-assignment/src/lib/highlighted.pdf");
  console.log(`Highlighted PDF saved to ${"/Users/adamvonbismarck/Study Fetch/study-fetch-open-assignment/src/lib"}`);
}

// Uncomment the following line to run the example when executing this file directly.
main();