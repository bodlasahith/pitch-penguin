import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getMascotColor, getMascotImage, getMascotName } from '../utils/mascots'
import LeaderboardModal from '../components/LeaderboardModal'

type Pitch = {
  id: string
  player: string
  title: string
  summary: string
  sketchData?: string | null
  usedMustHaves?: string[]
}

type GameResponse = {
  ok: boolean
  room?: {
    walrus: string
    phase?: string
    playerScores: Record<string, number>
    gameWinner: string | null
    gameWinners?: string[]
    finalRoundPlayers?: string[]
    round: number
    truceActivated?: boolean
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
  const [gameWinners, setGameWinners] = useState<string[]>([])
  const [finalRoundNeeded, setFinalRoundNeeded] = useState(false)
  const [round, setRound] = useState(0)
  const [isHost, setIsHost] = useState(false)
  const [lastWinner, setLastWinner] = useState<LastWinner | null>(null)
  const [playerMascots, setPlayerMascots] = useState<Record<string, string>>({})
  const [finalRoundPitches, setFinalRoundPitches] = useState<Pitch[]>([])
  const [truceActivated, setTruceActivated] = useState(false)

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
        setGameWinners(data.room.gameWinners ?? [])
        const hasFinalRound = (data.room.finalRoundPlayers?.length ?? 0) > 0
        setFinalRoundNeeded(hasFinalRound)
        setRound(data.room.round)
        setLastWinner(data.room.lastRoundWinner ?? null)
        setTruceActivated(data.room.truceActivated ?? false)
        
        // Fetch final round pitches if there was a final round and game is over
        if (hasFinalRound && (data.room.gameWinner || data.room.gameWinners) && data.room.finalRoundPlayers) {
          const pitchesResponse = await fetch(`/api/room/${roomCode}/pitches`)
          if (pitchesResponse.ok) {
            const pitchData = (await pitchesResponse.json()) as { ok: boolean; pitches: Pitch[] }
            if (pitchData.ok) {
              const frPitches = pitchData.pitches.filter(p => 
                data.room?.finalRoundPlayers?.includes(p.player)
              )
              setFinalRoundPitches(frPitches)
            }
          }
        }
        
        // Check if phase has changed to final-round (all players should redirect)
        if (data.room.phase === 'final-round') {
          navigate(`/final-round/${roomCode}`, { replace: true })
          return
        }
        
        // Check if phase has changed to next round (deal phase)
        if (data.room.phase === 'deal') {
          navigate(`/deal/${roomCode}`, { replace: true })
          return
        }
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
  }, [roomCode, playerName, navigate])

  const handleLeave = () => {
    navigate(`/`)
  }

  const handleNextRound = async () => {
    if (!roomCode || !isHost) {
      return
    }
    
    // Don't allow advancing if there's a single game winner
    if (gameWinner && !finalRoundNeeded) {
      return
    }
    
    try {
      const response = await fetch(`/api/room/${roomCode}/advance-round`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      const data = (await response.json()) as { ok?: boolean; phase?: string; finalRoundStarted?: boolean }
      if (data.ok || data.phase) {
        // Small delay to let server state propagate
        await new Promise(resolve => setTimeout(resolve, 500))
        
        if (data.finalRoundStarted) {
          // Navigate to final round page
          navigate(`/final-round/${roomCode}`)
        } else {
          navigate(`/deal/${roomCode}`)
        }
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
          <LeaderboardModal roomCode={roomCode} />
          <h1>
            {gameWinner ? (
              <span>
                {gameWinnerLabel} Wins The Game! 🎉
              </span>
            ) : gameWinners.length > 1 && !finalRoundNeeded ? (
              <span>
                Co-Winners! 🎉
              </span>
            ) : finalRoundNeeded ? (
              <span>
                Final Round! 🔥
              </span>
            ) : (
              'Round Results'
            )}
          </h1>
          <p>
            {gameWinner ? (
              <span>First player to reach $500 wins and claims victory! Congrats {gameWinnerLabel}.</span>
            ) : gameWinners.length > 1 && !finalRoundNeeded ? (
              <span>Multiple players finished with the highest score: {gameWinners.join(', ')}!</span>
            ) : finalRoundNeeded ? (
              <span>The top players will compete in a final round to determine the ultimate winner!</span>
            ) : (
              'View results and prepare for the next round.'
            )}
          </p>
          {truceActivated && (
            <div style={{
              marginTop: '16px',
              padding: '12px 16px',
              backgroundColor: 'rgba(212, 165, 116, 0.15)',
              border: '1px solid rgba(212, 165, 116, 0.3)',
              borderRadius: '8px',
              color: '#8b6f47',
              fontWeight: 500,
              fontSize: '14px',
            }}>
              🤝 Players agreed to a truce! Results based on previous round scores.
            </div>
          )}
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
            <p style={{ marginTop: '8px' }}>with ${champion[1] * 100}</p>
          )}
          {lastWinner?.walrusSurpriseWinner && (
            <p style={{ marginTop: '8px', color: '#d4a574' }}>⭐ Walrus Surprise bonus (+$100)</p>
          )}
        </div>

        <div className="panel">
          <h3>{gameWinner || gameWinners.length > 0 ? 'Final Earnings' : 'Leaderboard'}</h3>
          {gameWinner || gameWinners.length > 0 ? (
            // Bar chart for game end
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {Object.entries(playerScores ?? {})
                .sort(([, a], [, b]) => b - a)
                .map(([player, score]) => {
                  const maxScore = Math.max(...Object.values(playerScores ?? {}))
                  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0
                  const isWinner = gameWinner === player || gameWinners.includes(player)
                  
                  return (
                    <div
                      key={player}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {playerMascots[player] && (
                            <div
                              style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '8px',
                                background: 'rgba(59, 42, 21, 0.08)',
                                border: '1px solid rgba(59, 42, 21, 0.12)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              <img
                                src={getMascotImage(playerMascots[player]) ?? ''}
                                alt=""
                                style={{ width: '20px', height: '20px' }}
                              />
                            </div>
                          )}
                          <span style={{ fontWeight: isWinner ? 700 : 600 }}>
                            {player} {isWinner && '👑'}
                          </span>
                        </div>
                        <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>
                          ${score * 100}
                        </span>
                      </div>
                      <div
                        style={{
                          width: '100%',
                          height: '32px',
                          backgroundColor: 'rgba(59, 42, 21, 0.08)',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          position: 'relative'
                        }}
                      >
                        <div
                          style={{
                            width: `${percentage}%`,
                            height: '100%',
                            backgroundColor: isWinner
                              ? '#d4a574'
                              : getMascotColor(playerMascots[player]) ?? '#8ab4f8',
                            transition: 'width 0.5s ease-out',
                            borderRadius: '8px',
                            boxShadow: isWinner ? '0 2px 8px rgba(212, 165, 116, 0.4)' : 'none'
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
            </div>
          ) : (
            // Regular leaderboard for ongoing game
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
                  <div style={{ fontWeight: 700 }}>${score * 100}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Final Round Pitches - Show all pitches if game ended after final round */}
      {(gameWinner || gameWinners.length > 0) && finalRoundPitches.length > 0 && (
        <section className="panel">
          <h3>🔥 Final Round Pitches</h3>
          <p style={{ marginBottom: '16px' }}>
            These players competed in the championship round:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {finalRoundPitches
              .sort((a, b) => {
                // Sort by winner first, then by score
                const aScore = playerScores[a.player] ?? 0
                const bScore = playerScores[b.player] ?? 0
                const aIsWinner = gameWinner === a.player || gameWinners.includes(a.player)
                const bIsWinner = gameWinner === b.player || gameWinners.includes(b.player)
                if (aIsWinner && !bIsWinner) return -1
                if (!aIsWinner && bIsWinner) return 1
                return bScore - aScore
              })
              .map((pitch) => {
                const isWinner = gameWinner === pitch.player || gameWinners.includes(pitch.player)
                return (
                  <div
                    key={pitch.id}
                    style={{
                      border: isWinner ? '2px solid #d4a574' : '2px solid rgba(59, 42, 21, 0.2)',
                      borderRadius: '12px',
                      padding: '16px',
                      backgroundColor: isWinner ? 'rgba(212, 165, 116, 0.08)' : '#fffaf1',
                      boxShadow: isWinner ? '0 4px 12px rgba(212, 165, 116, 0.2)' : 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      {playerMascots[pitch.player] && (
                        <span style={mascotBadgeStyle}>
                          <img
                            src={getMascotImage(playerMascots[pitch.player]) ?? ''}
                            alt=""
                            style={{ width: '18px', height: '18px' }}
                          />
                        </span>
                      )}
                      <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>
                        {pitch.player} {isWinner && '👑'}
                      </span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '6px' }}>
                      {pitch.title || 'Untitled'}
                    </div>
                    <div style={{ fontSize: '0.95rem', color: '#666', marginBottom: '8px' }}>
                      {pitch.summary || 'No summary provided'}
                    </div>
                    {pitch.usedMustHaves && pitch.usedMustHaves.length > 0 && (
                      <div style={{ marginTop: '8px', fontSize: '0.85rem', color: '#6b6056' }}>
                        <strong>MUST HAVEs:</strong> {pitch.usedMustHaves.join(', ')}
                      </div>
                    )}
                    {pitch.sketchData && (
                      <img
                        src={pitch.sketchData}
                        alt={`Sketch from ${pitch.player}`}
                        style={{
                          marginTop: '12px',
                          maxWidth: '300px',
                          width: '100%',
                          border: '1px solid rgba(70, 60, 50, 0.12)',
                          borderRadius: '8px',
                          backgroundColor: '#fffaf1'
                        }}
                      />
                    )}
                  </div>
                )
              })}
          </div>
        </section>
      )}

      <section className="panel">
        <h3>What's Next?</h3>
        {gameWinner ? (
          <p>
            Congratulations to <strong>{gameWinnerLabel}</strong>! They reached <strong>${playerScores[gameWinner] * 100}</strong> and won the game.
          </p>
        ) : gameWinners.length > 1 && !finalRoundNeeded ? (
          <p>
            It's a tie! <strong>{gameWinners.join(', ')}</strong> all finished with the highest score.
          </p>
        ) : finalRoundNeeded ? (
          <p>
            <strong>Final Round!</strong> The top players will compete one last time.
            Host will start the final round where these players pitch and everyone else ranks them.
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
              {finalRoundNeeded && !gameWinner && gameWinners.length === 0 && (
                <button className="button" onClick={handleNextRound}>
                  Start Final Round
                </button>
              )}
              {!gameWinner && gameWinners.length === 0 && !finalRoundNeeded && (
                <button className="button" onClick={handleNextRound}>
                  Start Next Round
                </button>
              )}
            </>
          )}
          <button className="button secondary" onClick={handleLeave}>
            Leave & Go Home
          </button>
        </div>
      </section>
    </>
  )
}
