<script setup lang='ts'>
import type { Ref } from 'vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { NAutoComplete, NButton, NInput, useDialog, useMessage } from 'naive-ui'
import html2canvas from 'html2canvas'
import { Message } from './components'
import { useScroll } from './hooks/useScroll'
import { useChat } from './hooks/useChat'
import { useUsingContext } from './hooks/useUsingContext'
import HeaderComponent from './components/Header/index.vue'
import { HoverButton, SvgIcon } from '@/components/common'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { useChatStore, usePromptStore, useSettingStore } from '@/store'
import { fetchChatAPIProcess } from '@/api'
import { t } from '@/locales'

let controller = new AbortController()

const openLongReply = import.meta.env.VITE_GLOB_OPEN_LONG_REPLY === 'true'

const route = useRoute()
const dialog = useDialog()
const ms = useMessage()

const chatStore = useChatStore()
const { loadingMessages } = storeToRefs(chatStore)

const { isMobile } = useBasicLayout()
const { addChat, updateChat, updateChatSome, getChatByUuidAndIndex } = useChat()
const { scrollRef, scrollToBottom, scrollToBottomIfAtBottom } = useScroll()
const { usingContext, toggleUsingContext } = useUsingContext()

const { uuid } = route.params as { uuid: string }

const currentUuid = computed(() => chatStore.active || +uuid)
const dataSources = computed(() => chatStore.getChatByUuid(currentUuid.value))
const conversationList = computed(() => dataSources.value.filter(item => (!item.inversion && !!item.conversationOptions)))

const prompt = ref<string>('')
const loading = ref<boolean>(false)
const inputRef = ref<Ref | null>(null)
const gpt_model = ref(useSettingStore().gpt_model ?? 'gemini-3-flash-preview')

// 文件上传相关
const uploadedImages = ref<string[]>([])
const uploadedFiles = ref<{ name: string; type: string; data: string }[]>([])
const fileInputRef = ref<HTMLInputElement | null>(null)
const previewImage = ref<string | null>(null)

// 录音相关
const isRecording = ref(false)
const mediaRecorder = ref<MediaRecorder | null>(null)
const audioChunks = ref<Blob[]>([])

const MAX_IMAGES = 4
const MAX_FILES = 4
const MAX_IMAGE_SIZE = 1024
const MAX_FILE_SIZE = 20 * 1024 * 1024

// 支持的文件类型
const SUPPORTED_FILE_TYPES = [
  'application/pdf',
  'text/plain', 'text/csv', 'text/html', 'text/css', 'text/javascript',
  'application/json', 'application/xml',
]

// 触发文件上传
function triggerFileUpload() {
  fileInputRef.value?.click()
}

// 压缩图片
function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let { width, height } = img
        
        // 等比缩放
        if (width > MAX_IMAGE_SIZE || height > MAX_IMAGE_SIZE) {
          if (width > height) {
            height = (height / width) * MAX_IMAGE_SIZE
            width = MAX_IMAGE_SIZE
          } else {
            width = (width / height) * MAX_IMAGE_SIZE
            height = MAX_IMAGE_SIZE
          }
        }
        
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.8))
      }
      img.onerror = reject
      img.src = e.target?.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// 处理文件上传（图片+文档+音频）
