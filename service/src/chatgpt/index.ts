import * as dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import SocksProxyAgent from 'socks-proxy-agent'
import HttpsProxyAgent from 'https-proxy-agent'
import fetch from 'node-fetch'
import { sendResponse } from '../utils'
import { isNotEmptyString } from '../utils/is'
import type { ApiModel, ChatContext, ModelConfig } from '../types'
import type { RequestOptions } from './types'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 先加载 service/.env，再回退读取项目根目录 .env，方便前后端共用默认模型配置。
dotenv.config({ path: path.resolve(__dirname, '../.env') })
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

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
const OPENROUTER_API_BASE_URL = process.env.OPENROUTER_API_BASE_URL || 'https://openrouter.ai/api/v1'
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const OPENROUTER_HTTP_REFERER = process.env.OPENROUTER_HTTP_REFERER
const OPENROUTER_APP_NAME = process.env.OPENROUTER_APP_NAME
const DEEPSEEK_API_BASE_URL = process.env.DEEPSEEK_API_BASE_URL
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY
const QWEN_API_BASE_URL = process.env.QWEN_API_BASE_URL
const QWEN_API_KEY = process.env.QWEN_API_KEY
const TUZI_API_BASE_URL = process.env.TUZI_API_BASE_URL || 'https://api.tu-zi.com'
const TUZI_API_KEY = process.env.TUZI_API_KEY
const DEFAULT_GPT_MODEL = process.env.VITE_DEFAULT_GPT_MODEL || process.env.OPENAI_API_MODEL || 'gemini-3-flash-preview'
const DEFAULT_AVAILABLE_GPT_MODELS = ['qwen-plus', 'gemini-3-flash-preview', 'gpt-5.4']
const AVAILABLE_GPT_MODELS = (process.env.VITE_AVAILABLE_GPT_MODELS || '')
  .split(',')
  .map(item => item.trim())
  .filter(Boolean)

function getAvailableGptModels() {
  const models = AVAILABLE_GPT_MODELS.length > 0 ? AVAILABLE_GPT_MODELS : DEFAULT_AVAILABLE_GPT_MODELS
  if (models.includes(DEFAULT_GPT_MODEL))
    return models
  return [DEFAULT_GPT_MODEL, ...models]
}

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

interface ProviderConfig {
  baseURL: string
  apiKey?: string
  headers?: Record<string, string>
}

// 获取API配置
function getAPIConfig(model: string): ProviderConfig {
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
  else if (model.includes('gemini')) {
    // Gemini 模型统一走 OpenRouter，直接兼容 gemini-* 这类模型名。
    return {
      baseURL: OPENROUTER_API_BASE_URL,
      apiKey: OPENROUTER_API_KEY,
      headers: {
        ...(isNotEmptyString(OPENROUTER_HTTP_REFERER) ? { 'HTTP-Referer': OPENROUTER_HTTP_REFERER } : {}),
        ...(isNotEmptyString(OPENROUTER_APP_NAME) ? { 'X-Title': OPENROUTER_APP_NAME } : {}),
      },
    }
  }
  else if (model.includes('gpt-5.4')) {
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
    gpt_model,
    images = [],
    files = [],
    conversationHistory = []
  } = options
  
  try {
    const currentGptModel = isNotEmptyString(gpt_model) ? gpt_model : DEFAULT_GPT_MODEL
    const config = getAPIConfig(currentGptModel)
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
      model: currentGptModel,
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
        ...config.headers,
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
      defaultGptModel: DEFAULT_GPT_MODEL,
      availableGptModels: getAvailableGptModels(),
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

function defaultGptModel() {
  return DEFAULT_GPT_MODEL
}

function availableGptModels() {
  return getAvailableGptModels()
}

export type { ChatContext }
export { chatReplyProcess, chatConfig, currentModel, defaultGptModel, availableGptModels }
