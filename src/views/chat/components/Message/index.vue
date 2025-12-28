<script setup lang='ts'>
import { computed, ref } from 'vue'
import { NDropdown, useMessage } from 'naive-ui'
import AvatarComponent from './Avatar.vue'
import TextComponent from './Text.vue'
import { SvgIcon } from '@/components/common'
import { useIconRender } from '@/hooks/useIconRender'
import { t } from '@/locales'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { copyToClip } from '@/utils/copy'

interface ChatFile {
  name: string
  type: string
  data: string
}

interface Props {
  dateTime?: string
  text?: string
  thinking?: string
  images?: string[]
  files?: ChatFile[]
  inversion?: boolean
  error?: boolean
  loading?: boolean
}

interface Emit {
  (ev: 'regenerate'): void
  (ev: 'delete'): void
}

const props = defineProps<Props>()

const emit = defineEmits<Emit>()

const previewImage = ref<string | null>(null)

const { isMobile } = useBasicLayout()

const { iconRender } = useIconRender()

const message = useMessage()

// 获取文件图标
function getFileIcon(type: string) {
  if (type.includes('pdf')) return '📄'
  return '📎'
}

// 打开文件预览
function openFilePreview(file: ChatFile) {
  const win = window.open()
  if (win) {
    if (file.type.includes('pdf')) {
      win.document.write(`<iframe src="${file.data}" style="width:100%;height:100%;border:none;"></iframe>`)
    } else {
      // 文本文件解码显示
      const content = atob(file.data.split(',')[1])
      win.document.write(`<pre style="white-space:pre-wrap;padding:20px;">${content}</pre>`)
    }
  }
}

const textRef = ref<HTMLElement>()

const asRawText = ref(props.inversion)

const messageRef = ref<HTMLElement>()

const options = computed(() => {
  const common = [
    {
      label: t('chat.copy'),
      key: 'copyText',
      icon: iconRender({ icon: 'ri:file-copy-2-line' }),
    },
    {
      label: t('common.delete'),
      key: 'delete',
      icon: iconRender({ icon: 'ri:delete-bin-line' }),
    },
  ]

  if (!props.inversion) {
    common.unshift({
      label: asRawText.value ? t('chat.preview') : t('chat.showRawText'),
      key: 'toggleRenderType',
      icon: iconRender({ icon: asRawText.value ? 'ic:outline-code-off' : 'ic:outline-code' }),
    })
  }

  return common
})

function handleSelect(key: 'copyText' | 'delete' | 'toggleRenderType') {
  switch (key) {
    case 'copyText':
      handleCopy()
      return
    case 'toggleRenderType':
      asRawText.value = !asRawText.value
      return
    case 'delete':
      emit('delete')
  }
}

function handleRegenerate() {
  messageRef.value?.scrollIntoView()
  emit('regenerate')
}

async function handleCopy() {
  try {
    await copyToClip(props.text || '')
    message.success('复制成功')
  }
  catch {
    message.error('复制失败')
  }
}
</script>

<template>
  <div
    ref="messageRef"
    class="flex w-full mb-6 overflow-hidden"
    :class="[{ 'flex-row-reverse': inversion }]"
  >
    <div
      class="flex items-center justify-center flex-shrink-0 h-8 overflow-hidden rounded-full basis-8"
      :class="[inversion ? 'ml-2' : 'mr-2']"
    >
      <AvatarComponent :image="inversion" />
    </div>
    <div class="overflow-hidden text-sm " :class="[inversion ? 'items-end' : 'items-start']">
      <p class="text-xs text-[#b4bbc4]" :class="[inversion ? 'text-right' : 'text-left']">
        {{ dateTime }}
      </p>
      <!-- 图片显示在气泡上方 -->
      <div v-if="images?.length" class="flex gap-1 mt-1 mb-1" :class="[inversion ? 'justify-end' : 'justify-start']">
        <img v-for="(img, idx) in images" :key="idx" :src="img" style="max-width:100px;max-height:100px;object-fit:contain" class="rounded cursor-pointer" @click="previewImage = img" />
      </div>
      <!-- 文件显示 -->
      <div v-if="files?.length" class="flex flex-wrap gap-1 mt-1 mb-1" :class="[inversion ? 'justify-end' : 'justify-start']">
        <div 
          v-for="(file, idx) in files" 
          :key="idx" 
          class="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600"
          @click="openFilePreview(file)"
        >
          <span>{{ getFileIcon(file.type) }}</span>
          <span class="ml-1 max-w-[100px] truncate inline-block align-middle">{{ file.name }}</span>
        </div>
      </div>
      <div
        class="flex items-end gap-1 mt-2"
        :class="[inversion ? 'flex-row-reverse' : 'flex-row']"
      >
        <TextComponent
          ref="textRef"
          :inversion="inversion"
          :error="error"
          :text="text"
          :thinking="thinking"
          :loading="loading"
          :as-raw-text="asRawText"
        />
        <div class="flex flex-col">
          <button
            v-if="!inversion"
            class="mb-2 transition text-neutral-300 hover:text-neutral-800 dark:hover:text-neutral-300"
            @click="handleRegenerate"
          >
            <SvgIcon icon="ri:restart-line" />
          </button>
          <NDropdown
            :trigger="isMobile ? 'click' : 'hover'"
            :placement="!inversion ? 'right' : 'left'"
            :options="options"
            @select="handleSelect"
          >
            <button class="transition text-neutral-300 hover:text-neutral-800 dark:hover:text-neutral-200">
              <SvgIcon icon="ri:more-2-fill" />
            </button>
          </NDropdown>
        </div>
      </div>
    </div>
  </div>
  <!-- 图片预览弹窗 -->
  <div v-if="previewImage" class="fixed inset-0 bg-black/80 z-[1000] flex items-center justify-center" @click="previewImage = null">
    <img :src="previewImage" style="max-width:90vw;max-height:90vh;object-fit:contain" @click.stop />
    <button class="absolute top-5 right-5 w-10 h-10 bg-white/20 rounded-full text-white text-2xl" @click="previewImage = null">×</button>
  </div>
</template>
