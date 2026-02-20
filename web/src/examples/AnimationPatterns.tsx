/**
 * MASCOT ANIMATION SYSTEM - IMPLEMENTATION GUIDE
 * 
 * This file shows all patterns for using animations in the game
 */

import { useAnimationTrigger } from '../hooks/useAnimationTrigger'
import { AnimatedMascot, MascotWithAnimation } from '../components/AnimatedMascot'
import type { MascotAnimationRef } from '../components/AnimatedMascot'
import { MoneyPopup, ScoreTicker, AnimatedScore } from '../components/MoneyAnimation'
import { useRef } from 'react'

/**
 * ============================================
 * PATTERN 1: Using AnimatedMascot in UI
 * ============================================
 * 
 * For displaying mascots in list items, leaderboards, etc.
 * Set animation trigger prop to control from parent
 */
export function LobbyMascotExample() {
  const ref = useRef<MascotAnimationRef>(null)

  const handleSelect = () => {
    ref.current?.trigger('select')
  }

  return (
    <div>
      <MascotWithAnimation
        ref={ref}
        src="/path/to/mascot.svg"
        alt="Mascot"
        width="40px"
        height="40px"
      />
      <button onClick={handleSelect}>Select Mascot</button>
    </div>
  )
}

/**
 * ============================================
 * PATTERN 2: Manual Hook Usage
 * ============================================
 * 
 * For direct control over animations with useAnimationTrigger
 */
export function ManualAnimationExample() {
  const { animationClass, trigger } = useAnimationTrigger({
    character: 'blob',
    onAnimationEnd: () => console.log('Animation complete'),
  })

  return (
    <div>
      <img
        src="/blob.svg"
        alt="Blob"
        style={{ width: '50px', height: '50px' }}
        className={animationClass}
      />
      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
        <button onClick={() => trigger('select')}>Select</button>
        <button onClick={() => trigger('win')}>Win!</button>
        <button onClick={() => trigger('lose-money')}>Lose Money</button>
      </div>
    </div>
  )
}

/**
 * ============================================
 * PATTERN 3: Lobby Phase - Mascot Selection
 * ============================================
 */
export function LobbyPhaseExample() {
  const mascots = [
    { id: 'blob', name: 'Blob', src: '/blob.svg' },
    { id: 'chart', name: 'Chart', src: '/chart.svg' },
    { id: 'gremlin', name: 'Gremlin', src: '/gremlin.svg' },
  ]

  const handleSelectMascot = (mascotId: string) => {
    // Find the trigger for this mascot and call select
    // In real app, you'd store these in state or a ref map
    console.log(`Selected: ${mascotId}`)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
      {mascots.map((mascot) => (
        <div
          key={mascot.id}
          onClick={() => handleSelectMascot(mascot.id)}
          style={{
            cursor: 'pointer',
            padding: '16px',
            border: '2px solid #ddd',
            borderRadius: '12px',
            textAlign: 'center',
          }}
        >
          <AnimatedMascot
            src={mascot.src}
            alt={mascot.name}
            character={mascot.id}
            width="60px"
            height="60px"
            className="hover:scale-105 transition-transform"
          />
          <div style={{ marginTop: '8px' }}>{mascot.name}</div>
        </div>
      ))}
    </div>
  )
}

/**
 * ============================================
 * PATTERN 4: Round Results - Winner Announcement
 * ============================================
 */
export function RoundResultsExample() {
  const winner = {
    name: 'Alice',
    mascot: 'unicorn',
    mascotSrc: '/unicorn.svg',
    pointsGained: 100,
  }

  return (
    <div style={{ textAlign: 'center', padding: '32px' }}>
      <h2 style={{ marginBottom: '24px' }}>🏆 Round Winner!</h2>

      {/* Animated winner mascot */}
      <div style={{ marginBottom: '24px' }}>
        <AnimatedMascot
          src={winner.mascotSrc}
          alt={winner.name}
          character={winner.mascot}
          width="120px"
          height="120px"
          setAnimationTrigger={(trigger) => trigger('win')}
        />
      </div>

      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '8px' }}>
        {winner.name}
      </div>

      {/* Animated money display */}
      <div style={{ fontSize: '1.2rem', color: '#22c55e', fontWeight: 'bold' }}>
        <MoneyPopup
          amount={winner.pointsGained}
          type="gain"
          playerName={winner.name}
        />
      </div>
    </div>
  )
}

