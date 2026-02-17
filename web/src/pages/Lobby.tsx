import type { CSSProperties } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getMascotColor, getMascotImage, getMascotName } from '../utils/mascots'

import rocketSVG from '../assets/rocket.svg'
import chartSVG from '../assets/chart.svg'
import gremlinSVG from '../assets/gremlin.svg'
import penguinSVG from '../assets/penguin.svg'
import goblinSVG from '../assets/goblin.svg'
import robotSVG from '../assets/robot.svg'
import unicornSVG from '../assets/unicorn.svg'
import sharkSVG from '../assets/shark.svg'
import octopusSVG from '../assets/octopus.svg'
import llamaSVG from '../assets/llama.svg'
import hamsterSVG from '../assets/hamster.svg'
import blobSVG from '../assets/blob.svg'
import raccoonSVG from '../assets/raccoon.svg'

type RoomResponse = {
  ok: boolean
  code?: string
  status?: string
  players?: {
    name: string
    isHost: boolean
    mascot?: string
  }[]
  capacity?: number
  message?: string
  walrus?: string
}

type GameResponse = {
  ok: boolean
  room?: {
    robotVoiceEnabled: boolean
    phase?: string
  }
}

export default function Lobby() {
  const navigate = useNavigate()
  const { code } = useParams()
  const [players, setPlayers] = useState<RoomResponse['players']>([])
  const [roomStatus, setRoomStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading'
  )
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>(
    'idle'
  )
  const [capacity, setCapacity] = useState(8)
  const [leaveStatus, setLeaveStatus] = useState<'idle' | 'leaving' | 'error'>(
    'idle'
  )
  const [robotVoiceEnabled, setRobotVoiceEnabled] = useState(true)
  const [phase, setPhase] = useState('lobby')
  const [hostName, setHostName] = useState('')
  const [hostChanged, setHostChanged] = useState(false)
  const [activityLog, setActivityLog] = useState<string[]>([])
  const [selectedMascot, setSelectedMascot] = useState('')
  const previousPlayers = useRef<string[]>([])
  
  const mascotOptions = [
    { name: 'Rocket CEO', id: 'rocket', svg: rocketSVG },
    { name: 'Chart Wizard', id: 'chart', svg: chartSVG },
    { name: 'Idea Gremlin', id: 'gremlin', svg: gremlinSVG },
    { name: 'Corporate Penguin', id: 'penguin', svg: penguinSVG },
    { name: 'Growth Goblin', id: 'goblin', svg: goblinSVG },
    { name: 'AI Founder Bot', id: 'robot', svg: robotSVG },
    { name: 'Unicorn Founder', id: 'unicorn', svg: unicornSVG },
    { name: 'VC Shark', id: 'shark', svg: sharkSVG },
    { name: 'Multitasking Octo-Founder', id: 'octopus', svg: octopusSVG },
    { name: 'Hyper Influencer Llama', id: 'llama', svg: llamaSVG },
    { name: 'Hustler Hamster', id: 'hamster', svg: hamsterSVG },
    { name: 'Brainstorm Blob', id: 'blob', svg: blobSVG },
    { name: 'Crypto Raccoon', id: 'raccoon', svg: raccoonSVG }
  ]

  useEffect(() => {
    let refreshId: number | undefined

    const load = async () => {
      if (!code) {
        setRoomStatus('error')
        return
      }
      const response = await fetch(`/api/room/${code}`)
      const data = (await response.json()) as RoomResponse
      if (!data.ok || !data.players) {
        setRoomStatus('error')
        return
      }
      const storedName = localStorage.getItem(`bw:player:${code}`) ?? ''
      if (storedName) {
        const exists = data.players.some(
          (player) => player.name.toLowerCase() === storedName.toLowerCase()
        )
        if (!exists) {
          await fetch('/api/rooms/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, playerName: storedName })
          })
        }
      }

      const gameResponse = await fetch(`/api/room/${code}/game`)
      const gameData = (await gameResponse.json()) as GameResponse
      if (gameData.ok && gameData.room) {
        setRobotVoiceEnabled(gameData.room.robotVoiceEnabled)
        const nextPhase = gameData.room.phase ?? 'lobby'
        setPhase(nextPhase)
        if (nextPhase !== 'lobby') {
          const nextPath =
            nextPhase === 'deal'
              ? '/deal'
              : nextPhase === 'pitch'
                ? '/pitch'
                : nextPhase === 'reveal'
                  ? '/reveal'
                  : nextPhase === 'results'
                    ? '/results'
                    : '/deal'
          navigate(nextPath)
          return
        }
      }

      const nextPlayers = data.players.map((player) => player.name)
      const previous = previousPlayers.current
      const joined = nextPlayers.filter(
        (name) => !previous.some((prev) => prev.toLowerCase() === name.toLowerCase())
      )
      const left = previous.filter(
        (name) => !nextPlayers.some((next) => next.toLowerCase() === name.toLowerCase())
      )
      if (joined.length > 0) {
        const [first] = joined
        const message =
          joined.length === 1
            ? `${first} joined the room.`
            : `${first} and ${joined.length - 1} others joined the room.`
        setActivityLog((previousLog) => [message, ...previousLog].slice(0, 5))
      } else if (left.length > 0) {
        const [first] = left
        const message =
          left.length === 1
            ? `${first} left the room.`
            : `${first} and ${left.length - 1} others left the room.`
        setActivityLog((previousLog) => [message, ...previousLog].slice(0, 5))
      }
      previousPlayers.current = nextPlayers

      const host = data.players.find((player) => player.isHost)?.name ?? ''
      if (host && hostName && host !== hostName) {
        setHostChanged(true)
        window.setTimeout(() => setHostChanged(false), 2500)
      }
      if (host) {
        setHostName(host)
      }

      setPlayers(data.players)
      const current = data.players.find(
        (player) => player.name.toLowerCase() === (storedName || '').toLowerCase()
      )
      if (current?.mascot) {
        setSelectedMascot(current.mascot)
      }
      setCapacity(data.capacity ?? 8)
      setRoomStatus('ready')
    }

    void load()
    refreshId = window.setInterval(load, 4000)

    return () => {
      if (refreshId) {
        window.clearInterval(refreshId)
      }
    }
  }, [code, hostName, navigate])

  const handleLeave = async () => {
    if (!code) {
      setLeaveStatus('error')
      return
    }
    const playerName = localStorage.getItem(`bw:player:${code}`)
    if (!playerName) {
      setLeaveStatus('error')
      return
    }
    try {
      setLeaveStatus('leaving')
      const response = await fetch('/api/rooms/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, playerName })
      })
      const data = (await response.json()) as RoomResponse
      if (!data.ok) {
        setLeaveStatus('error')
        return
      }
      localStorage.removeItem(`bw:player:${code}`)
      setLeaveStatus('idle')
      navigate('/')
    } catch (err) {
      setLeaveStatus('error')
    }
  }

  const handleCopy = async () => {
    if (!code) {
      setCopyStatus('error')
      return
    }
    try {
      await navigator.clipboard.writeText(code)
      setCopyStatus('copied')
      window.setTimeout(() => setCopyStatus('idle'), 1500)
    } catch (err) {
      setCopyStatus('error')
    }
  }

  const handleVoiceToggle = async () => {
    if (!code) {
      return
    }
    const nextValue = !robotVoiceEnabled
    setRobotVoiceEnabled(nextValue)
    await fetch(`/api/room/${code}/toggle-voice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: nextValue })
    })
  }

  const handleMascotSelect = async (mascot: string) => {
    if (!code) {
      return
    }
    const playerName = localStorage.getItem(`bw:player:${code}`) ?? ''
    if (!playerName) {
      return
    }
    const response = await fetch(`/api/room/${code}/mascot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName, mascot })
    })
    const data = (await response.json()) as { ok: boolean; mascot?: string }
    if (data.ok) {
      setSelectedMascot(data.mascot ?? mascot)
    }
  }

  const handleAdvance = async () => {
    if (!code) {
      return
    }
    const playerName = localStorage.getItem(`bw:player:${code}`) ?? ''
    const response = await fetch(`/api/room/${code}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName })
    })
    const data = (await response.json()) as { ok: boolean; phase?: string }
    if (data.ok && data.phase === 'deal') {
      navigate(`/deal`)
    }
  }

  const currentPlayer = localStorage.getItem(`bw:player:${code}`) ?? ''
  const isHost = players?.some(
    (player) =>
      player.isHost &&
      currentPlayer &&
      player.name.toLowerCase() === currentPlayer.toLowerCase()
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
  const takenMascots = new Set(
    (players ?? [])
      .map((player) => player.mascot)
      .filter((mascot): mascot is string => Boolean(mascot))
  )

  return (
    <>
      <section className="page-header">
        <div>
          <div className="eyebrow">Room</div>
          <h1>Lobby</h1>
          <p>
            {players?.length ?? 0} of {capacity} players joined. Sync devices,
            then start the chaos.
          </p>
          {hostChanged && <span className="badge">Host changed</span>}
          {activityLog.length > 0 && (
            <div className="panel" style={{ marginTop: '12px' }}>
              <h3>Activity</h3>
              <ul className="list">
                {activityLog.map((entry, index) => (
                  <li key={`${entry}-${index}`}>{entry}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="panel">
          <h3>Room code</h3>
          <div className="timer">{code ?? 'TBD'}</div>
          <p style={{ marginTop: '8px' }}>Mode: Online + Local hybrid</p>
          <div className="footer-actions" style={{ marginTop: '12px' }}>
            <button className="button secondary" onClick={handleCopy}>
              {copyStatus === 'copied' ? 'Copied' : 'Copy code'}
            </button>
            <button
              className="button secondary"
              onClick={handleLeave}
              disabled={leaveStatus === 'leaving'}
            >
              Leave room
            </button>
            {copyStatus === 'error' && (
              <span style={{ color: '#8c2d2a' }}>Copy failed</span>
            )}
            {leaveStatus === 'error' && (
              <span style={{ color: '#8c2d2a' }}>Leave failed</span>
            )}
          </div>
        </div>
      </section>

      <section className="grid">
        <div className="panel">
          <h3>Players</h3>
          {roomStatus === 'error' ? (
            <p>Room not found. Double-check the code.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
              {players?.map((player) => {
                const mascotImg = getMascotImage(player.mascot)
                const mascotTitle = getMascotName(player.mascot) ?? 'Mascot'
                return (
                  <div
                    key={player.name}
                    style={{
                      borderRadius: '14px',
                      border: '1px solid rgba(70, 60, 50, 0.12)',
                      padding: '12px',
                      background: getMascotColor(player.mascot),
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      boxShadow: '0 6px 14px rgba(40, 30, 20, 0.08)'
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
                      {mascotImg && (
                        <img src={mascotImg} alt="" style={{ width: '36px', height: '36px' }} />
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 700 }}>{player.name}</span>
                        {player.isHost ? <span className="badge">Host</span> : null}
                      </div>
                      <span style={{ fontSize: '0.85rem', color: '#6b6056' }}>{mascotTitle}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <div className="panel">
          <h3>Choose your mascot</h3>
          <p style={{ marginTop: '6px', fontSize: '0.9rem', color: '#666' }}>
            Pick a business-themed mascot to rep your pitch style.
          </p>
          <div style={{ 
            marginTop: '12px', 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))', 
            gap: '10px' 
          }}>
            {mascotOptions.map((mascot) => {
              const isTaken = takenMascots.has(mascot.id) && selectedMascot !== mascot.id
              return (
              <button
                key={mascot.id}
                className="button secondary"
                onClick={() => handleMascotSelect(mascot.id)}
                disabled={isTaken}
                title={isTaken ? `${mascot.name} (Taken)` : mascot.name}
                style={{
                  padding: '8px',
                  borderRadius: '8px',
                  border: selectedMascot === mascot.id ? '2px solid #3b2a15' : '1px solid rgba(70, 60, 50, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: isTaken ? 'not-allowed' : 'pointer',
                  backgroundColor: selectedMascot === mascot.id ? 'rgba(59, 42, 21, 0.1)' : 'transparent',
                  opacity: isTaken ? 0.45 : 1
                }}
              >
                <img
                  src={mascot.svg}
                  alt={mascot.name}
                  style={{ width: '40px', height: '40px', filter: isTaken ? 'grayscale(1)' : 'none' }}
                />
              </button>
              )
            })}
          </div>
          {selectedMascot && (
            <p style={{ marginTop: '10px', color: '#2d7c2d' }}>
              Selected: {mascotOptions.find(m => m.id === selectedMascot)?.name}
            </p>
          )}
        </div>
        <div className="panel">
          <h3>Round settings</h3>
          <ul className="list">
            <li>Pitch timer: 90 seconds</li>
            <li>
              Robot voices: {robotVoiceEnabled ? 'Enabled' : 'Disabled'}
              <button
                className="button secondary"
                style={{ marginLeft: '12px' }}
                onClick={handleVoiceToggle}
              >
                {robotVoiceEnabled ? 'Disable' : 'Enable'}
              </button>
            </li>
            <li>Drawing pad: Enabled</li>
            <li>Walrus vote: Double weight</li>
          </ul>
        </div>
        <div className="panel">
          <h3>Start the Game</h3>
          <p>
            Players: {players?.length ?? 0} / {capacity}
          </p>
          <div style={{ marginTop: '12px' }}>
            {players && players.length < 3 && (
              <p style={{ color: '#d4a574' }}>
                ⏳ Waiting for at least 3 players to start.
              </p>
            )}
            {players && players.length >= 3 && (
              <p style={{ color: '#2d7c2d' }}>
                ✓ Ready to begin. {isHost ? 'Press below to start!' : 'Waiting for host...'}
              </p>
            )}
          </div>
          {isHost ? (
            <div className="footer-actions" style={{ marginTop: '16px' }}>
              <button
                className="button"
                onClick={handleAdvance}
                disabled={(players?.length ?? 0) < 3}
              >
                {phase === 'lobby' ? '🎮 Start Game' : '→ Next Phase'}
              </button>
            </div>
          ) : (
            <p style={{ marginTop: '16px', color: '#6b6056' }}>
              Waiting for host to start the game.
            </p>
          )}
        </div>
      </section>
    </>
  )
}
