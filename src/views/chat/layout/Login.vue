<script setup lang='ts'>
import { ref } from 'vue'
import { NButton, NInput, NModal, NTabs, NTabPane, useMessage } from 'naive-ui'
import { useAuthStore, useChatStore } from '@/store'

interface Props {
  visible: boolean
}

defineProps<Props>()

const authStore = useAuthStore()
const chatStore = useChatStore()
const ms = useMessage()

const loading = ref(false)
const username = ref('')
const password = ref('')
const inviteCode = ref('')
const activeTab = ref('login')

async function handleLogin() {
  if (!username.value.trim() || !password.value.trim()) {
    ms.warning('请输入用户名和密码')
    return
  }
  try {
    loading.value = true
    await authStore.login(username.value.trim(), password.value)
    ms.success('登录成功')
    // 登录后从服务器加载数据
    await chatStore.loadFromServer()
  }
  catch (error: any) {
    ms.error(error.message || '登录失败')
  }
  finally {
    loading.value = false
  }
}

async function handleRegister() {
  if (!inviteCode.value.trim()) {
    ms.warning('请输入邀请码')
    return
  }
  if (!username.value.trim() || !password.value.trim()) {
    ms.warning('请输入用户名和密码')
    return
  }
  if (username.value.trim().length < 3) {
    ms.warning('用户名至少3个字符')
    return
  }
  if (password.value.length < 6) {
    ms.warning('密码至少6个字符')
    return
  }
  try {
    loading.value = true
    await authStore.register(username.value.trim(), password.value, inviteCode.value.trim())
    ms.success('注册成功')
    // 注册后从服务器加载数据
    await chatStore.loadFromServer()
  }
  catch (error: any) {
    ms.error(error.message || '注册失败')
  }
  finally {
    loading.value = false
  }
}

function handleKeyPress(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    activeTab.value === 'login' ? handleLogin() : handleRegister()
  }
}
</script>

<template>
  <NModal :show="visible" style="width: 90%; max-width: 400px">
    <div class="p-8 rounded bg-white dark:bg-[#24272e]">
      <h2 class="text-xl font-bold text-center mb-6 text-slate-800 dark:text-neutral-200">
        ChatGPT Web
      </h2>
      <NTabs v-model:value="activeTab" type="segment" animated>
        <NTabPane name="login" tab="登录">
          <div class="space-y-4 mt-4">
            <NInput v-model:value="username" placeholder="用户名" @keypress="handleKeyPress" />
            <NInput v-model:value="password" type="password" placeholder="密码" @keypress="handleKeyPress" />
            <NButton block type="primary" :loading="loading" @click="handleLogin">
              登录
            </NButton>
          </div>
        </NTabPane>
        <NTabPane name="register" tab="注册">
          <div class="space-y-4 mt-4">
            <NInput v-model:value="inviteCode" placeholder="邀请码" @keypress="handleKeyPress" />
            <NInput v-model:value="username" placeholder="用户名 (至少3个字符)" @keypress="handleKeyPress" />
            <NInput v-model:value="password" type="password" placeholder="密码 (至少6个字符)" @keypress="handleKeyPress" />
            <NButton block type="primary" :loading="loading" @click="handleRegister">
              注册
            </NButton>
          </div>
        </NTabPane>
      </NTabs>
    </div>
  </NModal>
</template>
