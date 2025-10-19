import * as z from 'zod'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { ChatOpenAI } from '@langchain/openai'
import { MessagesState } from '../state'

const prompt = ChatPromptTemplate.fromTemplate(
  `You are a grader assessing relevance of retrieved docs to a user question.
  Here are the retrieved docs:
  \n ------- \n
  {context}
  \n ------- \n
  Here is the user question: {question}
  If the content of the docs are relevant to the users question, score them as relevant.
  Give a binary score 'yes' or 'no' score to indicate whether the docs are relevant to the question.
  Yes: The docs are relevant to the question.
  No: The docs are not relevant to the question.`
)

const gradeDocumentsSchema = z.object({
  binaryScore: z.string().describe("Relevance score 'yes' or 'no'"),
})

const llm = new ChatOpenAI({
  model: 'gpt-5-mini',
  apiKey: process.env.OPENAI_API_KEY,
}).withStructuredOutput(gradeDocumentsSchema)

export async function gradeDocumentsNode(state: MessagesState) {
  const { messages } = state

  const chain = prompt.pipe(llm)

  const score = await chain.invoke({
    question: messages[0]?.content,
    context: messages[messages.length - 1]?.content,
  })

  if (score.binaryScore === 'yes') {
    return 'generate'
  }
  return 'rewrite'
}