async function handleFileUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const files = input.files
  if (!files) return
  
  for (const file of Array.from(files)) {
    // 图片
    if (file.type.startsWith('image/')) {
      if (uploadedImages.value.length >= MAX_IMAGES) {
        ms.warning(`最多上传 ${MAX_IMAGES} 张图片`)
        continue
      }
      try {
        const base64 = await compressImage(file)
        uploadedImages.value.push(base64)
      } catch {
        ms.error('图片处理失败')
      }
    }
    // 音频
    else if (file.type.startsWith('audio/')) {
      if (uploadedFiles.value.length >= MAX_FILES) {
        ms.warning(`最多上传 ${MAX_FILES} 个文件`)
        continue
      }
      if (file.size > MAX_FILE_SIZE) {
        ms.warning(`文件 ${file.name} 超过 20MB 限制`)
        continue
      }
      try {
        const base64 = await fileToBase64(file)
        uploadedFiles.value.push({ name: file.name, type: file.type, data: base64 })
      } catch {
        ms.error('音频处理失败')
      }
    }
    // 文档（通过扩展名或MIME类型判断）
    else {
      const ext = file.name.split('.').pop()?.toLowerCase()
      const isSupported = SUPPORTED_FILE_TYPES.includes(file.type) 
        || file.type.startsWith('text/') 
        || ['pdf', 'txt', 'csv', 'json', 'xml', 'html', 'css', 'js'].includes(ext || '')
      
      if (!isSupported) {
        ms.warning(`不支持的文件类型: ${file.name}`)
        continue
      }
      if (uploadedFiles.value.length >= MAX_FILES) {
        ms.warning(`最多上传 ${MAX_FILES} 个文件`)
        continue
      }
      if (file.size > MAX_FILE_SIZE) {
        ms.warning(`文件 ${file.name} 超过 20MB 限制`)
        continue
      }
      try {
        const base64 = await fileToBase64(file)
        uploadedFiles.value.push({ name: file.name, type: file.type || `text/${ext}`, data: base64 })
      } catch {
        ms.error('文件处理失败')
      }
    }
  }
  input.value = ''
}

// 文件转 base64
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// 删除图片
function removeImage(index: number) {
  uploadedImages.value.splice(index, 1)
}

// 删除文件
function removeFile(index: number) {
  uploadedFiles.value.splice(index, 1)
}

// 拖拽上传
const isDragging = ref(false)

function handleDrop(event: DragEvent) {
  event.preventDefault()
  isDragging.value = false
  const files = event.dataTransfer?.files
  if (!files) return
  
  for (const file of Array.from(files)) {
    // 图片
    if (file.type.startsWith('image/')) {
      if (uploadedImages.value.length >= MAX_IMAGES) {
        ms.warning(`最多上传 ${MAX_IMAGES} 张图片`)
        continue
      }
      compressImage(file).then(base64 => {
        uploadedImages.value.push(base64)
      }).catch(() => ms.error('图片处理失败'))
    }
    // 其他文件
    else if (SUPPORTED_FILE_TYPES.includes(file.type) || file.type.startsWith('text/')) {
      if (uploadedFiles.value.length >= MAX_FILES) {
        ms.warning(`最多上传 ${MAX_FILES} 个文件`)
        continue
      }
      if (file.size > MAX_FILE_SIZE) {
        ms.warning(`文件 ${file.name} 超过 20MB 限制`)
        continue
      }
      fileToBase64(file).then(base64 => {
        uploadedFiles.value.push({ name: file.name, type: file.type, data: base64 })
      }).catch(() => ms.error('文件处理失败'))
    }
  }
}

function handleDragOver(event: DragEvent) {
  event.preventDefault()
  isDragging.value = true
}

function handleDragLeave(event: DragEvent) {
  event.preventDefault()
  isDragging.value = false
}

// 粘贴图片
async function handlePaste(event: ClipboardEvent) {
  const items = event.clipboardData?.items
  if (!items) return
  
  for (const item of Array.from(items)) {
    if (!item.type.startsWith('image/')) continue
    
    const file = item.getAsFile()
    if (!file) continue
    
    if (uploadedImages.value.length >= MAX_IMAGES) {
      ms.warning(`最多上传 ${MAX_IMAGES} 张图片`)
      break
    }
    
    try {
      const base64 = await compressImage(file)
      uploadedImages.value.push(base64)
    } catch {
      ms.error('图片处理失败')
    }
  }
}

// 添加PromptStore
const promptStore = usePromptStore()

// 使用storeToRefs，保证store修改后，联想部分能够重新渲染
const { promptList: promptTemplate } = storeToRefs<any>(promptStore)

// 未知原因刷新页面，loading 状态不会重置，手动重置
dataSources.value.forEach((item, index) => {
  if (item.loading)
    updateChatSome(currentUuid.value, index, { loading: false })
})

