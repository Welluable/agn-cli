import { randomUUID } from 'crypto'
import { writeFile, readFile } from 'fs/promises'

export async function generateSessionId(): Promise<string> {
  const id = randomUUID()
  await writeFile('sessionId', id, 'utf-8')
  return id
}

export async function getSessionId(): Promise<string | null> {
  try {
    return await readFile('sessionId', 'utf-8')
  } catch (e) {
    return null
  }
}
