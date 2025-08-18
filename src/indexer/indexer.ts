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

const METADATA_RATE_LIMIT = 14 // max 14 per minute (free tier has 15 requests per minute to 2.0-flash)
const METADATA_REQ_INTERVAL_MS = Math.ceil(60000 / METADATA_RATE_LIMIT)

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

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  })

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i]
    console.log('Extracting metadata for: ', doc.metadata.source)
    const metadata = await extractMetadata(doc.metadata.source)
    console.log('Metadata extracted: ', metadata)
    doc.metadata = {
      ...doc.metadata,
      ...metadata,
    }
    console.log('Splitting...')

    const allSplits = await splitter.splitDocuments([doc])
    console.log('Splitting done: ', allSplits.length)

    console.log('Adding to vector store...')
    await vectorStore.addDocuments(allSplits)
    console.log('Done!', doc.metadata.source)
    console.log('---------------------------------------------------')

    if (i < docs.length - 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, METADATA_REQ_INTERVAL_MS)
      )
    }
  }

  console.log('Finished!')
}

main()

async function test() {
  const metadata = await extractMetadata(
    path.join(
      __dirname,
      '..',
      '..',
      'decks',
      // '2.09-03.1 Helping Global Health Partnerships to Increase their Impact.pdf'
      '021915newgoldenage-ipwebinar-external-150707203217-lva1-app6891.pptx'
    )
  )

  console.log(metadata)
}

// test()
