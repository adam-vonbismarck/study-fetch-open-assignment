import {PrismaClient} from "@prisma/client";
import {createPassages, extractTextWithPositions} from "@/lib/pdf-tools";
import axios from "axios";

const prisma = new PrismaClient();

// Helper function to get the base URL
function getBaseUrl() {
  if (typeof window !== 'undefined') {
    // Browser should use relative path
    return '';
  }
  // Server should use full URL
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return `https://${process.env.NEXT_PUBLIC_BASE_URL}`;
  }
  return 'http://localhost:3000';
}

export async function queryEmbedding(query: string, studyId: string) {
  const baseUrl = getBaseUrl();
  const response = await fetch(`${baseUrl}/api/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ 
      action: 'queryEmbedding',
      query,
      studyId 
    }),
  });

  if (!response.ok) {
    console.error('Query embedding error:', await response.text());
    throw new Error('Failed to query embedding');
  }

  const data = await response.json();
  return data.result;
}

async function fetchPdfBufferFromWeb(url: string): Promise<Uint8Array> {
  // Fetch the PDF from the web as an ArrayBuffer.
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  // Convert the ArrayBuffer to a Uint8Array.
  return new Uint8Array(response.data);
}

export async function createEmbedding(pdfURL: string, studyId: string, window: string) {
  console.log('Creating embedding for PDF:', pdfURL);
  
  try {
    // Fetch and process PDF on client side
    const pdfUint8Array = await fetchPdfBufferFromWeb(pdfURL);
    console.log('Successfully fetched PDF buffer');
    
    const textPositions = await extractTextWithPositions(pdfUint8Array, window);
    console.log('Successfully extracted text positions');
    
    const passages = await createPassages(textPositions, 1000);
    console.log('Successfully created passages:', passages.length);

    // Send processed passages to server for embedding
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/api/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        action: 'createEmbedding',
        passages,
        studyId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Create embedding error:', errorText);
      throw new Error('Failed to create embedding: ' + errorText);
    }

    const result = await response.json();
    console.log('Successfully created embeddings');
    return result;
  } catch (error) {
    console.error('Error in createEmbedding:', error);
    throw error;
  }
}

export async function getAIResponse(messages: { role: string; content: string }[], studyId?: string) {
  const baseUrl = getBaseUrl();
  const response = await fetch(`${baseUrl}/api/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ 
      action: 'getAIResponse',
      messages,
      studyId: studyId || null  
    }),
  });

  if (!response.ok) {
    console.error('AI response error:', await response.text());
    throw new Error('Failed to get AI response');
  }

  // Return the response stream directly
  return response;
}

export async function saveMessages({ messages }: { messages: { content: string; role: string; studyId: string }[] }) {
  try {
    const result = await prisma.message.createMany({
      data: messages.map((message) => ({
        content: message.content,
        role: message.role,
        studyId: message.studyId,
      })),
    });
    return result;
  } catch (error) {
    console.error('Error saving messages:', error);
    throw error;
  }
}
