import * as dotenv from 'dotenv'
import { SocksProxyAgent } from 'socks-proxy-agent'
import { HttpsProxyAgent } from 'https-proxy-agent'
import fetch from 'node-fetch'
import { sendResponse } from '../utils'
import { isNotEmptyString } from '../utils/is'
import type { ApiModel, ChatContext, ModelConfig } from '../types'
import type { RequestOptions } from './types'

dotenv.config()

const ErrorCodeMessage: Record<string, string> = {
  401: '[API] 提供错误的API密钥 | Incorrect API key provided',
  403: '[API] 服务器拒绝访问，请稍后再试 | Server refused to access, please try again later',
  429: '[API] 请求过于频繁，请稍后再试 | Too many requests, please try again later',
  502: '[API] 错误的网关 | Bad Gateway',
  503: '[API] 服务器繁忙，请稍后再试 | Server is busy, please try again later',
  504: '[API] 网关超时 | Gateway Time-out',
  500: '[API] 服务器繁忙，请稍后再试 | Internal Server Error',
}

const timeoutMs: number = !isNaN(+process.env.TIMEOUT_MS) ? +process.env.TIMEOUT_MS : 100 * 1000

// API配置
const OPENAI_API_BASE_URL = process.env.OPENAI_API_BASE_URL || 'https://api.openai.com'
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const DEEPSEEK_API_BASE_URL = process.env.DEEPSEEK_API_BASE_URL
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY
const QWEN_API_BASE_URL = process.env.QWEN_API_BASE_URL
const QWEN_API_KEY = process.env.QWEN_API_KEY
const TUZI_API_BASE_URL = process.env.TUZI_API_BASE_URL || 'https://api.tu-zi.com'
const TUZI_API_KEY = process.env.TUZI_API_KEY

let apiModel: ApiModel = 'ChatGPTAPI'

export interface ChatMessage {
  id: string
  text: string
  role: 'user' | 'assistant' | 'system'
  conversationId?: string
  parentMessageId?: string
  images?: string[]
  detail?: any
}

interface APIMessage {
  role: 'user' | 'assistant' | 'system'
  content: string | Array<{ 
    type: 'text' | 'image_url'
    text?: string
    image_url?: { url: string }
  }>
}

// 获取API配置
function getAPIConfig(model: string) {
  if (model.includes('deepseek')) {
    return {
      baseURL: `${DEEPSEEK_API_BASE_URL}/v1`,
      apiKey: DEEPSEEK_API_KEY,
    }
  }
  else if (model.includes('qwen') || model.includes('qwq')) {
    return {
      baseURL: `${QWEN_API_BASE_URL}/v1`,
      apiKey: QWEN_API_KEY,
    }
  }
  else if (model.includes('gemini') || model.includes('gpt-5.1')) {
    return {
      baseURL: `${TUZI_API_BASE_URL}/v1`,
      apiKey: TUZI_API_KEY,
    }
  }
  else {
    return {
      baseURL: `${OPENAI_API_BASE_URL}/v1`,
      apiKey: OPENAI_API_KEY,
    }
  }
}

// 设置代理
function setupProxy(): any {
  if (isNotEmptyString(process.env.SOCKS_PROXY_HOST) && isNotEmptyString(process.env.SOCKS_PROXY_PORT)) {
    return new SocksProxyAgent({
      hostname: process.env.SOCKS_PROXY_HOST,
      port: process.env.SOCKS_PROXY_PORT,
      userId: isNotEmptyString(process.env.SOCKS_PROXY_USERNAME) ? process.env.SOCKS_PROXY_USERNAME : undefined,
      password: isNotEmptyString(process.env.SOCKS_PROXY_PASSWORD) ? process.env.SOCKS_PROXY_PASSWORD : undefined,
    })
  }
  else if (isNotEmptyString(process.env.HTTPS_PROXY) || isNotEmptyString(process.env.ALL_PROXY)) {
    const httpsProxy = process.env.HTTPS_PROXY || process.env.ALL_PROXY
    if (httpsProxy) {
      return new HttpsProxyAgent(httpsProxy)
    }
  }
  return undefined
}

async function chatReplyProcess(options: RequestOptions) {
  const { 
    message, 
    lastContext, 
    process, 
    systemMessage, 
    temperature = 0.8, 
    top_p = 1, 
    gpt_model = 'gemini-3-flash-preview',
    images = [],
    files = [],
    conversationHistory = []
  } = options
  
  try {
    const config = getAPIConfig(gpt_model)
    const agent = setupProxy()
    
    // 构建消息内容
    let content: string | Array<any> = message
    
    // 如果有图片或文件，构建多模态内容
    if ((images && images.length > 0) || (files && files.length > 0)) {
      content = [
        { type: 'text', text: message },
        ...images.map(img => ({
          type: 'image_url',
          image_url: { url: img }
        })),
        ...files.map(file => ({
          type: 'image_url',
          image_url: { url: file.data }
        }))
      ]
    }
    
    // 构建完整的消息历史 - 这是关键！
    const messages: APIMessage[] = []
    
    if (systemMessage) {
      messages.push({ role: 'system', content: systemMessage })
    }
    
    // 添加历史对话上下文
    if (conversationHistory && conversationHistory.length > 0) {
      conversationHistory.forEach(msg => {
        messages.push({
          role: msg.inversion ? 'user' : 'assistant',
          content: msg.text
        })
      })
    }
    
    // 添加当前用户消息
    messages.push({ role: 'user', content })
    
    // ... 其余代码保持不变
    
    const requestBody = {
      model: gpt_model,
      messages,
      temperature,
      top_p,
      stream: true,
    }
    
    const response = await fetch(`${config.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      agent,
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`API Error ${response.status}: ${errorText}`)
    }
    
    let fullText = ''
    const conversationId = Date.now().toString()
    const messageId = Date.now().toString()
    
    // 处理流式响应
    if (response.body) {
      const decoder = new TextDecoder()
      
      for await (const chunk of response.body) {
        const chunkText = decoder.decode(chunk, { stream: true })
        const lines = chunkText.split('\n')
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue
            
            try {
              const parsed = JSON.parse(data)
              const delta = parsed.choices?.[0]?.delta?.content
              if (delta) {
                fullText += delta
                
                const chatMessage: ChatMessage = {
                  id: messageId,
                  text: fullText,
                  role: 'assistant',
                  conversationId,
                  parentMessageId: lastContext?.parentMessageId,
                  images: images || [],
                  detail: parsed,
                }
                
                process?.(chatMessage)
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }
    }
    
    const finalMessage: ChatMessage = {
      id: messageId,
      text: fullText,
      role: 'assistant',
      conversationId,
      parentMessageId: lastContext?.parentMessageId,
      images: images || [],
    }
    
    return sendResponse({ type: 'Success', data: finalMessage })
  }
  catch (error: any) {
    const code = error.status || error.statusCode
    console.error('Chat API Error:', error)
    
    if (Reflect.has(ErrorCodeMessage, code)) {
      return sendResponse({ type: 'Fail', message: ErrorCodeMessage[code] })
    }
    return sendResponse({ type: 'Fail', message: error.message ?? 'Please check the back-end console' })
  }
}

async function chatConfig() {
  return sendResponse<ModelConfig>({
    type: 'Success',
    data: { 
      apiModel, 
      reverseProxy: '-', 
      timeoutMs, 
      socksProxy: '-', 
      httpsProxy: '-', 
      usage: '-' 
    },
  })
}

function currentModel(): ApiModel {
  return apiModel
}

export type { ChatContext }
export { chatReplyProcess, chatConfig, currentModel }
