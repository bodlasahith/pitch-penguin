import { useEffect, useState } from 'react'
import { apiFetch } from '../utils/api'

type RulesResponse = {
  ok: boolean
  rules: string[]
}

export default function Rules() {
  const [rules, setRules] = useState<string[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setStatus('loading')
      try {
        const response = await apiFetch('/api/rules')
        if (!response.ok) {
          throw new Error('Failed to load rules')
        }
        const data = (await response.json()) as RulesResponse
        if (!cancelled) {
          setRules(data.rules ?? [])
          setStatus('idle')
        }
      } catch {
        if (!cancelled) {
          setStatus('error')
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      <section className="page-header">
        <div>
          <div className="eyebrow">How To Play</div>
          <h1>Rules</h1>
          <p>Game rules in more detail, in one place.</p>
        </div>
      </section>

      <section className="panel">
        <h3>Rules of the game</h3>
        {status === 'error' ? (
          <p style={{ color: '#8c2d2a' }}>Could not load rules right now.</p>
        ) : (
          <div className="grid">
            <ul className="list">
              {(rules.length > 0
                ? rules.slice(0, Math.ceil(rules.length / 2))
                : ['Loading rules...']
              ).map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
            <ul className="list">
              {(rules.length > 0
                ? rules.slice(Math.ceil(rules.length / 2))
                : []
              ).map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="panel">
        <h3>Round flow</h3>
        <div className="grid">
          <div className="card">
            <strong>1. Deal cards</strong>
            <span>PROBLEM + CONSTRAINTS + TWIST.</span>
          </div>
          <div className="card">
            <strong>2. Write pitch</strong>
            <span>Timer + pitch + description + optional sketch.</span>
          </div>
          <div className="card">
            <strong>3. Reveal</strong>
            <span>Players take turns presenting to the Penguin.</span>
          </div>
          <div className="card">
            <strong>4. Vote</strong>
            <span>Penguin crowns the winner of the round and invests in them.</span>
          </div>
        </div>
        <h3 style={{ marginTop: '24px' }}>Final round Case A: Top player pitch-off</h3>
        <div className="grid">
          <div className="card">
            <strong>1. Write pitch</strong>
            <span>
              Auto assigned PROBLEM + CONSTRAINTS. Top 2-7 players pitch head-to-head.
            </span>
          </div>
          <div className="card">
            <strong>2. Vote</strong>
            <span>
              Penguin(s) rank the pitches best to worst. Player with the most money wins.
            </span>
          </div>
        </div>
        <h3 style={{ marginTop: '24px' }}>Final round Case B: Top player immunity</h3>
        <div className="grid">
          <div className="card">
            <strong>1. Write pitch</strong>
            <span>
              Auto assigned PROBLEM + CONSTRAINTS. Top player gets immunity bonus and becomes
              Penguin. Everyone else pitches to compete for ranks 2-7.
            </span>
          </div>
          <div className="card">
            <strong>2. Vote</strong>
            <span>
              Penguin ranks the pitches best to worst. Players may rise or fall,
              but the penguin stays safe on top.
            </span>
          </div>
        </div>
      </section>
    </>
  )
}
