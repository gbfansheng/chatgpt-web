<script setup lang='ts'>
import { computed, useAttrs } from 'vue'
import { Icon } from '@iconify/vue'

interface Props {
  icon?: string
}

const props = defineProps<Props>()

const attrs = useAttrs()

const bindAttrs = computed<{ class: string; style: string }>(() => ({
  class: (attrs.class as string) || '',
  style: (attrs.style as string) || '',
}))

// 如果icon没有被提供，使用一个默认的图标字符串
const iconValue = computed(() => props.icon ?? 'default-icon')
</script>

<template>
  <Icon :icon="iconValue" v-bind="bindAttrs" />
</template>