function handleSubmit() {
  onConversation()
}

// 开始/停止录音
async function toggleRecording() {
  if (isRecording.value) {
    // 停止录音
    mediaRecorder.value?.stop()
    isRecording.value = false
  } else {
    // 开始录音
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorder.value = new MediaRecorder(stream)
      audioChunks.value = []
      
      mediaRecorder.value.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.value.push(e.data)
      }
      
      mediaRecorder.value.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(audioChunks.value, { type: 'audio/webm' })
        const reader = new FileReader()
        reader.onload = () => {
          const base64 = reader.result as string
          uploadedFiles.value.push({ name: `录音_${Date.now()}.webm`, type: 'audio/webm', data: base64 })
        }
        reader.readAsDataURL(blob)
      }
      
      mediaRecorder.value.start()
      isRecording.value = true
    } catch (e: any) {
      if (e.name === 'NotAllowedError')
        ms.error('麦克风权限被拒绝')
      else if (location.protocol !== 'https:' && location.hostname !== 'localhost')
        ms.error('录音需要 HTTPS 环境')
      else
        ms.error('无法访问麦克风')
    }
  }
}

async function onConversation() {
  let message = prompt.value

  if (loading.value)
    return

  const hasFiles = uploadedImages.value.length > 0 || uploadedFiles.value.length > 0
  if ((!message || message.trim() === '') && !hasFiles)
    return

  controller = new AbortController()

  const currentImages = [...uploadedImages.value]
  const currentFiles = [...uploadedFiles.value]
  uploadedImages.value = []
  uploadedFiles.value = []

  addChat(
    currentUuid.value,
    {
      dateTime: new Date().toLocaleString(),
      text: message,
      images: currentImages,
      files: currentFiles,
      inversion: true,
      error: false,
      conversationOptions: null,
      requestOptions: { prompt: message, options: null },
    },
  )
  scrollToBottom()

  loading.value = true
  prompt.value = ''

  let options: Chat.ConversationRequest = {}
  const lastContext = conversationList.value[conversationList.value.length - 1]?.conversationOptions

  if (lastContext && usingContext.value)
    options = { ...lastContext }

  addChat(
    currentUuid.value,
    {
      dateTime: new Date().toLocaleString(),
      text: '',
      loading: true,
      inversion: false,
      error: false,
      conversationOptions: null,
      requestOptions: { prompt: message, options: { ...options } },
    },
  )
  scrollToBottom()

  try {
    let lastText = ''
    const fetchChatAPIOnce = async () => {
      // 构建对话历史 - 关键修复！
      const conversationHistory = dataSources.value
        .filter(item => !item.loading && !item.error)
        .map(item => ({
          text: item.text,
          inversion: item.inversion ?? false
        }))

      await fetchChatAPIProcess<Chat.ConversationResponse>({
        prompt: message,
        options,
        conversationHistory,
        images: currentImages,
        files: currentFiles,
        signal: controller.signal,
        onDownloadProgress: ({ event }) => {
          const xhr = event.target
          const { responseText } = xhr
          // Always process the final line
          const lastIndex = responseText.lastIndexOf('\n', responseText.length - 2)
          let chunk = responseText
          if (lastIndex !== -1)
            chunk = responseText.substring(lastIndex)
          try {
            const data = JSON.parse(chunk)
            updateChat(
              currentUuid.value,
              dataSources.value.length - 1,
              {
                dateTime: new Date().toLocaleString(),
                text: lastText + (data.text ?? ''),
                thinking: data.thinking ?? '',
                inversion: false,
                error: false,
                loading: true,
                conversationOptions: { conversationId: data.conversationId, parentMessageId: data.id },
                requestOptions: { prompt: message, options: { ...options } },
              },
            )

            if (openLongReply && data.detail?.choices?.[0]?.finish_reason === 'length') {
              options.parentMessageId = data.id
              lastText = data.text
              message = ''
              return fetchChatAPIOnce()
            }

            scrollToBottomIfAtBottom()
          }
          catch (error) {
            //
          }
        },
      })
      updateChatSome(currentUuid.value, dataSources.value.length - 1, { loading: false })
      // 保存AI回复到服务器
      const lastMsg = dataSources.value[dataSources.value.length - 1]
      if (lastMsg && !lastMsg.inversion && lastMsg.text)
        chatStore.saveAssistantMessage(currentUuid.value, lastMsg.text, lastMsg.thinking)
    }

    await fetchChatAPIOnce()
  }
  catch (error: any) {
    const errorMessage = error?.message ?? t('common.wrong')

    if (error.message === 'canceled') {
      updateChatSome(
        currentUuid.value,
        dataSources.value.length - 1,
        {
          loading: false,
        },
      )
      scrollToBottomIfAtBottom()
      return
    }

    const currentChat = getChatByUuidAndIndex(currentUuid.value, dataSources.value.length - 1)

    if (currentChat?.text && currentChat.text !== '') {
      updateChatSome(
        currentUuid.value,
        dataSources.value.length - 1,
        {
          text: `${currentChat.text}\n[${errorMessage}]`,
          error: false,
          loading: false,
        },
      )
      return
    }

    updateChat(
      currentUuid.value,
      dataSources.value.length - 1,
      {
        dateTime: new Date().toLocaleString(),
        text: errorMessage,
        inversion: false,
        error: true,
        loading: false,
        conversationOptions: null,
        requestOptions: { prompt: message, options: { ...options } },
      },
    )
    scrollToBottomIfAtBottom()
  }
  finally {
    loading.value = false
  }
}

