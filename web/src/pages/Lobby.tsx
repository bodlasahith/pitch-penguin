import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

type RoomResponse = {
  ok: boolean
  code?: string
  status?: string
  players?: {
    name: string
    isHost: boolean
  }[]
  capacity?: number
  message?: string
}

export default function Lobby() {
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
      setPlayers(data.players)
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
  }, [code])

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
            <ul className="list">
              {players?.map((player) => (
                <li key={player.name}>
                  {player.name} {player.isHost ? '(Host)' : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="panel">
          <h3>Round settings</h3>
          <ul className="list">
            <li>Pitch timer: 90 seconds</li>
            <li>Robot voices: 6 available</li>
            <li>Drawing pad: Enabled</li>
            <li>Walrus vote: Double weight</li>
          </ul>
        </div>
        <div className="panel">
          <h3>Ready check</h3>
          <p>Waiting for all players to lock in their voice.</p>
          <div className="footer-actions" style={{ marginTop: '16px' }}>
            <button className="button">Start round</button>
            <button className="button secondary">Shuffle seating</button>
          </div>
        </div>
      </section>
    </>
  )
}
