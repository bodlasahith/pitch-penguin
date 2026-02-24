import type { CSSProperties } from 'react'
import { apiFetch } from '../utils/api'
import { useEffect, useMemo, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getMascotColor, getMascotImage, getMascotName } from '../utils/mascots'
import { AnimatedMascot } from '../components/AnimatedMascot'
import type { MascotEvent } from '../hooks/useAnimationTrigger'
import LeaderboardModal from '../components/LeaderboardModal'
import { playActionSound, playPhaseSound } from '../utils/soundEffects'
import { ScoreTicker } from '../components/MoneyAnimation'

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
    penguin: string
    phase?: string
    playerScores: Record<string, number>
    gameWinner: string | null
    gameWinners?: string[]
    finalRoundPlayers?: string[]
    round: number
    truceActivated?: boolean
    roundNoParticipation?: boolean
    lastRoundWinner?: {
      player: string
      pitchId: string
      pitchTitle: string
      sketchData?: string | null
      pointsAwarded: number
      penguinSurpriseWinner: boolean
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
  penguinSurpriseWinner: boolean
  createdAt: string
}

export default function Results() {
  useEffect(() => {
    playPhaseSound('results')
  }, [])

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
  const [winnerMustHaveCount, setWinnerMustHaveCount] = useState(0)
  const [truceActivated, setTruceActivated] = useState(false)
  const [roundNoParticipation, setRoundNoParticipation] = useState(false)
  const [previousPlayerScores, setPreviousPlayerScores] = useState<Record<string, number>>({})
  const [rankMoveByPlayer, setRankMoveByPlayer] = useState<Record<string, 'up' | 'down'>>({})
  const [leaderboardAnimationsEnabled, setLeaderboardAnimationsEnabled] = useState(false)
  const [visibleWinnerBonusCount, setVisibleWinnerBonusCount] = useState(0)
  const [showWinnerScoreTicker, setShowWinnerScoreTicker] = useState(false)
  const mascotAnimationRefs = useRef<Record<string, (event: MascotEvent) => void>>({})
  const animationCycleKeyRef = useRef('')
  const endGameSoundKeyRef = useRef('')
  const rankMoveClearTimeoutRef = useRef<number | null>(null)

  const roomCode = code ?? localStorage.getItem('pp:lastRoom') ?? ''
  const playerName = roomCode ? localStorage.getItem(`pp:player:${roomCode}`) ?? '' : ''

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLeaderboardAnimationsEnabled(true)
    }, 3200)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    return () => {
      if (rankMoveClearTimeoutRef.current) {
        window.clearTimeout(rankMoveClearTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const load = async () => {
      if (!roomCode) return

      const response = await apiFetch(`/api/room/${roomCode}/game`)
      if (!response.ok) return

      const data = (await response.json()) as GameResponse
      if (data.ok && data.room) {
        const nextScores =
          data.room.playerScores ??
          (data as { playerScores?: Record<string, number> }).playerScores ??
          {}
        setPlayerScores((prevScores) => {
          const hasPrevious = Object.keys(prevScores).length > 0
          if (!leaderboardAnimationsEnabled) {
            // Keep ticker static until transition overlay window is over.
            setPreviousPlayerScores(nextScores)
            setRankMoveByPlayer({})
            return nextScores
          }

          setPreviousPlayerScores(hasPrevious ? prevScores : nextScores)

          if (!hasPrevious) {
            setRankMoveByPlayer({})
            return nextScores
          }

          const previousOrder = Object.entries(prevScores)
            .sort(([, a], [, b]) => b - a)
            .map(([player]) => player)
          const nextOrder = Object.entries(nextScores)
            .sort(([, a], [, b]) => b - a)
            .map(([player]) => player)

          const previousIndexByPlayer = new Map(previousOrder.map((player, index) => [player, index]))
          const nextMoves: Record<string, 'up' | 'down'> = {}
          nextOrder.forEach((player, nextIndex) => {
            const previousIndex = previousIndexByPlayer.get(player)
            if (previousIndex === undefined || previousIndex === nextIndex) {
              return
            }
            nextMoves[player] = nextIndex < previousIndex ? 'up' : 'down'
          })

          setRankMoveByPlayer(nextMoves)
          if (rankMoveClearTimeoutRef.current) {
            window.clearTimeout(rankMoveClearTimeoutRef.current)
          }
          rankMoveClearTimeoutRef.current = window.setTimeout(() => {
            setRankMoveByPlayer({})
          }, 1200)

          return nextScores
        })
        setGameWinner(data.room.gameWinner)
        setGameWinners(data.room.gameWinners ?? [])
        const hasFinalRound = (data.room.finalRoundPlayers?.length ?? 0) > 0
        setFinalRoundNeeded(hasFinalRound)
        setRound(data.room.round)
        setLastWinner(data.room.lastRoundWinner ?? null)
        setTruceActivated(data.room.truceActivated ?? false)
        setRoundNoParticipation(data.room.roundNoParticipation ?? false)
        
        const needsPitches =
          Boolean(data.room.lastRoundWinner?.pitchId) ||
          (hasFinalRound && Boolean(data.room.finalRoundPlayers))
        if (needsPitches) {
          const pitchesResponse = await apiFetch(`/api/room/${roomCode}/pitches`)
          if (pitchesResponse.ok) {
            const pitchData = (await pitchesResponse.json()) as { ok: boolean; pitches: Pitch[] }
            if (pitchData.ok) {
              const winnerPitch = data.room.lastRoundWinner?.pitchId
                ? pitchData.pitches.find((pitch) => pitch.id === data.room?.lastRoundWinner?.pitchId)
                : null
              setWinnerMustHaveCount(winnerPitch?.usedMustHaves?.length ?? 0)

              if (hasFinalRound && (data.room.gameWinner || data.room.gameWinners) && data.room.finalRoundPlayers) {
                const frPitches = pitchData.pitches.filter((pitch) =>
                  data.room?.finalRoundPlayers?.includes(pitch.player)
                )
                setFinalRoundPitches(frPitches)
              } else {
                setFinalRoundPitches([])
              }
            }
          }
        } else {
          setWinnerMustHaveCount(0)
          setFinalRoundPitches([])
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
      if (data.players && data.room) {
        const nextMascots: Record<string, string> = {}
        data.players.forEach((entry) => {
          if (entry.mascot) {
            nextMascots[entry.name] = entry.mascot
          }
        })
        setPlayerMascots(nextMascots)
        
        // Trigger winner animation after mascots are loaded
        if (data.ok && data.room && data.room.gameWinner && nextMascots[data.room.gameWinner]) {
          setTimeout(() => {
            mascotAnimationRefs.current[`champion-${data.room!.gameWinner}`]?.('win')
          }, 200)
        }
        
        const nextIsHost = data.players.some((entry) =>
          entry.isHost && playerName && entry.name.toLowerCase() === playerName.toLowerCase()
        )
        setIsHost(nextIsHost)
      }
    }

    void load()
    const interval = window.setInterval(load, 2000)
    return () => window.clearInterval(interval)
  }, [roomCode, playerName, navigate, leaderboardAnimationsEnabled])

  useEffect(() => {
    if (!gameWinner && gameWinners.length === 0) {
      return
    }
    const signature = `${gameWinner ?? ''}|${gameWinners.join(',')}|${Object.keys(playerScores).length}`
    if (!signature || animationCycleKeyRef.current === signature) {
      return
    }
    animationCycleKeyRef.current = signature
    const timeout = window.setTimeout(() => {
      Object.keys(playerScores).forEach((player) => {
        const isWinner = gameWinner === player || gameWinners.includes(player)
        const trigger = mascotAnimationRefs.current[`leaderboard-${player}`]
        if (trigger) {
          trigger(isWinner ? 'win' : 'lose-money')
        }
      })
      if (gameWinner) {
        mascotAnimationRefs.current[`champion-${gameWinner}`]?.('win')
      }
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [gameWinner, gameWinners, playerScores])

  useEffect(() => {
    const winnerKey = gameWinner
      ? `single:${gameWinner}`
      : gameWinners.length > 1 && !finalRoundNeeded
        ? `co:${gameWinners.join(',')}`
        : ''
    if (!winnerKey || endGameSoundKeyRef.current === winnerKey) {
      return
    }
    endGameSoundKeyRef.current = winnerKey
    playActionSound('end_game')
  }, [gameWinner, gameWinners, finalRoundNeeded])

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
      const response = await apiFetch(`/api/room/${roomCode}/advance-round`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      const data = (await response.json()) as { ok?: boolean; phase?: string; finalRoundStarted?: boolean }
      if (data.ok || data.phase) {
        playActionSound('start_round')
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
  const winnerExtraConstraintCount = Math.max(0, winnerMustHaveCount - 1)
  const winnerExtraConstraintBonusDollars = winnerExtraConstraintCount * 25
  const winnerCurrentBalanceDollars = lastWinner?.player
    ? Math.round((playerScores[lastWinner.player] ?? 0) * 100)
    : null
  const winnerPreviousBalanceDollars =
    lastWinner?.player && winnerCurrentBalanceDollars !== null
      ? Math.max(0, Math.round(((playerScores[lastWinner.player] ?? 0) - lastWinner.pointsAwarded) * 100))
      : null
  const winnerTickerPreviousDollars =
    leaderboardAnimationsEnabled && winnerPreviousBalanceDollars !== null
      ? winnerPreviousBalanceDollars
      : winnerCurrentBalanceDollars
  const winnerBonusItems = useMemo(() => {
    const items: string[] = []
    if (lastWinner?.penguinSurpriseWinner) {
      items.push('⭐ TWIST bonus (+$100)')
    }
    if (winnerExtraConstraintCount > 0) {
      items.push(
        `✅ CONSTRAINT bonus (+$${winnerExtraConstraintBonusDollars}) for ${winnerExtraConstraintCount} extra card${winnerExtraConstraintCount === 1 ? '' : 's'}`
      )
    }
    return items
  }, [
    lastWinner?.penguinSurpriseWinner,
    winnerExtraConstraintCount,
    winnerExtraConstraintBonusDollars
  ])

  useEffect(() => {
    if (!leaderboardAnimationsEnabled || !lastWinner?.player) {
      setVisibleWinnerBonusCount(0)
      setShowWinnerScoreTicker(false)
      return
    }

    setVisibleWinnerBonusCount(0)
    setShowWinnerScoreTicker(false)
    const timers: number[] = []
    const stepMs = 420
    winnerBonusItems.forEach((_, index) => {
      const timer = window.setTimeout(() => {
        setVisibleWinnerBonusCount(index + 1)
      }, (index + 1) * stepMs)
      timers.push(timer)
    })
    const tickerTimer = window.setTimeout(() => {
      setShowWinnerScoreTicker(true)
    }, winnerBonusItems.length * stepMs + 220)
    timers.push(tickerTimer)

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [leaderboardAnimationsEnabled, lastWinner?.player, winnerBonusItems])

  const mascotBadgeStyle: CSSProperties = {
    width: '34px',
    height: '34px',
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
        <span style={mascotBadgeStyle} className="phase-mascot-wrap phase-mascot-wrap--results">
          <AnimatedMascot
            src={getMascotImage(playerMascots[gameWinner]) ?? ''}
            alt={playerMascots[gameWinner]}
            character={playerMascots[gameWinner]}
            width="26px"
            height="26px"
            className="phase-mascot"
            setAnimationTrigger={(trigger) => {
              mascotAnimationRefs.current[`champion-${gameWinner}`] = trigger
            }}
          />
        </span>
      )}
      <span style={{ fontWeight: 600 }}>{gameWinner}</span>
    </span>
  ) : null
  const endGameCelebration = Boolean(gameWinner || (gameWinners.length > 1 && !finalRoundNeeded))
  const confettiPalette = useMemo(() => {
    if (gameWinner) {
      return [getMascotColor(playerMascots[gameWinner])]
    }
    if (gameWinners.length > 1) {
      const colors = gameWinners.map((winner) => getMascotColor(playerMascots[winner]))
      return colors.length > 0 ? colors : ['#f5b544']
    }
    return ['#f5b544']
  }, [gameWinner, gameWinners, playerMascots])
  const confettiPieces = useMemo(
    () =>
      Array.from({ length: 80 }, (_, index) => ({
        id: index,
        left: Math.random() * 100,
        delay: Math.random() * 0.9,
        duration: 2.7 + Math.random() * 2.2,
        drift: (Math.random() - 0.5) * 140,
        rotate: Math.random() * 360,
        color: confettiPalette[index % confettiPalette.length] ?? '#f5b544',
      })),
    [confettiPalette]
  )
  const billRainPieces = useMemo(
    () =>
      Array.from({ length: 32 }, (_, index) => ({
        id: index,
        left: Math.random() * 100,
        delay: Math.random() * 1.1,
        duration: 3.4 + Math.random() * 2.4,
        drift: (Math.random() - 0.5) * 180,
        sway: 14 + Math.random() * 18,
        rotation: (Math.random() - 0.5) * 36,
        scale: 0.82 + Math.random() * 0.48,
      })),
    []
  )

  return (
    <>
      {endGameCelebration && (
        <>
          <div className="confetti-overlay" aria-hidden>
            {confettiPieces.map((piece) => (
              <span
                key={piece.id}
                className="confetti-piece"
                style={{
                  left: `${piece.left}%`,
                  top: '-12vh',
                  backgroundColor: piece.color,
                  animationDelay: `${piece.delay}s`,
                  animationDuration: `${piece.duration}s`,
                  ['--confetti-drift' as string]: `${piece.drift}px`,
                  rotate: `${piece.rotate}deg`,
                }}
              />
            ))}
          </div>
          <div className="money-rain-overlay" aria-hidden>
            {billRainPieces.map((piece) => (
              <span
                key={piece.id}
                className="money-bill"
                style={{
                  left: `${piece.left}%`,
                  top: '-14vh',
                  animationDelay: `${piece.delay}s`,
                  animationDuration: `${piece.duration}s`,
                  ['--bill-drift' as string]: `${piece.drift}px`,
                  ['--bill-sway' as string]: `${piece.sway}px`,
                  ['--bill-rotation' as string]: `${piece.rotation}deg`,
                  ['--bill-scale' as string]: `${piece.scale}`,
                }}
              >
                <span className="money-bill-symbol">$</span>
              </span>
            ))}
          </div>
        </>
      )}
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
            ) : roundNoParticipation ? (
              'No Winner This Round 😢'
            ) : (
              'Round Results'
            )}
          </h1>
          <p>
            {gameWinner ? (
              <span> Congrats {gameWinnerLabel} for winning the game.</span>
            ) : gameWinners.length > 1 && !finalRoundNeeded ? (
              <span>Multiple players finished with the highest score: {gameWinners.join(', ')}!</span>
            ) : finalRoundNeeded ? (
              <span>The top players will compete in a final round to determine the ultimate winner!</span>
            ) : roundNoParticipation ? (
              <span>Nobody won this round because all pitch submissions were empty.</span>
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
            {roundNoParticipation ? (
              <span style={{ fontWeight: 600 }}>No winner this round</span>
            ) : lastWinner?.player ? (
              <>
                {playerMascots[lastWinner.player] && (
                  <span style={mascotBadgeStyle} className="phase-mascot-wrap phase-mascot-wrap--results">
                    <AnimatedMascot
                      src={getMascotImage(playerMascots[lastWinner.player]) ?? ''}
                      alt={playerMascots[lastWinner.player]}
                      character={playerMascots[lastWinner.player]}
                      width="24px"
                      height="24px"
                      className="phase-mascot"
                    />
                  </span>
                )}
                <span style={{ fontWeight: 600 }}>{lastWinner.player}</span>
              </>
            ) : champion ? (
              <>
                {playerMascots[champion[0]] && (
                  <span style={mascotBadgeStyle} className="phase-mascot-wrap phase-mascot-wrap--results">
                    <AnimatedMascot
                      src={getMascotImage(playerMascots[champion[0]]) ?? ''}
                      alt={playerMascots[champion[0]]}
                      character={playerMascots[champion[0]]}
                      width="24px"
                      height="24px"
                      className="phase-mascot"
                      setAnimationTrigger={(trigger) => {
                        mascotAnimationRefs.current[`champion-${champion[0]}`] = trigger
                      }}
                    />
                  </span>
                )}
                <span style={{ fontWeight: 600 }}>{champion[0]}</span>
              </>
            ) : (
              'TBD'
            )}
          </div>
          {roundNoParticipation && (
            <p style={{ marginTop: '8px' }}>
              Nobody participated, so all pitches were discarded and no earnings were awarded.
            </p>
          )}
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
          {champion && !lastWinner && !roundNoParticipation && (
            <p style={{ marginTop: '8px' }}>with ${champion[1] * 100}</p>
          )}
          {winnerBonusItems.map((bonusText, index) => {
            const visible = index < visibleWinnerBonusCount
            return (
              <p
                key={bonusText}
                style={{
                  marginTop: '8px',
                  color: bonusText.includes('TWIST') ? '#d4a574' : '#2d7c2d',
                  opacity: visible ? 1 : 0,
                  transform: visible ? 'translateY(0)' : 'translateY(6px)',
                  transition: 'opacity 320ms ease, transform 320ms ease'
                }}
              >
                {bonusText}
              </p>
            )
          })}
          {showWinnerScoreTicker && lastWinner?.player && winnerCurrentBalanceDollars !== null && winnerPreviousBalanceDollars !== null && (
            <div style={{ marginTop: '10px' }}>
              <span style={{ fontSize: '0.9rem', color: '#6b6056' }}>Winner balance: </span>
              <ScoreTicker
                previous={winnerTickerPreviousDollars ?? winnerCurrentBalanceDollars}
                current={winnerCurrentBalanceDollars}
                type="gain"
              />
            </div>
          )}
        </div>

        <div className="panel">
          <h3>{gameWinner || gameWinners.length > 0 ? 'Final Earnings' : 'Leaderboard'}</h3>
          {gameWinner || gameWinners.length > 0 ? (
            // Bar chart for game end
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {Object.entries(playerScores ?? {})
                .sort(([, a], [, b]) => b - a)
                .map(([player, score], index) => {
                  const maxScore = Math.max(...Object.values(playerScores ?? {}))
                  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0
                  const isWinner = gameWinner === player || gameWinners.includes(player)

                  const getMedalEmoji = (placement: number) => {
                    // Find the actual rank considering ties
                    const sortedScores = Object.entries(playerScores ?? {})
                      .sort(([, a], [, b]) => b - a)
                    
                    let actualRank = 0
                    let currentScore = maxScore
                    
                    for (let i = 0; i < sortedScores.length; i++) {
                      if (sortedScores[i][1] !== currentScore) {
                        actualRank = i
                        currentScore = sortedScores[i][1]
                      }
                      if (i === placement) {
                        break
                      }
                    }
                    
                    if (actualRank === 0) return '🥇'
                    if (actualRank === 1) return '🥈'
                    if (actualRank === 2) return '🥉'
                    return null
                  }
                  
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
                          {getMedalEmoji(index) && (
                            <span style={{ fontSize: '1.4rem' }}>
                              {getMedalEmoji(index)}
                            </span>
                          )}
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
                              <AnimatedMascot
                                src={getMascotImage(playerMascots[player]) ?? ''}
                                alt={playerMascots[player]}
                                character={playerMascots[player]}
                                width="24px"
                                height="24px"
                                className="phase-mascot"
                                setAnimationTrigger={(trigger) => {
                                  mascotAnimationRefs.current[`leaderboard-${player}`] = trigger
                                }}
                              />
                            </div>
                          )}
                          <span style={{ fontWeight: isWinner ? 700 : 600 }}>
                            {player} {isWinner && '👑'}
                          </span>
                          {rankMoveByPlayer[player] === 'up' && (
                            <span className="badge score-move-up">↑ Up</span>
                          )}
                          {rankMoveByPlayer[player] === 'down' && (
                            <span className="badge score-move-down">↓ Down</span>
                          )}
                        </div>
                        <ScoreTicker
                          previous={Math.round((previousPlayerScores[player] ?? score) * 100)}
                          current={Math.round(score * 100)}
                          type={score >= (previousPlayerScores[player] ?? score) ? 'gain' : 'loss'}
                        />
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
                  className={
                    rankMoveByPlayer[player] === 'up'
                      ? 'leaderboard-row-up'
                      : rankMoveByPlayer[player] === 'down'
                        ? 'leaderboard-row-down'
                        : ''
                  }
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
                        <AnimatedMascot
                          src={getMascotImage(playerMascots[player]) ?? ''}
                          alt={playerMascots[player]}
                          character={playerMascots[player]}
                          width="34px"
                          height="34px"
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
                  <ScoreTicker
                    previous={Math.round((previousPlayerScores[player] ?? score) * 100)}
                    current={Math.round(score * 100)}
                    type={score >= (previousPlayerScores[player] ?? score) ? 'gain' : 'loss'}
                  />
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
                        <span style={mascotBadgeStyle} className="phase-mascot-wrap phase-mascot-wrap--results">
                          <AnimatedMascot
                            src={getMascotImage(playerMascots[pitch.player]) ?? ''}
                            alt={playerMascots[pitch.player]}
                            character={playerMascots[pitch.player]}
                            width="22px"
                            height="22px"
                            className="phase-mascot"
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
                        <strong>CONSTRAINTS:</strong> {pitch.usedMustHaves.join(', ')}
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
        ) : roundNoParticipation ? (
          <p>
            No one participated this round. Waiting for the host to start the next round to continue the game.
          </p>
        ) : (
          <p>
            Prepare for the next round! A new Penguin will be chosen, fresh PROBLEM cards will be dealt, and you'll compete again.
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
