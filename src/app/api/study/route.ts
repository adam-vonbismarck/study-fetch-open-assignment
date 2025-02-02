"use server";

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { PrismaClient } from "@prisma/client"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"
import {authOptions} from "@/lib/auth-options";

const prisma = new PrismaClient()

// Initialize S3 client for R2
const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get("file") as File
    
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Convert File to Buffer for S3 upload
    const buffer = Buffer.from(await file.arrayBuffer())
    const key = `${session.user.id}/${Date.now()}-${file.name}`

    // Upload file to R2
    await s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: file.type,
      })
    )

    // Generate the secure URL for the uploaded file using proper R2 configuration
    const pdfUrl = `${process.env.R2_PUBLIC_DOMAIN}/${key}`

    // Create new study with the uploaded PDF
    const study = await prisma.study.create({
      data: {
        title: file.name.replace(/\.[^/.]+$/, ""), // Remove file extension
        pdfUrl: pdfUrl,
        pdfName: file.name,
        userId: session.user.id,
      },
    })

    return NextResponse.json({ study })
  } catch (error) {
    console.error("Error uploading PDF:", error)
    return NextResponse.json(
      { error: "Failed to upload PDF" },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const studies = await prisma.study.findMany({
      where: {
        userId: session.user.id,
      },
      include: {
        messages: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    return NextResponse.json({ studies })
  } catch (error) {
    console.error("Error fetching studies:", error)
    return NextResponse.json(
      { error: "Failed to fetch studies" },
      { status: 500 }
    )
  }
}
