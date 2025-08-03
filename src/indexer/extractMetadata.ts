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
import { FileProcessorRegistry } from './fileProcessor'
import { cleanupTempFile, sleep } from './utils'

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY })

const zodMetadataSchema = z.object({
  title: z
    .string()
    .describe('The title of the document, e.g. from the first page.'),
  agency: z
    .string()
    .nullable()
    .describe('The author or name of the agency.')
    .default(null),
  year: z
    .number()
    .nullable()
    .describe('The year of the document.')
    .default(null),
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

const PROCESSING_CHECK_INTERVAL = 3000
const fileProcessor = new FileProcessorRegistry()

async function waitForFileProcessing(fileName: string): Promise<void> {
  let fileStatus = await ai.files.get({ name: fileName })

  while (fileStatus.state === 'PROCESSING') {
    console.log(`Current file status: ${fileStatus.state}`)
    console.log('File is still processing, retrying in 3 seconds')

    await sleep(PROCESSING_CHECK_INTERVAL)
    fileStatus = await ai.files.get({ name: fileName })
  }

  if (fileStatus.state === 'FAILED') {
    throw new Error('File processing failed.')
  }
}

async function uploadFile(filePath: string) {
  const fileBuffer = fs.readFileSync(filePath)
  const fileType = await fileTypeFromBuffer(fileBuffer)

  if (!fileType) {
    console.error('Unable to resolve mime type for file:', filePath)
    throw new Error(`Unsupported file type: ${filePath}`)
  }

  const processedFile = await fileProcessor.processFile(filePath, fileType.mime)

  try {
    const uploadedFile = await ai.files.upload({
      file: processedFile.filePath,
      config: {
        displayName: processedFile.displayName,
        mimeType: processedFile.mimeType,
      },
    })

    await waitForFileProcessing(uploadedFile.name)
    console.log('File uploaded successfully:', processedFile.displayName)

    return uploadedFile
  } finally {
    // Always cleanup temp files, even if upload fails
    cleanupTempFile(processedFile.tempFilePath)
  }
}

// Call gemini to extract metadata for each doc
export async function extractMetadata(filePath: string): Promise<Metadata> {
  const uploadedFile = await uploadFile(filePath)

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
