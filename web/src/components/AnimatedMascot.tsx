import { forwardRef, useEffect, useImperativeHandle, type CSSProperties, type MouseEventHandler } from 'react'
import { useAnimationTrigger, type MascotEvent } from '../hooks/useAnimationTrigger'

export interface AnimatedMascotProps {
  src: string
  alt?: string
  character?: string // 'blob' | 'chart' | 'gremlin' | 'penguin' | 'shark' | 'octopus' | 'llama' | 'hamster' | 'unicorn' | 'walrus' | 'rocket' | 'robot' | 'goblin' | 'raccoon' | 'scientist'
  width?: string | number
  height?: string | number
  className?: string
  style?: CSSProperties
  setAnimationTrigger?: (trigger: (event: MascotEvent) => void) => void
  onClick?: MouseEventHandler<HTMLImageElement>
}

/**
 * AnimatedMascot - Reusable component for any mascot with automatic animations
 * 
 * Usage:
 * const { trigger } = useAnimationTrigger({ character: 'blob' })
 * <AnimatedMascot src={mascotSVG} character="blob" setAnimationTrigger={setTrigger} />
 * trigger('win') // triggers animation
 */
export function AnimatedMascot({
  src,
  alt = 'mascot',
  character = 'blob',
  width = '30px',
  height = '30px',
  className = '',
  style,
  setAnimationTrigger,
  onClick,
}: AnimatedMascotProps) {
  const { animationClass, trigger } = useAnimationTrigger({ character })

  useEffect(() => {
    setAnimationTrigger?.(trigger)
  }, [setAnimationTrigger, trigger])

  return (
    <img
      src={src}
      alt={alt}
      style={{
        width,
        height,
        display: 'block',
        imageRendering: 'crisp-edges',
        ...style,
      }}
      className={`${animationClass} ${className}`.trim()}
      onClick={onClick}
    />
  )
}

/**
 * MascotWithAnimation - Extended component with ref-based animation control
 */
export interface MascotAnimationRef {
  trigger: (event: MascotEvent) => void
}

export const MascotWithAnimation = forwardRef<MascotAnimationRef, AnimatedMascotProps>(
  ({
    src,
    alt,
    character = 'blob',
    width = '30px',
    height = '30px',
    className = '',
    style,
    setAnimationTrigger,
    onClick,
  }, ref) => {
  const { animationClass, trigger } = useAnimationTrigger({ character })

  useEffect(() => {
    setAnimationTrigger?.(trigger)
  }, [setAnimationTrigger, trigger])

  useImperativeHandle(ref, () => ({ trigger }), [trigger])

  return (
    <img
      src={src}
      alt={alt}
      style={{
        width,
        height,
        display: 'block',
        imageRendering: 'crisp-edges',
        ...style,
      }}
      className={`${animationClass} ${className}`.trim()}
      onClick={onClick}
    />
  )
})

MascotWithAnimation.displayName = 'MascotWithAnimation'