async function onRegenerate(index: number) {
  if (loading.value)
    return

  controller = new AbortController()

  const { requestOptions } = dataSources.value[index]

  let message = requestOptions?.prompt ?? ''

  let options: Chat.ConversationRequest = {}

  if (requestOptions.options)
    options = { ...requestOptions.options }

  loading.value = true

  updateChat(
    currentUuid.value,
    index,
    {
      dateTime: new Date().toLocaleString(),
      text: '',
      inversion: false,
      error: false,
      loading: true,
      conversationOptions: null,
      requestOptions: { prompt: message, options: { ...options } },
    },
  )

  try {
    let lastText = ''
    const fetchChatAPIOnce = async () => {
      await fetchChatAPIProcess<Chat.ConversationResponse>({
        prompt: message,
        options,
        signal: controller.signal,
        onDownloadProgress: ({ event }) => {
          const xhr = event.target
          const { responseText } = xhr
          // Always process the final line
          const lastIndex = responseText.lastIndexOf('\n', responseText.length - 2)
          let chunk = responseText
          if (lastIndex !== -1)
            chunk = responseText.substring(lastIndex)
          try {
            const data = JSON.parse(chunk)
            updateChat(
              currentUuid.value,
              index,
              {
                dateTime: new Date().toLocaleString(),
                text: lastText + (data.text ?? ''),
                thinking: data.thinking ?? '',
                inversion: false,
                error: false,
                loading: true,
                conversationOptions: { conversationId: data.conversationId, parentMessageId: data.id },
                requestOptions: { prompt: message, options: { ...options } },
              },
            )

            if (openLongReply && data.detail?.choices?.[0]?.finish_reason === 'length') {
              options.parentMessageId = data.id
              lastText = data.text
              message = ''
              return fetchChatAPIOnce()
            }
          }
          catch (error) {
            //
          }
        },
      })
      updateChatSome(currentUuid.value, index, { loading: false })
    }
    await fetchChatAPIOnce()
  }
  catch (error: any) {
    if (error.message === 'canceled') {
      updateChatSome(
        currentUuid.value,
        index,
        {
          loading: false,
        },
      )
      return
    }

    const errorMessage = error?.message ?? t('common.wrong')

    updateChat(
      currentUuid.value,
      index,
      {
        dateTime: new Date().toLocaleString(),
        text: errorMessage,
        inversion: false,
        error: true,
        loading: false,
        conversationOptions: null,
        requestOptions: { prompt: message, options: { ...options } },
      },
    )
  }
  finally {
    loading.value = false
  }
}

