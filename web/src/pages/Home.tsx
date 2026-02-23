import { useEffect, useState } from 'react'
import { apiFetch } from '../utils/api'
import { useNavigate } from 'react-router-dom'
import { playActionSound } from '../utils/soundEffects'
import GameFlowInfographic from '../components/GameFlowInfographic'

type HealthStatus = {
  ok: boolean
  service: string
  time: string
}

type CreateRoomResponse = {
  ok: boolean
  room?: {
    code: string
  }
  message?: string
}

export default function Home() {
  const navigate = useNavigate()
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [status, setStatus] = useState<'idle' | 'live' | 'down'>('idle')
  const [roomStatus, setRoomStatus] = useState<'idle' | 'loading' | 'error'>(
    'idle'
  )
  const [hostName, setHostName] = useState('')
  const [roomError, setRoomError] = useState('')

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const [healthResponse] = await Promise.all([apiFetch('/api/health')])
        if (!healthResponse.ok) {
          throw new Error('Health check failed')
        }
        const data = (await healthResponse.json()) as HealthStatus
        if (!cancelled) {
          setHealth(data)
          setStatus('live')
        }
      } catch (err) {
        if (!cancelled) {
          setStatus('down')
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const handleCreateRoom = async () => {
    try {
      const trimmedName = hostName.trim()
      if (!trimmedName) {
        setRoomError('Enter a host name to continue.')
        return
      }
      setRoomStatus('loading')
      setRoomError('')
      const response = await apiFetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostName: trimmedName })
      })
      const data = (await response.json()) as CreateRoomResponse
      if (!data.ok || !data.room) {
        setRoomStatus('error')
        setRoomError(data.message ?? 'Could not create a room.')
        return
      }
      localStorage.setItem(`pp:player:${data.room.code}`, trimmedName)
      localStorage.setItem('pp:lastRoom', data.room.code)
      localStorage.setItem('pp:lastName', trimmedName)
      playActionSound('join_lobby')
      navigate(`/lobby/${data.room.code}`)
    } catch (err) {
      setRoomStatus('error')
      setRoomError('Could not create a room.')
    }
  }

  return (
    <>
      <section className="page-header">
        <div>
          <div className="eyebrow">Kickoff</div>
          <h1>Bring the pitch night online.</h1>
          <p>
            Pitch Penguin is a entrepreneurship-themed social pitch party
            where: <br></br> <strong>PROBLEM</strong> cards present a problem, <br></br> <strong>CONSTRAINTS</strong> are quirky requirements, <br></br> and <strong>TWISTs</strong> throw a curveball.
            <br></br>Penguins may invest in ideas based on creativity, effort,
            entertainment, or just pure chaos.
          </p>
        </div>
        <div className="panel">
          <div
            className="pill"
            data-state={status === 'live' ? 'live' : status === 'down' ? 'down' : 'idle'}
          >
            {status === 'live' && 'Backend Online'}
            {status === 'down' && 'Backend Offline'}
            {status === 'idle' && 'Checking Backend...'}
          </div>
          <p style={{ marginTop: '10px' }}>
            {health?.service ?? 'Waiting for backend...'}
          </p>
          <p style={{ marginTop: '6px', fontSize: '0.85rem' }}>
            {health?.time ?? 'No timestamp yet'}
          </p>
        </div>
      </section>

      <section className="grid">
        <div className="panel">
          <h3>Start a room</h3>
          <p>Create a lobby, invite friends, choose local or online play.</p>
          <label htmlFor="host-name" style={{ marginTop: '12px', display: 'block' }}>
            <strong>Host name</strong>
          </label>
          <input
            id="host-name"
            className="input"
            placeholder="Your name"
            value={hostName}
            onChange={(event) => setHostName(event.target.value)}
            style={{ marginTop: '10px' }}
          />
          <div className="footer-actions" style={{ marginTop: '16px' }}>
            <button
              className="button"
              onClick={handleCreateRoom}
              disabled={roomStatus === 'loading'}
            >
              Create room
            </button>
            <button
              className="button secondary"
              onClick={() => navigate('/join')}
            >
              Join room
            </button>
          </div>
          {(roomStatus === 'error' || roomError) && (
            <p style={{ marginTop: '12px', color: '#8c2d2a' }}>
              {roomError || 'Could not create a room. Try again.'}
            </p>
          )}
        </div>
        <div className="panel">
          <h3>Pitching features</h3>
          <p>
            <strong>Visual pitch board: </strong>Add a doodle or logo sketch while you pitch, Pictionary-style. Make sure to
            <span title="Keep it simple, stupid."> KiSS!</span>
          </p>
          <p style={{ marginTop: '24px' }}>
            <strong>Robot reader: </strong>Every pitch gets an robot voice. Choose from quirky announcers and
            crisp startup narrators, if you don't want to do the honors yourself.
          </p>
          <p style={{ marginTop: '24px' }}>
            <strong>The AI angle: </strong>If you can't come up with a pitch in time, the AI Assistant has your back.
            But beware - if your opponents correctly guess that your pitch was AI-generated,
            you could be disqualified and lose money. Use it wisely!
          </p>
        </div>
      </section>
      <section className="panel">
        <h3>Game flow at a glance</h3>
        <div style={{ marginTop: '12px', borderRadius: '14px', overflow: 'hidden' }}>
          <GameFlowInfographic />
        </div>
      </section>
    </>
  )
}
