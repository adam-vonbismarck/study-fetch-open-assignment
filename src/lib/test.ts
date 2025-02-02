import {Pinecone} from "@pinecone-database/pinecone";
import {Passage} from "@/lib/pdf-tools";
import OpenAI from "openai";

const pc = new Pinecone({apiKey: "pcsk_3TBEuN_ofcSJpqNX5vmToFjueMudwZZdSCiNNzNJU8ie33TJdY1FKC91GLxg1Q3W4LEVd"});
const openai = new OpenAI({
  apiKey: "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"
});


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

async function main() {

  let messages = [{role: "user", content: "Find this doc"}];
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: messages,
  });

  console.log(response.choices[0].message.content);
}

main();