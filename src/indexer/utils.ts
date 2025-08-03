import fs from 'fs'
import path from 'path'

export interface TempFileInfo {
  tempFilePath: string
  displayName: string
}

export function createTempFilePath(
  originalPath: string,
  suffix: string,
  extension: string
): TempFileInfo {
  const fileName = path.basename(originalPath)
  const baseName = path.parse(fileName).name
  const tempFileName = `${baseName}_${suffix}.${extension}`
  const tempFilePath = path.join(path.dirname(originalPath), tempFileName)

  return {
    tempFilePath,
    displayName: tempFileName,
  }
}

export function cleanupTempFile(tempFilePath?: string): void {
  if (tempFilePath && fs.existsSync(tempFilePath)) {
    fs.unlinkSync(tempFilePath)
    console.log('Temporary file cleaned up')
  }
}

export function writeTempFile(filePath: string, content: Buffer): void {
  fs.writeFileSync(filePath, content)
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))
