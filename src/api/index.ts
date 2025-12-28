import type { AxiosProgressEvent, GenericAbortSignal } from 'axios'
import { post } from '@/utils/request'
import { useAuthStore, useSettingStore } from '@/store'

export function fetchChatAPI<T = any>(
  prompt: string,
  options?: { conversationId?: string; parentMessageId?: string },
  signal?: GenericAbortSignal,
) {
  return post<T>({
    url: '/chat',
    data: { prompt, options },
    signal,
  })
}

export function fetchChatConfig<T = any>() {
  return post<T>({
    url: '/config',
  })
}

export function fetchChatAPIProcess<T = any>(
  params: {
    prompt: string
    options?: { conversationId?: string; parentMessageId?: string }
    conversationHistory?: Array<{ text: string; inversion: boolean }>
    images?: string[]
    files?: Array<{ name: string; type: string; data: string }>
    signal?: GenericAbortSignal
    onDownloadProgress?: (progressEvent: AxiosProgressEvent) => void },
) {
  const settingStore = useSettingStore()

  const data: Record<string, any> = {
    prompt: params.prompt,
    options: params.options,
    conversationHistory: params.conversationHistory,
    images: params.images,
    files: params.files,
    systemMessage: settingStore.systemMessage,
    temperature: settingStore.temperature,
    top_p: settingStore.top_p,
    gpt_model: settingStore.gpt_model,
  }

  return post<T>({
    url: '/chat-process',
    data,
    signal: params.signal,
    onDownloadProgress: params.onDownloadProgress,
  })
}

export function fetchSession<T>() {
  return post<T>({
    url: '/session',
  })
}

export function fetchVerify<T>(token: string) {
  return post<T>({
    url: '/verify',
    data: { token },
  })
}

// 聊天记录 API
export function fetchConversations<T = any>() {
  return post<T>({ url: '/conversations', method: 'GET' })
}

export function fetchConversation<T = any>(uuid: string) {
  return post<T>({ url: `/conversations/${uuid}`, method: 'GET' })
}

export function createConversation<T = any>(uuid: string, title?: string) {
  return post<T>({ url: '/conversations', data: { uuid, title } })
}

export function updateConversation<T = any>(uuid: string, title: string) {
  return post<T>({ url: `/conversations/${uuid}`, data: { title }, method: 'PUT' })
}

export function deleteConversation<T = any>(uuid: string) {
  return post<T>({ url: `/conversations/${uuid}`, method: 'DELETE' })
}

export function saveMessage<T = any>(uuid: string, role: string, content: string, images?: string[], files?: any[], thinking?: string) {
  return post<T>({ url: `/conversations/${uuid}/messages`, data: { role, content, images, files, thinking } })
}

export function clearMessages<T = any>(uuid: string) {
  return post<T>({ url: `/conversations/${uuid}/messages`, method: 'DELETE' })
}

// 用户认证 API
export function userRegister<T = any>(username: string, password: string, inviteCode: string) {
  return post<T>({ url: '/user/register', data: { username, password, inviteCode } })
}

export function userLogin<T = any>(username: string, password: string) {
  return post<T>({ url: '/user/login', data: { username, password } })
}

export function getUserInfo<T = any>() {
  return post<T>({ url: '/user/info', method: 'GET' })
}
