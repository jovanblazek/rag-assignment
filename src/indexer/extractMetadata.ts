import { HumanMessage } from '@langchain/core/messages'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import z from 'zod'
import fs from 'fs'
import { fileTypeFromBuffer } from 'file-type'

const metadataSchema = z.object({
  title: z
    .string()
    .describe('The title of the document, e.g. from the first page.'),
  agency: z.string().nullable().describe('The author or name of the agency.'),
  year: z.number().nullable().describe('The year of the document.'),
  topics: z.array(z.string()).describe('The topics of the document.'),
})

type Metadata = z.infer<typeof metadataSchema>

// Call gemini to extract metadata for each doc
export async function extractMetadata(filePath: string): Promise<Metadata> {
  const file = fs.readFileSync(filePath)
  const fileType = await fileTypeFromBuffer(file)

  if (!fileType) {
    console.error('Unable to resolve mime type for file: ', filePath)
    throw new Error(`Unsupported file type: ${filePath}`)
  }

  // TODO: Rewrite this to upload file to google using ai.files.upload
  // Files larger than 20MB must be uploaded using ai.files.upload

  throw new Error('Not implemented')

  const geminiWithStructuredOutput = new ChatGoogleGenerativeAI({
    model: 'gemini-2.0-flash',
    apiKey: process.env.GOOGLE_API_KEY,
    maxRetries: 1,
  }).withStructuredOutput(metadataSchema)

  const userMessage = new HumanMessage({
    content: [
      {
        type: 'text',
        text: 'Extract metadata from this file',
      },
      {
        type: 'file',
        mime_type: fileType.mime,
        source_type: 'base64',
        data: file.toString('base64'),
        name: filePath.split('/').pop(),
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

  return metadata
}
