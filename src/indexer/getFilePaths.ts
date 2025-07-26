import { readdirSync } from 'fs'
import { join } from 'path'

export function getFilePaths() {
  const files = readdirSync(join(__dirname, '..', '..', 'decks'))
  return files.map((file) => join(__dirname, '..', '..', 'decks', file))
}
