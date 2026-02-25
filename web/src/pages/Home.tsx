import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { playActionSound } from '../utils/soundEffects'
import GameFlowInfographic from '../components/GameFlowInfographic'
import { apiFetch } from '../utils/api'

type CreateRoomResponse = {
  ok: boolean
  room?: {
    code: string
  }
  message?: string
}

export default function Home() {
  const navigate = useNavigate()
  const [roomStatus, setRoomStatus] = useState<'idle' | 'loading' | 'error'>(
    'idle'
  )
  const [hostName, setHostName] = useState('')
  const [roomError, setRoomError] = useState('')

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
          <p className="home-hero-hook">Turn wild ideas into competitive chaos.</p>
          <p>
            Every round drops a <strong>PROBLEM</strong>, weird
            <strong> CONSTRAINTS</strong>, and a chaotic <strong>TWIST</strong>.
            <br></br>Penguins may invest in ideas based on creativity, effort, entertainment, or just pure chaos.
            <br></br>Pitch, vote, and invest until one founder waddles away rich.
          </p>
        </div>
      </section>

      <section className="grid home-top-grid">
        <div className="panel home-start-panel">
          <h3>Start a room</h3>
          <p>Create a lobby, invite friends, choose local or online play.</p>
          <label htmlFor="host-name" style={{ marginTop: '12px', display: 'block' }}>
            <strong>Host name (room creator)</strong>
          </label>
          <input
            id="host-name"
            className="input"
            placeholder="Your name"
            value={hostName}
            onChange={(event) => setHostName(event.target.value)}
            style={{ marginTop: '10px' }}
          />
          <div className="footer-actions cta-stack" style={{ marginTop: '16px' }}>
            <button
              className="button primary-cta"
              onClick={handleCreateRoom}
              disabled={roomStatus === 'loading'}
            >
              Create new room
            </button>
            <button
              className="button secondary"
              onClick={() => navigate('/join')}
            >
              Join existing room
            </button>
          </div>
          <p style={{ marginTop: '10px', fontSize: '0.86rem' }}>
            Joining a friend&apos;s room? Use the Join page with their room code.
          </p>
          {(roomStatus === 'error' || roomError) && (
            <p style={{ marginTop: '12px', color: '#8c2d2a' }}>
              {roomError || 'Could not create a room. Try again.'}
            </p>
          )}
        </div>
        <div className="panel home-flow-panel">
          <h3>How it works</h3>
          <p>From deal to voting in four quick phases.</p>
          <div className="home-flow-wrap">
            <GameFlowInfographic />
          </div>
        </div>
      </section>
      <section className="panel">
        <h3>Pitching features</h3>
        <div className="feature-grid">
          <div className="feature-card">
            <div className="feature-tag">Visual board</div>
            <p>Add a doodle or logo sketch while you pitch, Pictionary-style. Make sure to <span className="kiss-tooltip-wrapper"><strong>KiSS</strong><span className="kiss-tooltip">Keep it simple, stupid!</span></span> so your idea lands fast!</p>
          </div>
          <div className="feature-card">
            <div className="feature-tag">Robot reader</div>
            <p>Every pitch gets an robot voice. Choose an announcers and crisp startup narrators, if you don't want to do the honors yourself.</p>
          </div>
          <div className="feature-card">
            <div className="feature-tag">AI backup</div>
            <p>If you can't come up with a pitch in time, the AI Assistant has your back. <strong>But beware -</strong> if your opponents correctly guess that your pitch was AI-generated, you could be disqualified and lose money. Use it wisely!</p>
          </div>
        </div>
      </section>
    </>
  )
}
