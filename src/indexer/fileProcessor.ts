import fs from 'fs'
import libre from 'libreoffice-convert'
import { promisify } from 'util'
import { PDFDocument } from 'pdf-lib'
import { createTempFilePath, writeTempFile } from './utils'

const convertAsync = promisify(libre.convert)

export const POWERPOINT_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
export const PDF_MIME_TYPE = 'application/pdf'
export const MAX_PDF_PAGES = 10

interface FileProcessor {
  canHandle(mimeType: string): boolean
  process(filePath: string): Promise<ProcessedFile>
}

export interface ProcessedFile {
  filePath: string
  mimeType: string
  tempFilePath?: string
  displayName: string
}

async function slicePdfToPages(
  pdfBuffer: Buffer,
  maxPages: number = MAX_PDF_PAGES
): Promise<Buffer> {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer)
    const totalPages = pdfDoc.getPageCount()

    console.log(
      `Original PDF has ${totalPages} pages, slicing to first ${Math.min(maxPages, totalPages)} pages`
    )

    // If PDF has fewer pages than maxPages, return original
    if (totalPages <= maxPages) {
      console.log('PDF already has fewer pages than limit, keeping original')
      return pdfBuffer
    }

    // Create new PDF with only the first N pages
    const newPdfDoc = await PDFDocument.create()
    const pagesToCopy = await newPdfDoc.copyPages(
      pdfDoc,
      Array.from({ length: maxPages }, (_, i) => i)
    )

    pagesToCopy.forEach((page) => newPdfDoc.addPage(page))

    const slicedPdfBytes = await newPdfDoc.save()
    console.log(`PDF sliced successfully to ${maxPages} pages`)

    return Buffer.from(slicedPdfBytes)
  } catch (error) {
    console.error('Failed to slice PDF:', error)
    console.log('Returning original PDF as fallback')
    return pdfBuffer
  }
}

class PowerPointProcessor implements FileProcessor {
  canHandle(mimeType: string): boolean {
    return mimeType === POWERPOINT_MIME_TYPE
  }

  async process(filePath: string): Promise<ProcessedFile> {
    console.log('Processing PowerPoint file...')

    try {
      const inputBuffer = fs.readFileSync(filePath)
      const tempInfo = createTempFilePath(filePath, 'converted_sliced', 'pdf')

      // Convert PowerPoint to PDF
      console.log('Converting PowerPoint to PDF...')
      const pdfBuffer = await convertAsync(inputBuffer, '.pdf', undefined)

      // Slice PDF to first N pages
      const slicedPdfBuffer = await slicePdfToPages(Buffer.from(pdfBuffer))

      writeTempFile(tempInfo.tempFilePath, slicedPdfBuffer)

      console.log('PowerPoint converted to PDF, sliced, and saved')

      return {
        filePath: tempInfo.tempFilePath,
        mimeType: PDF_MIME_TYPE,
        tempFilePath: tempInfo.tempFilePath,
        displayName: tempInfo.displayName,
      }
    } catch (error) {
      console.error('Failed to process PowerPoint file:', error)
      throw new Error(`Failed to process PowerPoint file: ${error}`)
    }
  }
}

class PdfProcessor implements FileProcessor {
  canHandle(mimeType: string): boolean {
    return mimeType === PDF_MIME_TYPE
  }

  async process(filePath: string): Promise<ProcessedFile> {
    console.log('Processing PDF file...')

    try {
      const pdfBuffer = fs.readFileSync(filePath)
      const tempInfo = createTempFilePath(filePath, 'sliced', 'pdf')

      // Slice PDF to first N pages
      const slicedPdfBuffer = await slicePdfToPages(pdfBuffer)

      writeTempFile(tempInfo.tempFilePath, slicedPdfBuffer)

      console.log('PDF sliced and saved')

      return {
        filePath: tempInfo.tempFilePath,
        mimeType: PDF_MIME_TYPE,
        tempFilePath: tempInfo.tempFilePath,
        displayName: tempInfo.displayName,
      }
    } catch (error) {
      console.error('Failed to process PDF file:', error)
      throw new Error(`Failed to process PDF file: ${error}`)
    }
  }
}

class DefaultProcessor implements FileProcessor {
  canHandle(_mimeType: string): boolean {
    return true // Default handler for all other types
  }

  async process(filePath: string): Promise<ProcessedFile> {
    const fileName = require('path').basename(filePath)

    return {
      filePath,
      mimeType: undefined, // Let Google AI determine the MIME type
      displayName: fileName,
    }
  }
}

export class FileProcessorRegistry {
  private processors: FileProcessor[] = [
    new PowerPointProcessor(),
    new PdfProcessor(),
    new DefaultProcessor(), // Must be last as it accepts all types
  ]

  async processFile(
    filePath: string,
    mimeType: string
  ): Promise<ProcessedFile> {
    const processor = this.processors.find((p) => p.canHandle(mimeType))
    if (!processor) {
      throw new Error(`No processor found for MIME type: ${mimeType}`)
    }

    return processor.process(filePath)
  }
}
