import { useEffect, useState } from 'react'

type Pitch = {
  id: string
  player: string
  title: string
  summary: string
  voice: string
}

type Score = {
  name: string
  points: number
}

type RoundResult = {
  round: number
  winner: string
  pitchId: string
  walrusSurpriseWinner: boolean
  pointsAwarded: number
}

type StateResponse = {
  ok: boolean
  room: {
    walrus: string
    walrusSurprisePlayer: string
  }
  scores: Score[]
  lastResult: RoundResult | null
}

type PitchesResponse = {
  ok: boolean
  pitches: Pitch[]
}

type VoteResponse = {
  ok: boolean
  result?: RoundResult
  message?: string
}

export default function Vote() {
  const [pitches, setPitches] = useState<Pitch[]>([])
  const [scores, setScores] = useState<Score[]>([])
  const [walrus, setWalrus] = useState('')
  const [walrusSurprisePlayer, setWalrusSurprisePlayer] = useState('')
  const [result, setResult] = useState<RoundResult | null>(null)
  const [status, setStatus] = useState<'idle' | 'voting' | 'done' | 'error'>(
    'idle'
  )

  const load = async () => {
    const [stateResponse, pitchesResponse] = await Promise.all([
      fetch('/api/state'),
      fetch('/api/round/pitches')
    ])

    if (stateResponse.ok) {
      const stateData = (await stateResponse.json()) as StateResponse
      if (stateData.ok) {
        setWalrus(stateData.room.walrus)
        setWalrusSurprisePlayer(stateData.room.walrusSurprisePlayer)
        setScores(stateData.scores)
        setResult(stateData.lastResult)
      }
    }

    if (pitchesResponse.ok) {
      const pitchData = (await pitchesResponse.json()) as PitchesResponse
      if (pitchData.ok) {
        setPitches(pitchData.pitches)
      }
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const handleVote = async (pitchId: string) => {
    try {
      setStatus('voting')
      const response = await fetch('/api/round/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pitchId, voter: walrus || 'Walrus' })
      })
      const data = (await response.json()) as VoteResponse
      if (!data.ok || !data.result) {
        setStatus('error')
        return
      }
      setResult(data.result)
      setStatus('done')
      await load()
    } catch (err) {
      setStatus('error')
    }
  }

  return (
    <>
      <section className="page-header">
        <div>
          <div className="eyebrow">Vote</div>
          <h1>Pick the winner</h1>
          <p>
            Walrus picks the best pitch. Winner earns 1 point, or 2 if they
            held the Walrus Surprise.
          </p>
        </div>
        <div className="pill">
          {result ? `Walrus voted: ${result.winner}` : 'Walrus vote: Pending'}
        </div>
      </section>

      <section className="grid">
        {pitches.map((pitch) => (
          <div className="panel" key={pitch.id}>
            <h3>{pitch.title}</h3>
            <p>{pitch.summary}</p>
            {pitch.player === walrusSurprisePlayer && (
              <div className="pill" style={{ marginTop: '10px' }}>
                Walrus Surprise holder
              </div>
            )}
            <div className="footer-actions" style={{ marginTop: '14px' }}>
              <button
                className="button"
                onClick={() => handleVote(pitch.id)}
                disabled={status === 'voting'}
              >
                Vote
              </button>
              <button className="button secondary">Details</button>
            </div>
          </div>
        ))}
      </section>

      <section className="panel">
        <h3>Scoreboard preview</h3>
        <ul className="list">
          {scores.map((score) => (
            <li key={score.name}>
              {score.name}: {score.points} points
            </li>
          ))}
        </ul>
        <p style={{ marginTop: '12px' }}>
          First player to 5 points wins the game and triggers a restart.
        </p>
        {status === 'error' && (
          <p style={{ marginTop: '12px', color: '#8c2d2a' }}>
            Vote failed. Try again.
          </p>
        )}
      </section>
    </>
  )
}
