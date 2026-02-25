import type { CSSProperties, PointerEvent } from 'react'
import { apiFetch } from '../utils/api'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getMascotImage } from '../utils/mascots'
import { AnimatedMascot } from '../components/AnimatedMascot'
import LeaderboardModal from '../components/LeaderboardModal'
import type { MascotEvent } from '../hooks/useAnimationTrigger'
import {
  buildNarrationText,
  KOKORO_VOICES,
  normalizeKokoroVoiceName,
  selectSpeechVoice,
} from '../utils/voiceProfiles'
import { fetchServerTtsAudio } from '../utils/ttsApi'
import { playActionSound, playPhaseSound } from '../utils/soundEffects'

type GameResponse = {
  ok: boolean
  room?: {
    penguin: string
    selectedAsk: string | null
    pitchTimerSeconds: number
    robotVoiceEnabled: boolean
    pitchEndsAt?: number | null
    serverNow?: number
    phase?: string
  }
  mustHavesByPlayer?: Record<string, string[]>
  surpriseByPlayer?: Record<string, string | null>
  pitchStatusByPlayer?: Record<string, string>
  playerScores?: Record<string, number>
  players?: {
    name: string
    isHost: boolean
    mascot?: string
  }[]
}

type PitchesResponse = {
  ok: boolean
  pitches: Array<{ player: string; summary: string; title: string; aiGenerated?: boolean; sketchData?: string | null }>
}

