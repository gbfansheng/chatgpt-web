import { defineStore } from 'pinia'
import { getLocalState, setLocalState } from './helper'
import { router } from '@/router'
import { createConversation, deleteConversation, fetchConversation, fetchConversations, saveMessage, updateConversation } from '@/api'

export const useChatStore = defineStore('chat-store', {
  state: (): Chat.ChatState => getLocalState(),

  getters: {
    getChatHistoryByCurrentActive(state: Chat.ChatState) {
      const index = state.history.findIndex(item => item.uuid === state.active)
      if (index !== -1)
        return state.history[index]
      return null
    },

    getChatByUuid(state: Chat.ChatState) {
      return (uuid?: number) => {
        if (uuid)
          return state.chat.find(item => item.uuid === uuid)?.data ?? []
        return state.chat.find(item => item.uuid === state.active)?.data ?? []
      }
    },
  },

  actions: {
    // 从服务器加载对话列表
    async loadFromServer() {
      try {
        const res = await fetchConversations()
        if (res.status === 'Success') {
          this.history = []
          this.chat = []
          if (res.data?.length) {
            for (const conv of res.data) {
              const uuid = Number(conv.uuid)
              this.history.push({ uuid, title: conv.title, isEdit: false })
              this.chat.push({ uuid, data: [] })
            }
            this.active = this.history[0].uuid
            await this.loadMessagesFromServer(this.active)
          }
          else {
            this.active = null
          }
          this.recordState()
        }
      }
      catch (e) {
        console.error('Load from server failed:', e)
      }
    },

    // 从服务器加载单个对话的消息
    async loadMessagesFromServer(uuid: number) {
      try {
        const res = await fetchConversation(String(uuid))
        if (res.status === 'Success' && res.data?.messages?.length) {
          const chatIndex = this.chat.findIndex(item => item.uuid === uuid)
          if (chatIndex !== -1) {
            this.chat[chatIndex].data = res.data.messages.map((m: any) => ({
              dateTime: m.created_at,
              text: m.content,
              thinking: m.thinking,
              images: m.images ? JSON.parse(m.images) : undefined,
              files: m.files ? JSON.parse(m.files) : undefined,
              inversion: m.role === 'user',
              error: false,
              loading: false,
            }))
            this.recordState()
          }
        }
      }
      catch (e) {
        console.error('Load messages failed:', e)
      }
    },

    setUsingContext(context: boolean) {
      this.usingContext = context
      this.recordState()
    },
    addHistory(history: Chat.History, chatData: Chat.Chat[] = []) {
      this.history.unshift(history)
      this.chat.unshift({ uuid: history.uuid, data: chatData })
      this.active = history.uuid
      this.reloadRoute(history.uuid)
      createConversation(String(history.uuid), history.title).catch(() => {})
    },

    updateHistory(uuid: number, edit: Partial<Chat.History>) {
      const index = this.history.findIndex(item => item.uuid === uuid)
      if (index !== -1) {
        this.history[index] = { ...this.history[index], ...edit }
        this.recordState()
        // 同步标题到服务器
        if (edit.title)
          updateConversation(String(uuid), edit.title).catch(() => {})
      }
    },

    async deleteHistory(index: number) {
      const uuid = this.history[index]?.uuid
      this.history.splice(index, 1)
      this.chat.splice(index, 1)
      // 同步删除到服务器
      if (uuid)
        deleteConversation(String(uuid)).catch(() => {})

      if (this.history.length === 0) {
        this.active = null
        this.reloadRoute()
        return
      }

      if (index > 0 && index <= this.history.length) {
        const uuid = this.history[index - 1].uuid
        this.active = uuid
        this.reloadRoute(uuid)
        return
      }

      if (index === 0) {
        if (this.history.length > 0) {
          const uuid = this.history[0].uuid
          this.active = uuid
          this.reloadRoute(uuid)
        }
      }

      if (index > this.history.length) {
        const uuid = this.history[this.history.length - 1].uuid
        this.active = uuid
        this.reloadRoute(uuid)
      }
    },

    async setActive(uuid: number) {
      this.active = uuid
      // 尝试从服务器加载消息
      await this.loadMessagesFromServer(uuid)
      return await this.reloadRoute(uuid)
    },

    getChatByUuidAndIndex(uuid: number, index: number) {
      if (!uuid || uuid === 0) {
        if (this.chat.length)
          return this.chat[0].data[index]
        return null
      }
      const chatIndex = this.chat.findIndex(item => item.uuid === uuid)
      if (chatIndex !== -1)
        return this.chat[chatIndex].data[index]
      return null
    },

    addChatByUuid(uuid: number, chat: Chat.Chat) {
      let targetUuid = uuid
      
      if (!uuid || uuid === 0) {
        if (this.history.length === 0) {
          // 创建新对话
          targetUuid = Date.now()
          const title = chat.text?.substring(0, 50) || 'New Chat'
          this.history.push({ uuid: targetUuid, title, isEdit: false })
          this.chat.push({ uuid: targetUuid, data: [chat] })
          this.active = targetUuid
          this.recordState()
          console.log('Creating conversation:', targetUuid, title)
          createConversation(String(targetUuid), title).catch(e => console.error('Create conversation failed:', e))
        }
        else {
          targetUuid = this.history[0].uuid
          this.chat[0].data.push(chat)
          if (this.history[0].title === 'New Chat' && chat.text) {
            const title = chat.text.substring(0, 50)
            this.history[0].title = title
            // 同步标题到服务器
            updateConversation(String(targetUuid), title).catch(() => {})
          }
          this.recordState()
        }
      }
      else {
        const index = this.chat.findIndex(item => item.uuid === uuid)
        if (index !== -1) {
          this.chat[index].data.push(chat)
          if (this.history[index]?.title === 'New Chat' && chat.text) {
            const title = chat.text.substring(0, 50)
            this.history[index].title = title
            // 同步标题到服务器
            updateConversation(String(uuid), title).catch(() => {})
          }
          this.recordState()
        }
      }
      
      // 只保存用户消息，AI消息在完成后单独保存
      if (chat.inversion && (chat.text || chat.images?.length || chat.files?.length))
        saveMessage(String(targetUuid), 'user', chat.text, chat.images, chat.files).catch(() => {})
    },

    // 保存完成的AI回复到服务器
    saveAssistantMessage(uuid: number, text: string, thinking?: string) {
      saveMessage(String(uuid), 'assistant', text, undefined, thinking).catch(() => {})
    },

    updateChatByUuid(uuid: number, index: number, chat: Chat.Chat) {
      if (!uuid || uuid === 0) {
        if (this.chat.length) {
          this.chat[0].data[index] = chat
          this.recordState()
        }
        return
      }

      const chatIndex = this.chat.findIndex(item => item.uuid === uuid)
      if (chatIndex !== -1) {
        this.chat[chatIndex].data[index] = chat
        this.recordState()
      }
    },

    updateChatSomeByUuid(uuid: number, index: number, chat: Partial<Chat.Chat>) {
      if (!uuid || uuid === 0) {
        if (this.chat.length) {
          this.chat[0].data[index] = { ...this.chat[0].data[index], ...chat }
          this.recordState()
        }
        return
      }

      const chatIndex = this.chat.findIndex(item => item.uuid === uuid)
      if (chatIndex !== -1) {
        this.chat[chatIndex].data[index] = { ...this.chat[chatIndex].data[index], ...chat }
        this.recordState()
      }
    },

    deleteChatByUuid(uuid: number, index: number) {
      if (!uuid || uuid === 0) {
        if (this.chat.length) {
          this.chat[0].data.splice(index, 1)
          this.recordState()
        }
        return
      }

      const chatIndex = this.chat.findIndex(item => item.uuid === uuid)
      if (chatIndex !== -1) {
        this.chat[chatIndex].data.splice(index, 1)
        this.recordState()
      }
    },

    clearChatByUuid(uuid: number) {
      if (!uuid || uuid === 0) {
        if (this.chat.length) {
          this.chat[0].data = []
          this.recordState()
        }
        return
      }

      const index = this.chat.findIndex(item => item.uuid === uuid)
      if (index !== -1) {
        this.chat[index].data = []
        this.recordState()
      }
    },

    async reloadRoute(uuid?: number) {
      this.recordState()
      await router.push({ name: 'Chat', params: { uuid } })
    },

    recordState() {
      setLocalState(this.$state)
    },
  },
})