function handleExport() {
  if (loading.value)
    return

  const d = dialog.warning({
    title: t('chat.exportImage'),
    content: t('chat.exportImageConfirm'),
    positiveText: t('common.yes'),
    negativeText: t('common.no'),
    onPositiveClick: async () => {
      try {
        d.loading = true
        const ele = document.getElementById('image-wrapper')
        const canvas = await html2canvas(ele as HTMLDivElement, {
          useCORS: true,
        })
        const imgUrl = canvas.toDataURL('image/png')
        const tempLink = document.createElement('a')
        tempLink.style.display = 'none'
        tempLink.href = imgUrl
        tempLink.setAttribute('download', 'chat-shot.png')
        if (typeof tempLink.download === 'undefined')
          tempLink.setAttribute('target', '_blank')

        document.body.appendChild(tempLink)
        tempLink.click()
        document.body.removeChild(tempLink)
        window.URL.revokeObjectURL(imgUrl)
        d.loading = false
        ms.success(t('chat.exportSuccess'))
        Promise.resolve()
      }
      catch (error: any) {
        ms.error(t('chat.exportFailed'))
      }
      finally {
        d.loading = false
      }
    },
  })
}

function handleModelChange() {
  // 修改模型
  let modelValue = gpt_model.value
  if (modelValue === 'qwen-plus')
    modelValue = 'gemini-3-pro'
  else if (modelValue === 'gemini-3-pro')
    modelValue = 'gemini-3-flash-preview'
  else if (modelValue === 'gemini-3-flash-preview')
    modelValue = 'gpt-5.1'
  else if (modelValue === 'gpt-5.1')
    modelValue = 'qwen-plus'
  useSettingStore().updateSetting({ gpt_model: modelValue })
  gpt_model.value = modelValue
}

const gptModelText = computed(() => {
  if (gpt_model.value === 'qwen-plus')
    return 'Qwen-Plus'
  else if (gpt_model.value === 'gemini-3-pro')
    return 'Gemini-3-Pro'
  else if (gpt_model.value === 'gemini-3-flash-preview')
    return 'Gemini-3-Flash'
  else if (gpt_model.value === 'gpt-5.1')
    return 'GPT-5.1'
  else
    return 'Gemini-3-Flash' // 默认显示
})

function handleDelete(index: number) {
  if (loading.value)
    return

  dialog.warning({
    title: t('chat.deleteMessage'),
    content: t('chat.deleteMessageConfirm'),
    positiveText: t('common.yes'),
    negativeText: t('common.no'),
    onPositiveClick: () => {
      chatStore.deleteChatByUuid(currentUuid.value, index)
    },
  })
}

function handleClear() {
  if (loading.value)
    return

  dialog.warning({
    title: t('chat.clearChat'),
    content: t('chat.clearChatConfirm'),
    positiveText: t('common.yes'),
    negativeText: t('common.no'),
    onPositiveClick: () => {
      chatStore.clearChatByUuid(currentUuid.value)
    },
  })
}

function handleEnter(event: KeyboardEvent) {
  if (!isMobile.value) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSubmit()
    }
  }
  else {
    if (event.key === 'Enter' && event.ctrlKey) {
      event.preventDefault()
      handleSubmit()
    }
  }
}

function handleStop() {
  if (loading.value) {
    controller.abort()
    loading.value = false
  }
}

// 可优化部分
// 搜索选项计算，这里使用value作为索引项，所以当出现重复value时渲染异常(多项同时出现选中效果)
// 理想状态下其实应该是key作为索引项,但官方的renderOption会出现问题，所以就需要value反renderLabel实现
const searchOptions = computed(() => {
  if (prompt.value.startsWith('/')) {
    return promptTemplate.value.filter((item: { key: string }) => item.key.toLowerCase().includes(prompt.value.substring(1).toLowerCase())).map((obj: { value: any }) => {
      return {
        label: obj.value,
        value: obj.value,
      }
    })
  }
  else {
    return []
  }
})

