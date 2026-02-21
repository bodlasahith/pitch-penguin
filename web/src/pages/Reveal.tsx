import type { CSSProperties } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getMascotColor, getMascotImage, getMascotName } from '../utils/mascots'
import LeaderboardModal from '../components/LeaderboardModal'
import { AnimatedMascot } from '../components/AnimatedMascot'
import { buildNarrationText, normalizeKokoroVoiceName, selectSpeechVoice } from '../utils/voiceProfiles'
import { fetchServerTtsAudio } from '../utils/ttsApi'
import { playActionSound, playPhaseSound } from '../utils/soundEffects'

type Pitch = {
  id: string
  player: string
  title: string
  summary: string
  voice: string
  usedMustHaves?: string[]
  aiGenerated?: boolean
  sketchData?: string | null
  isValid?: boolean
  isDisqualified?: boolean
}

type PitchesResponse = {
  ok: boolean
  pitches: Pitch[]
}

type GameResponse = {
  ok: boolean
  room?: {
    walrus: string
    phase: string
    walrusSurprisePlayer?: string | null
    challengeReveal?: ChallengeReveal | null
    viewedPitchIds?: string[]
  }
  surpriseByPlayer?: Record<string, string | null>
  players?: Array<{ name: string; isHost: boolean; mascot?: string }>
}

type ChallengeReveal = {
  accuser: string
  pitchId: string
  wasCorrect: boolean
  disqualifiedPlayer: string
  createdAt: string
}

type ChallengeResponse = {
  ok: boolean
  challenge?: {
    accuser: string
    pitchId: string
  }
}

const normalizePitchTitle = (title?: string | null) => (title ?? '').trim().toLowerCase()
const isUntitledPitch = (title?: string | null) => normalizePitchTitle(title) === 'untitled pitch'
const isChallengeEligibleSubmission = (pitch?: Pitch) => {
  if (!pitch) {
    return false
  }
  const title = pitch.title?.trim() ?? ''
  const summary = pitch.summary?.trim() ?? ''
  const untitledNoPitch = (!summary && !title) || (!summary && isUntitledPitch(title))
  if (untitledNoPitch) {
    return false
  }
  return !pitch.isDisqualified && pitch.isValid !== false && Boolean(title) && Boolean(summary)
}
const isPitchDisqualified = (pitch?: Pitch | null) => {
  if (!pitch) {
    return false
  }
  const title = pitch.title?.trim() ?? ''
  const summary = pitch.summary?.trim() ?? ''
  const untitledNoPitch = (!summary && !title) || (!summary && isUntitledPitch(title))
  const missingContent = !title || !summary
  return Boolean(pitch.isDisqualified) || pitch.isValid === false || untitledNoPitch || missingContent
}

