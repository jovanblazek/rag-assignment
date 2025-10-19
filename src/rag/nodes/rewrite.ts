import { ChatPromptTemplate } from '@langchain/core/prompts'
import { ChatOpenAI } from '@langchain/openai'
import { MessagesState } from '../state'

const rewritePrompt = ChatPromptTemplate.fromTemplate(
  `Look at the input and try to reason about the underlying semantic intent / meaning. The user's question is most likely referring to a specific topic present in a consulting deck. \n
  Here is the initial question:
  \n ------- \n
  {question}
  \n ------- \n
  Formulate an improved question:`
)

const llm = new ChatOpenAI({
  model: 'gpt-5-mini',
  apiKey: process.env.OPENAI_API_KEY,
})

export async function rewriteNode(state: MessagesState) {
  const { messages } = state
  const question = messages[0]?.content

  const chain = rewritePrompt.pipe(llm)
  const response = await chain.invoke({ question })
  return {
    messages: [response],
  }
}