export default function Pitch() {
  useEffect(() => {
    playPhaseSound('pitch')
  }, [])

  const { code } = useParams()
  const navigate = useNavigate()
  const [selectedAsk, setSelectedAsk] = useState<string | null>(null)
  const [mustHaves, setMustHaves] = useState<string[]>([])
  const [surprise, setSurprise] = useState<string | null>(null)
  const [robotVoiceEnabled, setRobotVoiceEnabled] = useState(true)
  const [pitchStatuses, setPitchStatuses] = useState<Record<string, string>>({})
  const [penguin, setPenguin] = useState('')
  const [pitchText, setPitchText] = useState('')
  const [pitchTitle, setPitchTitle] = useState('')
  const [selectedMustHaves, setSelectedMustHaves] = useState<string[]>([])
  const voiceOptions = useMemo(() => [...KOKORO_VOICES], [])
  const [voice, setVoice] = useState<string>(voiceOptions[0] ?? 'Heart')
  const [pitchEndsAt, setPitchEndsAt] = useState<number | null>(null)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [clockOffsetMs, setClockOffsetMs] = useState(0)
  const [generatedPitch, setGeneratedPitch] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [usedAIGeneration, setUsedAIGeneration] = useState(false)
  const [aiAttempted, setAiAttempted] = useState(false)
  const [autoSubmitted, setAutoSubmitted] = useState(false)
  const [readyError, setReadyError] = useState('')
  const [playerMascots, setPlayerMascots] = useState<Record<string, string>>({})
  const [aiWarning, setAiWarning] = useState('')
  const [playerScores, setPlayerScores] = useState<Record<string, number>>({})
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const canvasWrapRef = useRef<HTMLDivElement | null>(null)
  const isDrawingRef = useRef(false)
  const mascotAnimationRefs = useRef<Record<string, (event: MascotEvent) => void>>({})
  const previousStatusesRef = useRef<Record<string, string>>({})
  const [brushColor, setBrushColor] = useState('#2e2a27')
  const [brushSize, setBrushSize] = useState(6)
  const [isEraser, setIsEraser] = useState(false)
  const [isPreviewingVoice, setIsPreviewingVoice] = useState(false)
  const [isPreparingVoicePreview, setIsPreparingVoicePreview] = useState(false)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)
  const voicePreviewCacheRef = useRef<Map<string, string>>(new Map())
  const previewTokenRef = useRef(0)

  const roomCode = code ?? localStorage.getItem('pp:lastRoom') ?? ''
  const playerName = roomCode ? localStorage.getItem(`pp:player:${roomCode}`) ?? '' : ''
  const aiLockKey = roomCode && playerName ? `pp:ai-lock:${roomCode}:${playerName}` : ''
  const colorOptions = ['#2e2a27', '#d24b4b', '#3e7c3e', '#2d6cdf', '#f5b544', '#7c4bd2']
  const backgroundColor = { r: 255, g: 250, b: 241 }

  const load = async () => {
    if (!roomCode) {
      return
    }
    if (aiLockKey && localStorage.getItem(aiLockKey) === 'true') {
      setAiAttempted(true)
    }
    const [gameResponse, pitchesResponse] = await Promise.all([
      apiFetch(`/api/room/${roomCode}/game`),
      apiFetch(`/api/room/${roomCode}/pitches`)
    ])
    const data = (await gameResponse.json()) as GameResponse
    if (!data.ok || !data.room) {
      return
    }
    if (data.room.phase && data.room.phase !== 'pitch' && data.room.phase !== 'final-round') {
      const nextPath =
        data.room.phase === 'deal'
          ? '/deal'
          : data.room.phase === 'reveal'
            ? '/reveal'
            : data.room.phase === 'results'
              ? '/results'
              : '/pitch'
      navigate(nextPath, { replace: true })
      return
    }
    setPenguin(data.room.penguin)
    const offsetMs =
      typeof data.room.serverNow === 'number' ? data.room.serverNow - Date.now() : clockOffsetMs
    setClockOffsetMs(offsetMs)
    setSelectedAsk(data.room.selectedAsk)
    setRobotVoiceEnabled(data.room.robotVoiceEnabled)
    setPitchEndsAt(data.room.pitchEndsAt ?? null)
    setPitchStatuses(data.pitchStatusByPlayer ?? {})
    setPlayerScores(data.playerScores ?? {})
    if (playerName) {
      setMustHaves(data.mustHavesByPlayer?.[playerName] ?? [])
      setSurprise(data.surpriseByPlayer?.[playerName] ?? null)
    }
    if (data.players) {
      const nextMascots: Record<string, string> = {}
      data.players.forEach((player) => {
        if (player.mascot) {
          nextMascots[player.name] = player.mascot
        }
      })
      setPlayerMascots(nextMascots)
    }
    if (pitchesResponse.ok) {
      const pitchData = (await pitchesResponse.json()) as PitchesResponse
      if (pitchData.ok && playerName) {
        const existing = pitchData.pitches.find((pitch) => pitch.player === playerName)
        if (existing?.aiGenerated) {
          setUsedAIGeneration(true)
          setAiAttempted(true)
        }
      }
    }
  }

  useEffect(() => {
    let refreshId: number | undefined
    let timerId: number | undefined
    void load()
    refreshId = window.setInterval(load, 2000)
    timerId = window.setInterval(() => {
      if (!pitchEndsAt) {
        setSecondsLeft(null)
        return
      }
      const remaining = Math.max(0, Math.ceil((pitchEndsAt - (Date.now() + clockOffsetMs)) / 1000))
      setSecondsLeft(remaining)
    }, 1000)
    return () => {
      if (refreshId) {
        window.clearInterval(refreshId)
      }
      if (timerId) {
        window.clearInterval(timerId)
      }
    }
  }, [pitchEndsAt, navigate, clockOffsetMs])

  const handleStatus = async (status: 'drafting' | 'ready') => {
    if (!roomCode || !playerName) {
      return
    }
    if (pitchStatuses[playerName] === 'ready') {
      return
    }
    if (status === 'ready') {
      if (!pitchTitle.trim() || !pitchText.trim() || selectedMustHaves.length === 0) {
        setReadyError('Add a title, a pitch summary, and at least one CONSTRAINT before marking ready.')
        return
      }
    }
    setReadyError('')
    const sketchData = getSketchData()
    await apiFetch(`/api/room/${roomCode}/pitch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerName,
        title: pitchTitle || 'Untitled',
        summary: pitchText,
        usedMustHaves: selectedMustHaves,
        voice,
        aiGenerated: usedAIGeneration,
        sketchData,
        status
      })
    })
    if (status === 'ready') {
      playActionSound('submit_pitch')
    }
    await load()
  }

  const handleGeneratePitch = async () => {
    if (aiAttempted || usedAIGeneration) {
      return
    }
    if (selectedMustHaves.length === 0) {
      setAiWarning('⚠️ No 🧩 CONSTRAINTS selected. Using AI will mark you as an AI user—other players can challenge this.')
      return
    }
    
    // Check if player has enough balance
    const playerBalance = playerScores[playerName] ?? 0
    const AI_COST = 0.5 // $50
    if (playerBalance < AI_COST) {
      setAiWarning('⚠️ Insufficient balance. You need at least $50 to use AI generation.')
      return
    }
    
    setAiWarning('')
    setAiAttempted(true)
    if (aiLockKey) {
      localStorage.setItem(aiLockKey, 'true')
    }
    setGenerating(true)
    try {
      const response = await apiFetch(`/api/room/${roomCode}/generate-pitch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ask: selectedAsk,
          mustHaves: selectedMustHaves.length > 0 ? selectedMustHaves : [],
          surprise: surprise ?? null,
          playerName: playerName
        })
      })
      const data = (await response.json()) as { ok: boolean; pitch?: string; message?: string }
      if (!data.ok || !data.pitch) {
        alert(data.message ?? 'Failed to generate pitch. Try again.')
        setAiAttempted(false) // Allow retry on failure
        if (aiLockKey) {
          localStorage.removeItem(aiLockKey)
        }
        return
      }
      setGeneratedPitch(data.pitch)
      // Mark as AI user immediately upon successful generation
      setUsedAIGeneration(true)
      // Refresh scores to show deduction
      void load()
    } catch (err) {
      alert('Failed to generate pitch. Try again.')
      setAiAttempted(false) // Allow retry on failure
      if (aiLockKey) {
        localStorage.removeItem(aiLockKey)
      }
    } finally {
      setGenerating(false)
    }
  }

  const handleUseGeneratedPitch = () => {
    if (!generatedPitch) return
    setPitchText(generatedPitch)
    setUsedAIGeneration(true)
    if (aiLockKey) {
      localStorage.setItem(aiLockKey, 'true')
    }
    setGeneratedPitch(null)
  }

  const stopVoicePreview = () => {
    previewTokenRef.current += 1
    if (previewAudioRef.current) {
      previewAudioRef.current.pause()
      previewAudioRef.current.src = ''
      previewAudioRef.current = null
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    setIsPreparingVoicePreview(false)
    setIsPreviewingVoice(false)
  }

  const playPreviewAudio = async (audioUrl: string, token: number) => {
    const audio = new Audio(audioUrl)
    previewAudioRef.current = audio
    setIsPreparingVoicePreview(false)
    setIsPreviewingVoice(true)
    audio.onended = () => {
      if (token === previewTokenRef.current) {
        setIsPreviewingVoice(false)
      }
      previewAudioRef.current = null
    }
    audio.onerror = () => {
      if (token === previewTokenRef.current) {
        setIsPreviewingVoice(false)
      }
      previewAudioRef.current = null
    }
    await audio.play()
  }

  const handlePreviewVoice = async () => {
    const synth =
      typeof window !== 'undefined' && 'speechSynthesis' in window
        ? window.speechSynthesis
        : null
    if (isPreviewingVoice || isPreparingVoicePreview) {
      stopVoicePreview()
      return
    }

    stopVoicePreview()
    const previewToken = previewTokenRef.current
    const selectedVoiceName = normalizeKokoroVoiceName(voice)
    const previewText = buildNarrationText(
      'Voice preview',
      'Investors, this is your Kokoro voice test. Big idea. Big energy. Big finish.',
    )
    const cachedPreviewUrl = voicePreviewCacheRef.current.get(selectedVoiceName)
    if (cachedPreviewUrl) {
      await playPreviewAudio(cachedPreviewUrl, previewToken)
      return
    }

    setIsPreparingVoicePreview(true)
    try {
      const serverAudio = await fetchServerTtsAudio({
        text: previewText,
        voiceId: selectedVoiceName,
      })
      if (serverAudio && previewToken === previewTokenRef.current) {
        const cachedUrl = URL.createObjectURL(serverAudio)
        voicePreviewCacheRef.current.set(selectedVoiceName, cachedUrl)
        await playPreviewAudio(cachedUrl, previewToken)
        return
      }
    } catch {
      // Fall back to browser speech synthesis.
    }

    if (previewToken !== previewTokenRef.current) {
      return
    }

    if (!synth) {
      setIsPreparingVoicePreview(false)
      alert('Voice preview is not available in this browser.')
      return
    }

    setIsPreparingVoicePreview(false)
    synth.cancel()
    const utterance = new SpeechSynthesisUtterance(previewText)
    const selectedVoice = selectSpeechVoice(synth.getVoices(), selectedVoiceName)
    if (selectedVoice) {
      utterance.voice = selectedVoice
      utterance.lang = selectedVoice.lang
    } else {
      utterance.lang = 'en-US'
    }
    utterance.rate = 1
    utterance.pitch = 1
    utterance.volume = 1
    utterance.onstart = () => {
      if (previewToken !== previewTokenRef.current) {
        synth.cancel()
        return
      }
      setIsPreviewingVoice(true)
    }
    utterance.onend = () => setIsPreviewingVoice(false)
    utterance.onerror = () => setIsPreviewingVoice(false)
    synth.speak(utterance)
  }

  const isPenguin = penguin && playerName && penguin.toLowerCase() === playerName.toLowerCase()
  const playerStatus = playerName ? pitchStatuses[playerName] : undefined
  const isLocked = playerStatus === 'ready'
  const mascotBadgeStyle: CSSProperties = {
    width: '30px',
    height: '30px',
    borderRadius: '999px',
    backgroundColor: 'rgba(59, 42, 21, 0.08)',
    border: '1px solid rgba(59, 42, 21, 0.12)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  }
  const allReady = Object.entries(pitchStatuses)
    .filter(([name]) => name !== penguin)
    .every(([, status]) => status === 'ready')

  useEffect(() => {
    if (isPenguin || isLocked || autoSubmitted) {
      return
    }
    if (secondsLeft !== null && secondsLeft <= 0) {
      setAutoSubmitted(true)
      void handleStatus('ready')
    }
  }, [secondsLeft, isPenguin, isLocked, autoSubmitted])

  useEffect(() => {
    Object.entries(pitchStatuses)
      .filter(([name]) => name !== penguin)
      .forEach(([name, status]) => {
        const trigger = mascotAnimationRefs.current[name]
        if (!trigger) return
        const previous = previousStatusesRef.current[name]
        if (previous === status) return
        if (status === 'ready') {
          trigger('win')
        } else {
          trigger('pitch')
        }
      })
    previousStatusesRef.current = pitchStatuses
  }, [pitchStatuses, penguin])

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return
    }
    const synth = window.speechSynthesis
    const warmVoices = () => {
      synth.getVoices()
    }
    warmVoices()
    synth.addEventListener('voiceschanged', warmVoices)
    return () => {
      synth.removeEventListener('voiceschanged', warmVoices)
      stopVoicePreview()
      voicePreviewCacheRef.current.forEach((url) => URL.revokeObjectURL(url))
      voicePreviewCacheRef.current.clear()
    }
  }, [])

  const canvasBg = '#fffaf1'

  const setupCanvas = () => {
    const canvas = canvasRef.current
    const wrap = canvasWrapRef.current
    if (!canvas || !wrap) return
    const rect = wrap.getBoundingClientRect()
    const width = Math.max(260, Math.floor(rect.width))
    const height = 260
    const scale = window.devicePixelRatio || 1
    canvas.width = width * scale
    canvas.height = height * scale
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    ctx.fillStyle = canvasBg
    ctx.fillRect(0, 0, width, height)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }

  useEffect(() => {
    setupCanvas()
    const handleResize = () => setupCanvas()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const getCanvasPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
  }

  const startDraw = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    isDrawingRef.current = true
    canvas.setPointerCapture(event.pointerId)
    const { x, y } = getCanvasPoint(event)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  const draw = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const { x, y } = getCanvasPoint(event)
    ctx.strokeStyle = isEraser ? canvasBg : brushColor
    ctx.lineWidth = brushSize
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const endDraw = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (canvas) {
      canvas.releasePointerCapture(event.pointerId)
    }
    isDrawingRef.current = false
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = canvasBg
    ctx.fillRect(0, 0, width, height)
  }

  const getSketchData = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return null
    const { width, height } = canvas
    if (width === 0 || height === 0) return null
    const pixels = ctx.getImageData(0, 0, width, height).data
    let hasInk = false
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i]
      const g = pixels[i + 1]
      const b = pixels[i + 2]
      const a = pixels[i + 3]
      if (a !== 0 && (r !== backgroundColor.r || g !== backgroundColor.g || b !== backgroundColor.b)) {
        hasInk = true
        break
      }
    }
    if (!hasInk) return null
    return canvas.toDataURL('image/png')
  }

  return (
    <>
      <section className="page-header">
        <div>
          <div className="eyebrow">Pitch Lab</div>
          <LeaderboardModal roomCode={roomCode} inline />
          <h1>{isPenguin ? 'Monitor Pitches' : 'Write Your Pitch'}</h1>
          <p>
            {isPenguin
              ? 'Track player readiness and monitor the round timing.'
              : 'Build your idea and choose a voice personality.'}
          </p>
        </div>
        <div className="panel">
          <h3>{isPenguin ? 'Reveals In' : 'Time Left'}</h3>
          <div className="timer">
            {secondsLeft !== null
              ? `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`
              : '--:--'}
          </div>
          {secondsLeft !== null && secondsLeft <= 15 && (
            <p style={{ marginTop: '8px', color: '#d4a574' }}>⏰ Time running out</p>
          )}
          <p style={{ marginTop: '8px' }}>
            {usedAIGeneration && '🤖 Using AI Generation'}
          </p>
        </div>
      </section>

      <section className="split">
        <div className="panel">
          <h3>The 💡 PROBLEM</h3>
          <div className="card">
            <strong>"{selectedAsk ?? 'Waiting for 💡 PROBLEM...'}"</strong>
            <span>Answer this problem with your pitch.</span>
          </div>
        </div>
        <div className="panel">
          <h3>Player Status</h3>
          <ul className="list">
            {Object.entries(pitchStatuses)
              .filter(([name]) => name !== penguin)
              .map(([name, status]) => (
                <li
                  key={name}
                  style={{
                    color: status === 'ready' ? '#2d7c2d' : '#666',
                    fontWeight: status === 'ready' ? 'bold' : 'normal',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {playerMascots[name] && (
                    <span style={mascotBadgeStyle} className="phase-mascot-wrap phase-mascot-wrap--pitch">
                      <AnimatedMascot
                        src={getMascotImage(playerMascots[name]) ?? ''}
                        alt={playerMascots[name]}
                        character={playerMascots[name]}
                        width="24px"
                        height="24px"
                        className="phase-mascot"
                        setAnimationTrigger={(trigger) => {
                          mascotAnimationRefs.current[name] = trigger
                        }}
                      />
                    </span>
                  )}
                  <span>
                    {name}: {status === 'ready' ? '✓ Ready' : 'Drafting...'}
                  </span>
                </li>
              ))}
          </ul>
          {allReady && isPenguin && (
            <p style={{ marginTop: '12px', color: '#2d7c2d' }}>
              ✓ All players ready. Can advance to reveal phase.
            </p>
          )}
        </div>
      </section>

      {!isPenguin && (
        <section className="split">
          <div className="panel">
            <h3>Your Pitch</h3>
            <input
              className="input"
              placeholder="Pitch title (e.g., 'TimeFlow')"
              value={pitchTitle}
              onChange={(event) => setPitchTitle(event.target.value)}
              disabled={isLocked}
              style={{ marginBottom: '10px' }}
            />
            <textarea
              className="input textarea"
              placeholder="Sell the dream. Highlight the 🧩 CONSTRAINTS and your solution."
              value={pitchText}
              onChange={(event) => setPitchText(event.target.value)}
              disabled={isLocked}
            />
            {surprise && (
              <div className="card" style={{ marginTop: '12px', backgroundColor: '#d4a574' }}>
                <strong>⭐ TWIST</strong>
                <span>{surprise}</span>
              </div>
            )}
            <div style={{ marginTop: '14px' }}>
              <strong>Select 🧩 CONSTRAINTS (use at least 1 of 4)</strong>
              <ul className="list" style={{ marginTop: '8px' }}>
                {mustHaves.map((card) => (
                  <li key={card}>
                    <label style={{ display: 'flex', alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={selectedMustHaves.includes(card)}
                        onChange={(event) => {
                          const next = event.target.checked
                            ? [...selectedMustHaves, card]
                            : selectedMustHaves.filter((item) => item !== card)
                          setSelectedMustHaves(next)
                          if (next.length > 0) {
                            setAiWarning('')
                          }
                        }}
                        disabled={isLocked}
                        style={{ marginRight: '8px' }}
                      />
                      {card}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
            <div className="footer-actions" style={{ marginTop: '16px' }}>
              <button
                className="button primary-cta"
                onClick={() => handleStatus('ready')}
                disabled={isLocked}
              >
                Mark Ready
              </button>
            </div>
            {readyError && (
              <p style={{ marginTop: '10px', color: '#8c2d2a' }}>{readyError}</p>
            )}
            {isLocked && (
              <p style={{ marginTop: '10px', color: '#2d7c2d' }}>
                ✓ Submission locked. Waiting on the round to finish.
              </p>
            )}
          </div>
          <div className="panel">
            <h3>Voice Personality</h3>
            <select
              className="input"
              disabled={!robotVoiceEnabled}
              value={voice}
              onChange={(event) => setVoice(event.target.value)}
              style={{ marginBottom: '12px' }}
            >
              {voiceOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
            <div className="footer-actions" style={{ marginBottom: '12px' }}>
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  void handlePreviewVoice()
                }}
                disabled={!robotVoiceEnabled}
              >
                {isPreparingVoicePreview
                  ? 'Loading Preview...'
                  : isPreviewingVoice
                    ? 'Stop Voice Preview'
                    : 'Preview Voice'}
              </button>
            </div>
            <div className="card">
              <strong>💡 Pro Tip</strong>
              <span>Short punchy sentences sound better read aloud by robots.</span>
            </div>
            {!robotVoiceEnabled && (
              <div className="card" style={{ marginTop: '12px' }}>
                <strong>Voice disabled</strong>
                <span>Host has disabled robot voice. Type your pitch anyway!</span>
              </div>
            )}
          </div>
        </section>
      )}

      {!isPenguin && (
        <section className="panel">
          <h3>AI Pitch Generator</h3>
          <p>
            Running out of time? Use 🤖 AI to generate a quick pitch that matches the 💡 PROBLEM and your 🧩 CONSTRAINTS. 
            <strong> Cost: $50</strong>. Note: Other players can challenge AI-generated pitches. 
            If challenged correctly, you lose $100.
          </p>
          <p style={{ marginTop: '8px', fontSize: '0.95rem', color: '#666' }}>
            Your balance: <strong>${((playerScores[playerName] ?? 0) * 100).toFixed(0)}</strong>
          </p>
          {generatedPitch && (
            <div className="card" style={{ marginTop: '12px', borderLeft: '4px solid #d4a574' }}>
              <strong>Generated Pitch:</strong>
              <span>"{generatedPitch}"</span>
              <div className="footer-actions" style={{ marginTop: '12px' }}>
                <button className="button primary-cta" onClick={handleUseGeneratedPitch} disabled={isLocked}>
                  Call the AI Assistant
                </button>
              </div>
            </div>
          )}
          {!generatedPitch && (
            <div className="footer-actions" style={{ marginTop: '12px' }}>
              <button
                className="button primary-cta"
                onClick={handleGeneratePitch}
                disabled={
                  generating ||
                  aiAttempted ||
                  usedAIGeneration ||
                  isLocked
                }
              >
                {generating
                  ? 'Generating...'
                  : aiAttempted || usedAIGeneration
                    ? 'AI Pitch Used'
                    : 'Generate AI Pitch ($50)'}
              </button>
            </div>
          )}
          {aiWarning && (
            <p style={{ marginTop: '10px', color: '#8c2d2a' }}>{aiWarning}</p>
          )}
        </section>
      )}

      {!isPenguin && (
        <section className="panel">
          <h3>Sketch Pad</h3>
          <p style={{ marginTop: '6px', fontSize: '0.9rem', color: '#666' }}>
            Doodle a logo or diagram to sell your idea.
          </p>
          <div className="footer-actions" style={{ marginTop: '12px' }}>
            {colorOptions.map((color) => (
              <button
                key={color}
                type="button"
                className="button secondary"
                onClick={() => {
                  setBrushColor(color)
                  setIsEraser(false)
                }}
                style={{
                  padding: '6px 10px',
                  borderRadius: '999px',
                  background: color,
                  border: brushColor === color && !isEraser ? '2px solid #3b2a15' : '1px solid rgba(70, 60, 50, 0.2)',
                  boxShadow: 'none',
                  color: 'transparent',
                  minWidth: '28px',
                }}
                aria-label={`Select color ${color}`}
              >
                ■
              </button>
            ))}
            <button
              type="button"
              className={`button secondary${isEraser ? '' : ''}`}
              onClick={() => setIsEraser((prev) => !prev)}
              style={{ padding: '6px 12px' }}
            >
              {isEraser ? 'Eraser On' : 'Eraser'}
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={clearCanvas}
              style={{ padding: '6px 12px' }}
            >
              Clear
            </button>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.85rem', color: '#6b6056' }}>Brush</span>
              <input
                type="range"
                min={2}
                max={18}
                value={brushSize}
                onChange={(event) => setBrushSize(Number(event.target.value))}
              />
            </label>
          </div>
          <div ref={canvasWrapRef} style={{ marginTop: '12px' }}>
            <canvas
              ref={canvasRef}
              onPointerDown={startDraw}
              onPointerMove={draw}
              onPointerUp={endDraw}
              onPointerLeave={endDraw}
              style={{
                borderRadius: '16px',
                border: '1px dashed rgba(70, 60, 50, 0.35)',
                background: '#fffaf1',
                width: '100%',
                height: '260px',
                touchAction: 'none',
              }}
            />
          </div>
        </section>
      )}
    </>
  )
}
