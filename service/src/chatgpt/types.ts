import type { ChatCompletionRequestMessageTool, ChatMessage } from 'lin-chatgpt'
import type fetch from 'node-fetch'

export interface RequestOptions {
  message: string
  lastContext?: { conversationId?: string; parentMessageId?: string }
  process?: (chat: ChatMessage) => void
  systemMessage?: string
  temperature?: number
  top_p?: number
  gpt_model?: string
  tools?: Array<ChatCompletionRequestMessageTool>
  tool_choice?: string
}

export interface SetProxyOptions {
  fetch?: typeof fetch
}

export interface UsageResponse {
  total_usage: number
}
