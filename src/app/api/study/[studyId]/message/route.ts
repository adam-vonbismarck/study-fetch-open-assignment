import { NextRequest, NextResponse } from "next/server";
import {getAIResponse, queryEmbedding} from "@/lib/message-helpers";
import {highlightPassages, fetchPdfBufferFromWeb} from "@/lib/pdf-tools";
import { PrismaClient } from "@prisma/client";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const prisma = new PrismaClient();
const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

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
      fetchPdfBufferFromWeb(currPdfUrl),
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
