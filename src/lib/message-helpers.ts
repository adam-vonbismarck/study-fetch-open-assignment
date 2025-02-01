import {PrismaClient} from "@prisma/client";
import OpenAI from "openai";
import { queryPDFContext } from "./pdf-helpers";

const prisma = new PrismaClient();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_TWO,
});

export async function getAIResponse(messages: { role: string; content: string }[], studyId?: string) {
  let systemMessage = "You are a helpful AI assistant.";
  
  if (studyId) {
    // Get relevant PDF context
    const lastUserMessage = messages.filter(m => m.role === "user").pop();
    if (lastUserMessage) {
      const pdfContext = await queryPDFContext(lastUserMessage.content, studyId);
      if (pdfContext) {
        systemMessage = `You are a helpful AI assistant. Use the following PDF context to help answer the question: \n\n${pdfContext}\n\nIf the context doesn't help answer the question directly, use your general knowledge but mention that the answer isn't specifically from the PDF.`;
      }
    }
  }

  const formattedMessages = [
    { role: "system", content: systemMessage },
    ...messages.map(msg => ({
      role: msg.role === "user" ? "user" : "assistant",
      content: msg.content
    }))
  ];

  const response = await openai.chat.completions.create({
    model: "gpt-4-turbo-2024-04-09",
    messages: formattedMessages,
  });

  return response.choices[0].message.content;
}

export async function saveMessages({ messages }: { messages: { content: string; role: string; studyId: string }[] }) {
  return await Promise.all(
    messages.map(async (message) => {
      return prisma.message.create({
        data: {
          content: message.content,
          role: message.role,
          studyId: message.studyId,
        },
      });
    })
  );
}
