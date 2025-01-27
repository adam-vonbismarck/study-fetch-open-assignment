import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export async function POST(
  request: NextRequest,
  { params }: { params: { studyId: string } }
) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { content } = await request.json()

    // Verify the study belongs to the user
    const study = await prisma.study.findFirst({
      where: {
        id: params.studyId,
        userId: session.user.id,
      },
    })

    if (!study) {
      return NextResponse.json({ error: "Study not found" }, { status: 404 })
    }

    // Create user message
    const userMessage = await prisma.message.create({
      data: {
        content,
        role: "user",
        studyId: params.studyId,
      },
    })

    // TODO: Generate AI response based on PDF content
    const aiResponse = "This is a placeholder AI response. Integration with AI model pending."

    // Create AI message
    const aiMessage = await prisma.message.create({
      data: {
        content: aiResponse,
        role: "ai",
        studyId: params.studyId,
      },
    })

    return NextResponse.json({ userMessage, aiMessage })
  } catch (error) {
    console.error("Error creating message:", error)
    return NextResponse.json(
      { error: "Failed to create message" },
      { status: 500 }
    )
  }
}