/**
 * ============================================
 * PATTERN 5: Player List with Live Scores
 * ============================================
 */
export function PlayerLeaderboardExample() {
  const players = [
    { name: 'Alice', mascot: 'unicorn', score: 250, mascotSrc: '/unicorn.svg' },
    { name: 'Bob', mascot: 'shark', score: 200, mascotSrc: '/shark.svg' },
    { name: 'Carol', mascot: 'blob', score: 180, mascotSrc: '/blob.svg' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {players.map((player, idx) => (
        <div
          key={player.name}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px',
            backgroundColor: idx === 0 ? '#fff9e6' : '#f9f9f9',
            borderRadius: '8px',
          }}
        >
          {/* Animated mascot - show idle by default */}
          <AnimatedMascot
            src={player.mascotSrc}
            alt={player.name}
            character={player.mascot}
            width="30px"
            height="30px"
          />

          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{player.name}</div>
          </div>

          {/* Score with animation support */}
          <ScoreTicker current={player.score} previous={player.score - 20} />
        </div>
      ))}
    </div>
  )
}

/**
 * ============================================
 * PATTERN 6: Pitch Phase - Timer + Animation
 * ============================================
 */
export function PitchPhaseExample() {
  const currentPitcher = {
    name: 'Alice',
    mascot: 'gremlin',
    mascotSrc: '/gremlin.svg',
  }

  return (
    <div style={{ padding: '24px', textAlign: 'center' }}>
      <div style={{ marginBottom: '24px' }}>
        <AnimatedMascot
          src={currentPitcher.mascotSrc}
          alt={currentPitcher.name}
          character={currentPitcher.mascot}
          width="80px"
          height="80px"
          // Llama and gremlin have special pitch animations
          setAnimationTrigger={(trigger) => trigger('pitch')}
        />
      </div>

      <p style={{ fontSize: '1rem', marginBottom: '16px' }}>
        {currentPitcher.name} is pitching...
      </p>

      {/* Timer display with animation */}
      <div
        style={{
          fontSize: '2rem',
          fontWeight: 'bold',
          color: '#f59e0b',
        }}
        className="pulse"
      >
        45s
      </div>
    </div>
  )
}

/**
 * ============================================
 * PATTERN 7: Challenge Result - Walrus Judge
 * ============================================
 */
