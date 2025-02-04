# Study Fetch

Study Fetch is an AI-powered PDF study assistant that helps users interact with their study materials through natural
language conversations. The application features PDF viewing, text-to-speech capabilities, and intelligent responses
based on the content of your documents.

## Features

- PDF document upload and viewing
- AI-powered chat interface for document interaction
- Voice input support with speech-to-text
- Text-to-speech capability for AI responses
- Responsive design with automatic PDF scaling
- User authentication with NextAuth.js
- Markdown support with KaTeX for mathematical expressions

## Tech Stack

- **Frontend**: Next.js 13+ with App Router
- **Backend**: Next.js API Routes
- **Database**: MongoDB with Prisma ORM
- **Authentication**: NextAuth.js
- **AI/ML**: OpenAI GPT-4, Pinecone for vector embeddings
- **PDF Processing**: pdf.js
- **UI Components**: Tailwind CSS, shadcn/ui

## Prerequisites

- Node.js 18+
- MongoDB instance
- OpenAI API key
- Pinecone API key and index
- AWS S3 bucket (for PDF storage)

## Known Issues

- The application is slow to process message requests due to the AI model's latency
- This could be sped up with caching or by optimising the code for highlighting PDFs
- The application does not work on PDFs much longer than about 20 pages as chunking
has not been implemented

## Environment Setup

1. Clone the repository:

```bash
git clone <repository-url>
cd study-fetch
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file in the root directory an example file can be found in `.env.example`:

## Database Setup

1. Initialize Prisma with MongoDB:

```bash
npx prisma generate
```

2. Push the schema to your database:

```bash
npx prisma db push
```

The schema includes three main models:

- `User`: Stores user authentication information
- `Study`: Represents uploaded PDF documents
- `Message`: Stores conversation history between users and AI

## Development

1. Start the development server:

```bash
npm run dev
```

2. Visit `http://localhost:3000` in your browser

## Project Structure

```
study-fetch/
├── src/
│   ├── app/
│   │   ├── api/           # API routes
│   │   ├── dashboard/     # Main application page
│   │   └── auth/         # Authentication pages
│   ├── components/       # Reusable UI components
│   ├── lib/             # Utility functions and helpers
│   └── styles/          # Global styles
├── prisma/
│   └── schema.prisma    # Database schema
└── public/             # Static assets
```

## Key Features Implementation

### PDF Processing

- PDFs are uploaded to AWS S3
- Text is extracted and split into chunks
- Chunks are embedded using OpenAI's embedding model, ada-002
- Embeddings are stored in Pinecone for semantic search

### Chat Interface

- Real-time conversation with AI
- Context-aware responses using document embeddings
- Voice input/output support using Web Speech API
- Markdown rendering with mathematical expression support for AI responses

### Authentication

- Secure user authentication with NextAuth.js
- Protected API routes and pages
- User-specific document management

## License

This project is licensed under the MIT License - see the LICENSE file for details
