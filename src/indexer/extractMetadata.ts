import z from 'zod'
import fs from 'fs'
import path from 'path'
import { fileTypeFromBuffer } from 'file-type'
import { parseOfficeAsync } from 'officeparser'
import {
  createPartFromUri,
  createUserContent,
  GoogleGenAI,
  Type,
  Schema,
  UploadFileParameters,
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

const POWERPOINT_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
const PROCESSING_CHECK_INTERVAL = 5000

async function extractTextFromPowerPoint(
  filePath: string
): Promise<{ textContent: string; tempFilePath: string }> {
  console.log('Detected PowerPoint file, extracting text...')

  try {
    const extractedText = await parseOfficeAsync(filePath)
    const fileName = path.basename(filePath)
    const baseName = path.parse(fileName).name
    const tempFileName = `${baseName}_extracted.txt`
    const tempFilePath = path.join(path.dirname(filePath), tempFileName)

    fs.writeFileSync(tempFilePath, extractedText)
    console.log('Text extracted from PowerPoint and saved to temporary file')

    return { textContent: extractedText, tempFilePath }
  } catch (error) {
    console.error('Failed to extract text from PowerPoint file:', error)
    throw new Error(`Failed to extract text from PowerPoint file: ${error}`)
  }
}

async function waitForFileProcessing(fileName: string): Promise<void> {
  let fileStatus = await ai.files.get({ name: fileName })

  while (fileStatus.state === 'PROCESSING') {
    console.log(`Current file status: ${fileStatus.state}`)
    console.log('File is still processing, retrying in 5 seconds')

    await new Promise((resolve) =>
      setTimeout(resolve, PROCESSING_CHECK_INTERVAL)
    )
    fileStatus = await ai.files.get({ name: fileName })
  }

  if (fileStatus.state === 'FAILED') {
    throw new Error('File processing failed.')
  }
}

function cleanupTempFile(tempFilePath?: string): void {
  if (tempFilePath && fs.existsSync(tempFilePath)) {
    fs.unlinkSync(tempFilePath)
    console.log('Temporary text file cleaned up')
  }
}

async function createUploadConfig(
  filePath: string,
  fileType: any
): Promise<UploadFileParameters & { tempFilePath?: string }> {
  const fileName = path.basename(filePath)

  // Handle PowerPoint files by extracting text
  if (fileType.mime === POWERPOINT_MIME_TYPE) {
    const { tempFilePath } = await extractTextFromPowerPoint(filePath)
    const tempFileName = path.basename(tempFilePath)

    return {
      file: tempFilePath,
      tempFilePath,
      config: {
        displayName: tempFileName,
        mimeType: 'text/plain',
      },
    }
  }

  // Handle other file types normally
  return {
    file: filePath,
    config: {
      displayName: fileName,
    },
  }
}

async function uploadFile(filePath: string) {
  const fileBuffer = fs.readFileSync(filePath)
  const fileType = await fileTypeFromBuffer(fileBuffer)

  if (!fileType) {
    console.error('Unable to resolve mime type for file:', filePath)
    throw new Error(`Unsupported file type: ${filePath}`)
  }

  const uploadConfig = await createUploadConfig(filePath, fileType)

  try {
    const uploadedFile = await ai.files.upload(uploadConfig)

    await waitForFileProcessing(uploadedFile.name)
    console.log('File uploaded successfully:', uploadConfig.config?.displayName)

    return uploadedFile
  } finally {
    // Always cleanup temp files, even if upload fails
    cleanupTempFile(uploadConfig.tempFilePath)
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
