import { useEffect, useState } from 'react'
import { apiFetch } from '../utils/api'

type RulesResponse = {
  ok: boolean
  rules: string[]
}

export default function Rules() {
  const [rules, setRules] = useState<string[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const normalizedRules = rules.map((rule) => rule.replace(/^\d+\.\s*/, ''))
  const fallbackRules = ['Loading rules...']
  const rulesSource = normalizedRules.length > 0 ? normalizedRules : fallbackRules
  const ruleGroups = [
    {
      title: 'Round basics',
      description: 'The Penguin sets the stage and everyone prepares pitches quickly.',
      rules: rulesSource.slice(0, 5)
    },
    {
      title: 'Scoring and bonuses',
      description: 'Big swings get big money, especially with extra 🧩 CONSTRAINTS.',
      rules: rulesSource.slice(5, 8)
    },
    {
      title: 'AI challenge + final round',
      description: 'Call out pitches made with AI and settle it in the final pitch-off.',
      rules: rulesSource.slice(8)
    }
  ]

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
        <p className="panel-sub">Short, playful, and made for the chaos.</p>
        {status === 'error' ? (
          <p style={{ color: '#8c2d2a' }}>Could not load rules right now.</p>
        ) : (
          <div className="rules-grid">
            {ruleGroups.map((group) => (
              <div className="rule-group" key={group.title}>
                <h4>{group.title}</h4>
                <p>{group.description}</p>
                <ul className="list compact">
                  {group.rules.map((rule) => (
                    <li key={`${group.title}-${rule}`}>{rule}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h3>Round flow</h3>
        <p className="panel-sub">A four-step loop everyone learns in one round.</p>
        <div className="grid">
          <div className="card">
            <strong>1. Deal cards</strong>
            <span>💡 PROBLEM + 🧩 CONSTRAINTS + ⭐ TWIST.</span>
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
        <h3 style={{ marginTop: '24px' }}>Final round modes</h3>
        <div className="grid">
          <div className="card">
            <strong>Case A: Top player pitch-off</strong>
            <span>
              Auto assigned 💡 PROBLEM + 🧩 CONSTRAINTS. Top 2-7 players pitch head-to-head. Penguin(s) rank the pitches best to worst. Player with the most money wins.
            </span>
          </div>
          <div className="card">
            <strong>Case B: Top player immunity</strong>
            <span>
              Auto assigned 💡 PROBLEM + 🧩 CONSTRAINTS. Top player gets immunity and becomes Penguin. Everyone else pitches to compete for ranks 2-7. 
              Penguin ranks the pitches best to worst. Players may rise or fall,
              but the penguin stays safe on top.
            </span>
          </div>
        </div>
      </section>
    </>
  )
}
