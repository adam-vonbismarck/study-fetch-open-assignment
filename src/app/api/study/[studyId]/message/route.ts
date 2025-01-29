// import {NextRequest, NextResponse} from "next/server"
// import {getServerSession} from "next-auth"
// import {PrismaClient} from "@prisma/client"
// import {CoreMessage, createDataStreamResponse, generateText, streamText} from 'ai';
// import {authOptions} from "@/app/api/auth/[...nextauth]/route";
// import {createOpenAI} from "@ai-sdk/openai"
// import {getMostRecentUserMessage, saveMessages} from "@/lib/message-helpers";
//
// const openai = createOpenAI({apiKey: process.env.OPENAI_API_TWO})
//
// const prisma = new PrismaClient()
//
//
// export async function POST(request: Request) {
//   const session = await getServerSession(authOptions)
//   if (!session?.user?.id) {
//     return NextResponse.json({error: "Unauthorized"}, {status: 401})
//   }
//
//   const {studyId, messages}: { studyId: string, messages: Array<string> } = await request.json()
//
//   const model = openai.chat('gpt-4-turbo', {user: session.user.id})
//
//   const userMessage = getMostRecentUserMessage(messages);
//
//   if (!userMessage) {
//     return NextResponse.json({error: "No user message found"}, {status: 400})
//   }
//
//   const study = await prisma.study.findFirst({select: {id: true}, where: {id: studyId, userId: session.user.id}})
//
//   if (!study) {
//     return NextResponse.json({error: "Study not found"}, {status: 404})
//   }
//
//   await saveMessages({
//     messages: [{...userMessage, role: "user", studyId}],
//   });
//
//   return createDataStreamResponse({
//     execute: (dataStream) => {
//       const result = streamText({
//         model: model,
//         system: "You are a study AI tutor",
//         messages,
//         onFinish: async ({response}) => {
//           await saveMessages({
//             messages: response.messages.map(
//               (msg) => {
//                 return {
//                   content: msg.content,
//                   role: msg.role,
//                   studyId,
//                 };
//               }
//             )
//           })
//         }
//       });
//       result.mergeIntoDataStream(dataStream);
//     },
//   });
// }

import { NextRequest, NextResponse } from "next/server";
import { getAIResponse } from "@/lib/message-helpers";

export async function POST(req: NextRequest, props: { params: Promise<{ studyId: string }> }) {
  const params = await props.params;
  try {
    const { messages } = await req.json();
    const studyId = params.studyId;

    // Get response from OpenAI
    const aiResponse = await getAIResponse(messages);

    // Return the response
    return NextResponse.json({ content: aiResponse });

  } catch (error) {
    console.error("Error in message route:", error);
    return NextResponse.json(
      { error: "Failed to process message" },
      { status: 500 }
    );
  }
}
