import {NextResponse} from 'next/server';
import OpenAI from "openai";
import {Pinecone} from "@pinecone-database/pinecone";
import {Passage} from "@/lib/pdf-tools";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_TWO,
});

// @ts-ignore
const pc = new Pinecone({apiKey: process.env.PINECONE_API_KEY});

async function embed(docs: string[]) {
  const embedding = await openai.embeddings.create({
    model: 'text-embedding-ada-002',
    input: docs,
    encoding_format: "float",
  });
  return embedding.data.map(item => item.embedding);
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

export async function POST(req: Request) {
  try {
    const {action, ...data} = await req.json();

    switch (action) {
      case 'getAIResponse': {
        const {messages, studyId} = data;
        console.log('Messages:', messages);

        let augmentedMessages = [...messages];
        
        // If we have a studyId, get relevant context from the PDF
        if (studyId) {
          const lastMessage = messages[messages.length - 1].content;
          const relevantPassages = await queryEmbeddingHandler(lastMessage, studyId);
          
          // Only include passages with good relevance
          const RELEVANCE_THRESHOLD = 0.5;
          const contextPassages = relevantPassages
            .filter(p => p.score >= RELEVANCE_THRESHOLD)
            .map(p => `[Page ${p.page}] ${p.text}`);

          if (contextPassages.length > 0) {
            // Add PDF context as a system message
            augmentedMessages.unshift({
              role: "system",
              content: " You are a Tutor assistant designed to get content from PDFs and talk about it. Use the" +
                " PDF context over your own knowledge and say when you have to get more information from outside" +
                " sources. Here" +
                " is" +
                " relevant context" +
                " from" +
                " the" +
                " PDF document:\n\n" + contextPassages.join('\n\n')
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
        const result = await queryEmbeddingHandler(query, studyId);
        return NextResponse.json({result});
      }

      case 'createEmbedding': {
        const {passages, studyId} = data;
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
          }
        ));

        await index.namespace(studyId).upsert(records);

        return NextResponse.json({
          success: true
        });
      }

      default:
        return NextResponse.json({error: 'Invalid action'}, {status: 400});
    }
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({error: 'Failed to process request'}, {status: 500});
  }
}
