import {NextResponse} from 'next/server';
import OpenAI from "openai";
import {Pinecone} from "@pinecone-database/pinecone";
import {Passage} from "@/lib/pdf-tools";
import {PrismaClient} from "@prisma/client";
import {createPassages, extractTextWithPositions} from "@/lib/pdf-tools";
import axios from "axios";

const prisma = new PrismaClient();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_TWO,
});

// @ts-ignore
const pc = new Pinecone({apiKey: process.env.PINECONE_API_KEY});

// Helper function to get the base URL
function getBaseUrl() {
  if (typeof window !== 'undefined') return '';
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.NEXT_PUBLIC_VERCEL_URL) return `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`;
  return 'http://localhost:3000';
}

async function embed(docs: string[]) {
  if (!docs || docs.length === 0) {
    throw new Error('No documents provided for embedding');
  }

  try {
    const embedding = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: docs,
      encoding_format: "float",
    });
    
    if (!embedding.data || embedding.data.length === 0) {
      throw new Error('No embeddings returned from OpenAI');
    }
    
    return embedding.data.map(item => item.embedding);
  } catch (error: any) {
    console.error('Error generating embeddings:', error);
    throw new Error(`Failed to generate embeddings: ${error.message}`);
  }
}

async function queryEmbeddingHandler(query: string, studyId: string) {
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

async function fetchPdfBufferFromWeb(url: string): Promise<Uint8Array> {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  return new Uint8Array(response.data);
}

async function createEmbeddingHandler(pdfURL: string, studyId: string, window: string) {
  const pdfUint8Array = await fetchPdfBufferFromWeb(pdfURL);
  const textPositions = await extractTextWithPositions(pdfUint8Array, window);
  const passages = await createPassages(textPositions, 1000);

  const docs = passages.map((passage: Passage) => passage.page_content);
  const embeddings = await embed(docs);
  const index = pc.Index("study-fetch");

  const records = passages.map((d: Passage, i: number) => ({
    id: d.metadata.pid,
    values: embeddings[i],
    metadata: {
      page: d.metadata.page,
      annotations: d.metadata.annotations,
      text: d.page_content,
    },
  }));

  await index.namespace(studyId).upsert(records);
  return { success: true };
}

async function saveMessages(messages: { content: string; role: string; studyId: string }[]) {
  try {
    return await prisma.message.createMany({
      data: messages.map((message) => ({
        content: message.content,
        role: message.role,
        studyId: message.studyId,
      })),
    });
  } catch (error) {
    console.error('Error saving messages:', error);
    throw error;
  }
}

export async function POST(req: Request) {
  try {
    const {action, ...data} = await req.json();

    switch (action) {
      case 'getAIResponse': {
        const {messages, studyId} = data;
        let augmentedMessages = [...messages];
        
        if (studyId) {
          const lastMessage = messages[messages.length - 1].content;
          const relevantPassages = await queryEmbeddingHandler(lastMessage, studyId);
          
          const RELEVANCE_THRESHOLD = 0.5;
          const contextPassages = relevantPassages
            .filter(p => p.score >= RELEVANCE_THRESHOLD)
            .map(p => `[Page ${p.page}] ${p.text}`);

          if (contextPassages.length > 0) {
            augmentedMessages.unshift({
              role: "system",
              content: "You are a Tutor assistant designed to get content from PDFs and talk about it. Use the" +
                " PDF context over your own knowledge and say when you have to get more information from outside" +
                " sources. Here is relevant context from the PDF document:\n\n" + contextPassages.join('\n\n')
            });
          }
        }

        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: augmentedMessages,
        });
        return NextResponse.json({result: response.choices[0].message});
      }

      case 'queryEmbedding': {
        const {query, studyId} = data;
        
        if (!query || typeof query !== 'string') {
          return NextResponse.json({ error: 'Invalid or missing query parameter' }, { status: 400 });
        }
        
        if (!studyId || typeof studyId !== 'string') {
          return NextResponse.json({ error: 'Invalid or missing studyId parameter' }, { status: 400 });
        }

        try {
          const result = await queryEmbeddingHandler(query, studyId);
          return NextResponse.json({result});
        } catch (error: any) {
          console.error('Error querying embeddings:', error);
          return NextResponse.json(
            {error: `Failed to query embeddings: ${error.message}`},
            {status: 500}
          );
        }
      }

      case 'createEmbedding': {
        const {pdfURL, studyId, window} = data;
        try {
          const result = await createEmbeddingHandler(pdfURL, studyId, window);
          return NextResponse.json(result);
        } catch (error: any) {
          console.error('Error creating embedding:', error);
          return NextResponse.json(
            {error: `Failed to create embedding: ${error.message}`},
            {status: 500}
          );
        }
      }

      case 'saveMessages': {
        const {messages} = data;
        try {
          const result = await saveMessages(messages);
          return NextResponse.json({result});
        } catch (error: any) {
          console.error('Error saving messages:', error);
          return NextResponse.json(
            {error: `Failed to save messages: ${error.message}`},
            {status: 500}
          );
        }
      }

      default:
        return NextResponse.json({error: 'Invalid action'}, {status: 400});
    }
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({error: 'Failed to process request'}, {status: 500});
  }
}
