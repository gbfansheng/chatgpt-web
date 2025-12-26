export interface RequestProps {
  prompt: string
  options?: ChatContext
  systemMessage: string
  temperature?: number
  top_p?: number
  gpt_model: string
  images?: string[]
  conversationHistory?: Array<{ text: string; inversion: boolean }>
  tools?: any
  tool_choice?: string
}

export interface ChatContext {
  conversationId?: string
  parentMessageId?: string
}

export interface ModelConfig {
  apiModel?: ApiModel
  reverseProxy?: string
  timeoutMs?: number
  socksProxy?: string
  httpsProxy?: string
  usage?: string
}

export type ApiModel = 'ChatGPTAPI' | 'ChatGPTUnofficialProxyAPI' | undefined
