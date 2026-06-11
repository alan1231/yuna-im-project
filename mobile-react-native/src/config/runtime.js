export const cloudApiUrl = 'https://yuna-im-project.onrender.com'
export const cloudWsUrl = 'wss://yuna-im-project.onrender.com/ws'
export const profileStorageKey = 'yuna-im-mobile-rn-profile'
export const stockBotId = 'stock_bot'
export const stockBotName = '行情小幫手'
export const maxCachedMessagesPerConversation = 200

const runtimeOverrides = loadRuntimeOverrides()
const apiHost = runtimeOverrides.apiHost || ''
const apiPort = runtimeOverrides.apiPort || '8080'

export const apiBaseUrl = trimTrailingSlash(
  runtimeOverrides.apiBaseUrl || (apiHost ? `http://${apiHost}:${apiPort}` : cloudApiUrl),
)

export const wsBaseUrl = trimTrailingSlash(
  runtimeOverrides.wsBaseUrl || (apiHost ? `ws://${apiHost}:${apiPort}/ws` : cloudWsUrl),
)

function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/, '')
}

function loadRuntimeOverrides() {
  try {
    const runtimeModule = require('./runtime.local')
    return runtimeModule.default || runtimeModule
  } catch {
    return {}
  }
}
