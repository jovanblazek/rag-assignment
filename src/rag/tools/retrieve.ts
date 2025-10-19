import { tool } from '@langchain/core/tools'
import z from 'zod'
import { vectorStore } from '../vectorStore'
import { LangGraphRunnableConfig } from '@langchain/langgraph'

const retrieveSchema = z.object({ query: z.string() })

export const retrieveTool = tool(
  async ({ query }, config: LangGraphRunnableConfig) => {
    config?.writer?.("Retrieving information related to the query...")
    const retrievedDocs = await vectorStore.similaritySearch(query, 2)
    config?.writer?.("Retrieved information from the vector store...")
    const serialized = retrievedDocs
      .map(
        (doc) => `Source: ${doc.metadata.source}\nContent: ${doc.pageContent}`
      )
      .join('\n')
    return [serialized, retrievedDocs]
  },
  {
    name: 'retrieve',
    description: 'Retrieve information related to a query.',
    schema: retrieveSchema,
    responseFormat: 'content_and_artifact',
  }
)
