import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import { getChangeClass } from '../../utils/stockChange'

export default function MessageBubble({ message }) {
  const [isImagePreviewOpen, setIsImagePreviewOpen] = useState(false)
  const imagePreviewModal = useRef(null)
  const isSelf = Boolean(message.isSelf)
  const isPending = Boolean(message.isPending)
  const hasText = Boolean(message.text)
  const hasAttachment = Boolean(message.attachmentUrl)
  const isImageAttachment = message.attachmentType?.startsWith('image/')
  const attachmentLabel = message.attachmentName || '檔案'
  const changeClass = getChangeClass(message)
  const sentTime = (() => {
    const date = new Date(message.sentAt)
    if (Number.isNaN(date.getTime())) return message.sentAt || ''

    return date.toLocaleTimeString('zh-TW', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  })()
  const readStatusLabel = isSelf ? (message.readAt ? '已讀' : '未讀') : ''

  useEffect(() => {
    if (isImagePreviewOpen) {
      imagePreviewModal.current?.focus()
    }
  }, [isImagePreviewOpen])

  return (
    <>
      <article className={`message ${isSelf ? 'message-self' : ''} ${isPending ? 'message-pending' : ''}`}>
        {hasAttachment && isImageAttachment ? (
          <a
            className="message-image-link"
            href={message.attachmentUrl}
            aria-label={attachmentLabel}
            onClick={(event) => {
              event.preventDefault()
              setIsImagePreviewOpen(true)
            }}
          >
            <img
              className="message-image"
              src={message.attachmentUrl}
              alt={attachmentLabel}
              loading="lazy"
            />
          </a>
        ) : null}
        {hasAttachment && !isImageAttachment ? (
          <a
            className="message-file-link"
            href={message.attachmentUrl}
            target="_blank"
            rel="noreferrer"
            download={attachmentLabel}
          >
            <span className="message-file-icon" aria-hidden="true">
              檔
            </span>
            <span>{attachmentLabel}</span>
          </a>
        ) : null}
        {isPending ? (
          <div className="typing-indicator" aria-label="股票機器人正在回覆">
            <span />
            <span />
            <span />
          </div>
        ) : null}
        {!isPending && hasText ? <p className={changeClass}>{message.text}</p> : null}
        {!isPending ? (
          <footer className="message-footer">
            {sentTime ? <time>{sentTime}</time> : null}
            {isSelf ? (
              <span
                className={`message-read-status ${message.readAt ? 'message-read-status-read' : ''}`}
                aria-label={readStatusLabel}
                title={readStatusLabel}
              >
                <span />
                {message.readAt ? <span /> : null}
              </span>
            ) : null}
          </footer>
        ) : null}
      </article>

      {isImagePreviewOpen
        ? createPortal(
            <div
              ref={imagePreviewModal}
              className="image-preview-modal"
              role="dialog"
              aria-modal="true"
              aria-label={attachmentLabel}
              tabIndex="0"
              onClick={(event) => {
                if (event.target === event.currentTarget) setIsImagePreviewOpen(false)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setIsImagePreviewOpen(false)
              }}
            >
              <button
                type="button"
                className="image-preview-close"
                aria-label="關閉圖片預覽"
                title="關閉圖片預覽"
                onClick={() => setIsImagePreviewOpen(false)}
              >
                ×
              </button>
              <img className="image-preview-full" src={message.attachmentUrl} alt={attachmentLabel} />
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
