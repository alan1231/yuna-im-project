export const cloudApiUrl = 'https://yuna-im-project.onrender.com'
export const cloudWsUrl = 'wss://yuna-im-project.onrender.com/ws'
export const profileStorageKey = 'yuna-im-mobile-rn-profile'
export const stockBotId = 'stock_bot'
export const stockBotName = '行情小幫手'
export const maxCachedMessagesPerConversation = 200

const apiHost = process.env.EXPO_PUBLIC_API_HOST || ''
const apiPort = process.env.EXPO_PUBLIC_API_PORT || '8080'

export const apiBaseUrl = trimTrailingSlash(
  process.env.EXPO_PUBLIC_API_URL ||
    (apiHost ? `http://${apiHost}:${apiPort}` : cloudApiUrl),
)

export const wsBaseUrl = trimTrailingSlash(
  process.env.EXPO_PUBLIC_WS_URL ||
    (apiHost ? `ws://${apiHost}:${apiPort}/ws` : cloudWsUrl),
)

function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/, '')
}
