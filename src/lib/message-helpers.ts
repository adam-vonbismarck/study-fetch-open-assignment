import {PrismaClient} from "@prisma/client";
import OpenAI from "openai";
import {createPassages, extractTextWithPositions, fetchPdfBufferFromWeb} from "@/lib/pdf-tools";
import {Pinecone} from "@pinecone-database/pinecone";

const prisma = new PrismaClient();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_TWO,
});
const pc = new Pinecone({apiKey: process.env.PINECONE_API_KEY});

export async function queryEmbedding(query: string, studyId: string) {
  const index = pc.Index("study-fetch");
  const queryEmbedded = await embed([query]);

  const result = await index.namespace(studyId).query({
    vector: queryEmbedded[0],
    topK: 4,
    includeMetadata: true
  });

  return result.matches.map((match: any) => ({
    id: match.id,
    score: match.score,
    page: match.metadata.page,
    annotations: match.metadata.annotations,
    text: match.metadata.text,
  }));
}

async function embed(docs: string[]) {
  const embedding = await openai.embeddings.create({
    model: 'text-embedding-ada-002',
    input: docs,
    encoding_format: "float",
  });
  return embedding.data.map(item => item.embedding);
}

export async function createEmbedding(pdfURL: string, studyId: string) {
  // const testPDFBuffer = fs.readFileSync(pdfURL);
  const pdfUint8Array = await fetchPdfBufferFromWeb(pdfURL);
  const textPositions = await extractTextWithPositions(pdfUint8Array);
  const passages = createPassages(textPositions, 1000);

  const docEmbedded = await embed(passages.map(d => d.page_content));
  const index = pc.Index("study-fetch");
  const records = passages.map((d, i) => ({
    id: d.metadata.pid,
    values: docEmbedded[i],
    metadata: {page: d.metadata.page, annotations: d.metadata.annotations, text: d.page_content},
  }));
  await index.namespace(studyId).upsert(records);

  // await highlightPassages(passages, pdfUint8Array, "/Users/adamvonbismarck/Study" +
  //   " Fetch/study-fetch-open-assignment/src/lib/highlighted.pdf");
  // console.log(`Highlighted PDF saved to ${"/Users/adamvonbismarck/Study
  // Fetch/study-fetch-open-assignment/src/lib"}`);
}

export async function getAIResponse(messages: { role: string; content: string }[], studyId?: string) {
  let systemMessage = "You are a helpful AI assistant.";

  if (studyId) {
    // Get relevant PDF context
    const lastUserMessage = messages.filter(m => m.role === "user").pop();
    if (lastUserMessage) {
      const pdfContext = await queryEmbedding(lastUserMessage.content, studyId);
      if (pdfContext && pdfContext.length > 0) {
        const contextText = pdfContext.map(p => p.text).join('\n\n');
        systemMessage = `You are a helpful AI assistant. Use the following PDF context to help answer the question: \n\n${contextText}\n\nIf the context doesn't help answer the question directly, use your general knowledge but mention that the answer isn't specifically from the PDF.`;
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
