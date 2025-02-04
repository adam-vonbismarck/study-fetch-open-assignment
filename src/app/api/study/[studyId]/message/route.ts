"use server"

import { NextRequest, NextResponse } from "next/server";
import {getAIResponse, queryEmbedding} from "@/lib/message-helpers";
import { PrismaClient } from "@prisma/client";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import {PDFDocument, rgb} from 'pdf-lib';
import axios from "axios";
import { TextDecoder } from 'util';

const prisma = new PrismaClient();
const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

const decoder = new TextDecoder('utf-8');

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
async function highlightPassages(
  passages: { id: any; score: any; page: any; annotations: any; text: any }[],
  inputPdfData: string,
  outputPath: Uint8Array<ArrayBuffer>
): Promise<{ pdfBytes: Uint8Array, highlightedPages: number[] }> {
  // Load the PDF with pdf-lib.
  // load doc using pdf-js from url
  const relevanceThreshold = 0.83;
  const getData = await fetchPdfBufferFromWeb(inputPdfData)
  const pdfDoc = await PDFDocument.load(getData);
  const pages = pdfDoc.getPages();

  if (passages.length === 0) {
    console.error("No passages to highlight.");
    return { pdfBytes: await pdfDoc.save(), highlightedPages: [] };
  }
  const relevantPassages = passages.filter(passage => passage.score >= relevanceThreshold);
  const highlightedPages: number[] = [];
  // Parse the annotations JSON string.
  for (const passage of relevantPassages) {
    const annotations: Array<{
      page: number;
      x: number;
      y: number;
      width: number;
      height: number;
      color: string;
    }> = JSON.parse(passage.annotations);

    // For each annotation in the passage, add a highlight
    for (const annotation of annotations) {
      const pageIndex = annotation.page - 1;
      if (pageIndex < 0 || pageIndex >= pages.length) continue;

      const page = pages[pageIndex];
      page.drawRectangle({
        x: annotation.x,
        y: annotation.y,
        width: annotation.width,
        height: annotation.height,
        color: rgb(1, 1, 0), // Yellow fill
        opacity: 0.5, // Semi-transparent
      });

      if (!highlightedPages.includes(annotation.page)) {
        highlightedPages.push(annotation.page);
      }
    }
  }

  return {
    pdfBytes: await pdfDoc.save(),
    highlightedPages: highlightedPages.sort((a, b) => a - b)
  };
}

async function fetchPdfBufferFromWeb(url: string): Promise<Uint8Array> {
  // Fetch the PDF from the web as an ArrayBuffer.
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  // Convert the ArrayBuffer to a Uint8Array.
  return new Uint8Array(response.data);
}

export async function POST(req: NextRequest, props: { params: Promise<{ studyId: string }> }) {
  const params = await props.params;
  const encoder = new TextEncoder();

  try {
    const { messages } = await req.json();
    const studyId = params.studyId;

    const study = await prisma.study.findUnique({
      where: { id: studyId },
    });
    const currPdfUrl = study?.pdfUrl;

    if (!study) {
      return NextResponse.json({ error: "Study not found" }, { status: 404 });
    }

    // Save the user's message to the database
    await prisma.message.create({
      data: {
        content: messages[messages.length - 1].content,
        role: "user",
        studyId: studyId,
      }
    });

    // Get relevant PDF context using vector search
    const lastUserMessage = messages[messages.length - 1].content;
    const relevantPassages = await queryEmbedding(lastUserMessage, studyId);
    console.log('Relevant passages:', relevantPassages);
    // Create a readable stream for the response
    const readable = new ReadableStream({
      async start(controller) {
        try {
          // Get AI response stream
          const aiResponse = await getAIResponse(messages, studyId);
          const reader = aiResponse.body?.getReader();
          if (!reader) {
            throw new Error('No reader available from AI response');
          }

          let fullContent = "";

          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;

              // Decode and parse the chunk
              const text = decoder.decode(value);
              const events = text.split('\n').filter(Boolean);

              for (const event of events) {
                try {
                  const data = JSON.parse(event);
                  if (data.type === 'content') {
                    fullContent += data.value;
                    // Forward the content chunk to the client
                    const streamData = JSON.stringify({ type: 'content', value: data.value }) + '\n';
                    controller.enqueue(encoder.encode(streamData));
                  }
                } catch (e) {
                  console.error('Error parsing event:', e);
                }
              }
            }
          } finally {
            reader.releaseLock();
          }

          // Save the AI message after streaming is complete
          await prisma.message.create({
            data: {
              content: fullContent,
              role: "ai",
              studyId: studyId,
            }
          });

          // Process PDF highlighting
          const pdfResponse = await fetch(study.pdfUrl);
          const pdfBuffer = await pdfResponse.arrayBuffer();

          const { pdfBytes, highlightedPages } = await highlightPassages(
            relevantPassages,
            currPdfUrl,
            new Uint8Array(pdfBuffer)
          );

          // Upload highlighted PDF to S3
          const highlightedPdfKey = `${studyId}/highlighted-${Date.now()}.pdf`;
          const putCommand = new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: highlightedPdfKey,
            Body: pdfBytes,
            ContentType: 'application/pdf'
          });

          await s3Client.send(putCommand);

          const pdfUrl = `${process.env.R2_PUBLIC_DOMAIN}/${highlightedPdfKey}`;

          // Update study with new highlighted PDF URL
          await prisma.study.update({
            where: { id: studyId },
            data: { pdfUrl: pdfUrl }
          });

          // Send the PDF metadata
          const metadataChunk = JSON.stringify({
            type: 'metadata',
            highlightedPdfUrl: pdfUrl,
            highlightedPages: highlightedPages
          }) + '\n';
          controller.enqueue(encoder.encode(metadataChunk));
          
          controller.close();
        } catch (error) {
          console.error("Error in streaming response:", error);
          controller.error(error);
        }
      }
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error("Error in message route:", error);
    return NextResponse.json(
      { error: "Failed to process message", errorDetails: error },
      { status: 500 }
    );
  }
}
