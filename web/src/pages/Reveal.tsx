import { useEffect, useState } from 'react'

type Pitch = {
  id: string
  player: string
  title: string
  summary: string
  voice: string
}

type PitchesResponse = {
  ok: boolean
  pitches: Pitch[]
}

type ChallengeResponse = {
  ok: boolean
}

export default function Reveal() {
  const [pitches, setPitches] = useState<Pitch[]>([])
  const [currentPitch, setCurrentPitch] = useState<Pitch | null>(null)
  const [challengeStatus, setChallengeStatus] = useState<
    'idle' | 'sent' | 'error'
  >('idle')

  useEffect(() => {
    const load = async () => {
      const response = await fetch('/api/round/pitches')
      if (!response.ok) {
        return
      }
      const data = (await response.json()) as PitchesResponse
      if (data.ok) {
        setPitches(data.pitches)
        setCurrentPitch(data.pitches[0] ?? null)
      }
    }

    void load()
  }, [])

  const handleChallenge = async () => {
    if (!currentPitch) {
      return
    }
    try {
      const response = await fetch('/api/round/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accuser: 'Alex',
          pitchId: currentPitch.id,
          verdict: 'pending'
        })
      })
      const data = (await response.json()) as ChallengeResponse
      setChallengeStatus(data.ok ? 'sent' : 'error')
    } catch (err) {
      setChallengeStatus('error')
    }
  }

  return (
    <>
      <section className="page-header">
        <div>
          <div className="eyebrow">Reveal</div>
          <h1>Pitch playback</h1>
          <p>Robot readers present each pitch while the room reacts.</p>
        </div>
        <div className="pill">
          {currentPitch ? `Now presenting: ${currentPitch.player}` : 'Loading'}
        </div>
      </section>

      <section className="split">
        <div className="panel">
          <h3>Pitch script</h3>
          <div className="card">
            <strong>{currentPitch?.title ?? 'Awaiting pitch'}</strong>
            <span>{currentPitch?.summary ?? 'Pitch details loading.'}</span>
          </div>
          <div className="footer-actions" style={{ marginTop: '16px' }}>
            <button className="button">Play voice</button>
            <button className="button secondary">Applause</button>
          </div>
        </div>
        <div className="panel">
          <h3>Pitch visual</h3>
          <div className="canvas-placeholder">Sketch preview</div>
        </div>
      </section>

      <section className="panel">
        <h3>Queue</h3>
        <ul className="list">
          {pitches.map((pitch) => (
            <li key={pitch.id}>
              {pitch.player} - {pitch.voice}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h3>AI challenge</h3>
        <p>
          Suspicious a pitch was AI-generated? Call a challenge now. If the
          accuser is correct, the presenter loses 1 point and is disqualified
          this round. If incorrect, the accuser is disqualified this round.
        </p>
        <div className="footer-actions" style={{ marginTop: '16px' }}>
          <button className="button" onClick={handleChallenge}>
            Challenge pitch
          </button>
          <button className="button secondary">Hold</button>
        </div>
        {challengeStatus === 'sent' && (
          <p style={{ marginTop: '12px' }}>Challenge submitted.</p>
        )}
        {challengeStatus === 'error' && (
          <p style={{ marginTop: '12px', color: '#8c2d2a' }}>
            Challenge failed. Try again.
          </p>
        )}
      </section>
    </>
  )
}
