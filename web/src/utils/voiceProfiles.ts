export const KOKORO_MODEL_VOICES = [
  'Adam',
  'Alloy',
  'Aoede',
  'Bella',
  'Echo',
  'Eric',
  'Fenrir',
  'Heart',
  'Jessica',
  'Kore',
  'Liam',
  'Michael',
  'Nicole',
  'Nova',
  'Onyx',
  'Puck',
  'River',
  'Santa',
  'Sarah',
  'Sky',
] as const

export const QWEN3_TTS_VOICES = [
  'Aiden',
  'Dylan',
  'Eric',
  'Ono_Anna',
  'Ryan',
  'Serena',
  'Sohee',
  'Uncle_Fu',
  'Vivian',
] as const

export const KOKORO_VOICES = [...KOKORO_MODEL_VOICES, ...QWEN3_TTS_VOICES] as const

const DEFAULT_KOKORO_VOICE = 'Heart'
const normalize = (value: string) => value.trim().toLowerCase()
const VOICE_BY_NORMALIZED_NAME = new Map(KOKORO_VOICES.map((voice) => [normalize(voice), voice] as const))
const LEGACY_VOICE_MAP: Record<string, (typeof KOKORO_VOICES)[number]> = {
  'neon announcer': 'Heart',
  'calm founder': 'Onyx',
  'buzzword bot': 'Nova',
  'wall street hype': 'Puck',
  'game show host': 'Heart',
  'arcade ringleader': 'Puck',
  'chaos commentator': 'Nova',
  'retro robot mc': 'Onyx',
  'af_heart': 'Heart',
  'am_puck': 'Puck',
  'af_nova': 'Nova',
  'am_onyx': 'Onyx',
}

export const normalizeKokoroVoiceName = (voiceName?: string | null): string => {
  const raw = normalize(voiceName ?? '')
  if (!raw) {
    return DEFAULT_KOKORO_VOICE
  }
  const direct = VOICE_BY_NORMALIZED_NAME.get(raw)
  if (direct) {
    return direct
  }
  const legacy = LEGACY_VOICE_MAP[raw]
  if (legacy) {
    return legacy
  }
  const suffix = raw.includes('_') ? raw.split('_').at(-1) ?? '' : raw
  const bySuffix = VOICE_BY_NORMALIZED_NAME.get(suffix)
  return bySuffix ?? DEFAULT_KOKORO_VOICE
}

export const selectSpeechVoice = (
  availableVoices: SpeechSynthesisVoice[],
  preferredVoiceName: string,
): SpeechSynthesisVoice | null => {
  if (availableVoices.length === 0) {
    return null
  }

  const englishVoices = availableVoices.filter((voice) => voice.lang.toLowerCase().startsWith('en'))
  const pool = englishVoices.length > 0 ? englishVoices : availableVoices
  const preferred = normalizeKokoroVoiceName(preferredVoiceName).toLowerCase()

  const scored = pool
    .map((voice) => {
      const haystack = `${voice.name} ${voice.voiceURI} ${voice.lang}`.toLowerCase()
      const score = haystack.includes(preferred) ? 1 : 0
      return { voice, score }
    })
    .sort((a, b) => b.score - a.score)

  return scored[0]?.voice ?? null
}

export const buildNarrationText = (title: string, summary: string): string => {
  const cleanTitle = title.trim() || 'Untitled Pitch'
  const cleanSummary = summary.trim() || 'No summary provided yet.'
  return `${cleanTitle}. ${cleanSummary}`
}
