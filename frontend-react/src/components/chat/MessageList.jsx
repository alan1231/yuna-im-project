import { useEffect, useMemo, useRef } from 'react'
import MessageBubble from './MessageBubble.jsx'

const parseMessageDate = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? new Date() : date
}

const dateKey = (value) => {
  const date = parseMessageDate(value)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

const formatDateLabel = (value) => {
  const date = parseMessageDate(value)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)

  if (dateKey(value) === dateKey(today)) return '今天'
  if (dateKey(value) === dateKey(yesterday)) return '昨天'

  const sameYear = date.getFullYear() === today.getFullYear()
  return date.toLocaleDateString('zh-TW', {
    year: sameYear ? undefined : 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default function MessageList({ messages, activeRoom }) {
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
          label: formatDateLabel(message.sentAt),
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
  }, [messages])

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
      {messages.length === 0 ? <p className="empty-state">{activeRoom.description}</p> : null}

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
