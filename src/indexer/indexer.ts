import '../environment'
import { OpenAIEmbeddings } from '@langchain/openai'
import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase'
import { createClient } from '@supabase/supabase-js'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { PPTXLoader } from '@langchain/community/document_loaders/fs/pptx'
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf'
import { DirectoryLoader } from 'langchain/document_loaders/fs/directory'
import path from 'path'
import { extractMetadata } from './extractMetadata'

const DECKS_PATH = path.join(__dirname, '..', '..', 'decks')

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
    '.pdf': (path) => new PDFLoader(path, { splitPages: false }),
  })

  console.log('Loading decks...')

  const docs = await loader.load()

  console.log('Docs loaded: ', docs.length)

  for (const doc of docs) {
    console.log('Extracting metadata for: ', doc.metadata.source)
    const metadata = await extractMetadata(doc.metadata.source)
    console.log('Metadata extracted: ', metadata)
    doc.metadata = {
      ...doc.metadata,
      ...metadata,
    }
  }

  console.log('Splitting decks...')

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  })
  const allSplits = await splitter.splitDocuments(docs)

  console.log('Splits done: ', allSplits.length)

  // console.log('Adding decks to vector store...')
  // await vectorStore.addDocuments(allSplits)

  console.log('Done!')
}

// main()

async function test() {
  const metadata = await extractMetadata(
    path.join(__dirname, '..', '..', 'decks', '20181022-1228full-report-en.pdf')
  )

  console.log(metadata)
}

test()
