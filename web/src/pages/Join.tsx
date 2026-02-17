import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Join() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState<'idle' | 'joining' | 'error'>('idle')
  const lastRoom = localStorage.getItem('bw:lastRoom') ?? ''
  const lastName = localStorage.getItem('bw:lastName') ?? ''
  const [banner, setBanner] = useState('')

  const handleJoin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = code.trim().toUpperCase()
    const playerName = name.trim()
    if (!trimmed) {
      setError('Enter a room code to continue.')
      return
    }
    if (!playerName) {
      setError('Enter a player name to continue.')
      return
    }
    setError('')
    setBanner('')
    try {
      setStatus('joining')
      const response = await fetch('/api/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed, playerName })
      })
      const data = (await response.json()) as { ok: boolean; message?: string }
      if (!data.ok) {
        setStatus('error')
        setError(data.message ?? 'Unable to join that room.')
        if (data.message === 'Room is full') {
          setBanner('This room is full. Try another code.')
        }
        return
      }
      localStorage.setItem(`bw:player:${trimmed}`, playerName)
      localStorage.setItem('bw:lastRoom', trimmed)
      localStorage.setItem('bw:lastName', playerName)
      navigate(`/lobby/${trimmed}`)
    } catch (err) {
      setStatus('error')
      setError('Unable to join that room.')
    }
  }

  const handleQuickRejoin = async () => {
    if (!lastRoom || !lastName) {
      return
    }
    setError('')
    setBanner('')
    try {
      setStatus('joining')
      const response = await fetch('/api/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: lastRoom, playerName: lastName })
      })
      const data = (await response.json()) as { ok: boolean; message?: string }
      if (!data.ok && data.message !== 'Name already taken') {
        setStatus('error')
        setError(data.message ?? 'Unable to rejoin that room.')
        if (data.message === 'Room is full') {
          setBanner('This room is full. Try another code.')
        }
        return
      }
      localStorage.setItem(`bw:player:${lastRoom}`, lastName)
      navigate(`/lobby/${lastRoom}`)
    } catch (err) {
      setStatus('error')
      setError('Unable to rejoin that room.')
    }
  }

  return (
    <>
      <section className="page-header">
        <div>
          <div className="eyebrow">Join</div>
          <h1>Enter a room code</h1>
          <p>Use the code from your host to jump into the lobby.</p>
        </div>
        <div className="panel">
          <h3>Example</h3>
          <div className="timer">WLR-482</div>
        </div>
      </section>

      {lastRoom && lastName && (
        <section className="panel">
          <h3>Quick rejoin</h3>
          <p>
            Jump back into {lastRoom} as {lastName}.
          </p>
          <div className="footer-actions" style={{ marginTop: '12px' }}>
            <button
              className="button"
              type="button"
              onClick={handleQuickRejoin}
              disabled={status === 'joining'}
            >
              Rejoin room
            </button>
          </div>
        </section>
      )}

      <section className="panel">
        <form onSubmit={handleJoin}>
          {banner && <div className="banner warning">{banner}</div>}
          <label htmlFor="player-name">
            <strong>Player name</strong>
          </label>
          <input
            id="player-name"
            className="input"
            placeholder="Your name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            style={{ marginTop: '10px' }}
          />
          <label
            htmlFor="room-code"
            style={{ marginTop: '16px', display: 'block' }}
          >
            <strong>Room code</strong>
          </label>
          <input
            id="room-code"
            className="input"
            placeholder="WLR-123"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            style={{ marginTop: '10px' }}
          />
          <div className="footer-actions" style={{ marginTop: '16px' }}>
            <button className="button" type="submit" disabled={status === 'joining'}>
              Join room
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => navigate('/')}
            >
              Cancel
            </button>
          </div>
          {error && (
            <p style={{ marginTop: '12px', color: '#8c2d2a' }}>{error}</p>
          )}
        </form>
      </section>
    </>
  )
}
