import { apiFetch } from './api'

export type ServerTtsRequest = {
  text: string
  voiceProfile?: string
  voiceId?: string
}

export const fetchServerTtsAudio = async (payload: ServerTtsRequest): Promise<Blob | null> => {
  const response = await apiFetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    return null
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.startsWith('audio/')) {
    return null
  }

  const audioBlob = await response.blob()
  if (audioBlob.size === 0) {
    return null
  }

  return audioBlob
}
