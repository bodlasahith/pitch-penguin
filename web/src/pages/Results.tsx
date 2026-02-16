import { useEffect, useState } from 'react'

type Score = {
  name: string
  points: number
}

type RoundResult = {
  round: number
  winner: string
  pointsAwarded: number
  walrusSurpriseWinner: boolean
}

type StateResponse = {
  ok: boolean
  scores: Score[]
  lastResult: RoundResult | null
}

type ResultsResponse = {
  ok: boolean
  winner?: string
  pointsAwarded?: number
  walrusSurpriseWinner?: boolean
}

export default function Results() {
  const [scores, setScores] = useState<Score[]>([])
  const [result, setResult] = useState<RoundResult | null>(null)

  useEffect(() => {
    const load = async () => {
      const [stateResponse, resultResponse] = await Promise.all([
        fetch('/api/state'),
        fetch('/api/round/results')
      ])

      if (stateResponse.ok) {
        const stateData = (await stateResponse.json()) as StateResponse
        if (stateData.ok) {
          setScores(stateData.scores)
          setResult(stateData.lastResult)
        }
      }

      if (resultResponse.ok) {
        const resultData = (await resultResponse.json()) as ResultsResponse
        if (resultData.ok && resultData.winner) {
          setResult((prev) =>
            prev ?? {
              round: 0,
              winner: resultData.winner ?? 'TBD',
              pointsAwarded: resultData.pointsAwarded ?? 0,
              walrusSurpriseWinner: resultData.walrusSurpriseWinner ?? false
            }
          )
        }
      }
    }

    void load()
  }, [])

  const champion = scores.reduce<Score | null>((top, current) => {
    if (!top || current.points > top.points) {
      return current
    }
    return top
  }, null)

  return (
    <>
      <section className="page-header">
        <div>
          <div className="eyebrow">Game end</div>
          <h1>We have a winner</h1>
          <p>First to 5 points wins. Restart to run it back with a new Walrus.</p>
        </div>
        <div className="panel">
          <h3>Champion</h3>
          <div className="timer">{champion?.name ?? 'TBD'}</div>
          <p style={{ marginTop: '8px' }}>
            Final score: {champion?.points ?? 0} points
          </p>
        </div>
      </section>

      <section className="grid">
        <div className="panel">
          <h3>Final scoreboard</h3>
          <ul className="list">
            {scores.map((score) => (
              <li key={score.name}>
                {score.name}: {score.points} points
              </li>
            ))}
          </ul>
        </div>
        <div className="panel">
          <h3>Round recap</h3>
          <p>
            {result ? (
              <>
                {result.winner} won the round for {result.pointsAwarded} point
                {result.pointsAwarded === 1 ? '' : 's'}. Walrus Surprise winners
                earn 2 points for the round.
              </>
            ) : (
              'Waiting for the final round result.'
            )}
          </p>
        </div>
        <div className="panel">
          <h3>Restart</h3>
          <p>Shuffle seating, clear scores, and deal a fresh ASK card.</p>
          <div className="footer-actions" style={{ marginTop: '16px' }}>
            <button className="button">Play again</button>
            <button className="button secondary">Return to lobby</button>
          </div>
        </div>
      </section>
    </>
  )
}
