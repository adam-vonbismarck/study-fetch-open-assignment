"use client";

import {PDFDocument, rgb} from 'pdf-lib';
import axios from "axios";
import { pdfjs } from 'react-pdf';

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
    page: number;
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
  pdfData: Uint8Array, window: string
): Promise<TextPosition[]> {
  // const pdfJS: any = await import('pdfjs-dist/build/pdf');
  pdfjs.GlobalWorkerOptions.workerSrc =
    window + '/pdf.worker.min.mjs';

  console.log('Test1');
  const loadingTask = await pdfjs.getDocument({data: pdfData}).promise;
  const pdfDoc = loadingTask
  const textPositions: TextPosition[] = [];
  const numPages = pdfDoc.numPages;

  // Iterate through each page.
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    console.log('Test2');
    const page = await pdfDoc.getPage(pageNum);
    // Get the viewport to know the page height (origin is bottom-left)
    const viewport = page.getViewport({scale: 1});
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
export async function createPassages(
  textPositions: TextPosition[],
  charsPerPassage = 1000
): Promise<Passage[]> {
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

  for (const {text, page, bbox, charCount: spanCharCount} of textPositions) {
    // Add one for the space that will be added between spans.
    const newCharCount = charCount + spanCharCount + 1;
    if (newCharCount > charsPerPassage && currentPassage) {
      const passage: Passage = {
        page_content: currentPassage.trim(),
        metadata: {
          title: "",
          page: page,
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
        page: textPositions[textPositions.length - 1].page,
        pid: String(passages.length),
        annotations: JSON.stringify(currentAnnotations),
      },
      type: "Document",
    };
    passages.push(passage);
  }

  return passages;
}

async function main() {
  const pdfUrl = 'https://pub-1e6fc0a0389b459094600e681adfc15d.r2.dev/6796f5b0983066d8e8d83b3c/1738506145584-first-chapter.pdf';
  const pdfBuffer = await fetchPdfBufferFromWeb(pdfUrl);
  const textPositions = await extractTextWithPositions(pdfBuffer);
  const passages = await createPassages(textPositions, 1000);
  console.log('Passages:', passages);
}

// main()
