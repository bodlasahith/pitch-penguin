import { useEffect, useState } from 'react'

export type MoneyChangeType = 'gain' | 'loss'

interface MoneyPopupProps {
  amount: number
  type: MoneyChangeType
  x?: number
  y?: number
  playerName?: string
  onComplete?: () => void
}

/**
 * MoneyPopup - Animated money display that floats away and disappears
 * 
 * Usage:
 * <MoneyPopup amount={100} type="gain" x={100} y={100} />
 * <MoneyPopup amount={50} type="loss" playerName="Alice" />
 */
export function MoneyPopup({
  amount,
  type,
  x,
  y,
  playerName,
  onComplete,
}: MoneyPopupProps) {
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false)
      onComplete?.()
    }, 1200)

    return () => clearTimeout(timer)
  }, [onComplete])

  if (!isVisible) return null

  const isGain = type === 'gain'
  const sign = isGain ? '+' : '−'
  const color = isGain ? '#22c55e' : '#ef4444'
  const anchored = typeof x === 'number' && typeof y === 'number'

  return (
    <div
      style={{
        position: anchored ? 'fixed' : 'relative',
        left: anchored ? x : undefined,
        top: anchored ? y : undefined,
        pointerEvents: 'none',
        zIndex: 1000,
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: anchored ? 'flex-start' : 'center',
        gap: '2px',
      }}
      className={isGain ? 'money-gain' : 'money-loss'}
    >
      <div style={{ color, fontSize: '1.5rem', fontWeight: 'bold' }}>
        {sign}${amount}
      </div>
      {playerName && (
        <div style={{ color: '#6b6056', fontSize: '0.78rem', fontWeight: 600 }}>
          {playerName}
        </div>
      )}
    </div>
  )
}

/**
 * ScoreTicker - Animated counter for score updates
 * 
 * Usage:
 * <ScoreTicker current={350} previous={300} type="gain" />
 */
interface ScoreTickerProps {
  current: number
  previous: number
  type?: 'gain' | 'loss'
  onAnimationEnd?: () => void
}

export function ScoreTicker({
  current,
  previous,
  type,
  onAnimationEnd,
}: ScoreTickerProps) {
  const [displayNumber, setDisplayNumber] = useState(previous)
  const [showTicker, setShowTicker] = useState(false)
  const resolvedType: MoneyChangeType = type ?? (current >= previous ? 'gain' : 'loss')

  useEffect(() => {
    if (current === previous) {
      setDisplayNumber(current)
      setShowTicker(false)
      return
    }

    // Show ticker animation
    setShowTicker(true)

    // Animate number increment/decrement
    const diff = current - previous
    const steps = Math.max(8, Math.min(24, Math.abs(diff)))
    const stepSize = diff / steps
    let currentStep = 0

    const interval = setInterval(() => {
      currentStep++
      setDisplayNumber(Math.round(previous + stepSize * currentStep))

      if (currentStep >= steps) {
        clearInterval(interval)
        setDisplayNumber(current)
        setShowTicker(false)
        onAnimationEnd?.()
      }
    }, 30)

    return () => clearInterval(interval)
  }, [current, previous, onAnimationEnd])

  return (
    <div
      style={{
        fontSize: '1.2rem',
        fontWeight: 600,
      }}
      className={showTicker ? (resolvedType === 'gain' ? 'score-tick-up' : 'score-tick-down') : ''}
    >
      ${displayNumber}
    </div>
  )
}

/**
 * AnimatedScore - Combines ScoreTicker with optional money popup
 */
interface AnimatedScoreProps {
  current: number
  previous: number
  showPopup?: boolean
  popupX?: number
  popupY?: number
}

export function AnimatedScore({
  current,
  previous,
  showPopup = false,
  popupX,
  popupY,
}: AnimatedScoreProps) {
  const type: MoneyChangeType = current >= previous ? 'gain' : 'loss'

  return (
    <>
      <ScoreTicker current={current} previous={previous} type={type} />
      {showPopup && (
        <MoneyPopup
          amount={Math.abs(current - previous)}
          type={type}
          x={popupX}
          y={popupY}
        />
      )}
    </>
  )
}
