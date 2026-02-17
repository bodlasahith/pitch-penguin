import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getMascotImage } from '../utils/mascots'
import walrusSVG from '../assets/walrus.svg'

type GameResponse = {
  ok: boolean
  room?: {
    walrus: string
    round: number
    phase?: string
    askOptions: string[]
    selectedAsk: string | null
    walrusAskTimerSeconds: number
    askSelectionExpiresAt?: number | null
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
  const [walrus, setWalrus] = useState('')
  const [round, setRound] = useState(0)
  const [mustHaves, setMustHaves] = useState<string[]>([])
  const [surprise, setSurprise] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [selectedOption, setSelectedOption] = useState('')
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [allPlayers, setAllPlayers] = useState<Array<{ name: string; mascot?: string }>>([])

  const roomCode = code ?? localStorage.getItem('bw:lastRoom') ?? ''
  const playerName = roomCode ? localStorage.getItem(`bw:player:${roomCode}`) ?? '' : ''

  const load = async () => {
    if (!roomCode) {
      return
    }
    setStatus('loading')
    const response = await fetch(`/api/room/${roomCode}/game`)
    const data = (await response.json()) as GameResponse
    if (!data.ok || !data.room) {
      setStatus('error')
      return
    }
    setWalrus(data.room.walrus)
    setRound(data.room.round)
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
        Math.ceil((data.room.askSelectionExpiresAt - Date.now()) / 1000)
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

  const handleSelectAsk = async () => {
    if (!roomCode || !selectedOption) {
      return
    }
    await fetch(`/api/room/${roomCode}/select-ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ask: selectedOption })
    })
    await load()
  }

  const handleSkipTimer = async () => {
    if (!roomCode) {
      return
    }
    await fetch(`/api/room/${roomCode}/select-ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ask: selectedOption || askOptions[0] })
    })
    await load()
  }

  const isWalrus = walrus && playerName && walrus.toLowerCase() === playerName.toLowerCase()
  const mustHavesRevealed = !!selectedAsk
  const walrusPlayer = allPlayers.find((player) => player.name === walrus)
  const walrusMascotImg = getMascotImage(walrusPlayer?.mascot)
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
          <h1>
            {isWalrus ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <span style={mascotBadgeStyle}>
                  <img src={walrusSVG} alt="" style={{ width: '20px', height: '20px' }} />
                </span>
                <span>You are the Walrus</span>
              </span>
            ) : (
              'Wait Your Turn'
            )}
          </h1>
          <p>
            {isWalrus ? (
              'Choose 1 of 3 ASK cards for this round. Other players get 4 MUST HAVEs.'
            ) : (
              <span>
                The Walrus{' '}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <span style={mascotBadgeStyle}>
                    <img src={walrusSVG} alt="" style={{ width: '18px', height: '18px' }} />
                  </span>
                  {walrusMascotImg && (
                    <span style={mascotBadgeStyle}>
                      <img src={walrusMascotImg} alt="" style={{ width: '18px', height: '18px' }} />
                    </span>
                  )}
                  <span>{walrus}</span>
                </span>{' '}
                is selecting the ASK card. Your MUST HAVEs will be revealed next.
              </span>
            )}
          </p>
        </div>
        <div className="panel">
          <h3>{isWalrus ? 'Make Your Pick' : 'Reveals In'}</h3>
          <div className="timer">{secondsLeft ?? '--'}s</div>
          {secondsLeft !== null && secondsLeft <= 5 && (
            <p style={{ marginTop: '8px', color: '#d4a574' }}>⏰ Time running out</p>
          )}
        </div>
      </section>

      <section className="split">
        <div className="panel">
          <h3>ASK Cards (Pick 1)</h3>
          {isWalrus ? (
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
              </div>
              <div className="footer-actions" style={{ marginTop: '16px' }}>
                <button
                  className="button"
                  onClick={handleSelectAsk}
                  disabled={!selectedOption}
                >
                  Lock This ASK
                </button>
                <button className="button secondary" onClick={handleSkipTimer}>
                  Skip Timer
                </button>
              </div>
            </>
          ) : (
            <div className="card">
              {selectedAsk ? (
                <>
                  <strong>Today's Challenge</strong>
                  <span>"{selectedAsk}"</span>
                  <p style={{ marginTop: '12px', fontSize: '0.9rem', color: '#666' }}>
                    Prepare to pitch. MUST HAVEs are now visible.
                  </p>
                </>
              ) : (
                <>
                  <strong>Waiting for ASK...</strong>
                  <span>The Walrus is reviewing the 3 ASK options.</span>
                </>
              )}
            </div>
          )}
        </div>

        {!isWalrus && (
          <div className="panel">
            <h3>Your MUST HAVEs</h3>
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
        <h3>⭐ Walrus Surprise (Secret)</h3>
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
              <p style={{ margin: '8px 0', fontSize: '0.95rem' }}>{surprise}</p>
              <p style={{ fontSize: '0.85rem', color: '#666', margin: '8px 0' }}>
                Use this in your pitch for bonus points if you win!
              </p>
            </>
          ) : (
            <>
              <strong>Random draw pending</strong>
              <span>One player (not you) gets a secret twist. Might be you on next round!</span>
            </>
          )}
        </div>
      </section>

      <section className="panel">
        <h3>Walrus Order</h3>
        <p style={{ marginBottom: '12px' }}>
          After this round, the Walrus role rotates to the next player in line.
        </p>
        <ul className="list">
          {allPlayers.map((player) => {
            const mascotImg = getMascotImage(player.mascot)
            return (
              <li key={player.name} style={{ fontWeight: player.name === walrus ? 'bold' : 'normal', display: 'flex', alignItems: 'center', gap: '10px' }}>
                {player.name === walrus && (
                  <span style={mascotBadgeStyle}>
                    <img src={walrusSVG} alt="" style={{ width: '20px', height: '20px' }} />
                  </span>
                )}
                {mascotImg && (
                  <span style={mascotBadgeStyle}>
                    <img src={mascotImg} alt="" style={{ width: '20px', height: '20px' }} />
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
