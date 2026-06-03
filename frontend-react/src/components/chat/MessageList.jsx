import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import MessageBubble from './MessageBubble.jsx'

const parseMessageDate = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? new Date() : date
}

const dateKey = (value) => {
  const date = parseMessageDate(value)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

const formatDateLabel = (value, t, language) => {
  const date = parseMessageDate(value)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)

  if (dateKey(value) === dateKey(today)) return t('chat.today')
  if (dateKey(value) === dateKey(yesterday)) return t('chat.yesterday')

  const sameYear = date.getFullYear() === today.getFullYear()
  return date.toLocaleDateString(language, {
    year: sameYear ? undefined : 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

const stockQuickQueries = ['2330', '2317', 'NVDA', 'TSM']

function StockEmptyState({ activeRoom, onQuickStockQuery }) {
  const { t } = useTranslation()

  return (
    <div className="stock-empty-state">
      <span>{t('chat.stockEmptyKicker')}</span>
      <h2>{activeRoom.name}</h2>
      <p>{t('chat.stockEmptyDescription')}</p>
      <div className="stock-empty-actions" aria-label={t('chat.stockQuickQueries')}>
        {stockQuickQueries.map((symbol) => (
          <button key={symbol} type="button" onClick={() => onQuickStockQuery?.(symbol)}>
            {symbol}
          </button>
        ))}
      </div>
      <small>{t('chat.stockEmptyHint')}</small>
    </div>
  )
}

export default function MessageList({ messages, activeRoom, onQuickStockQuery }) {
  const { i18n, t } = useTranslation()
  const messageList = useRef(null)
  const messageEnd = useRef(null)
  const messageItems = useMemo(() => {
    const items = []
    let previousDateKey = ''

    messages.forEach((message, index) => {
      const currentDateKey = dateKey(message.sentAt)
      if (currentDateKey !== previousDateKey) {
        items.push({
          type: 'date',
          key: `date-${currentDateKey}-${index}`,
          label: formatDateLabel(message.sentAt, t, i18n.language),
        })
        previousDateKey = currentDateKey
      }

      items.push({
        type: 'message',
        key: `${message.sender}-${message.sentAt}-${index}`,
        message,
      })
    })

    return items
  }, [i18n.language, messages, t])

  useEffect(() => {
    requestAnimationFrame(() => {
      messageEnd.current?.scrollIntoView({ block: 'end' })

      if (messageList.current) {
        messageList.current.scrollTop = messageList.current.scrollHeight
      }
    })
  }, [messages.length])

  return (
    <section ref={messageList} className="message-list" aria-live="polite">
      {messages.length === 0 && activeRoom.id === 'stock_bot' ? (
        <StockEmptyState activeRoom={activeRoom} onQuickStockQuery={onQuickStockQuery} />
      ) : null}
      {messages.length === 0 && activeRoom.id !== 'stock_bot' ? (
        <p className="empty-state">{activeRoom.description}</p>
      ) : null}

      {messageItems.map((item) =>
        item.type === 'date' ? (
          <div key={item.key} className="message-date-divider">
            {item.label}
          </div>
        ) : (
          <MessageBubble key={item.key} message={item.message} />
        ),
      )}

      <div ref={messageEnd} className="message-end" aria-hidden="true" />
    </section>
  )
}
