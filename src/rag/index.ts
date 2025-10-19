import '../environment'
import { HumanMessage, AIMessage } from 'langchain'
import { retrieveTool } from './tools/retrieve'
import { MessagesStateSchema, type MessagesState } from './state'
import { ChatOpenAI } from '@langchain/openai'
import { StateGraph, START, END } from '@langchain/langgraph'
import { ToolNode } from '@langchain/langgraph/prebuilt'
import { gradeDocumentsNode } from './nodes/gradeDocuments'
import { rewriteNode } from './nodes/rewrite'
import { generateNode } from './nodes/generate'

const tools = [retrieveTool]

const llmWithTools = new ChatOpenAI({
  model: 'gpt-5-mini',
  apiKey: process.env.OPENAI_API_KEY,
}).bindTools(tools)

// async function llmCall(state: MessagesState) {
//   return {
//     messages: await llmWithTools.invoke([systemPrompt, ...state.messages]),
//     llmCalls: (state.llmCalls ?? 0) + 1,
//   }
// }

async function generateQueryOrRespond(state: MessagesState) {
  const { messages } = state
  const response = await llmWithTools.invoke(messages)
  return {
    messages: [response],
  }
}

// Create a ToolNode for the retriever
const toolNode = new ToolNode(tools)

// Helper function to determine if we should retrieve
function shouldRetrieve({ messages }: MessagesState) {
  const lastMessage = messages[messages.length - 1]

  if (AIMessage.isInstance(lastMessage) && lastMessage.tool_calls.length) {
    return 'retrieve'
  }
  return END
}

function gradeDocumentsDecision({ messages }: MessagesState) {
  const lastMessage = messages[messages.length - 1]
  return lastMessage.content === 'generate' ? 'generate' : 'rewrite'
}

const builder = new StateGraph(MessagesStateSchema)
  .addNode('generateQueryOrRespond', generateQueryOrRespond)
  .addNode('retrieve', toolNode)
  .addNode('gradeDocuments', gradeDocumentsNode)
  .addNode('rewrite', rewriteNode)
  .addNode('generate', generateNode)
  // Add edges
  .addEdge(START, 'generateQueryOrRespond')
  // Decide whether to retrieve
  .addConditionalEdges('generateQueryOrRespond', shouldRetrieve)
  .addEdge('retrieve', 'gradeDocuments')
  // Edges taken after grading documents
  .addConditionalEdges('gradeDocuments', gradeDocumentsDecision)
  .addEdge('generate', END)
  .addEdge('rewrite', 'generateQueryOrRespond')

const graph = builder.compile()


// TODO:
// grade documents node has incorrect state in the `question` field
// grade documents fails with InvalidUpdateError: Expected node "gradeDocuments" to return an object or an array containing at least one Command object, received string
const main = async () => {
  const inputMessage = `Tell me about Roche's strategic transaction regarding Foundation Medicine`

  const inputs = {
    messages: [new HumanMessage(inputMessage)],
  }

  for await (const output of await graph.stream(inputs)) {
    for (const [key, value] of Object.entries(output)) {
      const lastMsg = output[key].messages[output[key].messages.length - 1]
      console.log(`Output from node: '${key}'`)
      console.log({
        type: lastMsg._getType(),
        content: lastMsg.content,
        tool_calls: lastMsg.tool_calls,
      })
      console.log('---\n')
    }
  }
}

main()
