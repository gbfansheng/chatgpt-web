import type fetch from 'node-fetch'

export interface RequestOptions {
  message: string
  lastContext?: { conversationId?: string; parentMessageId?: string }
  process?: (chat: any) => void
  systemMessage?: string
  temperature?: number
  top_p?: number
  gpt_model?: string
  images?: string[]
  conversationHistory?: Array<{ text: string; inversion: boolean }>
  tools?: any[]
  tool_choice?: any
}

export interface SetProxyOptions {
  fetch?: typeof fetch
}
