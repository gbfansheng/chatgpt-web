import { defineStore } from 'pinia'
import { getToken, removeToken, setToken } from './helper'
import { store } from '@/store'
import { fetchSession, getUserInfo, userLogin, userRegister } from '@/api'

interface SessionResponse {
  auth: boolean
  model: 'ChatGPTAPI' | 'ChatGPTUnofficialProxyAPI'
}

interface UserInfo {
  userId: number
  username: string
}

export interface AuthState {
  token: string | undefined
  session: SessionResponse | null
  user: UserInfo | null
}

export const useAuthStore = defineStore('auth-store', {
  state: (): AuthState => ({
    token: getToken(),
    session: null,
    user: null,
  }),

  getters: {
    isChatGPTAPI(state): boolean {
      return state.session?.model === 'ChatGPTAPI'
    },
    isLoggedIn(state): boolean {
      return !!state.token
    },
  },

  actions: {
    async getSession() {
      try {
        const { data } = await fetchSession<SessionResponse>()
        this.session = { ...data }
        return Promise.resolve(data)
      }
      catch (error) {
        return Promise.reject(error)
      }
    },

    async login(username: string, password: string) {
      const res = await userLogin(username, password)
      if (res.status === 'Success') {
        this.token = res.data.token
        this.user = { userId: res.data.user.id, username: res.data.user.username }
        setToken(res.data.token)
        return true
      }
      throw new Error(res.message || '登录失败')
    },

    async register(username: string, password: string, inviteCode: string) {
      const res = await userRegister(username, password, inviteCode)
      if (res.status === 'Success') {
        this.token = res.data.token
        this.user = { userId: res.data.user.id, username: res.data.user.username }
        setToken(res.data.token)
        return true
      }
      throw new Error(res.message || '注册失败')
    },

    async checkAuth() {
      const storedToken = getToken()
      if (storedToken && !this.token)
        this.token = storedToken
      if (!this.token) return false
      try {
        const res = await getUserInfo()
        if (res.status === 'Success' && res.data) {
          this.user = res.data
          return true
        }
        this.logout()
        return false
      }
      catch {
        this.logout()
        return false
      }
    },

    setToken(token: string) {
      this.token = token
      setToken(token)
    },

    logout() {
      this.token = undefined
      this.user = null
      removeToken()
      // 清除聊天数据
      localStorage.removeItem('chatStorage')
    },

    removeToken() {
      this.logout()
    },
  },
})

export function useAuthStoreWithout() {
  return useAuthStore(store)
}
