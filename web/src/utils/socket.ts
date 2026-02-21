import { io, type Socket } from 'socket.io-client'

let socket: Socket | null = null

export const getSocket = () => {
  if (!socket) {
    socket = io({
      autoConnect: false,
      withCredentials: true
    })
  }
  return socket
}