export default function Reveal() {
  useEffect(() => {
    playPhaseSound('reveal')
  }, [])

  const { code } = useParams()
  const navigate = useNavigate()
  const [pitches, setPitches] = useState<Pitch[]>([])
  const [currentPitch, setCurrentPitch] = useState<Pitch | null>(null)
  const [challengeStatus, setChallengeStatus] = useState<
    'idle' | 'sent' | 'error'
  >('idle')
  const [walrus, setWalrus] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [canChallenge, setCanChallenge] = useState(true)
  const [challenged, setChallenged] = useState(false)
  const [selectedWinnerId, setSelectedWinnerId] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [judgingError, setJudgingError] = useState('')
  const [challengeReveal, setChallengeReveal] = useState<ChallengeReveal | null>(null)
  const [showChallengeModal, setShowChallengeModal] = useState(false)
  const [challengeModalPhase, setChallengeModalPhase] = useState<'build' | 'result'>('build')
  const lastChallengeAt = useRef<string | null>(null)
  const challengeBuildTimerRef = useRef<number | null>(null)
  const challengeCloseTimerRef = useRef<number | null>(null)
  const hasSeededQueue = useRef(false)
  const [walrusSurprisePlayer, setWalrusSurprisePlayer] = useState<string | null>(null)
  const [surpriseByPlayer, setSurpriseByPlayer] = useState<Record<string, string | null>>({})
  const [viewedPitchIds, setViewedPitchIds] = useState<string[]>([])
  const [playerMascots, setPlayerMascots] = useState<Record<string, string>>({})
  const [speakingPitchId, setSpeakingPitchId] = useState<string | null>(null)
  const [loadingPitchId, setLoadingPitchId] = useState<string | null>(null)
  const activeAudioRef = useRef<HTMLAudioElement | null>(null)
  const activeAudioUrlRef = useRef<string | null>(null)
  const narrationTokenRef = useRef(0)

  const roomCode = code ?? localStorage.getItem('bw:lastRoom') ?? ''
  const playerName = roomCode ? localStorage.getItem(`bw:player:${roomCode}`) ?? '' : ''

  const clearChallengeModalTimers = () => {
    if (challengeBuildTimerRef.current) {
      window.clearTimeout(challengeBuildTimerRef.current)
      challengeBuildTimerRef.current = null
    }
    if (challengeCloseTimerRef.current) {
      window.clearTimeout(challengeCloseTimerRef.current)
      challengeCloseTimerRef.current = null
    }
  }

  const stopNarration = () => {
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
  }

  const playBlobNarration = async (pitchId: string, audioBlob: Blob, token: number) => {
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
  }

  const speakPitch = async (pitch: Pitch | null) => {
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
  }

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
  }, [])

  useEffect(() => {
    return () => {
      clearChallengeModalTimers()
    }
  }, [])

  useEffect(() => {
    let refreshId: number | undefined

    const load = async () => {
      if (!roomCode) {
        return
      }
      const response = await fetch(`/api/room/${roomCode}/pitches`)
      if (!response.ok) {
        return
      }
      const data = (await response.json()) as PitchesResponse
      if (data.ok && data.pitches.length > 0) {
        if (!hasSeededQueue.current) {
          hasSeededQueue.current = true
          setPitches(data.pitches)
          setCurrentPitch(data.pitches[0] ?? null)
          setCurrentIndex(0)
        } else {
          setPitches((prev) => {
            if (prev.length === 0) {
              setCurrentPitch(data.pitches[0] ?? null)
              setCurrentIndex(0)
              return data.pitches
            }
            const nextById = new Map(data.pitches.map((pitch) => [pitch.id, pitch]))
            const merged = prev.map((pitch) => nextById.get(pitch.id) ?? pitch)
            const current = currentPitch ? nextById.get(currentPitch.id) ?? currentPitch : merged[currentIndex] ?? merged[0] ?? null
            setCurrentPitch(current)
            return merged
          })
        }
      }

      const gameResponse = await fetch(`/api/room/${roomCode}/game`)
      const gameData = (await gameResponse.json()) as GameResponse
      if (gameData.ok && gameData.room) {
        setWalrus(gameData.room.walrus)
        setWalrusSurprisePlayer(gameData.room.walrusSurprisePlayer ?? null)
        setSurpriseByPlayer(gameData.surpriseByPlayer ?? {})
        setViewedPitchIds(gameData.room.viewedPitchIds ?? [])
        if (gameData.players) {
          const nextMascots: Record<string, string> = {}
          gameData.players.forEach((player) => {
            if (player.mascot) {
              nextMascots[player.name] = player.mascot
            }
          })
          setPlayerMascots(nextMascots)
        }
        if (gameData.room.phase && gameData.room.phase !== 'reveal') {
          const nextPath =
            gameData.room.phase === 'deal'
              ? '/deal'
              : gameData.room.phase === 'pitch'
                ? '/pitch'
                : gameData.room.phase === 'results'
                  ? '/results'
                  : '/reveal'
          navigate(nextPath, { replace: true })
          return
        }
        if (gameData.room.challengeReveal) {
          const current = gameData.room.challengeReveal
          if (current.createdAt !== lastChallengeAt.current) {
            lastChallengeAt.current = current.createdAt
            clearChallengeModalTimers()
            setChallengeReveal(current)
            setChallengeModalPhase('build')
            setShowChallengeModal(true)
            challengeBuildTimerRef.current = window.setTimeout(
              () => setChallengeModalPhase('result'),
              1400
            )
            challengeCloseTimerRef.current = window.setTimeout(
              () => setShowChallengeModal(false),
              5000
            )
          }
        }
      }
    }

    void load()
    refreshId = window.setInterval(load, 2000)
    return () => {
      if (refreshId) {
        window.clearInterval(refreshId)
      }
    }
  }, [roomCode, currentIndex, navigate])

  const handleChallenge = async () => {
    if (!currentPitch || !playerName) {
      return
    }
    if (currentPitch.player.toLowerCase() === playerName.toLowerCase()) {
      return
    }
    if (!viewedPitchIds.includes(currentPitch.id)) {
      return
    }
    if (currentPitch.isValid === false || currentPitch.isDisqualified) {
      return
    }
    if (!isChallengeEligibleSubmission(currentPlayerPitch)) {
      return
    }
    try {
      const response = await fetch(`/api/room/${roomCode}/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accuser: playerName,
          pitchId: currentPitch.id,
          usedAI: true,
        })
      })
      const data = (await response.json()) as ChallengeResponse
      if (data.ok) {
        playActionSound('ai_challenge')
        setChallengeStatus('sent')
        setChallenged(true)
        setCanChallenge(false)
      } else {
        setChallengeStatus('error')
      }
    } catch (err) {
      setChallengeStatus('error')
    }
  }

  const handleNext = () => {
    stopNarration()
    const nextIndex = Math.min(currentIndex + 1, pitches.length - 1)
    setCurrentIndex(nextIndex)
    const nextPitch = pitches[nextIndex] ?? null
    setCurrentPitch(nextPitch)
    if (nextPitch && isWalrus) {
      void markPitchViewed(nextPitch.id)
    }
    setChallengeStatus('idle')
    setChallenged(false)
  }

  const handlePrevious = () => {
    stopNarration()
    const nextIndex = Math.max(currentIndex - 1, 0)
    setCurrentIndex(nextIndex)
    const nextPitch = pitches[nextIndex] ?? null
    setCurrentPitch(nextPitch)
    if (nextPitch && isWalrus) {
      void markPitchViewed(nextPitch.id)
    }
    setChallengeStatus('idle')
    setChallenged(false)
  }

  const isWalrus = walrus && playerName && walrus.toLowerCase() === playerName.toLowerCase()
  const isLastPitch = currentIndex === pitches.length - 1
  const selectedWinner = pitches.find((pitch) => pitch.id === selectedWinnerId) ?? null
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
  const surpriseLabel = walrusSurprisePlayer ? surpriseByPlayer[walrusSurprisePlayer] ?? null : null
  const isSurpriseWinner = Boolean(selectedWinner && walrusSurprisePlayer && selectedWinner.player === walrusSurprisePlayer)
  const isOwnPitch = Boolean(currentPitch && playerName && currentPitch.player.toLowerCase() === playerName.toLowerCase())
  const hasWalrusViewed = Boolean(currentPitch && viewedPitchIds.includes(currentPitch.id))
  const allViewed = pitches.length > 0 && pitches.every((pitch) => viewedPitchIds.includes(pitch.id))
  const currentPlayerPitch = playerName
    ? pitches.find((pitch) => pitch.player.toLowerCase() === playerName.toLowerCase())
    : undefined
  const isPlayerDisqualified = isPitchDisqualified(currentPlayerPitch)
  const isCurrentPitchDisqualified = isPitchDisqualified(currentPitch)
  const canSubmitChallenge = isChallengeEligibleSubmission(currentPlayerPitch)
  const remainingCandidates = pitches.filter((pitch) => !isPitchDisqualified(pitch)).length
  const hideChallengePanel = remainingCandidates <= 1

  const markPitchViewed = async (pitchId: string) => {
    if (!roomCode || !playerName || !isWalrus) {
      return
    }
    if (viewedPitchIds.includes(pitchId)) {
      return
    }
    await fetch(`/api/room/${roomCode}/pitch-viewed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pitchId, viewer: playerName })
    })
  }

  return (
    <>
      <section className="page-header">
        <div>
          <div className="eyebrow">Reveal & Judge</div>
          <LeaderboardModal roomCode={roomCode} inline />
          <h1>{isWalrus ? 'Judge The Pitches' : 'Watch & Challenge'}</h1>
          <p>
            {isWalrus
              ? 'Review each pitch and select the winner.'
              : 'If a pitch seems AI-generated, challenge it now.'}
          </p>
        </div>
        <div className="pill">
          {currentPitch ? `Pitch ${currentIndex + 1} of ${pitches.length}` : 'Loading'}
        </div>
      </section>

      <section className="split">
        <div className="panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>Pitch Details</h3>
            <button
              className="button secondary"
              aria-label="Play pitch audio"
              style={{ padding: '6px 10px', borderRadius: '10px' }}
              onClick={() => {
                void speakPitch(currentPitch)
              }}
            >
              {loadingPitchId === currentPitch?.id
                ? '⏳'
                : speakingPitchId === currentPitch?.id
                  ? '⏹️'
                  : '🔊'}
            </button>
          </div>
          <div className="card" style={{ marginTop: '12px' }}>
            <strong>{currentPitch?.title ?? 'Awaiting pitch'}</strong>
            <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {isCurrentPitchDisqualified && (
                <span className="badge">Disqualified</span>
              )}
              {currentPitch?.voice && (
                <span className="badge">{normalizeKokoroVoiceName(currentPitch.voice)}</span>
              )}
            </div>
            {currentPitch?.player && (
              <p style={{ marginTop: '6px', color: '#6b6056', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>By</span>
                {playerMascots[currentPitch.player] && (
                  <span style={mascotBadgeStyle}>
                    <AnimatedMascot
                      src={getMascotImage(playerMascots[currentPitch.player]) ?? ''}
                      alt=""
                      character={playerMascots[currentPitch.player]}
                      style={{ width: '18px', height: '18px' }}
                    />
                  </span>
                )}
                <span style={{ fontWeight: 600 }}>{currentPitch.player}</span>
              </p>
            )}
            <span>{currentPitch?.summary ?? 'Pitch details loading.'}</span>
            {isCurrentPitchDisqualified && (
              <p style={{ marginTop: '8px', color: '#8c2d2a' }}>
                This pitch is disqualified.
              </p>
            )}
            {currentPitch?.usedMustHaves && currentPitch.usedMustHaves.length > 0 && (
              <div style={{ marginTop: '12px' }}>
                <strong>Used Must-Haves:</strong>
                <ul style={{ margin: '8px 0' }}>
                  {currentPitch.usedMustHaves.map((have) => (
                    <li key={have}>{have}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="footer-actions" style={{ marginTop: '16px' }}>
            <div style={{ display: 'flex', gap: '12px' }}>
              {currentIndex > 0 && (
                <button className="button secondary" onClick={handlePrevious}>
                  Previous
                </button>
              )}
              {!isLastPitch && (
                <button className="button" onClick={handleNext}>
                  Next
                </button>
              )}
            </div>
            {isWalrus && !isCurrentPitchDisqualified && (
              <button
                className="button"
                onClick={() => {
                  if (currentPitch && !isPitchDisqualified(currentPitch)) {
                    setSelectedWinnerId(currentPitch.id)
                  }
                }}
                disabled={!currentPitch || isPitchDisqualified(currentPitch)}
              >
                {selectedWinnerId === currentPitch?.id ? 'Winner Selected' : 'Select Winner'}
              </button>
            )}
          </div>
        </div>
        <div className="panel">
          <h3>Pitch Visual</h3>
          {currentPitch?.sketchData ? (
            <img
              src={currentPitch.sketchData}
              alt={`Sketch from ${currentPitch.player}`}
              style={{
                width: '100%',
                borderRadius: '16px',
                border: '1px solid rgba(70, 60, 50, 0.12)',
                background: '#fffaf1',
              }}
            />
          ) : (
            <div className="canvas-placeholder">Sketch preview</div>
          )}
        </div>
      </section>

      {!isWalrus && !isOwnPitch && !isPlayerDisqualified && canSubmitChallenge && !hideChallengePanel && (
        <section className="panel">
          <h3>AI Challenge</h3>
          <p>
            Suspicious this pitch was AI-generated? Challenge it now. If correct, the presenter
            loses $100. If incorrect, you're disqualified this round.
          </p>
          <div className="footer-actions" style={{ marginTop: '16px' }}>
            <button
              className={`button${!canChallenge ? ' secondary' : ''}`}
              onClick={handleChallenge}
              disabled={!canChallenge || !currentPitch || isOwnPitch || !hasWalrusViewed}
            >
              {challenged ? 'Challenge Submitted' : 'Challenge Pitch'}
            </button>
          </div>
          {!hasWalrusViewed && (
            <p style={{ marginTop: '10px', color: '#8c2d2a' }}>
              Waiting for the walrus to review this pitch.
            </p>
          )}
          {challengeStatus === 'sent' && (
            <p style={{ marginTop: '12px', color: '#2d7c2d' }}>Challenge submitted! ✓</p>
          )}
          {challengeStatus === 'error' && (
            <p style={{ marginTop: '12px', color: '#8c2d2a' }}>
              Challenge failed. Try again.
            </p>
          )}
        </section>
      )}

      <section className="panel">
        <h3>Walrus Surprise</h3>
        {walrusSurprisePlayer && surpriseLabel ? (
          <p>
            ⭐ {walrusSurprisePlayer}: {surpriseLabel}
          </p>
        ) : (
          <p>No surprise assigned this round.</p>
        )}
      </section>

      {isWalrus && (
        <section className="panel">
          <h3>Judging Controls</h3>
          <p>Review all pitches and select your winner.</p>
          <div className="footer-actions" style={{ marginTop: '16px' }}>
            <button
              className="button"
              onClick={() => {
                if (!selectedWinnerId) {
                  setJudgingError('Select a winning pitch before completing judging.')
                  return
                }
                if (!allViewed) {
                  setJudgingError('Review all pitches before completing judging.')
                  return
                }
                setJudgingError('')
                setShowConfirm(true)
              }}
            >
              Complete Judging
            </button>
          </div>
          {judgingError && (
            <p style={{ marginTop: '10px', color: '#8c2d2a' }}>{judgingError}</p>
          )}
          {selectedWinner && (
            <div style={{ marginTop: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <strong>Selected Winner:</strong>
                {playerMascots[selectedWinner.player] && (
                  <span style={mascotBadgeStyle}>
                    <AnimatedMascot
                      src={getMascotImage(playerMascots[selectedWinner.player]) ?? ''}
                      alt={playerMascots[selectedWinner.player]}
                      character={playerMascots[selectedWinner.player]}
                      width="18px"
                      height="18px"
                    />
                  </span>
                )}
                <span style={{ fontWeight: 600 }}>{selectedWinner.player}</span>
                <span>— "{selectedWinner.title}"</span>
              </div>
              {isSurpriseWinner && (
                <div style={{ marginTop: '8px', color: '#d4a574' }}>
                  ⭐ Walrus Surprise bonus (+1)
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <section className="panel">
        <h3>Pitch Queue ({pitches.length})</h3>
        <div style={{ display: 'grid', gap: '12px' }}>
          {pitches.map((pitch, index) => (
            <div
              key={pitch.id}
              style={{
                backgroundColor: getMascotColor(playerMascots[pitch.player]),
                padding: '12px',
                borderRadius: '12px',
                border: index === currentIndex
                  ? '2px solid rgba(80, 140, 200, 0.6)'
                  : pitch.id === selectedWinnerId
                    ? '2px solid rgba(70, 140, 90, 0.6)'
                    : '1px solid rgba(70, 60, 50, 0.12)',
                cursor: isWalrus ? 'pointer' : 'default',
                opacity:
                  isPitchDisqualified(pitch) ? 0.5 : 1,
                display: 'grid',
                gridTemplateColumns: '52px 1fr',
                gap: '12px',
                boxShadow: '0 6px 14px rgba(40, 30, 20, 0.08)'
              }}
              onClick={() => {
                stopNarration()
                setCurrentIndex(index)
                setCurrentPitch(pitch)
                if (isWalrus) {
                  void markPitchViewed(pitch.id)
                }
                if (isWalrus && !isPitchDisqualified(pitch)) {
                  setSelectedWinnerId(pitch.id)
                }
              }}
            >
              <div
                style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '16px',
                  background: 'rgba(59, 42, 21, 0.08)',
                  border: '1px solid rgba(59, 42, 21, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {playerMascots[pitch.player] && (
                  <AnimatedMascot
                    src={getMascotImage(playerMascots[pitch.player]) ?? ''}
                    alt={playerMascots[pitch.player]}
                    character={playerMascots[pitch.player]}
                    width="34px"
                    height="34px"
                  />
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700 }}>{pitch.player}</span>
                  <span style={{ fontSize: '0.85rem', color: '#6b6056' }}>
                    {getMascotName(playerMascots[pitch.player]) ?? 'Mascot'}
                  </span>
                  {isPitchDisqualified(pitch) && (
                    <span className="badge">Disqualified</span>
                  )}
                </div>
                <div style={{ fontSize: '0.95rem' }}>
                  “{pitch.title}”{pitch.aiGenerated && ' 🤖'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {showConfirm && selectedWinner && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Confirm winner</h3>
            <p>
              You are about to crown{' '}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                {playerMascots[selectedWinner.player] && (
                  <span style={mascotBadgeStyle}>
                    <AnimatedMascot
                      src={getMascotImage(playerMascots[selectedWinner.player]) ?? ''}
                      alt={playerMascots[selectedWinner.player]}
                      character={playerMascots[selectedWinner.player]}
                      width="18px"
                      height="18px"
                    />
                  </span>
                )}
                <strong>{selectedWinner.player}</strong>
              </span>
              {' '}with "{selectedWinner.title}". This cannot be changed.
            </p>
            <div className="footer-actions" style={{ marginTop: '16px' }}>
              <button
                className="button"
                disabled={submitting}
                onClick={async () => {
                  if (!roomCode || !selectedWinnerId) return
                  try {
                    setSubmitting(true)
                    const response = await fetch(`/api/room/${roomCode}/judge`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ winnerPitchId: selectedWinnerId })
                    })
                    const data = (await response.json()) as { ok: boolean }
                    if (data.ok) {
                      navigate('/results')
                    }
                  } finally {
                    setSubmitting(false)
                    setShowConfirm(false)
                  }
                }}
              >
                {submitting ? 'Submitting...' : 'Confirm Winner'}
              </button>
              <button
                className="button secondary"
                onClick={() => setShowConfirm(false)}
                disabled={submitting}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showChallengeModal && challengeReveal && (
        <div className="modal-backdrop">
          <div
            className={`modal ai-challenge-modal ${
              challengeReveal.wasCorrect ? 'is-correct' : 'is-wrong'
            } ${challengeModalPhase === 'build' ? 'is-building' : 'is-revealed'}`}
          >
            {challengeModalPhase === 'build' ? (
              <>
                <div className="eyebrow">AI Challenge</div>
                <h3>Verifying Pitch Authenticity</h3>
                <div className="challenge-loading-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              </>
            ) : (
              <>
                <div className="eyebrow">AI Challenge Verdict</div>
                <h3>{challengeReveal.wasCorrect ? 'Challenge Upheld' : 'Challenge Rejected'}</h3>
                <p>
                  {challengeReveal.wasCorrect
                    ? `${challengeReveal.accuser} was correct. ${challengeReveal.disqualifiedPlayer} is disqualified and loses $100.`
                    : `${challengeReveal.accuser} was wrong and is disqualified this round.`}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
