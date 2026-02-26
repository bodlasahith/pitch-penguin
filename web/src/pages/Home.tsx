import { CSSProperties, PointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { playActionSound } from '../utils/soundEffects'
import GameFlowInfographic from '../components/GameFlowInfographic'
import { apiFetch } from '../utils/api'
import {
  buildNarrationText,
  KOKORO_MODEL_VOICES,
  normalizeKokoroVoiceName,
  QWEN3_TTS_VOICES,
  selectSpeechVoice,
} from '../utils/voiceProfiles'
import { fetchServerTtsAudio } from '../utils/ttsApi'

type CreateRoomResponse = {
  ok: boolean
  room?: {
    code: string
  }
  message?: string
}

const BROWSER_SPEECH_OPTION = '__browser_speech__'

export default function Home() {
  const navigate = useNavigate()
  const [roomStatus, setRoomStatus] = useState<'idle' | 'loading' | 'error'>(
    'idle'
  )
  const [hostName, setHostName] = useState('')
  const [roomError, setRoomError] = useState('')
  const kokoroVoiceOptions = useMemo(() => [...KOKORO_MODEL_VOICES], [])
  const qwenVoiceOptions = useMemo(() => [...QWEN3_TTS_VOICES], [])
  const [voice, setVoice] = useState<string>(kokoroVoiceOptions[0] ?? 'Heart')
  const [isPreparingVoicePreview, setIsPreparingVoicePreview] = useState(false)
  const [isPreviewingVoice, setIsPreviewingVoice] = useState(false)
  const [ttsRateLimitMessage, setTtsRateLimitMessage] = useState('')
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)
  const previewTokenRef = useRef(0)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const canvasWrapRef = useRef<HTMLDivElement | null>(null)
  const isDrawingRef = useRef(false)
  const [brushColor, setBrushColor] = useState('#2e2a27')
  const [brushSize, setBrushSize] = useState(6)
  const [isEraser, setIsEraser] = useState(false)
  const voicePreviewText = useMemo(
    () =>
      buildNarrationText(
        "Robot voice test:",
        "Entrepreneurs, this is your startup voice check. Big idea. Big energy! This is the idea of a lifetime!! Are you ready to pitch? Let's go!",
      ),
    [],
  )
  const canvasBg = '#fffaf1'
  const colorOptions = ['#2e2a27', '#d24b4b', '#3e7c3e', '#2d6cdf', '#f5b544', '#7c4bd2']
  const backgroundColor = { r: 255, g: 250, b: 241 }

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

  const setupCanvas = () => {
    const canvas = canvasRef.current
    const wrap = canvasWrapRef.current
    if (!canvas || !wrap) return
    const rect = wrap.getBoundingClientRect()
    const width = Math.max(10, Math.floor(rect.width - 2)) // Account for border
    const height = Math.min(260, width) // Keep it reasonably sized
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

  const playPreviewAudio = async (audioBlob: Blob, token: number) => {
    const audioUrl = URL.createObjectURL(audioBlob)
    const audio = new Audio(audioUrl)
    previewAudioRef.current = audio
    setIsPreparingVoicePreview(false)
    setIsPreviewingVoice(true)
    audio.onended = () => {
      if (token === previewTokenRef.current) {
        setIsPreviewingVoice(false)
      }
      previewAudioRef.current = null
      URL.revokeObjectURL(audioUrl)
    }
    audio.onerror = () => {
      if (token === previewTokenRef.current) {
        setIsPreviewingVoice(false)
      }
      previewAudioRef.current = null
      URL.revokeObjectURL(audioUrl)
    }
    await audio.play()
  }

  const handlePreviewVoice = async () => {
    setTtsRateLimitMessage('')
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
    const useBrowserSpeech = voice === BROWSER_SPEECH_OPTION
    const selectedVoiceName = normalizeKokoroVoiceName(voice)
    if (!useBrowserSpeech) {
      setIsPreparingVoicePreview(true)
      try {
        const serverAudio = await fetchServerTtsAudio({
          text: voicePreviewText,
          voiceId: selectedVoiceName,
        })
        if (serverAudio && previewToken === previewTokenRef.current) {
          console.info('[TTS] Playing server audio preview', {
            source: 'deapi',
            voice: selectedVoiceName,
            mode: 'home-tester',
          })
          await playPreviewAudio(serverAudio, previewToken)
          return
        } else if (!serverAudio && previewToken === previewTokenRef.current) {
          // TTS failed (likely rate limited) - show message and fall back to browser speech
          setTtsRateLimitMessage('Server TTS temporarily unavailable. Using browser speech instead.')
          console.info('[TTS] Server audio unavailable; falling back to Web Speech API', {
            mode: 'home-tester',
            voice: selectedVoiceName,
          })
        }
      } catch {
        console.info('[TTS] Server preview failed; falling back to Web Speech API', {
          mode: 'home-tester',
          voice: selectedVoiceName,
        })
      }
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
    const utterance = new SpeechSynthesisUtterance(voicePreviewText)
    if (!useBrowserSpeech) {
      const selectedVoice = selectSpeechVoice(synth.getVoices(), selectedVoiceName)
      if (selectedVoice) {
        utterance.voice = selectedVoice
        utterance.lang = selectedVoice.lang
      } else {
        utterance.lang = 'en-US'
      }
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
      console.info('[TTS] Playing browser speech preview', {
        source: 'web-speech',
        mode: 'home-tester',
        voice: useBrowserSpeech ? 'system-default' : selectedVoiceName,
      })
      setIsPreviewingVoice(true)
    }
    utterance.onend = () => setIsPreviewingVoice(false)
    utterance.onerror = () => setIsPreviewingVoice(false)
    synth.speak(utterance)
  }

  useEffect(() => {
    setupCanvas()
    const handleResize = () => setupCanvas()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

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
    }
  }, [])

  const handleCreateRoom = async () => {
    try {
      const trimmedName = hostName.trim()
      if (!trimmedName) {
        setRoomError('Enter a host name to continue.')
        return
      }
      setRoomStatus('loading')
      setRoomError('')
      const response = await apiFetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostName: trimmedName })
      })
      const data = (await response.json()) as CreateRoomResponse
      if (!data.ok || !data.room) {
        setRoomStatus('error')
        setRoomError(data.message ?? 'Could not create a room.')
        return
      }
      localStorage.setItem(`pp:player:${data.room.code}`, trimmedName)
      localStorage.setItem('pp:lastRoom', data.room.code)
      localStorage.setItem('pp:lastName', trimmedName)
      playActionSound('join_lobby')
      navigate(`/lobby/${data.room.code}`)
    } catch (err) {
      setRoomStatus('error')
      setRoomError('Could not create a room.')
    }
  }

  return (
    <>
      <section className="page-header">
        <div>
          <div className="eyebrow">Kickoff</div>
          <h1>Bring the pitch night online.</h1>
          <p className="home-hero-hook">Turn wild ideas into competitive chaos.</p>
          <p>
            Every round drops a <strong>💡 PROBLEM</strong>, weird
            <strong> 🧩 CONSTRAINTS</strong>, and a surprise <strong>⭐ TWIST</strong>.
            <br></br>Penguins may invest in ideas based on creativity, effort, entertainment, or just pure chaos.
            <br></br>Pitch, vote, and invest until one founder waddles away rich.
          </p>
        </div>
      </section>

      <section className="grid home-top-grid">
        <div className="panel home-start-panel">
          <h3>Start a room</h3>
          <p>Create a lobby, invite friends, choose local or online play.</p>
          <label htmlFor="host-name" style={{ marginTop: '12px', display: 'block' }}>
            <strong>Host name (room creator)</strong>
          </label>
          <input
            id="host-name"
            className="input"
            placeholder="Your name"
            value={hostName}
            onChange={(event) => setHostName(event.target.value)}
            style={{ marginTop: '10px' }}
          />
          <div className="footer-actions cta-stack" style={{ marginTop: '16px' }}>
            <button
              className="button primary-cta"
              onClick={handleCreateRoom}
              disabled={roomStatus === 'loading'}
            >
              Create new room
            </button>
            <button
              className="button secondary"
              onClick={() => navigate('/join')}
            >
              Join existing room
            </button>
          </div>
          <p style={{ marginTop: '10px', fontSize: '0.86rem' }}>
            Joining a friend&apos;s room? Use the Join page with their room code.
          </p>
          {(roomStatus === 'error' || roomError) && (
            <p style={{ marginTop: '12px', color: '#8c2d2a' }}>
              {roomError || 'Could not create a room. Try again.'}
            </p>
          )}
        </div>
        <div className="panel home-flow-panel">
          <h3>How it works</h3>
          <p>From deal to voting in four quick phases.</p>
          <div className="home-flow-wrap">
            <GameFlowInfographic />
          </div>
        </div>
      </section>
      <section className="panel">
        <h3>Pitching features</h3>
        <div className="feature-grid">
          <div className="feature-card">
            <div className="feature-tag">Visual board</div>
            <p>Add a doodle or logo sketch to create a fun visual of the your solution. Make sure to <span className="kiss-tooltip-wrapper"><strong>KiSS</strong><span className="kiss-tooltip">Keep it simple, stupid!</span></span> so your idea lands fast!</p>
            <div ref={canvasWrapRef} style={{ marginTop: '12px', width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
              <canvas
                ref={canvasRef}
                style={{ border: '1px solid #ccc', borderRadius: '4px', display: 'block', cursor: 'crosshair' }}
                onPointerDown={startDraw}
                onPointerMove={draw}
                onPointerUp={endDraw}
                onPointerLeave={endDraw}
              />
            </div>
            <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '4px' }}>
                {colorOptions.map((color) => (
                  <button
                    key={color}
                    onClick={() => { setBrushColor(color); setIsEraser(false) }}
                    style={{
                      width: '24px',
                      height: '24px',
                      backgroundColor: color,
                      border: brushColor === color && !isEraser ? '2px solid #333' : '1px solid #ccc',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      padding: 0
                    }}
                  />
                ))}
              </div>
              <select
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                style={{ fontSize: '0.9rem', padding: '4px' }}
              >
                <option value="3">Thin</option>
                <option value="6">Normal</option>
                <option value="12">Thick</option>
              </select>
              <button
                onClick={() => setIsEraser(!isEraser)}
                style={{
                  padding: '4px 8px',
                  backgroundColor: isEraser ? '#eee' : 'transparent',
                  border: isEraser ? '1px solid #999' : '1px solid #ccc',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.9rem'
                }}
              >
                Eraser
              </button>
              <button
                onClick={clearCanvas}
                style={{
                  padding: '4px 8px',
                  backgroundColor: 'transparent',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.9rem'
                }}
              >
                Clear
              </button>
            </div>
          </div>
          <div className="feature-card">
            <div className="feature-tag">Robot reader</div>
            <p>Every pitch gets a robot voice. Choose announcers and crisp startup narrators, if you don't want to do the honors yourself.</p>
            <label htmlFor="home-voice-select" style={{ display: 'block', marginTop: '12px', marginBottom: '6px' }}>
              <strong>Voice</strong>
            </label>
            <select
              id="home-voice-select"
              className="input"
              value={voice}
              onChange={(event) => setVoice(event.target.value)}
              style={{ marginBottom: '12px' }}
            >
              <optgroup label="deAPI · Kokoro">
                {kokoroVoiceOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </optgroup>
              <optgroup label="deAPI · Qwen3-TTS">
                {qwenVoiceOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Browser Speech">
                <option value={BROWSER_SPEECH_OPTION}>System default (Web Speech API)</option>
              </optgroup>
            </select>
            {ttsRateLimitMessage && (
              <p style={{ marginTop: '12px', marginBottom: '12px', fontSize: '0.9rem', color: '#ff8c00' }}>
                ⚠️ {ttsRateLimitMessage}
              </p>
            )}
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                void handlePreviewVoice()
              }}
              style={{ width: '100%' }}
            >
              {isPreparingVoicePreview
                ? 'Loading Preview...'
                : isPreviewingVoice
                  ? 'Stop'
                  : 'Play Voice'}
            </button>
          </div>
          <div className="feature-card">
            <div className="feature-tag">AI backup</div>
            <p>If you can't come up with a pitch in time, the AI Assistant has your back. <strong>But beware -</strong> if your opponents correctly guess that your pitch was AI-generated, you could be disqualified and lose money. Use it wisely!</p>
            <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '4px', fontSize: '0.9rem' }}>
              <p style={{ marginTop: 0, marginBottom: '8px' }}><strong>Example:</strong></p>
              <p style={{ marginBottom: '8px' }}><strong>Problem:</strong> Remote teams struggle with communication.</p>
              <p style={{ marginBottom: '8px' }}><strong>Constraints:</strong> Must use emojis, within 100 words</p>
              <p style={{ marginBottom: '8px' }}><strong>Twist:</strong> Must make it about banana farming</p>
              <div style={{ marginTop: '10px', padding: '8px', backgroundColor: '#fff', borderRadius: '3px', fontStyle: 'italic' }}>
                "🍌 BananaConnect: connecting remote farm teams through emoji-powered communication. 📞 When pickers in different fields need to coordinate harvests, they use our visual language. ✂️ Cut emoji = ready to harvest. 🚚 Truck emoji = delivery incoming. 🍌💬 No language barriers, no confusion. Banana farming just got smarter. 🌍"
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
