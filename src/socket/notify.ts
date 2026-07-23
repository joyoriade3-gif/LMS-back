// src/socket/notify.ts
import type { Server } from 'socket.io'

let ioInstance: Server | null = null
const userSockets = new Map<string, Set<string>>()

export function setIO(io: Server) { ioInstance = io }

export function registerUserSocket(userId: string, socketId: string) {
  if (!userSockets.has(userId)) userSockets.set(userId, new Set())
  userSockets.get(userId)!.add(socketId)
}

export function unregisterSocket(socketId: string) {
  for (const [userId, ids] of userSockets.entries()) {
    ids.delete(socketId)
    if (ids.size === 0) userSockets.delete(userId)
  }
}

export function getOnlineUserIds() {
  return Array.from(userSockets.keys())
}

export function emitNotificationToUser(userId: string, notification: Record<string, any>) {
  if (!ioInstance) return
  const socketIds = userSockets.get(String(userId))
  if (!socketIds) return
  for (const id of socketIds) ioInstance.to(id).emit('new_notification', notification)
}