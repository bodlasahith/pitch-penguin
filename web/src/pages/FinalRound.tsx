import type { CSSProperties, PointerEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getMascotImage } from '../utils/mascots'
import { AnimatedMascot } from '../components/AnimatedMascot'
import LeaderboardModal from '../components/LeaderboardModal'
import { playActionSound, playPhaseSound } from '../utils/soundEffects'
import { buildNarrationText, KOKORO_VOICES, normalizeKokoroVoiceName, selectSpeechVoice } from '../utils/voiceProfiles'
import { fetchServerTtsAudio } from '../utils/ttsApi'

type GameResponse = {
  ok: boolean
  room?: {
    phase: string
    walrus: string
    selectedAsk: string | null
    pitchTimerSeconds: number
    pitchEndsAt?: number | null
    finalRoundPlayers: string[]
    finalRoundRankings: Record<string, string[]>
    judgeViewedPitches?: Record<string, string[]>
    gameWinner: string | null
    gameWinners: string[]
    playerScores: Record<string, number>
  }
  mustHavesByPlayer?: Record<string, string[]>
  surpriseByPlayer?: Record<string, string | null>
  pitchStatusByPlayer?: Record<string, string>
  players?: Array<{ name: string; isHost: boolean; mascot?: string }>
}

type Pitch = {
  id: string
  player: string
  title: string
  summary: string
  voice?: string
  sketchData?: string | null
  usedMustHaves?: string[]
}

