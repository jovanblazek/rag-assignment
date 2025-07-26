import '../environment'
import { OpenAIEmbeddings } from '@langchain/openai'
import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase'
import { createClient } from '@supabase/supabase-js'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { PPTXLoader } from '@langchain/community/document_loaders/fs/pptx'
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf'
import { MultiFileLoader } from 'langchain/document_loaders/fs/multi_file'
import { getFilePaths } from './getFilePaths'

async function main() {
  const embeddings = new OpenAIEmbeddings({
    model: 'text-embedding-3-large',
  })

  const supabaseClient = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PRIVATE_KEY!
  )

  const vectorStore = new SupabaseVectorStore(embeddings, {
    client: supabaseClient,
    tableName: 'documents',
    queryName: 'match_documents',
  })

  const filePathsToLoad = getFilePaths()

  console.log('File paths to load:', filePathsToLoad)

  const loader = new MultiFileLoader([filePathsToLoad[0]], {
    '.pptx': (path) => new PPTXLoader(path),
    '.pdf': (path) => new PDFLoader(path),
  })

  console.log('Loading decks...')

  const docs = await loader.load()

  console.log('Docs loaded')

  console.log('Splitting decks...')

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  })
  const allSplits = await splitter.splitDocuments(docs)

  console.log(allSplits[3].pageContent)

  // console.log("Adding decks to vector store...")
  // await vectorStore.addDocuments(allSplits)

  console.log('Done!')
}

main()
