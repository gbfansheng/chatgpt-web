import { ss } from '@/utils/storage'

const LOCAL_NAME = 'chatStorage'

export function defaultState(): Chat.ChatState {
  const uuid = 1002
  return {
    active: uuid,
    usingContext: true,
    loadingMessages: false,
    history: [{ uuid, title: 'New Chat', isEdit: false }],
    chat: [{ uuid, data: [] }],
  }
}

export function getLocalState(): Chat.ChatState {
  const localState = ss.get(LOCAL_NAME)
  return { ...defaultState(), ...localState }
}

export function setLocalState(state: Chat.ChatState) {
  // 过滤掉 images/files 避免 localStorage 超限
  const filtered = {
    ...state,
    chat: state.chat.map(c => ({
      ...c,
      data: c.data.map(m => ({ ...m, images: undefined, files: undefined })),
    })),
  }
  ss.set(LOCAL_NAME, filtered)
}
