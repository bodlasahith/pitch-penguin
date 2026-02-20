import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import LeaderboardModal from '../components/LeaderboardModal'
import { playActionSound, playPhaseSound } from '../utils/soundEffects'

type Pitch = {
  id: string
  player: string
  title: string
  summary: string
  voice: string
  usedMustHaves?: string[]
  aiGenerated?: boolean
}

type Challenge = {
  accuser: string
  pitchId: string
  verdict: 'upheld' | 'rejected' | 'pending'
}

type GameResponse = {
  ok: boolean
  room?: {
    walrus: string
    walrusSurprisePlayer: string
    playerScores: Record<string, number>
    gameWinner: string | null
    phase?: string
  }
  players?: Array<{ name: string; isHost: boolean }>
  disqualifiedPlayers?: string[]
}

type PitchesResponse = {
  ok: boolean
  pitches: Pitch[]
}

type JudgeResponse = {
  ok: boolean
  playerScores?: Record<string, number>
  disqualified?: string[]
  gameWinner?: string | null
}

export default function Vote() {
  useEffect(() => {
    playPhaseSound('vote')
  }, [])

  const { code } = useParams()
  const navigate = useNavigate()
  const [pitches, setPitches] = useState<Pitch[]>([])
  const [selectedWinner, setSelectedWinner] = useState<string | null>(null)
  const [walrus, setWalrus] = useState('')
  const [walrusSurprisePlayer, setWalrusSurprisePlayer] = useState('')
  const [playerScores, setPlayerScores] = useState<Record<string, number>>({})
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [challengeVerdicts, setChallengeVerdicts] = useState<
    Record<string, { verdict: 'upheld' | 'rejected'; wasCorrect: boolean }>
  >({})
  const [status, setStatus] = useState<'idle' | 'judging' | 'done' | 'error'>('idle')
  const [gameWinner, setGameWinner] = useState<string | null>(null)

  const roomCode = code ?? localStorage.getItem('bw:lastRoom') ?? ''
  const playerName = roomCode ? localStorage.getItem(`bw:player:${roomCode}`) ?? '' : ''

  const load = async () => {
    if (!roomCode) return

    const [gameResponse, pitchesResponse] = await Promise.all([
      fetch(`/api/room/${roomCode}/game`),
      fetch(`/api/room/${roomCode}/pitches`)
    ])

    if (gameResponse.ok) {
      const gameData = (await gameResponse.json()) as GameResponse
      if (gameData.ok && gameData.room) {
        if (gameData.room.phase && gameData.room.phase !== 'vote') {
          const nextPath =
            gameData.room.phase === 'results'
              ? '/results'
              : gameData.room.phase === 'reveal'
                ? '/reveal'
                : gameData.room.phase === 'pitch'
                  ? '/pitch'
                  : '/deal'
          navigate(nextPath, { replace: true })
          return
        }
        setWalrus(gameData.room.walrus)
        setWalrusSurprisePlayer(gameData.room.walrusSurprisePlayer)
        setPlayerScores(gameData.room.playerScores ?? {})
        setGameWinner(gameData.room.gameWinner)
      }
    }

    if (pitchesResponse.ok) {
      const pitchData = (await pitchesResponse.json()) as PitchesResponse
      if (pitchData.ok) {
        setPitches(pitchData.pitches)
        // Simulate loading challenges from backend
        // In a real implementation, you'd have a dedicated endpoint
        const mockChallenges: Challenge[] = []
        setChallenges(mockChallenges)
      }
    }
  }

  useEffect(() => {
    void load()
    const interval = window.setInterval(load, 2000)
    return () => window.clearInterval(interval)
  }, [roomCode])

  const isWalrus = walrus && playerName && walrus.toLowerCase() === playerName.toLowerCase()

  const handleVerdictChange = (
    pitchId: string,
    verdict: 'upheld' | 'rejected',
    wasCorrect: boolean
  ) => {
    setChallengeVerdicts((prev) => ({
      ...prev,
      [pitchId]: { verdict, wasCorrect },
    }))
  }

  const handleSubmitJudgment = async () => {
    if (!selectedWinner || !roomCode) return

    try {
      setStatus('judging')
      const response = await fetch(`/api/room/${roomCode}/judge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          winnerPitchId: selectedWinner,
          challengeVerdicts,
        })
      })
      const data = (await response.json()) as JudgeResponse
      if (data.ok) {
        setPlayerScores(data.playerScores || {})
        if (data.gameWinner) {
          setGameWinner(data.gameWinner)
          setTimeout(() => {
            navigate(`/results`)
          }, 2000)
        } else {
          setStatus('done')
          // Show next round button
        }
      } else {
        setStatus('error')
      }
    } catch (err) {
      setStatus('error')
    }
  }

  const handleNextRound = async () => {
    if (!roomCode) return
    try {
      await fetch(`/api/room/${roomCode}/advance-round`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      playActionSound('start_round')
      navigate(`/deal`)
    } catch (err) {
      console.error(err)
    }
  }

  if (gameWinner) {
    return (
      <>
        <section className="page-header">
          <div>
            <div className="eyebrow">Game Over 🎉</div>
            <h1>{gameWinner} wins!</h1>
            <p>First player to reach $500!</p>
          </div>
        </section>
        <section className="panel">
          <h3>Final Scores</h3>
          <ul className="list">
            {Object.entries(playerScores)
              .sort(([, a], [, b]) => b - a)
              .map(([player, score]) => (
                <li key={player}>
                  <strong>{player}</strong>: ${score * 100}
                </li>
              ))}
          </ul>
          <div className="footer-actions" style={{ marginTop: '16px' }}>
            <button
              className="button"
              onClick={() => {
                navigate(`/`)
              }}
            >
              Home
            </button>
          </div>
        </section>
      </>
    )
  }

  return (
    <>
      <section className="page-header">
        <div>
          <div className="eyebrow">Results & Judgment</div>
          <LeaderboardModal roomCode={roomCode} inline />
          <h1>
            {isWalrus ? 'Judge the Pitches' : 'Waiting for Walrus Decision'}
          </h1>
          <p>
            {isWalrus
              ? 'Select the winning pitch and resolve any challenges.'
              : 'The walrus is judging the pitches...'}
          </p>
        </div>
      </section>

      {isWalrus && (
        <>
          <section className="panel">
            <h3>Available Pitches</h3>
            <div className="grid">
              {pitches.map((pitch) => (
                <div
                  key={pitch.id}
                  className="panel"
                  style={{
                    backgroundColor:
                      selectedWinner === pitch.id ? 'rgba(100, 200, 100, 0.2)' : undefined,
                    border:
                      selectedWinner === pitch.id ? '2px solid #4a7c4e' : undefined,
                  }}
                  onClick={() => setSelectedWinner(pitch.id)}
                >
                  <h3>{pitch.title}</h3>
                  <p>{pitch.summary}</p>
                  <strong>{pitch.player}</strong>
                  {pitch.player === walrusSurprisePlayer && (
                    <div style={{ marginTop: '8px', color: '#d4a574' }}>
                      ⭐ Walrus Surprise ($200 if wins)
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {challenges.length > 0 && (
            <section className="panel">
              <h3>AI Challenges to Resolve</h3>
              {challenges.map((challenge) => {
                const pitch = pitches.find((p) => p.id === challenge.pitchId)
                return (
                  <div key={challenge.pitchId} style={{ marginBottom: '16px' }}>
                    <p>
                      <strong>{challenge.accuser}</strong> challenged{' '}
                      <strong>{pitch?.player}</strong>'s pitch
                    </p>
                    <div className="footer-actions">
                      <button
                        className={`button${
                          challengeVerdicts[challenge.pitchId]?.verdict === 'upheld'
                            ? ''
                            : ' secondary'
                        }`}
                        onClick={() => handleVerdictChange(challenge.pitchId, 'upheld', true)}
                      >
                        Challenge Correct
                      </button>
                      <button
                        className={`button${
                          challengeVerdicts[challenge.pitchId]?.verdict === 'rejected'
                            ? ''
                            : ' secondary'
                        }`}
                        onClick={() => handleVerdictChange(challenge.pitchId, 'rejected', false)}
                      >
                        Challenge Wrong
                      </button>
                    </div>
                  </div>
                )
              })}
            </section>
          )}

          <section className="panel">
            <div className="footer-actions">
              <button
                className="button"
                onClick={handleSubmitJudgment}
                disabled={!selectedWinner || status === 'judging'}
              >
                {status === 'judging' ? 'Submitting...' : 'Submit Judgment'}
              </button>
            </div>
            {status === 'error' && (
              <p style={{ marginTop: '12px', color: '#8c2d2a' }}>Error submitting judgment.</p>
            )}
          </section>
        </>
      )}

      <section className="panel">
        <h3>Current Scoreboard</h3>
        <ul className="list">
          {Object.entries(playerScores)
            .sort(([, a], [, b]) => b - a)
            .map(([player, score]) => (
              <li key={player}>
                <strong>{player}</strong>: ${score * 100}
                {player === walrusSurprisePlayer && ' ⭐'}
              </li>
            ))}
        </ul>
        <p style={{ marginTop: '12px' }}>
          First to $500 wins.{" "}
          {Object.values(playerScores).length > 0 &&
          Math.max(...Object.values(playerScores)) >= 5
            ? 'Game over!'
            : ''}
        </p>
      </section>

      {status === 'done' && isWalrus && (
        <section className="panel">
          <div className="footer-actions">
            <button className="button" onClick={handleNextRound}>
              Start Next Round
            </button>
          </div>
        </section>
      )}
    </>
  )
}
