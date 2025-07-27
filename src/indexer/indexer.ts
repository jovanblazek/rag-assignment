import '../environment'
import { OpenAIEmbeddings } from '@langchain/openai'
import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase'
import { createClient } from '@supabase/supabase-js'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { PPTXLoader } from '@langchain/community/document_loaders/fs/pptx'
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf'
import { DirectoryLoader } from 'langchain/document_loaders/fs/directory'
import path from 'path'
import z from 'zod'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import fs from 'fs'
import { HumanMessage } from '@langchain/core/messages'

const DECKS_PATH = path.join(__dirname, '..', '..', 'decks')

const metadataSchema = z.object({
  title: z
    .string()
    .describe('The title of the document, e.g. from the first page.'),
  agency: z.string().nullable().describe('The author or name of the agency.'),
  year: z.number().nullable().describe('The year of the document.'),
  topics: z.array(z.string()).describe('The topics of the document.'),
})

async function main() {
  const embeddings = new OpenAIEmbeddings({
    model: 'text-embedding-3-large',
    apiKey: process.env.OPENAI_API_KEY,
  })

  const supabaseClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_PRIVATE_KEY
  )

  const vectorStore = new SupabaseVectorStore(embeddings, {
    client: supabaseClient,
    tableName: 'documents',
    queryName: 'match_documents',
  })

  const loader = new DirectoryLoader(DECKS_PATH, {
    '.pptx': (path) => new PPTXLoader(path),
    '.pdf': (path) => new PDFLoader(path),
  })

  console.log('Loading decks...')

  const docs = await loader.load()

  console.log('Docs loaded: ', docs.length)

  // Call gemini to extract metadata for each doc
  const geminiWithStructuredOutput = new ChatGoogleGenerativeAI({
    model: 'gemini-2.0-flash',
    apiKey: process.env.GOOGLE_API_KEY,
    maxRetries: 1,
  }).withStructuredOutput(metadataSchema)

  const file = fs.readFileSync(docs[0].metadata.source)

  const userMessage = new HumanMessage({
    content: [
      {
        type: 'text',
        text: 'Extract metadata from this file',
      },
      {
        type: 'file',
        mime_type: 'application/pdf',
        source_type: 'base64',
        data: Buffer.from(file).toString('base64'),
        name: docs[0].metadata.source.split('/').pop(),
      },
    ],
  })

  const metadata = await geminiWithStructuredOutput.invoke([
    [
      'system',
      'You are a helpful assistant that extracts metadata from provided document.',
    ],
    userMessage,
  ])

  console.log(metadata)

  return

  console.log('Splitting decks...')

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  })
  const allSplits = await splitter.splitDocuments(docs)

  console.log(allSplits[0])

  console.log('Splits done: ', allSplits.length)

  // console.log("Adding decks to vector store...")
  // await vectorStore.addDocuments(allSplits)

  console.log('Done!')
}

main()
