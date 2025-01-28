import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { PrismaClient } from "@prisma/client"
import { CoreMessage, generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import {authOptions} from "@/app/api/auth/[...nextauth]/route";

const prisma = new PrismaClient()

export async function POST(
  request: NextRequest,
  { params }: { params: { studyId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
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

    const messages: CoreMessage[] = [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content },
    ]

    const { response } = await generateText({
      model: openai("gpt-4o-2024-11-20"), // calls the OpenAI GPT-4 model
      system: "You are a helpful assistant.", // top-level system prompt
      messages,
    })

    const aiContent =
      response.messages[response.messages.length - 1]?.content ||
      "No AI response."


    // TODO: Generate AI response based on PDF content
    const aiResponse = "This is a placeholder AI response. Integration with AI model pending."

    // Create AI message
    const aiMessage = await prisma.message.create({
      data: {
        content: aiContent as string,
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
