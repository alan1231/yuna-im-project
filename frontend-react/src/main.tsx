import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './i18n'
import './style.css'
import App from './App'

const appElement = document.getElementById('app')

if (!appElement) {
  throw new Error('App root element was not found.')
}

createRoot(appElement).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
