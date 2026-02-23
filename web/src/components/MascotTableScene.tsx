const mascots = [
  'rocket',
  'chart',
  'gremlin',
  'walrus',
  'goblin',
  'robot',
  'unicorn',
  'shark',
  'octopus',
  'llama',
  'hamster',
  'blob',
  'raccoon',
  'scientist',
] as const
import monologo from '../../public/logo-mono.svg'

function MascotSilhouette({ mascot }: { mascot: (typeof mascots)[number] }) {
  switch (mascot) {
    case 'rocket':
      return (
        <g>
          <path d="M 0 -14 L 7 -2 L 0 12 L -7 -2 Z" />
          <path d="M -7 6 L -11 10 M 7 6 L 11 10" />
          <circle cx="0" cy="-2" r="2.2" />
        </g>
      )
    case 'chart':
      return (
        <g>
          <path d="M -12 10 H 12 M -10 10 V 1 M -4 10 V -4 M 2 10 V 4 M 8 10 V -8" />
          <path d="M -10 -2 L -4 -6 L 2 0 L 8 -9" />
        </g>
      )
    case 'gremlin':
      return (
        <g>
          <path d="M -10 -5 L -4 -13 L 0 -7 L 4 -13 L 10 -5" />
          <circle cx="-5" cy="0" r="2" />
          <circle cx="5" cy="0" r="2" />
          <path d="M -6 8 L -2 5 L 2 8 L 6 5" />
        </g>
      )
    case 'walrus':
      return (
        <g>
          <ellipse cx="0" cy="-1" rx="11" ry="8" />
          <path d="M -9 2 Q 0 7 9 2" />
          <path d="M -5 3 V 11 M 5 3 V 11" />
          <path d="M -11 0 H -15 M 11 0 H 15" />
        </g>
      )
    case 'goblin':
      return (
        <g>
          <path d="M -12 -1 L -5 -7 M 12 -1 L 5 -7" />
          <ellipse cx="0" cy="0" rx="9" ry="8" />
          <circle cx="-4" cy="0" r="1.8" />
          <circle cx="4" cy="0" r="1.8" />
          <path d="M -4 6 L 0 3 L 4 6" />
        </g>
      )
    case 'robot':
      return (
        <g>
          <rect x="-10" y="-9" width="20" height="18" rx="3" />
          <path d="M 0 -9 V -13 M -3 -13 H 3" />
          <circle cx="-4" cy="-1" r="2" />
          <circle cx="4" cy="-1" r="2" />
          <path d="M -5 5 H 5" />
        </g>
      )
    case 'unicorn':
      return (
        <g>
          <path d="M 0 -14 L -2 -7 L 2 -7 Z" />
          <ellipse cx="-2" cy="0" rx="8" ry="7" />
          <path d="M -10 0 Q -14 2 -10 4" />
          <circle cx="-4" cy="-1" r="1.7" />
          <path d="M 2 4 Q 7 8 10 6" />
        </g>
      )
    case 'shark':
      return (
        <g>
          <path d="M -12 2 Q -2 -8 11 1 Q -2 10 -12 2 Z" />
          <path d="M -2 -3 L 1 -10 L 4 -2" />
          <circle cx="-5" cy="0" r="1.4" />
          <path d="M 2 3 L 4 5 L 6 3 L 8 5" />
        </g>
      )
    case 'octopus':
      return (
        <g>
          <path d="M -9 1 Q -9 -8 0 -8 Q 9 -8 9 1" />
          <path d="M -8 2 Q -10 8 -6 10 M -4 2 Q -5 9 -1 10 M 0 2 V 10 M 4 2 Q 5 9 1 10 M 8 2 Q 10 8 6 10" />
          <circle cx="-3" cy="-1" r="1.7" />
          <circle cx="3" cy="-1" r="1.7" />
        </g>
      )
    case 'llama':
      return (
        <g>
          <path d="M -5 9 V -5 Q -5 -10 0 -10 Q 5 -10 5 -5 V 9" />
          <path d="M -4 -10 L -7 -14 M 4 -10 L 7 -14" />
          <circle cx="-2" cy="-3" r="1.5" />
          <circle cx="2" cy="-3" r="1.5" />
        </g>
      )
    case 'hamster':
      return (
        <g>
          <circle cx="0" cy="0" r="9" />
          <circle cx="-6" cy="-7" r="3" />
          <circle cx="6" cy="-7" r="3" />
          <circle cx="-3" cy="0" r="1.5" />
          <circle cx="3" cy="0" r="1.5" />
          <path d="M -3 5 Q 0 7 3 5" />
        </g>
      )
    case 'blob':
      return (
        <g>
          <path d="M -11 2 Q -12 -9 -2 -10 Q 8 -12 11 -2 Q 12 9 1 10 Q -8 11 -11 2 Z" />
          <circle cx="-3" cy="-1" r="1.6" />
          <circle cx="4" cy="-2" r="1.6" />
        </g>
      )
    case 'raccoon':
      return (
        <g>
          <path d="M -9 -1 Q -7 -9 0 -9 Q 7 -9 9 -1 Q 10 7 0 9 Q -10 7 -9 -1 Z" />
          <path d="M -7 -1 H 7" />
          <circle cx="-4" cy="0" r="1.6" />
          <circle cx="4" cy="0" r="1.6" />
          <path d="M -2 5 Q 0 6 2 5" />
        </g>
      )
    case 'scientist':
      return (
        <g>
          <path d="M -6 -10 H 6 M -2 -10 V -5 M 2 -10 V -5" />
          <circle cx="-4" cy="0" r="3" />
          <circle cx="4" cy="0" r="3" />
          <path d="M -1 0 H 1 M 0 4 V 10 M -4 10 H 4 M -2 8 L -4 10 L -2 12 M 2 8 L 4 10 L 2 12" />
        </g>
      )
    default:
      return null
  }
}

export function MascotTableScene() {
  const seatCount = mascots.length
  const centerX = 460
  const centerY = 260
  const ringRadiusX = 330
  const ringRadiusY = 165

  return (
    <svg
      viewBox="0 0 920 520"
      role="img"
      aria-label="Monochrome outline scene of all mascots around a table with Penguin in the center seat."
      style={{ width: '100%', height: 'auto', display: 'block' }}
    >

      <ellipse cx={centerX} cy={centerY + 132} rx="315" ry="34" fill="none" stroke="#3b2a15" strokeOpacity="0.2" />

      <ellipse cx={centerX} cy={centerY} rx="280" ry="125" fill="#f8f2e7" stroke="#3b2a15" strokeWidth="3" />
      <ellipse cx={centerX} cy={centerY - 6} rx="240" ry="90" fill="none" stroke="#3b2a15" strokeOpacity="0.2" />

      {mascots.map((mascot, idx) => {
      const angle = -Math.PI / 2 + (idx / seatCount) * Math.PI * 2
      const x = centerX + Math.cos(angle) * ringRadiusX
      const y = centerY + Math.sin(angle) * ringRadiusY

      return (
        <g key={`${mascot}-${idx}`} transform={`translate(${x}, ${y})`} fill="none" stroke="#3b2a15">
        <ellipse cx="0" cy="55" rx="28" ry="10" strokeOpacity="0.2" />
        <rect x="-22" y="18" width="44" height="32" rx="10" strokeOpacity="0.35" />

        <circle cx="0" cy="0" r="26" strokeWidth="2" />
        <g strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <MascotSilhouette mascot={mascot} />
        </g>
        </g>
      )
      })}

      <image href={monologo} x={centerX - 60} y={centerY - 60} width="120" height="120" />
    </svg>
  )
}