// value反渲染key
const renderOption = (option: { label: string }) => {
  for (const i of promptTemplate.value) {
    if (i.value === option.label)
      return [i.key]
  }
  return []
}

const placeholder = computed(() => {
  if (isMobile.value)
    return t('chat.placeholderMobile')
  return t('chat.placeholder')
})

const buttonDisabled = computed(() => {
  const hasContent = prompt.value && prompt.value.trim() !== ''
  const hasFiles = uploadedImages.value.length > 0 || uploadedFiles.value.length > 0
  return loading.value || (!hasContent && !hasFiles)
})

const footerClass = computed(() => {
  let classes = ['p-4']
  if (isMobile.value)
    classes = ['sticky', 'left-0', 'bottom-0', 'right-0', 'p-2', 'pr-3', 'overflow-hidden']
  return classes
})

onMounted(() => {
  scrollToBottom()
  if (inputRef.value && !isMobile.value)
    inputRef.value?.focus()
  
  // 监听粘贴事件
  document.addEventListener('paste', handlePaste)
})

onUnmounted(() => {
  if (loading.value)
    controller.abort()
  document.removeEventListener('paste', handlePaste)
})
</script>

<template>
  <div 
    class="flex flex-col w-full h-full relative" 
    :class="{ 'drag-active': isDragging }"
    @drop="handleDrop" 
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
  >
    <!-- 拖拽提示遮罩 -->
    <div v-if="isDragging" class="drag-overlay">
      <div class="drag-hint">
        <SvgIcon icon="ri:image-add-line" class="text-4xl mb-2" />
        <span>释放以上传图片</span>
      </div>
    </div>
    <!-- 图片预览弹窗 -->
    <div v-if="previewImage" class="preview-overlay" @click="previewImage = null">
      <img :src="previewImage" class="preview-image" @click.stop />
      <button class="preview-close" @click="previewImage = null">×</button>
    </div>
    <HeaderComponent v-if="isMobile" :using-context="usingContext" @export="handleExport" @handle-clear="handleClear" />
    <main class="flex-1 overflow-hidden">
      <div id="scrollRef" ref="scrollRef" class="h-full overflow-hidden overflow-y-auto">
        <div
          id="image-wrapper" class="w-full max-w-screen-xl m-auto dark:bg-[#101014]"
          :class="[isMobile ? 'p-2' : 'p-4']"
        >
          <template v-if="!dataSources.length">
            <div v-if="loadingMessages" class="flex items-center justify-center mt-4 text-center text-neutral-400">
              <SvgIcon icon="ri:loader-4-line" class="mr-2 text-2xl animate-spin" />
              <span>加载中...</span>
            </div>
            <div v-else class="flex items-center justify-center mt-4 text-center text-neutral-300">
              <SvgIcon icon="ri:bubble-chart-fill" class="mr-2 text-3xl" />
              <span>Aha~</span>
            </div>
          </template>
          <template v-else>
            <div>
              <Message
                v-for="(item, index) of dataSources" :key="index" :date-time="item.dateTime" :text="item.text"
                :thinking="item.thinking"
                :images="item.images"
                :files="item.files"
                :inversion="item.inversion" :error="item.error" :loading="item.loading" @regenerate="onRegenerate(index)"
                @delete="handleDelete(index)"
              />
              <div class="sticky bottom-0 left-0 flex justify-center">
                <NButton v-if="loading" type="warning" @click="handleStop">
                  <template #icon>
                    <SvgIcon icon="ri:stop-circle-line" />
                  </template>
                  {{ t('common.stopResponding') }}
                </NButton>
              </div>
            </div>
          </template>
        </div>
      </div>
    </main>
    <footer :class="footerClass">
      <div class="w-full max-w-screen-xl m-auto">
        <div class="flex items-end justify-between space-x-2">
          <HoverButton v-if="!isMobile" @click="handleClear">
            <span class="text-xl text-[#4f555e] dark:text-white">
              <SvgIcon icon="ri:delete-bin-line" />
            </span>
          </HoverButton>
          <HoverButton v-if="!isMobile" @click="handleExport">
            <span class="text-xl text-[#4f555e] dark:text-white">
              <SvgIcon icon="ri:download-2-line" />
            </span>
          </HoverButton>
          <HoverButton @click="toggleUsingContext">
            <span class="text-xl" :class="{ 'text-[#4b9e5f]': usingContext, 'text-[#a8071a]': !usingContext }">
              <SvgIcon icon="ri:chat-history-line" />
            </span>
          </HoverButton>
          <!-- 文件上传按钮（图片+文档） -->
          <HoverButton @click="triggerFileUpload">
            <span class="text-xl text-[#4f555e] dark:text-white">
              <SvgIcon icon="ri:attachment-2" />
            </span>
          </HoverButton>
          <!-- 录音按钮（仅桌面端） -->
          <HoverButton v-if="!isMobile" @click="toggleRecording">
            <span class="text-xl" :class="isRecording ? 'text-red-500 animate-pulse' : 'text-[#4f555e] dark:text-white'">
              <SvgIcon :icon="isRecording ? 'ri:stop-circle-fill' : 'ri:mic-line'" />
            </span>
          </HoverButton>
          <input
            ref="fileInputRef"
            type="file"
            accept="image/*,audio/*,.pdf,.txt,.csv,.json,.xml,.html,.css,.js"
            multiple
            style="display: none;"
            @change="handleFileUpload"
          />
          <button style="min-width: 60px; max-width: 60px; text-align: center; color: #4b9e5f;" @click="handleModelChange" v-text="gptModelText" />
          <div class="flex-1 flex flex-col">
            <!-- 图片/文件预览区域 -->
            <div v-if="uploadedImages.length || uploadedFiles.length" class="flex flex-wrap gap-2 mb-2">
              <div v-for="(img, idx) in uploadedImages" :key="'img-'+idx" class="relative" style="width:50px;height:50px">
                <img :src="img" style="width:50px;height:50px;object-fit:contain" class="rounded cursor-pointer" @click="previewImage = img" />
                <button class="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-xs" @click="removeImage(idx)">×</button>
              </div>
              <div v-for="(file, idx) in uploadedFiles" :key="'file-'+idx" class="relative flex items-center px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">
                <span class="max-w-[80px] truncate">{{ file.name }}</span>
                <button class="ml-1 text-red-500" @click="removeFile(idx)">×</button>
              </div>
            </div>
            <NAutoComplete v-model:value="prompt" :options="searchOptions" :render-label="renderOption">
              <template #default="{ handleInput, handleBlur, handleFocus }">
                <NInput
                  ref="inputRef" v-model:value="prompt" type="textarea" :placeholder="placeholder"
                  :autosize="{ minRows: 1, maxRows: isMobile ? 4 : 8 }" @input="handleInput" @focus="handleFocus"
                  @blur="handleBlur" @keypress="handleEnter"
                />
              </template>
            </NAutoComplete>
          </div>
          <NButton type="primary" :disabled="buttonDisabled" @click="handleSubmit">
            <template #icon>
              <span class="dark:text-black">
                <SvgIcon icon="ri:send-plane-fill" />
              </span>
            </template>
          </NButton>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.drag-active {
  position: relative;
}

.drag-overlay {
  position: absolute;
  inset: 0;
  background: rgba(75, 158, 95, 0.1);
  border: 3px dashed #4b9e5f;
  border-radius: 8px;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.drag-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  color: #4b9e5f;
  font-size: 16px;
  font-weight: 500;
}

.preview-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-image {
  max-width: 90vw;
  max-height: 90vh;
  object-fit: contain;
}

.preview-close {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 40px;
  height: 40px;
  background: rgba(255, 255, 255, 0.2);
  border: none;
  border-radius: 50%;
  color: white;
  font-size: 24px;
  cursor: pointer;
}
</style>
