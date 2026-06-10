import { stockBotId } from '../config/runtime'
import { formatStockPreview } from './stockReply'

export function initials(name) {
  return String(name || '?').slice(0, 1).toUpperCase()
}

export function userToRoomListCandidate(user) {
  return {
    kind: 'user',
    listKey: `user:${user.id}`,
    name: user.displayName,
    online: user.online,
    user,
  }
}

export function roomPreview(room) {
  if (room.lastMessage) {
    if (room.id === stockBotId) return formatStockPreview(room.lastMessage)
    return room.lastMessage
  }
  if (room.id === stockBotId) return '輸入股票代號查詢行情'
  if (room.isGroup) return '群組對話'
  if (room.isFriend) return room.online ? '在線上' : '好友'
  return '開始對話'
}
