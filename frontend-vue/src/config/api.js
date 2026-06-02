const localAPIHost = window.location.hostname || 'localhost'
const localAPIURL = `http://${localAPIHost}:8080`
const localWSURL = `ws://${localAPIHost}:8080/ws`

export const API_URL = import.meta.env.VITE_API_URL || localAPIURL
export const WS_URL = import.meta.env.VITE_WS_URL || localWSURL
