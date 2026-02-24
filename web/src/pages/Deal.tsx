import type { CSSProperties } from 'react'
import { apiFetch } from '../utils/api'
import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getMascotImage } from '../utils/mascots'
import LeaderboardModal from '../components/LeaderboardModal'
import { AnimatedMascot } from '../components/AnimatedMascot'
import type { MascotEvent } from '../hooks/useAnimationTrigger'
import { playPhaseSound } from '../utils/soundEffects'
import penguinSVG from '../assets/penguin.svg'

type GameResponse = {
  ok: boolean
  room?: {
    penguin: string
    round: number
    phase?: string
    askOptions: string[]
    selectedAsk: string | null
    penguinAskTimerSeconds: number
    askSelectionExpiresAt?: number | null
    serverNow?: number
  }
  mustHavesByPlayer?: Record<string, string[]>
  surpriseByPlayer?: Record<string, string | null>
  players?: Array<{ name: string; isHost: boolean; mascot?: string }>
}

export default function Deal() {
  const { code } = useParams()
  const navigate = useNavigate()
  const [askOptions, setAskOptions] = useState<string[]>([])
  const [selectedAsk, setSelectedAsk] = useState<string | null>(null)
  const [penguin, setPenguin] = useState('')
  const [round, setRound] = useState(0)
  const [mustHaves, setMustHaves] = useState<string[]>([])
  const [surprise, setSurprise] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [selectedOption, setSelectedOption] = useState('')
  const [customProblem, setCustomProblem] = useState('')
  const [askError, setAskError] = useState('')
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [clockOffsetMs, setClockOffsetMs] = useState(0)
  const [allPlayers, setAllPlayers] = useState<Array<{ name: string; mascot?: string }>>([])
  const [hoveredPlayer, setHoveredPlayer] = useState<string | null>(null)
  const mascotAnimationRefs = useRef<Record<string, (event: MascotEvent) => void>>({})

  const roomCode = code ?? localStorage.getItem('pp:lastRoom') ?? ''
  const playerName = roomCode ? localStorage.getItem(`pp:player:${roomCode}`) ?? '' : ''

  useEffect(() => {
    playPhaseSound('deal')
  }, [])

  const load = async () => {
    if (!roomCode) {
      return
    }
    setStatus('loading')
    const response = await apiFetch(`/api/room/${roomCode}/game`)
    const data = (await response.json()) as GameResponse
    if (!data.ok || !data.room) {
      setStatus('error')
      return
    }
    setPenguin(data.room.penguin)
    setRound(data.room.round)
    const offsetMs =
      typeof data.room.serverNow === 'number' ? data.room.serverNow - Date.now() : clockOffsetMs
    setClockOffsetMs(offsetMs)
    if (data.room.phase && data.room.phase !== 'deal') {
      const nextPath =
        data.room.phase === 'pitch'
          ? '/pitch'
          : data.room.phase === 'reveal'
            ? '/reveal'
            : data.room.phase === 'results'
              ? '/results'
              : '/deal'
      navigate(nextPath, { replace: true })
      return
    }
    setAskOptions(data.room.askOptions)
    setSelectedAsk(data.room.selectedAsk)
    if (data.room.askSelectionExpiresAt) {
      const remaining = Math.max(
        0,
        Math.ceil((data.room.askSelectionExpiresAt - (Date.now() + offsetMs)) / 1000)
      )
      setSecondsLeft(remaining)
    } else {
      setSecondsLeft(null)
    }
    if (playerName) {
      setMustHaves(data.mustHavesByPlayer?.[playerName] ?? [])
      setSurprise(data.surpriseByPlayer?.[playerName] ?? null)
    }
    if (data.players) {
      setAllPlayers(data.players.map((p) => ({ name: p.name, mascot: p.mascot })))
    }
    setStatus('idle')
  }

  useEffect(() => {
    void load()
    const interval = window.setInterval(load, 1000)
    return () => window.clearInterval(interval)
  }, [navigate])

  useEffect(() => {
    if (!hoveredPlayer) {
      allPlayers.forEach((player) => {
        mascotAnimationRefs.current[player.name]?.('idle')
      })
      return
    }
    allPlayers.forEach((player) => {
      const trigger = mascotAnimationRefs.current[player.name]
      if (!trigger) return
      if (player.name === hoveredPlayer) {
        trigger('select')
      } else {
        trigger('idle')
      }
    })
  }, [hoveredPlayer, allPlayers])

  const handleSelectAsk = async () => {
    if (!roomCode || !selectedOption) {
      return
    }
    setAskError('')
    const askToSubmit =
      selectedOption === '__custom__' ? customProblem.trim() : selectedOption
    if (!askToSubmit) {
      return
    }
    const response = await apiFetch(`/api/room/${roomCode}/select-ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ask: askToSubmit, playerName })
    })
    const data = (await response.json()) as { ok: boolean; message?: string }
    if (!data.ok) {
      setAskError(data.message ?? 'Could not lock this PROBLEM.')
      return
    }
    await load()
  }

  const handleSkipTimer = async () => {
    if (!roomCode) {
      return
    }
    setAskError('')
    const trimmedCustom = customProblem.trim()
    const askToSubmit =
      selectedOption === '__custom__' && trimmedCustom.length > 0
        ? trimmedCustom
        : selectedOption && selectedOption !== '__custom__'
          ? selectedOption
          : askOptions[0]
    const response = await apiFetch(`/api/room/${roomCode}/select-ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ask: askToSubmit, playerName })
    })
    const data = (await response.json()) as { ok: boolean; message?: string }
    if (!data.ok) {
      setAskError(data.message ?? 'Could not skip timer.')
      return
    }
    await load()
  }

  const isPenguin = penguin && playerName && penguin.toLowerCase() === playerName.toLowerCase()
  const canUseCustomProblem = isPenguin
  const mustHavesRevealed = !!selectedAsk
  const penguinPlayer = allPlayers.find((player) => player.name === penguin)
  const penguinMascotImg = getMascotImage(penguinPlayer?.mascot)
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

  return (
    <>
      <section className="page-header">
        <div>
          <div className="eyebrow">Round {round + 1}: The Deal</div>
          <LeaderboardModal roomCode={roomCode} />
          <h1>
            {isPenguin ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <span style={mascotBadgeStyle}>
                  <img src={penguinSVG} alt="" style={{ width: '20px', height: '20px' }} />
                </span>
                <span>You are the Penguin</span>
              </span>
            ) : (
              'Wait Your Turn'
            )}
          </h1>
          <p>
            {isPenguin ? (
              'Choose 1 of 3 PROBLEM cards or write your own custom PROBLEM. Other players get 4 CONSTRAINTS.'
            ) : (
              <span>
                The Penguin{' '}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <span style={mascotBadgeStyle}>
                    <img src={penguinSVG} alt="" style={{ width: '18px', height: '18px' }} />
                  </span>
                  {penguinMascotImg && (
                    <span style={mascotBadgeStyle} className="phase-mascot-wrap phase-mascot-wrap--deal">
                      <AnimatedMascot
                        src={penguinMascotImg}
                        character={penguinPlayer?.mascot}
                        width="22px"
                        height="22px"
                        className="phase-mascot"
                      />
                    </span>
                  )}
                  <span>{penguin}</span>
                </span>{' '}
                is selecting the PROBLEM card. Your CONSTRAINTS will be revealed next.
              </span>
            )}
          </p>
        </div>
        <div className="panel">
          <h3>{isPenguin ? 'Make Your Pick' : 'Reveals In'}</h3>
          <div className="timer">{secondsLeft ?? '--'}s</div>
          {secondsLeft !== null && secondsLeft <= 5 && (
            <p style={{ marginTop: '8px', color: '#d4a574' }}>⏰ Time running out</p>
          )}
        </div>
      </section>

      <section className="split">
        <div className="panel">
          <h3>PROBLEM Cards (Pick 1)</h3>
          {isPenguin ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {askOptions.map((ask, index) => (
                  <label
                    key={ask}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      padding: '12px',
                      borderRadius: '8px',
                      backgroundColor:
                        selectedOption === ask ? 'rgba(100, 200, 100, 0.15)' : '#f5f5f5',
                      border:
                        selectedOption === ask ? '2px solid #4a7c4e' : '1px solid #ddd',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                      <input
                        type="radio"
                        name="ask"
                        value={ask}
                        checked={selectedOption === ask}
                        onChange={() => setSelectedOption(ask)}
                        style={{ marginRight: '12px', marginTop: '2px' }}
                      />
                      <div>
                        <strong>Card {index + 1}</strong>
                        <p style={{ margin: '6px 0', fontSize: '0.95rem' }}>"{ask}"</p>
                      </div>
                    </div>
                  </label>
                ))}
                {canUseCustomProblem && (
                  <label
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      padding: '12px',
                      borderRadius: '8px',
                      backgroundColor:
                        selectedOption === '__custom__' ? 'rgba(100, 200, 100, 0.15)' : '#f5f5f5',
                      border:
                        selectedOption === '__custom__' ? '2px solid #4a7c4e' : '1px solid #ddd',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                      <input
                        type="radio"
                        name="ask"
                        value="__custom__"
                        checked={selectedOption === '__custom__'}
                        onChange={() => setSelectedOption('__custom__')}
                        style={{ marginRight: '12px', marginTop: '2px' }}
                      />
                      <div style={{ width: '100%' }}>
                        <strong>Custom PROBLEM (Walrus)</strong>
                        <textarea
                          value={customProblem}
                          onChange={(event) => {
                            setCustomProblem(event.target.value)
                            setSelectedOption('__custom__')
                            setAskError('')
                          }}
                          placeholder="Write your own PROBLEM card..."
                          rows={3}
                          maxLength={180}
                          style={{
                            width: '100%',
                            marginTop: '8px',
                            borderRadius: '8px',
                            border: '1px solid #d6d0c8',
                            padding: '8px',
                            fontFamily: 'inherit',
                            fontSize: '0.9rem',
                            resize: 'vertical',
                          }}
                        />
                        <span style={{ fontSize: '0.8rem', color: '#666' }}>
                          1-180 characters
                        </span>
                      </div>
                    </div>
                  </label>
                )}
              </div>
              <div className="footer-actions" style={{ marginTop: '16px' }}>
                <button
                  className="button"
                  onClick={handleSelectAsk}
                  disabled={!selectedOption || (selectedOption === '__custom__' && customProblem.trim().length === 0)}
                >
                  Lock This PROBLEM
                </button>
                <button className="button secondary" onClick={handleSkipTimer}>
                  Skip Timer
                </button>
              </div>
              {askError && (
                <p style={{ marginTop: '10px', color: '#8c2d2a' }}>{askError}</p>
              )}
            </>
          ) : (
            <div className="card">
              {selectedAsk ? (
                <>
                  <strong>Today's Challenge</strong>
                  <span>"{selectedAsk}"</span>
                  <p style={{ marginTop: '12px', fontSize: '0.9rem', color: '#666' }}>
                    Prepare to pitch. CONSTRAINTS are now visible.
                  </p>
                </>
              ) : (
                <>
                  <strong>Waiting for PROBLEM...</strong>
                  <span>The Penguin is reviewing the 3 PROBLEM options.</span>
                </>
              )}
            </div>
          )}
        </div>

        {!isPenguin && (
          <div className="panel">
            <h3>Your CONSTRAINTS</h3>
            <p style={{ marginTop: '6px', fontSize: '0.9rem', color: '#666' }}>
              Use at least 1 in your pitch answer.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
              {mustHavesRevealed && mustHaves.length > 0 ? (
                mustHaves.map((card) => (
                  <div
                    key={card}
                    style={{
                      padding: '12px',
                      backgroundColor: '#f0f8ff',
                      borderLeft: '4px solid #4169e1',
                      borderRadius: '4px',
                    }}
                  >
                    <strong>{card}</strong>
                  </div>
                ))
              ) : (
                [1, 2, 3, 4].map((placeholder) => (
                  <div
                    key={placeholder}
                    style={{
                      padding: '12px',
                      backgroundColor: '#f5f5f5',
                      borderRadius: '4px',
                      textAlign: 'center',
                      color: '#999',
                    }}
                  >
                    🔒 Face Down
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </section>

      <section className="panel">
        <h3>⭐ TWIST (Secret)</h3>
        <div
          style={{
            padding: '12px',
            backgroundColor: surprise ? '#d4a57480' : '#f5f5f5',
            borderRadius: '8px',
            borderLeft: surprise ? '4px solid #d4a574' : 'none',
          }}
        >
          {surprise ? (
            <>
              <strong>You have a Twist!</strong>
              <p style={{ margin: '8px 0', fontSize: '0.95rem' }}>
                You have been assigned a TWIST! It will be revealed in the Pitch phase.
              </p>
              <p style={{ fontSize: '0.85rem', color: '#666', margin: '8px 0' }}>
                Keep it secret for now. If you win while using it, you get a $100 bonus.
              </p>
            </>
          ) : (
            <>
              <strong>Random draw pending: </strong>
              <span>One player (not you) gets a secret twist. Might be you on next round!</span>
            </>
          )}
        </div>
      </section>

      <section className="panel">
        <h3>Penguin Order</h3>
        <p style={{ marginBottom: '12px' }}>
          After this round, the Penguin role rotates to the next player in line.
        </p>
        <ul className="list">
          {allPlayers.map((player) => {
            const mascotImg = getMascotImage(player.mascot)
            const isHovered = hoveredPlayer === player.name
            return (
              <li
                key={player.name}
                style={{
                  fontWeight: player.name === penguin ? 'bold' : 'normal',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  cursor: 'pointer',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  transition: 'background-color 0.2s',
                  backgroundColor: isHovered ? 'rgba(100, 200, 100, 0.1)' : 'transparent',
                }}
                onMouseEnter={() => setHoveredPlayer(player.name)}
                onMouseLeave={() => setHoveredPlayer(null)}
              >
                {player.name === penguin && (
                  <span style={mascotBadgeStyle}>
                    <img src={penguinSVG} alt="" style={{ width: '20px', height: '20px' }} />
                  </span>
                )}
                {mascotImg && (
                  <span style={mascotBadgeStyle} className="phase-mascot-wrap phase-mascot-wrap--deal">
                    <AnimatedMascot
                      src={mascotImg}
                      character={player.mascot}
                      width="24px"
                      height="24px"
                      className="phase-mascot"
                      setAnimationTrigger={(trigger) => {
                        mascotAnimationRefs.current[player.name] = trigger
                      }}
                    />
                  </span>
                )}
                <span>{player.name}</span>
              </li>
            )
          })}
        </ul>
      </section>

      {status === 'error' && (
        <section className="panel" style={{ backgroundColor: '#ffe0e0' }}>
          <p style={{ color: '#8c2d2a' }}>Unable to load round state. Try refreshing.</p>
        </section>
      )}
    </>
  )
}
