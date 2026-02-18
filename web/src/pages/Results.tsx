import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getMascotColor, getMascotImage, getMascotName } from '../utils/mascots'

type GameResponse = {
  ok: boolean
  room?: {
    walrus: string
    playerScores: Record<string, number>
    gameWinner: string | null
    round: number
    lastRoundWinner?: {
      player: string
      pitchId: string
      pitchTitle: string
      sketchData?: string | null
      pointsAwarded: number
      walrusSurpriseWinner: boolean
      createdAt: string
    } | null
  }
  players?: Array<{ name: string; isHost: boolean; mascot?: string }>
}

type LastWinner = {
  player: string
  pitchId: string
  pitchTitle: string
  sketchData?: string | null
  pointsAwarded: number
  walrusSurpriseWinner: boolean
  createdAt: string
}

export default function Results() {
  const { code } = useParams()
  const navigate = useNavigate()
  const [playerScores, setPlayerScores] = useState<Record<string, number>>({})
  const [gameWinner, setGameWinner] = useState<string | null>(null)
  const [round, setRound] = useState(0)
  const [isHost, setIsHost] = useState(false)
  const [lastWinner, setLastWinner] = useState<LastWinner | null>(null)
  const [playerMascots, setPlayerMascots] = useState<Record<string, string>>({})

  const roomCode = code ?? localStorage.getItem('bw:lastRoom') ?? ''
  const playerName = roomCode ? localStorage.getItem(`bw:player:${roomCode}`) ?? '' : ''

  useEffect(() => {
    const load = async () => {
      if (!roomCode) return

      const response = await fetch(`/api/room/${roomCode}/game`)
      if (!response.ok) return

      const data = (await response.json()) as GameResponse
      if (data.ok && data.room) {
        setPlayerScores(data.room.playerScores ?? (data as { playerScores?: Record<string, number> }).playerScores ?? {})
        setGameWinner(data.room.gameWinner)
        setRound(data.room.round)
        setLastWinner(data.room.lastRoundWinner ?? null)
      }

      // Check if player is host
      if (data.players) {
        const nextMascots: Record<string, string> = {}
        data.players.forEach((entry) => {
          if (entry.mascot) {
            nextMascots[entry.name] = entry.mascot
          }
        })
        setPlayerMascots(nextMascots)
        const player = data.players.find(
          (p) => p.name.toLowerCase() === playerName.toLowerCase()
        )
        setIsHost(player?.isHost ?? false)
      }
    }

    void load()
    const interval = window.setInterval(load, 2000)
    return () => window.clearInterval(interval)
  }, [roomCode, playerName])

  const handleLeave = () => {
    navigate(`/`)
  }

  const handleNextRound = async () => {
    if (!roomCode || !isHost || gameWinner) {
      return
    }
    try {
      const response = await fetch(`/api/room/${roomCode}/advance-round`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      const data = (await response.json()) as { ok?: boolean; phase?: string }
      if (data.ok || data.phase) {
        // Small delay to let server state propagate
        await new Promise(resolve => setTimeout(resolve, 500))
        navigate(`/deal/${roomCode}`)
      } else {
        console.error('Failed to advance round:', data)
      }
    } catch (err) {
      console.error('Error advancing round:', err)
    }
  }

  const champion = Object.entries(playerScores ?? {}).reduce<[string, number] | null>(
    (top, [name, score]) => {
      if (!top || score > top[1]) {
        return [name, score]
      }
      return top
    },
    null
  )

  const mascotBadgeStyle: CSSProperties = {
    width: '28px',
    height: '28px',
    borderRadius: '999px',
    backgroundColor: 'rgba(59, 42, 21, 0.08)',
    border: '1px solid rgba(59, 42, 21, 0.12)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  }

  const gameWinnerLabel = gameWinner ? (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
      {playerMascots[gameWinner] && (
        <span style={mascotBadgeStyle}>
          <img
            src={getMascotImage(playerMascots[gameWinner]) ?? ''}
            alt=""
            style={{ width: '20px', height: '20px' }}
          />
        </span>
      )}
      <span style={{ fontWeight: 600 }}>{gameWinner}</span>
    </span>
  ) : null

  return (
    <>
      <section className="page-header">
        <div>
          <div className="eyebrow">Round {round + 1} Complete</div>
          <h1>
            {gameWinner ? (
              <span>
                {gameWinnerLabel} Wins The Game! 🎉
              </span>
            ) : (
              'Round Results'
            )}
          </h1>
          <p>
            {gameWinner ? (
              <span>First player to reach 5 points wins and claims victory! Congrats {gameWinnerLabel}.</span>
            ) : (
              'View results and prepare for the next round.'
            )}
          </p>
        </div>
      </section>

      <section className="split">
        <div className="panel">
          <h3>Winner</h3>
          <div className="timer" style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center' }}>
            {lastWinner?.player ? (
              <>
                {playerMascots[lastWinner.player] && (
                  <span style={mascotBadgeStyle}>
                    <img
                      src={getMascotImage(playerMascots[lastWinner.player]) ?? ''}
                      alt=""
                      style={{ width: '20px', height: '20px' }}
                    />
                  </span>
                )}
                <span style={{ fontWeight: 600 }}>{lastWinner.player}</span>
              </>
            ) : champion ? (
              <>
                {playerMascots[champion[0]] && (
                  <span style={mascotBadgeStyle}>
                    <img
                      src={getMascotImage(playerMascots[champion[0]]) ?? ''}
                      alt=""
                      style={{ width: '20px', height: '20px' }}
                    />
                  </span>
                )}
                <span style={{ fontWeight: 600 }}>{champion[0]}</span>
              </>
            ) : (
              'TBD'
            )}
          </div>
          {lastWinner?.pitchTitle && (
            <p style={{ marginTop: '8px' }}>“{lastWinner.pitchTitle}”</p>
          )}
          {lastWinner?.sketchData && (
            <img
              src={lastWinner.sketchData}
              alt={`Sketch from ${lastWinner.player}`}
              style={{
                marginTop: '12px',
                width: '100%',
                borderRadius: '14px',
                border: '1px solid rgba(70, 60, 50, 0.12)',
                background: '#fffaf1',
              }}
            />
          )}
          {champion && !lastWinner && (
            <p style={{ marginTop: '8px' }}>with {champion[1]} points</p>
          )}
          {lastWinner?.walrusSurpriseWinner && (
            <p style={{ marginTop: '8px', color: '#d4a574' }}>⭐ Walrus Surprise bonus (+1)</p>
          )}
        </div>

        <div className="panel">
          <h3>Leaderboard</h3>
          <div style={{ display: 'grid', gap: '12px' }}>
            {Object.entries(playerScores ?? {})
              .sort(([, a], [, b]) => b - a)
              .map(([player, score], index) => (
                <div
                  key={player}
                  style={{
                    backgroundColor: getMascotColor(playerMascots[player]),
                    padding: '12px',
                    borderRadius: '12px',
                    border: index === 0
                      ? '2px solid rgba(212, 165, 116, 0.6)'
                      : '1px solid rgba(70, 60, 50, 0.12)',
                    display: 'grid',
                    gridTemplateColumns: '52px 1fr auto',
                    gap: '12px',
                    alignItems: 'center',
                    boxShadow: '0 6px 14px rgba(40, 30, 20, 0.08)'
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{index + 1}.</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
                      {playerMascots[player] && (
                        <img
                          src={getMascotImage(playerMascots[player]) ?? ''}
                          alt=""
                          style={{ width: '34px', height: '34px' }}
                        />
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontWeight: 700 }}>{player}</span>
                      <span style={{ fontSize: '0.85rem', color: '#6b6056' }}>
                        {getMascotName(playerMascots[player]) ?? 'Mascot'}
                      </span>
                    </div>
                  </div>
                  <div style={{ fontWeight: 700 }}>{score} pts</div>
                </div>
              ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <h3>What's Next?</h3>
        {gameWinner ? (
          <p>
            Congratulations to <strong>{gameWinnerLabel}</strong>! They reached 5 points first and won
            the game. You can start a new game or head back home.
          </p>
        ) : (
          <p>
            Prepare for the next round! A new Walrus will be chosen, fresh ASK cards will be
            dealt, and you'll compete again.
          </p>
        )}

        <div className="footer-actions" style={{ marginTop: '16px' }}>
          {isHost && (
            <>
              {!gameWinner && (
                <button className="button" onClick={handleNextRound}>
                  Start Next Round
                </button>
              )}
              <button className="button secondary" onClick={() => navigate(`/lobby/${roomCode}`)}>
                Back to Lobby
              </button>
            </>
          )}
          <button className="button secondary" onClick={handleLeave}>
            Leave & Go Home
          </button>
        </div>
      </section>

      {!isHost && (
        <section className="panel" style={{ backgroundColor: 'rgba(100, 150, 255, 0.1)' }}>
          <p>
            <em>Waiting for host to restart the game or return to lobby...</em>
          </p>
        </section>
      )}
    </>
  )
}
