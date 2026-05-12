import { randomUUID } from 'crypto'

let sessionId: string | null = null

export async function generateSessionId(): Promise<string> {
  sessionId = randomUUID()
  return sessionId
}

export async function getSessionId(): Promise<string | null> {
  return sessionId
}
