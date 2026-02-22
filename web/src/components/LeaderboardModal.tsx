import { useEffect, useState } from 'react'
import { apiFetch } from '../utils/api'
import { getMascotColor, getMascotImage, getMascotName } from '../utils/mascots'

type LeaderboardModalProps = {
  roomCode: string
  inline?: boolean
}

type GameResponse = {
  ok: boolean
  room?: {
    playerScores: Record<string, number>
  }
  players?: Array<{ name: string; mascot?: string }>
}

export default function LeaderboardModal({ roomCode, inline = false }: LeaderboardModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [playerScores, setPlayerScores] = useState<Record<string, number>>({})
  const [playerMascots, setPlayerMascots] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!isOpen) return

    const load = async () => {
      try {
        const response = await apiFetch(`/api/room/${roomCode}/game`)
        if (!response.ok) return

        const data = (await response.json()) as GameResponse
        if (data.ok && data.room) {
          setPlayerScores(data.room.playerScores ?? {})
        }

        if (data.players) {
          const nextMascots: Record<string, string> = {}
          data.players.forEach((entry) => {
            if (entry.mascot) {
              nextMascots[entry.name] = entry.mascot
            }
          })
          setPlayerMascots(nextMascots)
        }
      } catch (err) {
        console.error('Error loading leaderboard:', err)
      }
    }

    void load()
    const interval = window.setInterval(load, 2000)
    return () => window.clearInterval(interval)
  }, [isOpen, roomCode])

  return (
    <>
      {/* Button */}
      <button
        onClick={() => setIsOpen(true)}
        style={{
          padding: inline ? '6px 12px' : '8px 16px',
          borderRadius: '8px',
          backgroundColor: '#d4a574',
          border: '2px solid rgba(212, 165, 116, 0.3)',
          color: '#fff',
          fontSize: inline ? '13px' : '14px',
          fontWeight: '600',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: inline ? '6px' : '8px',
          boxShadow: inline ? '0 1px 4px rgba(212, 165, 116, 0.2)' : '0 2px 8px rgba(212, 165, 116, 0.2)',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.boxShadow =
            '0 4px 12px rgba(212, 165, 116, 0.3)'
          ;(e.currentTarget as HTMLButtonElement).style.transform =
            'translateY(-2px)'
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.boxShadow =
            '0 2px 8px rgba(212, 165, 116, 0.2)'
          ;(e.currentTarget as HTMLButtonElement).style.transform =
            'translateY(0)'
        }}
        title="View Leaderboard"
      >
        <span>📊</span>
        <span>{inline ? 'Scores' : 'Leaderboard'}</span>
      </button>

      {/* Modal Backdrop */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          {/* Modal Content */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#fffaf1',
              borderRadius: '16px',
              padding: '28px',
              maxWidth: '500px',
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto',
              boxShadow: '0 20px 60px rgba(40, 30, 20, 0.3)',
              border: '2px solid rgba(212, 165, 116, 0.2)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
              }}
            >
              <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 700 }}>
                📊 Leaderboard
              </h2>
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '28px',
                  cursor: 'pointer',
                  padding: '0',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gap: '12px' }}>
              {Object.entries(playerScores ?? {})
                .sort(([, a], [, b]) => b - a)
                .map(([player, score], index) => (
                  <div
                    key={player}
                    style={{
                      backgroundColor: getMascotColor(
                        playerMascots[player]
                      ),
                      padding: '12px',
                      borderRadius: '12px',
                      border: index === 0
                        ? '2px solid rgba(212, 165, 116, 0.6)'
                        : '1px solid rgba(70, 60, 50, 0.12)',
                      display: 'grid',
                      gridTemplateColumns: '40px 1fr auto',
                      gap: '12px',
                      alignItems: 'center',
                      boxShadow: '0 4px 10px rgba(40, 30, 20, 0.08)',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: '18px',
                        textAlign: 'center',
                      }}
                    >
                      {index === 0 ? '👑' : index + 1}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                      }}
                    >
                      <div
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '12px',
                          background: 'rgba(59, 42, 21, 0.08)',
                          border: '1px solid rgba(59, 42, 21, 0.12)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {playerMascots[player] && (
                          <img
                            src={getMascotImage(playerMascots[player]) ?? ''}
                            alt=""
                            style={{ width: '28px', height: '28px' }}
                          />
                        )}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '2px',
                        }}
                      >
                        <span style={{ fontWeight: 700, fontSize: '14px' }}>
                          {player}
                        </span>
                        <span
                          style={{
                            fontSize: '12px',
                            color: '#6b6056',
                          }}
                        >
                          {getMascotName(playerMascots[player]) ?? 'Mascot'}
                        </span>
                      </div>
                    </div>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: '16px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      ${score * 100}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
