import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase"
import { createClient } from "@supabase/supabase-js"
import { embeddings } from "./embeddings"

const supabaseClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_PRIVATE_KEY
)

export const vectorStore = new SupabaseVectorStore(embeddings, {
  client: supabaseClient,
  tableName: 'documents',
  queryName: 'match_documents',
})