export default function FinalRound() {
  useEffect(() => {
    playPhaseSound('final-round')
  }, [])

  const { code } = useParams()
  const navigate = useNavigate()
  
  // Shared state
  const [phase, setPhase] = useState<'pitching' | 'ranking'>('pitching')
  const [finalRoundPlayers, setFinalRoundPlayers] = useState<string[]>([])
  const [isPitcher, setIsPitcher] = useState(false)
  const [selectedAsk, setSelectedAsk] = useState<string | null>(null)
  
  // Pitcher state
  const [mustHaves, setMustHaves] = useState<string[]>([])
  const [surprise, setSurprise] = useState<string | null>(null)
  const [pitchTitle, setPitchTitle] = useState('')
  const [pitchText, setPitchText] = useState('')
  const voiceOptions = useMemo(() => [...KOKORO_VOICES], [])
  const [voice, setVoice] = useState<string>(voiceOptions[0] ?? 'Heart')
  const [selectedMustHaves, setSelectedMustHaves] = useState<string[]>([])
  const [pitchEndsAt, setPitchEndsAt] = useState<number | null>(null)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [pitchStatuses, setPitchStatuses] = useState<Record<string, string>>({})
  const [isLocked, setIsLocked] = useState(false)
  const [readyError, setReadyError] = useState('')
  const [proposingTruce, setProposingTruce] = useState(false)
  const [playerMascots, setPlayerMascots] = useState<Record<string, string>>({})
  
  // Judge state
  const [pitches, setPitches] = useState<Pitch[]>([])
  const [rankedPitchIds, setRankedPitchIds] = useState<string[]>([])
  const [submitted, setSubmitted] = useState(false)
  const [viewedPitches, setViewedPitches] = useState<Set<string>>(new Set())
  const [submitError, setSubmitError] = useState<'viewed' | 'incomplete' | null>(null)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [speakingPitchId, setSpeakingPitchId] = useState<string | null>(null)
  const [loadingPitchId, setLoadingPitchId] = useState<string | null>(null)
  
  // Canvas state
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const canvasWrapRef = useRef<HTMLDivElement | null>(null)
  const isDrawingRef = useRef(false)
  const hasStartedTransitionRef = useRef(false)
  const finalRoundReadyRef = useRef(false)
  const activeAudioRef = useRef<HTMLAudioElement | null>(null)
  const activeAudioUrlRef = useRef<string | null>(null)
  const narrationTokenRef = useRef(0)
  const [brushColor, setBrushColor] = useState('#2e2a27')
  const [brushSize, setBrushSize] = useState(6)
  const [isEraser, setIsEraser] = useState(false)

  const roomCode = code ?? localStorage.getItem('bw:lastRoom') ?? ''
  const playerName = roomCode ? localStorage.getItem(`bw:player:${roomCode}`) ?? '' : ''
  const colorOptions = ['#2e2a27', '#d24b4b', '#3e7c3e', '#2d6cdf', '#f5b544', '#7c4bd2']
  const backgroundColor = { r: 255, g: 250, b: 241 }
  const canvasBg = '#fffaf1'

  const getSketchData = useCallback(() => {
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
  }, [backgroundColor.r, backgroundColor.g, backgroundColor.b])

  const stopNarration = useCallback(() => {
    narrationTokenRef.current += 1
    if (activeAudioRef.current) {
      activeAudioRef.current.pause()
      activeAudioRef.current.src = ''
      activeAudioRef.current = null
    }
    if (activeAudioUrlRef.current) {
      URL.revokeObjectURL(activeAudioUrlRef.current)
      activeAudioUrlRef.current = null
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    setLoadingPitchId(null)
    setSpeakingPitchId(null)
  }, [])

  const playBlobNarration = useCallback(async (pitchId: string, audioBlob: Blob, token: number) => {
    const audioUrl = URL.createObjectURL(audioBlob)
    const audio = new Audio(audioUrl)
    activeAudioRef.current = audio
    activeAudioUrlRef.current = audioUrl
    setSpeakingPitchId(pitchId)
    setLoadingPitchId(null)
    audio.onended = () => {
      if (token === narrationTokenRef.current) {
        setSpeakingPitchId(null)
      }
      if (activeAudioUrlRef.current) {
        URL.revokeObjectURL(activeAudioUrlRef.current)
        activeAudioUrlRef.current = null
      }
      activeAudioRef.current = null
    }
    audio.onerror = () => {
      if (token === narrationTokenRef.current) {
        setSpeakingPitchId(null)
      }
      if (activeAudioUrlRef.current) {
        URL.revokeObjectURL(activeAudioUrlRef.current)
        activeAudioUrlRef.current = null
      }
      activeAudioRef.current = null
    }
    await audio.play()
  }, [])

  const speakPitch = useCallback(async (pitch: Pitch | null) => {
    if (!pitch) {
      return
    }

    const synth =
      typeof window !== 'undefined' && 'speechSynthesis' in window
        ? window.speechSynthesis
        : null
    if (speakingPitchId === pitch.id || loadingPitchId === pitch.id) {
      stopNarration()
      return
    }

    stopNarration()
    const narrationToken = narrationTokenRef.current
    const selectedVoiceName = normalizeKokoroVoiceName(pitch.voice)
    const narrationText = buildNarrationText(pitch.title, pitch.summary)
    setLoadingPitchId(pitch.id)

    try {
      const serverAudio = await fetchServerTtsAudio({
        text: narrationText,
        voiceId: selectedVoiceName,
      })
      if (serverAudio && narrationToken === narrationTokenRef.current) {
        await playBlobNarration(pitch.id, serverAudio, narrationToken)
        return
      }
    } catch {
      // Fall back to browser speech synthesis.
    }

    if (narrationToken !== narrationTokenRef.current) {
      return
    }

    if (!synth) {
      setLoadingPitchId(null)
      alert('Voice playback is not available in this browser.')
      return
    }

    synth.cancel()
    const utterance = new SpeechSynthesisUtterance(narrationText)
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
      if (narrationToken !== narrationTokenRef.current) {
        synth.cancel()
        return
      }
      setLoadingPitchId(null)
      setSpeakingPitchId(pitch.id)
    }
    utterance.onend = () => setSpeakingPitchId((activeId) => (activeId === pitch.id ? null : activeId))
    utterance.onerror = () => {
      setLoadingPitchId(null)
      setSpeakingPitchId((activeId) => (activeId === pitch.id ? null : activeId))
    }
    synth.speak(utterance)
  }, [loadingPitchId, playBlobNarration, speakingPitchId, stopNarration])

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
      stopNarration()
    }
  }, [stopNarration])

  const load = useCallback(async () => {
    if (!roomCode) return

    try {
      const [gameResponse, pitchesResponse] = await Promise.all([
        fetch(`/api/room/${roomCode}/game`),
        fetch(`/api/room/${roomCode}/pitches`)
      ])

      if (!gameResponse.ok) {
        console.error('Failed to load game state:', gameResponse.status)
        return
      }

      const gameData = (await gameResponse.json()) as GameResponse
      if (gameData.ok && gameData.room) {
        // Check for phase changes first - redirect if needed
        if (gameData.room.phase !== 'final-round') {
          if (isTransitioning) {
            setIsTransitioning(false)
          }
          if (gameData.room.phase === 'results' || gameData.room.gameWinner) {
            navigate(`/results/${roomCode}`, { replace: true })
            return
          } else if (gameData.room.phase === 'deal') {
            navigate(`/deal/${roomCode}`, { replace: true })
            return
          } else if (gameData.room.phase === 'pitch') {
            navigate(`/pitch/${roomCode}`, { replace: true })
            return
          }
        }

        setFinalRoundPlayers(gameData.room.finalRoundPlayers ?? [])
        setSelectedAsk(gameData.room.selectedAsk)
        setPitchEndsAt(gameData.room.pitchEndsAt ?? null)
        setPitchStatuses(gameData.pitchStatusByPlayer ?? {})

        if (isTransitioning && phase === 'pitching') {
          setIsTransitioning(false)
        }
        
        // Check if player is a pitcher or judge
        const isPlayerPitcher = gameData.room.finalRoundPlayers.includes(playerName)
        setIsPitcher(isPlayerPitcher)
        
        if (isPlayerPitcher) {
          setMustHaves(gameData.mustHavesByPlayer?.[playerName] ?? [])
          setSurprise(gameData.surpriseByPlayer?.[playerName] ?? null)
          const status = gameData.pitchStatusByPlayer?.[playerName]
          setIsLocked(status === 'ready')
        } else {
          // Judge - load viewed pitches
          if (gameData.room.judgeViewedPitches) {
            const viewedArray = gameData.room.judgeViewedPitches[playerName] ?? []
            setViewedPitches(new Set(viewedArray))
          }
          
          // Check if already voted
          if (gameData.room.finalRoundRankings && gameData.room.finalRoundRankings[playerName]) {
            setSubmitted(true)
            setRankedPitchIds(gameData.room.finalRoundRankings[playerName])
          }
        }
        
        if (gameData.players) {
          const nextMascots: Record<string, string> = {}
          gameData.players.forEach((player) => {
            if (player.mascot) {
              nextMascots[player.name] = player.mascot
            }
          })
          setPlayerMascots(nextMascots)
        }
        
        // Check if phase changed from pitching to ranking
        if (pitchesResponse.ok) {
          const pitchData = (await pitchesResponse.json()) as { ok: boolean; pitches: Pitch[] }
          if (pitchData.ok) {
            const finalRoundPitches = pitchData.pitches.filter((p) =>
              gameData.room?.finalRoundPlayers.includes(p.player)
            )
            setPitches(finalRoundPitches)
            
            // If all pitchers are ready, either transition to ranking (2+ pitches)
            // or wait for backend to send results (0 or 1 valid pitch).
            const allPitchersReady = gameData.room.finalRoundPlayers.every(
              (player) => gameData.pitchStatusByPlayer?.[player] === 'ready'
            )
            if (allPitchersReady) {
              if (finalRoundPitches.length <= 1) {
                // Backend auto-resolves final round with 0/1 valid submissions.
                // Wait for the next poll to redirect to results.
                console.log('Final round auto-resolution in progress...')
              } else if (phase === 'pitching' && !hasStartedTransitionRef.current) {
                // Normal ranking phase - start transition animation (only once)
                hasStartedTransitionRef.current = true
                setIsTransitioning(true)
                setTimeout(() => {
                  setPhase('ranking')
                  setIsTransitioning(false)
                }, 3000)
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error loading final round data:', error)
    }
  }, [roomCode, playerName, navigate, phase])

  useEffect(() => {
    void load()
    // Poll more frequently (every 2 seconds) to catch phase transitions faster
    const interval = window.setInterval(load, 2000)
    return () => window.clearInterval(interval)
  }, [load])

  useEffect(() => {
    setIsTransitioning(false)
    hasStartedTransitionRef.current = false
    finalRoundReadyRef.current = false
  }, [])

  // Reset transition ref when phase changes back to pitching
  useEffect(() => {
    if (phase === 'pitching') {
      hasStartedTransitionRef.current = false
    }
  }, [phase])

  // Signal to backend after transition overlay is gone
  useEffect(() => {
    const signalReady = async () => {
      if (!roomCode || !playerName) return
      if (phase !== 'pitching' || isTransitioning) return
      if (finalRoundReadyRef.current) return

      try {
        const response = await fetch(`/api/room/${roomCode}/player-ready`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerName })
        })
        if (response.ok) {
          finalRoundReadyRef.current = true
        }
      } catch (err) {
        console.error('Error signaling player ready:', err)
      }
    }

    void signalReady()
  }, [roomCode, playerName, phase, isTransitioning])

  // Timer countdown - only starts when not transitioning
  useEffect(() => {
    if (isTransitioning || !pitchEndsAt) {
      return
    }
    
    const timerId = window.setInterval(() => {
      if (!pitchEndsAt) {
        setSecondsLeft(null)
        return
      }
      const remaining = Math.max(0, Math.ceil((pitchEndsAt - Date.now()) / 1000))
      setSecondsLeft(remaining)
    }, 1000)
    return () => window.clearInterval(timerId)
  }, [pitchEndsAt, isTransitioning])

  const handleSubmitPitch = useCallback(async () => {
    if (!roomCode || !playerName || isLocked) return

    if (selectedMustHaves.length < 2) {
      setReadyError('⚠️ You must select at least 2 out of 3 MUST HAVEs before submitting.')
      return
    }

    if (!pitchTitle.trim() || !pitchText.trim()) {
      setReadyError('⚠️ Add a title and pitch summary before submitting.')
      return
    }

    setReadyError('')
    const sketchData = getSketchData()
    
    await fetch(`/api/room/${roomCode}/pitch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerName,
        title: pitchTitle || 'Untitled',
        summary: pitchText,
        usedMustHaves: selectedMustHaves,
        voice,
        aiGenerated: false,
        sketchData,
        status: 'ready'
      })
    })
    
    playActionSound('submit_pitch')
    setIsLocked(true)
    await load()
  }, [roomCode, playerName, isLocked, selectedMustHaves, pitchTitle, pitchText, getSketchData, load, voice])

  // Auto-submit when timer runs out (only for pitchers)
  useEffect(() => {
    if (!isPitcher || isLocked || secondsLeft === null) return
    if (secondsLeft <= 0) {
      void handleSubmitPitch()
    }
  }, [secondsLeft, isPitcher, isLocked, handleSubmitPitch])

  const handleProposeTruce = async () => {
    if (!roomCode || !playerName) return
    setProposingTruce(true)
    
    // Submit empty pitch to signal truce
    await fetch(`/api/room/${roomCode}/pitch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerName,
        title: '',
        summary: '',
        usedMustHaves: [],
        voice: 'Neon Announcer',
        aiGenerated: false,
        sketchData: null,
        status: 'ready',
        truce: true
      })
    })
    
    playActionSound('submit_pitch')
    setIsLocked(true)
    await load()
  }

  const markPitchViewed = useCallback(async (pitchId: string) => {
    if (isPitcher || viewedPitches.has(pitchId)) return

    try {
      await fetch(`/api/room/${roomCode}/pitch-viewed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pitchId,
          viewer: playerName
        })
      })
      setViewedPitches(prev => new Set([...prev, pitchId]))
    } catch (err) {
      console.error('Error marking pitch viewed:', err)
    }
  }, [isPitcher, viewedPitches, roomCode, playerName])

  const handleSubmitRanking = async () => {
    if (!roomCode || !playerName) {
      console.error('Missing roomCode or playerName')
      alert('Error: Missing room or player information')
      return
    }

    if (isPitcher) {
      console.error('Pitchers cannot submit rankings')
      alert('Error: Only judges can submit rankings')
      return
    }

    // Validate all pitches are ranked
    if (rankedPitchIds.length !== pitches.length) {
      setSubmitError('incomplete')
      return
    }

    // Validate all pitches have been viewed
    const allViewed = pitches.every(p => viewedPitches.has(p.id))
    if (!allViewed) {
      setSubmitError('viewed')
      return
    }
    
    setSubmitError(null)

    try {
      console.log('Submitting ranking:', { playerName, rankedPitchIds })
      const response = await fetch(`/api/room/${roomCode}/tiebreaker-ranking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerName,
          rankedPitchIds
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Ranking submission failed:', response.status, errorText)
        throw new Error(`Server returned ${response.status}: ${errorText}`)
      }

      const data = (await response.json()) as { ok: boolean; allJudgesVoted?: boolean; error?: string }
      if (data.ok) {
        setSubmitted(true)
        
        if (data.allJudgesVoted) {
          // Start transition before navigating
          setIsTransitioning(true)
          setTimeout(() => {
            navigate(`/results/${roomCode}`)
          }, 2500)
        }
      } else {
        console.error('Ranking submission returned ok:false', data)
        alert(`Failed to submit ranking: ${data.error ?? 'Unknown error'}`)
      }
    } catch (err) {
      console.error('Error submitting ranking:', err)
      alert(`Failed to submit ranking: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, pitchId: string) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', pitchId)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetPitchId: string) => {
    e.preventDefault()
    const draggedPitchId = e.dataTransfer.getData('text/plain')
    
    if (draggedPitchId === targetPitchId) return

    const draggedIndex = rankedPitchIds.indexOf(draggedPitchId)
    const targetIndex = rankedPitchIds.indexOf(targetPitchId)

    const newRanking = [...rankedPitchIds]
    newRanking.splice(draggedIndex, 1)
    newRanking.splice(targetIndex, 0, draggedPitchId)
    
    setRankedPitchIds(newRanking)
  }

  // Initialize ranking order when pitches load or phase changes to ranking
  useEffect(() => {
    if (!isPitcher && phase === 'ranking' && pitches.length > 0 && rankedPitchIds.length === 0 && !submitted) {
      console.log('Initializing ranking order for', pitches.length, 'pitches')
      setRankedPitchIds(pitches.map((p) => p.id))
    }
  }, [isPitcher, phase, pitches, rankedPitchIds.length, submitted])

  // Mark pitches as viewed when they appear
  useEffect(() => {
    if (!isPitcher && pitches.length > 0) {
      pitches.forEach(pitch => {
        if (!viewedPitches.has(pitch.id)) {
          void markPitchViewed(pitch.id)
        }
      })
    }
  }, [pitches, isPitcher, viewedPitches, markPitchViewed])

  // Canvas functions
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
    if (isPitcher && phase === 'pitching') {
      setupCanvas()
      const handleResize = () => setupCanvas()
      window.addEventListener('resize', handleResize)
      return () => window.removeEventListener('resize', handleResize)
    }
  }, [isPitcher, phase])

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

  const mascotBadgeStyle: CSSProperties = {
    width: '24px',
    height: '24px',
    borderRadius: '999px',
    backgroundColor: 'rgba(59, 42, 21, 0.08)',
    border: '1px solid rgba(59, 42, 21, 0.12)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  }

  const rankedPitches = rankedPitchIds
    .map((id) => pitches.find((p) => p.id === id))
    .filter((p): p is Pitch => !!p)

  return (
    <>
      <section className="page-header">
        <div>
          <div className="eyebrow">Final Round</div>
          <LeaderboardModal roomCode={roomCode} />
          <h1>🔥 Championship Pitch-Off</h1>
          <p>
            {isPitcher
              ? phase === 'pitching'
                ? `You're in the final round! Make your best pitch while others judge.`
                : 'Your pitch is submitted. Judges are ranking now...'
              : phase === 'pitching'
                ? `Final round players: ${finalRoundPlayers.join(', ')}. Waiting for pitches...`
                : `Rank the pitches from best to worst.`}
          </p>
        </div>
        {isPitcher && phase === 'pitching' && (
          <div className="panel">
            <h3>Time Left</h3>
            <div className="timer">
              {secondsLeft !== null
                ? `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`
                : '--:--'}
            </div>
          </div>
        )}
      </section>

      {/* PITCHING PHASE - FOR PITCHERS */}
      {isPitcher && phase === 'pitching' && (
        <>
          <section className="split">
            <div className="panel">
              <h3>The ASK</h3>
              <div className="card">
                <strong>"{selectedAsk ?? 'Loading...'}"</strong>
                <span>Answer this problem with your pitch.</span>
              </div>
            </div>
            <div className="panel">
              <h3>Player Status</h3>
              <ul className="list">
                {finalRoundPlayers.map((name) => {
                  const status = pitchStatuses[name] ?? 'drafting'
                  return (
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
                        <span style={mascotBadgeStyle}>
                          <AnimatedMascot
                            src={getMascotImage(playerMascots[name]) ?? ''}
                            alt={playerMascots[name]}
                            character={playerMascots[name]}
                            width="18px"
                            height="18px"
                          />
                        </span>
                      )}
                      <span>
                        {name}: {status === 'ready' ? '✓ Ready' : 'Drafting...'}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          </section>

          <section className="split">
            <div className="panel">
              <h3>Your Pitch</h3>
              <input
                className="input"
                placeholder="Pitch title (e.g., 'TimeFlow')"
                value={pitchTitle}
                onChange={(e) => setPitchTitle(e.target.value)}
                disabled={isLocked}
                style={{ marginBottom: '10px' }}
              />
              <textarea
                className="input textarea"
                placeholder="Sell the dream. Highlight at least 2 MUST HAVEs and your solution."
                value={pitchText}
                onChange={(e) => setPitchText(e.target.value)}
                disabled={isLocked}
              />
              <div style={{ marginTop: '10px' }}>
                <label htmlFor="final-round-voice" style={{ display: 'block', marginBottom: '6px' }}>
                  Robot Voice
                </label>
                <select
                  id="final-round-voice"
                  className="input"
                  value={voice}
                  onChange={(e) => setVoice(e.target.value)}
                  disabled={isLocked}
                >
                  {voiceOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              {surprise && (
                <div className="card" style={{ marginTop: '12px', backgroundColor: '#d4a574' }}>
                  <strong>⭐ Final Round Surprise</strong>
                  <span>{surprise}</span>
                </div>
              )}
              <div style={{ marginTop: '14px' }}>
                <strong>Select MUST HAVEs (choose at least 2 of 3)</strong>
                <ul className="list" style={{ marginTop: '8px' }}>
                  {mustHaves.map((card) => (
                    <li key={card}>
                      <label style={{ display: 'flex', alignItems: 'center' }}>
                        <input
                          type="checkbox"
                          checked={selectedMustHaves.includes(card)}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...selectedMustHaves, card]
                              : selectedMustHaves.filter((item) => item !== card)
                            setSelectedMustHaves(next)
                            if (next.length >= 2) {
                              setReadyError('')
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
                <p style={{ marginTop: '8px', fontSize: '0.9rem', color: '#666' }}>
                  Selected: {selectedMustHaves.length} / 3 (minimum 2 required)
                </p>
              </div>
              <div className="footer-actions" style={{ marginTop: '16px' }}>
                <button
                  className="button"
                  onClick={handleSubmitPitch}
                  disabled={isLocked}
                >
                  {isLocked ? '✓ Submitted' : 'Submit Pitch'}
                </button>
                <button
                  className="button secondary"
                  onClick={handleProposeTruce}
                  disabled={proposingTruce}
                >
                  {proposingTruce ? 'Proposing Truce...' : 'Propose Truce'}
                </button>
              </div>
              {readyError && (
                <p style={{ marginTop: '10px', color: '#8c2d2a' }}>{readyError}</p>
              )}
              {isLocked && (
                <p style={{ marginTop: '10px', color: '#2d7c2d' }}>
                  ✓ Pitch submitted. Waiting for others to finish...
                </p>
              )}
            </div>
            <div className="panel">
              <h3>Final Round Rules</h3>
              <div className="card">
                <strong>💡 Final Round</strong>
                <span>
                  • Use at least 2 of your 3 MUST HAVEs<br />
                  • AI generation is disabled<br />
                  • Empty pitches result in disqualification<br />
                  • Truce ends the game immediately
                </span>
              </div>
            </div>
          </section>

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
                className="button secondary"
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
                  onChange={(e) => setBrushSize(Number(e.target.value))}
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
        </>
      )}

      {/* WAITING PHASE - FOR PITCHERS AFTER SUBMISSION */}
      {isPitcher && phase === 'ranking' && (
        <>
          <section className="panel">
            <h3>Your Pitch is In!</h3>
            <p>Judges are ranking the pitches now. Wait for final results...</p>
            <div style={{ marginTop: '16px' }}>
              <h4>Your Submission:</h4>
              {pitches
                .filter((p) => p.player === playerName)
                .map((pitch) => (
                  <div key={pitch.id} className="card" style={{ marginTop: '12px' }}>
                    <strong>{pitch.title}</strong>
                    <span>{pitch.summary}</span>
                    {pitch.sketchData && (
                      <img
                        src={pitch.sketchData}
                        alt="Your sketch"
                        style={{
                          marginTop: '12px',
                          maxWidth: '300px',
                          border: '1px solid #ddd',
                          borderRadius: '4px'
                        }}
                      />
                    )}
                    {pitch.usedMustHaves && pitch.usedMustHaves.length > 0 && (
                      <div style={{ marginTop: '8px' }}>
                        <strong>MUST HAVEs Used:</strong>
                        <ul style={{ margin: '4px 0' }}>
                          {pitch.usedMustHaves.map((mh) => (
                            <li key={mh}>{mh}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </section>

          <section className="panel">
            <h3>Other Final Round Pitches</h3>
            <p style={{ marginBottom: '16px' }}>
              View the competition while judges are ranking.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {pitches
                .filter((p) => p.player !== playerName)
                .map((pitch) => (
                  <div
                    key={pitch.id}
                    style={{
                      border: '2px solid rgba(59, 42, 21, 0.2)',
                      borderRadius: '8px',
                      padding: '12px',
                      backgroundColor: '#fffaf1',
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: '4px' }}>
                      {pitch.title} by {pitch.player}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#666' }}>{pitch.summary}</div>
                    {pitch.usedMustHaves && pitch.usedMustHaves.length > 0 && (
                      <div style={{ marginTop: '6px', fontSize: '0.85rem', color: '#6b6056' }}>
                        <strong>MUST HAVEs:</strong> {pitch.usedMustHaves.join(', ')}
                      </div>
                    )}
                    {pitch.sketchData && (
                      <img
                        src={pitch.sketchData}
                        alt={`Sketch from ${pitch.player}`}
                        style={{
                          marginTop: '8px',
                          maxWidth: '200px',
                          border: '1px solid #ddd',
                          borderRadius: '4px'
                        }}
                      />
                    )}
                  </div>
                ))}
            </div>
          </section>
        </>
      )}

      {/* RANKING PHASE - FOR JUDGES */}
      {!isPitcher && phase === 'pitching' && (
        <section className="panel">
          <h3>Waiting for Pitches...</h3>
          <p>Final round players are creating their championship pitches. You'll rank them once they're done.</p>
          <p style={{ marginTop: '12px', fontWeight: 600 }}>
            Pitches loaded: {pitches.length} / {finalRoundPlayers.length}
          </p>
          <ul className="list" style={{ marginTop: '12px' }}>
            {finalRoundPlayers.map((name) => {
              const status = pitchStatuses[name] ?? 'drafting'
              const hasPitch = pitches.some(p => p.player === name)
              return (
                <li
                  key={name}
                  style={{
                    color: status === 'ready' ? '#2d7c2d' : '#666',
                    fontWeight: status === 'ready' ? 'bold' : 'normal',
                  }}
                >
                  {name}: {status === 'ready' ? (hasPitch ? '✓ Ready' : '⏳ Finalizing...') : 'Drafting...'}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {!isPitcher && phase === 'ranking' && !submitted && (
        <section className="panel">
          <h3>Rank The Pitches</h3>
          <p style={{ marginBottom: '16px' }}>
            <strong>Drag and drop to reorder.</strong> 1st place = best, last place = worst.
          </p>
          {rankedPitches.length !== finalRoundPlayers.length && (
            <div style={{ 
              padding: '12px', 
              backgroundColor: 'rgba(255, 200, 100, 0.2)', 
              borderRadius: '8px',
              marginBottom: '12px',
              border: '1px solid rgba(255, 200, 100, 0.5)'
            }}>
              <p style={{ margin: 0, fontWeight: 600 }}>
                ⏳ Loading pitches... ({rankedPitches.length} / {finalRoundPlayers.length})
              </p>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {rankedPitches.map((pitch, index) => (
              <div
                key={pitch.id}
                draggable
                onDragStart={(e) => handleDragStart(e, pitch.id)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, pitch.id)}
                style={{
                  border: '2px solid rgba(59, 42, 21, 0.2)',
                  borderRadius: '8px',
                  padding: '12px',
                  backgroundColor: '#fffaf1',
                  cursor: 'grab',
                  transition: 'box-shadow 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(212, 165, 116, 0.3)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ fontWeight: 700, marginBottom: '4px' }}>
                    #{index + 1}: {pitch.title} by {pitch.player}
                  </div>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      void speakPitch(pitch)
                    }}
                    style={{ padding: '6px 10px', borderRadius: '10px', flexShrink: 0 }}
                    aria-label={`Play pitch audio for ${pitch.player}`}
                  >
                    {loadingPitchId === pitch.id ? '⏳' : speakingPitchId === pitch.id ? '⏹️' : '🔊'}
                  </button>
                </div>
                <div style={{ fontSize: '0.9rem', color: '#666' }}>{pitch.summary}</div>
                {pitch.voice && (
                  <div style={{ marginTop: '6px', fontSize: '0.82rem', color: '#6b6056' }}>
                    Voice: {normalizeKokoroVoiceName(pitch.voice)}
                  </div>
                )}
                {pitch.usedMustHaves && pitch.usedMustHaves.length > 0 && (
                  <div style={{ marginTop: '6px', fontSize: '0.85rem', color: '#6b6056' }}>
                    <strong>MUST HAVEs:</strong> {pitch.usedMustHaves.join(', ')}
                  </div>
                )}
                {pitch.sketchData && (
                  <img
                    src={pitch.sketchData}
                    alt="Sketch"
                    style={{
                      marginTop: '8px',
                      maxWidth: '200px',
                      border: '1px solid #ddd',
                      borderRadius: '4px'
                    }}
                  />
                )}
                <div style={{ marginTop: '8px', fontSize: '0.8rem', color: '#999' }}>
                  ↕️ Drag to reorder
                </div>
              </div>
            ))}
          </div>
          <div className="footer-actions" style={{ marginTop: '16px' }}>
            <button
              className="button"
              onClick={handleSubmitRanking}
              disabled={rankedPitchIds.length !== pitches.length}
            >
              Submit Rankings
            </button>
          </div>
          {submitError && (
            <div style={{ 
              marginTop: '12px', 
              padding: '12px', 
              backgroundColor: submitError === 'viewed' ? 'rgba(211, 47, 47, 0.1)' : 'rgba(211, 47, 47, 0.1)',
              borderRadius: '8px',
              border: '1px solid #d32f2f'
            }}>
              <p style={{ margin: 0, color: '#c1260d', fontWeight: 600 }}>
                {submitError === 'viewed' 
                  ? '⚠️ You must view all pitches before submitting rankings!'
                  : `⚠️ Please rank all ${pitches.length} pitches before submitting`}
              </p>
            </div>
          )}
        </section>
      )}

      {!isPitcher && phase === 'ranking' && submitted && !isTransitioning && (
        <section className="panel">
          <h3>✓ Rankings Submitted</h3>
          <p>Waiting for other judges to submit their rankings...</p>
        </section>
      )}

      {/* TRANSITION SCREEN - LOADING NEXT PHASE */}
      {isTransitioning && (
        <section className="panel" style={{ 
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          zIndex: 1000,
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ marginBottom: '24px', fontSize: '2.4rem' }}>
              {isPitcher ? '🎯 Judges are ranking...' : '📊 Tallying results...'}
            </h1>
            <p style={{ fontSize: '1.1rem', color: '#666', marginBottom: '32px' }}>
              {isPitcher 
                ? 'Your pitch has been submitted! Judges are now ranking all final round pitches. Get ready for the final results!'
                : 'All judges have submitted their rankings. The system is calculating the winner...'}
            </p>
            <div style={{ 
              display: 'inline-block',
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              border: '4px solid rgba(212, 165, 116, 0.2)',
              borderTop: '4px solid #d4a574',
              animation: 'spin 1s linear infinite'
            }}>
              <style>{`
                @keyframes spin {
                  to { transform: rotate(360deg); }
                }
              `}</style>
            </div>
            <p style={{ marginTop: '24px', fontSize: '0.9rem', color: '#999' }}>
              Loading next phase... please wait
            </p>
          </div>
        </section>
      )}
    </>
  )
}