export function ChallengeResultExample() {
  const verdict = 'upheld' // 'upheld' | 'rejected' | 'pending'

  return (
    <div style={{ padding: '24px', textAlign: 'center' }}>
      {/* Walrus as judge */}
      <AnimatedMascot
        src="/walrus.svg"
        alt="Walrus Judge"
        character="walrus"
        width="100px"
        height="100px"
        setAnimationTrigger={(trigger) => {
          // Walrus has special judging animation (mustache twitch)
          trigger('judge')
        }}
      />

      <div style={{ marginTop: '24px', fontSize: '1.5rem', fontWeight: 'bold' }}>
        {verdict === 'upheld' ? '⚖️ Challenge Upheld!' : '❌ Challenge Rejected'}
      </div>

      {/* Loser animation for disqualified player */}
      {verdict === 'upheld' && (
        <div style={{ marginTop: '24px' }}>
          <AnimatedMascot
            src="/blob.svg"
            alt="Disqualified"
            character="blob"
            width="60px"
            height="60px"
            setAnimationTrigger={(trigger) => trigger('lose-money')}
          />
          <div style={{ marginTop: '8px', color: '#ef4444', fontWeight: 'bold' }}>
            −$100
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * ============================================
 * PATTERN 8: Final Round Entry - Cinematic
 * ============================================
 */
export function FinalRoundEntryExample() {
  const finalists = [
    { name: 'Alice', mascot: 'unicorn', mascotSrc: '/unicorn.svg' },
    { name: 'Bob', mascot: 'shark', mascotSrc: '/shark.svg' },
  ]

  return (
    <div
      style={{
        padding: '48px 24px',
        textAlign: 'center',
        background: 'linear-gradient(135deg, #fff4d8 0%, #e6f3ff 100%)',
        borderRadius: '16px',
      }}
    >
      <h1 style={{ marginBottom: '32px' }}>🏁 Final Round</h1>

      <div style={{ display: 'flex', gap: '32px', justifyContent: 'center' }}>
        {finalists.map((finalist) => (
          <div key={finalist.name}>
            {/* Special final-round animation with spotlight */}
            <AnimatedMascot
              src={finalist.mascotSrc}
              alt={finalist.name}
              character={finalist.mascot}
              width="120px"
              height="120px"
              setAnimationTrigger={(trigger) => trigger('enter-final')}
            />
            <div style={{ marginTop: '12px', fontWeight: 'bold' }}>
              {finalist.name}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * ============================================
 * PATTERN 9: Winner Announcement - Final Winner
 * ============================================
 */
export function FinalWinnerExample() {
  const winner = {
    name: 'Alice',
    mascot: 'unicorn',
    mascotSrc: '/unicorn.svg',
  }

  return (
    <div
      style={{
        padding: '48px 24px',
        textAlign: 'center',
        background: 'radial-gradient(circle, #fff9e6 0%, #ffe0b2 100%)',
        borderRadius: '16px',
      }}
    >
      <h1 style={{ marginBottom: '32px', fontSize: '3rem' }}>🎆 WINNER!</h1>

      {/* Unicorn final winner has special rainbow burst animation */}
      <div style={{ marginBottom: '32px' }}>
        <AnimatedMascot
          src={winner.mascotSrc}
          alt={winner.name}
          character={winner.mascot}
          width="150px"
          height="150px"
          className="unicorn-final-winner"
          setAnimationTrigger={(trigger) => {
            // Note: in real app, this would be handled by game logic
            trigger('win')
          }}
        />
      </div>

      <div style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '12px' }}>
        {winner.name}
      </div>

      <div style={{ fontSize: '1.5rem', color: '#d4af37', fontWeight: 'bold' }}>
        💰 $500 Prize Pool
      </div>
    </div>
  )
}

/**
 * ============================================
 * PATTERN 10: Real Integration Example
 * ============================================
 * 
 * How to integrate in your actual game component
 */
export function IntegrationExample() {
  // In your game state:
  // const [roundState, setRoundState] = useState('reveal') // reveal | winner | loser
  // const [currentWinner, setCurrentWinner] = useState<string | null>(null)
  // const mascotRefs = useRef<Map<string, MascotAnimationRef>>(new Map())

  const handleRoundEnd = (winnerName: string) => {
    console.log(`Round ended. Winner: ${winnerName}`)
    // Trigger animation for winner
    // mascotRefs.current.get(winnerName)?.trigger('win')
    
    // Trigger lose-money animation for players who bet
    // otherPlayers.forEach(p => {
    //   mascotRefs.current.get(p.name)?.trigger('lose-money')
    // })

    // Show money animations
    // <MoneyPopup amount={100} type="gain" x={200} y={100} />
  }

  return (
    <div>
      {/* Integration placeholder */}
      <p>See above patterns for how to integrate in your actual game components</p>
      <div style={{ marginTop: '12px' }}>
        <button onClick={() => handleRoundEnd('Alice')}>Simulate Round End</button>
      </div>
      <div style={{ marginTop: '12px' }}>
        <AnimatedScore current={350} previous={300} showPopup popupX={120} popupY={120} />
      </div>
    </div>
  )
}
