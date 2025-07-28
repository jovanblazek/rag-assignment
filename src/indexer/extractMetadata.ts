import z from 'zod'
import fs from 'fs'
import { fileTypeFromBuffer } from 'file-type'
import {
  createPartFromUri,
  createUserContent,
  GoogleGenAI,
  Type,
  Schema,
} from '@google/genai'

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY })

const zodMetadataSchema = z.object({
  title: z
    .string()
    .describe('The title of the document, e.g. from the first page.'),
  agency: z.string().nullable().describe('The author or name of the agency.'),
  year: z.number().nullable().describe('The year of the document.'),
  topics: z.array(z.string()).describe('The topics of the document.'),
})

type Metadata = z.infer<typeof zodMetadataSchema>

const geminiMetadataSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: 'The title of the document, e.g. from the first page.',
    },
    agency: {
      type: Type.STRING,
      description: 'The author or name of the agency.',
      nullable: true,
    },
    year: {
      type: Type.NUMBER,
      description: 'The year of the document.',
      nullable: true,
    },
    topics: {
      type: Type.ARRAY,
      description: 'The topics of the document.',
      items: {
        type: Type.STRING,
        description: 'A topic of the document.',
      },
    },
  },
}

async function uploadFile(filePath: string) {
  const file = fs.readFileSync(filePath)
  const fileType = await fileTypeFromBuffer(file)

  if (!fileType) {
    console.error('Unable to resolve mime type for file: ', filePath)
    throw new Error(`Unsupported file type: ${filePath}`)
  }

  const fileName = filePath.split('/').pop()

  const uploadedFile = await ai.files.upload({
    file: filePath,
    config: { displayName: fileName },
  })

  // Wait for the file to be processed.
  let getFile = await ai.files.get({ name: uploadedFile.name })
  while (getFile.state === 'PROCESSING') {
    getFile = await ai.files.get({ name: uploadedFile.name })
    console.log(`current file status: ${getFile.state}`)
    console.log('File is still processing, retrying in 5 seconds')

    await new Promise((resolve) => {
      setTimeout(resolve, 5000)
    })
  }
  if (uploadedFile.state === 'FAILED') {
    throw new Error('File processing failed.')
  }

  console.log('File uploaded successfully', fileName)

  return uploadedFile
}

// Call gemini to extract metadata for each doc
export async function extractMetadata(filePath: string): Promise<Metadata> {
  const uploadedFile = await uploadFile(filePath)
  // TODO: Gemini doesn't support pptx mime type at all so we need to convert it to image or pdf first
  // Alternatively, we can slice off first page or slide and convert it to image and then send it to gemini

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [
      createUserContent([
        'Extract metadata from this file.',
        createPartFromUri(uploadedFile.uri, uploadedFile.mimeType),
      ]),
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: geminiMetadataSchema,
    },
  })

  const metadata = zodMetadataSchema.parse(JSON.parse(response.text))

  return metadata
}
