import type { CSSProperties } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getMascotColor, getMascotImage, getMascotName } from '../utils/mascots'
import LeaderboardModal from '../components/LeaderboardModal'
import { AnimatedMascot } from '../components/AnimatedMascot'

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

export default function Reveal() {
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
  const [challengeReveal, setChallengeReveal] = useState<ChallengeReveal | null>(null)
  const [showChallengeModal, setShowChallengeModal] = useState(false)
  const lastChallengeAt = useRef<string | null>(null)
  const hasSeededQueue = useRef(false)
  const [walrusSurprisePlayer, setWalrusSurprisePlayer] = useState<string | null>(null)
  const [surpriseByPlayer, setSurpriseByPlayer] = useState<Record<string, string | null>>({})
  const [viewedPitchIds, setViewedPitchIds] = useState<string[]>([])
  const [playerMascots, setPlayerMascots] = useState<Record<string, string>>({})

  const roomCode = code ?? localStorage.getItem('bw:lastRoom') ?? ''
  const playerName = roomCode ? localStorage.getItem(`bw:player:${roomCode}`) ?? '' : ''

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
            setChallengeReveal(current)
            setShowChallengeModal(true)
            window.setTimeout(() => setShowChallengeModal(false), 3000)
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
  const isPlayerDisqualified = Boolean(currentPlayerPitch?.isDisqualified)
  const remainingCandidates = pitches.filter((pitch) => !pitch.isDisqualified).length
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
            >
              🔊
            </button>
          </div>
          <div className="card" style={{ marginTop: '12px' }}>
            <strong>{currentPitch?.title ?? 'Awaiting pitch'}</strong>
            <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {currentPitch?.isDisqualified && (
                <span className="badge">Disqualified</span>
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
            {currentPitch?.isDisqualified && (
              <p style={{ marginTop: '8px', color: '#8c2d2a' }}>
                Disqualified due to challenge.
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
            {isWalrus && !currentPitch?.isDisqualified && (
              <button
                className="button"
                onClick={() => {
                  if (currentPitch && currentPitch.isValid !== false && !currentPitch.isDisqualified) {
                    setSelectedWinnerId(currentPitch.id)
                  }
                }}
                disabled={!currentPitch || currentPitch.isValid === false || currentPitch.isDisqualified}
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

      {!isWalrus && !isOwnPitch && !isPlayerDisqualified && !hideChallengePanel && (
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
              onClick={() => setShowConfirm(true)}
              disabled={!selectedWinnerId || !allViewed}
            >
              Complete Judging
            </button>
          </div>
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
                  pitch.isValid === false || pitch.isDisqualified ? 0.5 : 1,
                display: 'grid',
                gridTemplateColumns: '52px 1fr',
                gap: '12px',
                boxShadow: '0 6px 14px rgba(40, 30, 20, 0.08)'
              }}
              onClick={() => {
                setCurrentIndex(index)
                setCurrentPitch(pitch)
                if (isWalrus) {
                  void markPitchViewed(pitch.id)
                }
                if (isWalrus && pitch.isValid !== false && !pitch.isDisqualified) {
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
                  {pitch.isDisqualified && (
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
          <div className="modal">
            <h3>AI Challenge Result</h3>
            <p>
              {challengeReveal.wasCorrect
                ? `${challengeReveal.accuser} was correct. ${challengeReveal.disqualifiedPlayer} is disqualified and loses $100.`
                : `${challengeReveal.accuser} was wrong and is disqualified this round.`}
            </p>
          </div>
        </div>
      )}
    </>
  )
}
