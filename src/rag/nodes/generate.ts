import { ChatPromptTemplate } from '@langchain/core/prompts'
import { ChatOpenAI } from '@langchain/openai'
import { MessagesState } from '../state'

const prompt = ChatPromptTemplate.fromTemplate(
  `You are an assistant for question-answering tasks.
      Use the following pieces of retrieved context to answer the question.
      If you don't know the answer, just say that you don't know.
      Use three sentences maximum and keep the answer concise.
      Question: {question}
      Context: {context}`
)

const llm = new ChatOpenAI({
  model: 'gpt-5-mini',
  apiKey: process.env.OPENAI_API_KEY,
})

export async function generateNode(state: MessagesState) {
  const { messages } = state
  const question = messages[0]?.content
  const context = messages[messages.length - 1]?.content

  const chain = prompt.pipe(llm)

  const response = await chain.invoke({
    context,
    question,
  })

  return {
    messages: [response],
  }
}
