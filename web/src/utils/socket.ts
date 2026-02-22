import { io, type Socket } from 'socket.io-client'
import { API_BASE_URL } from './api'

let socket: Socket | null = null

export const getSocket = () => {
  if (!socket) {
    socket = io(API_BASE_URL || undefined, {
      autoConnect: false,
      withCredentials: true
    })
  }
  return socket
}
