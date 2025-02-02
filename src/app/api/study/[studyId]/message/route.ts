import { NextRequest, NextResponse } from "next/server";
import {getAIResponse, queryEmbedding} from "@/lib/message-helpers";
import { PrismaClient } from "@prisma/client";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import {PDFDocument, rgb} from 'pdf-lib';
import axios from "axios";

const prisma = new PrismaClient();
const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

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
  passages: { id: any; score: any; page: any; annotations: any; text: any }[],
  inputPdfData: string,
  outputPath: Uint8Array<ArrayBuffer>
): Promise<Uint8Array> {
  // Load the PDF with pdf-lib.
  // load doc using pdf-js from url
  const getData = await fetchPdfBufferFromWeb(inputPdfData)
  const pdfDoc = await PDFDocument.load(getData);
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
  }> = JSON.parse(firstPassage.annotations);

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

  return pdfDoc.save();
  // const modifiedPdfBytes = await pdfDoc.save();
  // fs.writeFileSync(outputPath, modifiedPdfBytes);
}

export async function fetchPdfBufferFromWeb(url: string): Promise<Uint8Array> {
  // Fetch the PDF from the web as an ArrayBuffer.
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  // Convert the ArrayBuffer to a Uint8Array.
  return new Uint8Array(response.data);
}

export async function POST(req: NextRequest, props: { params: Promise<{ studyId: string }> }) {
  const params = await props.params;
  try {
    const { messages } = await req.json();
    const studyId = params.studyId;

    // Get the study to access the PDF URL
    const study = await prisma.study.findUnique({
      where: { id: studyId },
    });
    const currPdfUrl = study?.pdfUrl;

    if (!study) {
      return NextResponse.json({ error: "Study not found" }, { status: 404 });
    }

    // Get relevant PDF context using vector search
    const lastUserMessage = messages[messages.length - 1].content;
    const relevantPassages = await queryEmbedding(lastUserMessage, studyId);

    // Get AI response with PDF context
    const aiResponse = await getAIResponse(messages, studyId);

    // Get the PDF buffer from the current URL
    const pdfResponse = await fetch(study.pdfUrl);
    const pdfBuffer = await pdfResponse.arrayBuffer();

    // Highlight relevant passages in the PDF
    const highlightedPdfBuffer  = await highlightPassages(
      relevantPassages,
      currPdfUrl,
      new Uint8Array(pdfBuffer)
    );

    // Upload highlighted PDF to S3
    const highlightedPdfKey = `${studyId}/highlighted-${Date.now()}.pdf`;
    const putCommand = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: highlightedPdfKey,
      Body: highlightedPdfBuffer,
      ContentType: 'application/pdf'
    });

    await s3Client.send(putCommand);

    const pdfUrl = `${process.env.R2_PUBLIC_DOMAIN}/${highlightedPdfKey}`

    // Update study with new highlighted PDF URL
    await prisma.study.update({
      where: { id: studyId },
      data: { pdfUrl: pdfUrl }
    });

    // Return both the AI response and the new PDF URL
    return NextResponse.json({ 
      content: aiResponse,
      highlightedPdfUrl: pdfUrl
    });

  } catch (error) {
    console.error("Error in message route:", error);
    return NextResponse.json(
      { error: "Failed to process message" },
      { status: 500 }
    );
  }
}
