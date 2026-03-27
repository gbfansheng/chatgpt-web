import { ss } from '@/utils/storage'

const LOCAL_NAME = 'settingsStorage'
export const DEFAULT_GPT_MODEL_FALLBACK = 'gemini-3-flash-preview'
export const DEFAULT_AVAILABLE_GPT_MODELS_FALLBACK = ['qwen-plus', 'gemini-3-pro', 'gemini-3-flash-preview', 'gpt-5.1']

export interface SettingsState {
  systemMessage: string
  temperature: number
  top_p: number
  gpt_model: string
}

export function defaultSetting(): SettingsState {
  return {
    systemMessage: 'You are ChatGPT, a large language model trained by OpenAI. Follow the user\'s instructions carefully. Respond using markdown.',
    temperature: 0.8,
    top_p: 1,
    gpt_model: '',
  }
}

export function getLocalState(): SettingsState {
  const localSetting: SettingsState | undefined = ss.get(LOCAL_NAME)
  return { ...defaultSetting(), ...localSetting }
}

export function setLocalState(setting: SettingsState): void {
  ss.set(LOCAL_NAME, setting)
}

export function removeLocalState() {
  ss.remove(LOCAL_NAME)
}
