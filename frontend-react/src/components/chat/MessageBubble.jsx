import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { blackjackInviteExpiresAt } from '../../utils/blackjack'

export default function MessageBubble({ message, showSenderName = false, onGameResponse }) {
  const { i18n, t } = useTranslation()
  const [isImagePreviewOpen, setIsImagePreviewOpen] = useState(false)
  const [isGameInviteExpired, setIsGameInviteExpired] = useState(false)
  const [isGameResponsePending, setIsGameResponsePending] = useState(false)
  const imagePreviewModal = useRef(null)
  const isSelf = Boolean(message.isSelf)
  const isPending = Boolean(message.isPending)
  const hasText = Boolean(message.text)
  const hasAttachment = Boolean(message.attachmentUrl)
  const isBlackjackInvite = message.gameType === 'blackjack' && message.gameAction === 'invite'
  const isImageAttachment = message.attachmentType?.startsWith('image/')
  const attachmentLabel = message.attachmentName || t('chat.file')
  const sentTime = (() => {
    const date = new Date(message.sentAt)
    if (Number.isNaN(date.getTime())) return message.sentAt || ''

    return date.toLocaleTimeString(i18n.language, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  })()
  const readStatusLabel = isSelf ? (message.readAt ? t('chat.read') : t('chat.unread')) : ''
  const messageClassName = [
    'message',
    isSelf ? 'message-self' : '',
    isPending ? 'message-pending' : '',
  ]
    .filter(Boolean)
    .join(' ')

  useEffect(() => {
    if (isImagePreviewOpen) {
      imagePreviewModal.current?.focus()
    }
  }, [isImagePreviewOpen])

  useEffect(() => {
    if (!isBlackjackInvite || message.gameResponse) return undefined
    const expiresAt = blackjackInviteExpiresAt(message.sentAt)
    const refreshExpiration = () => setIsGameInviteExpired(Date.now() >= expiresAt)
    refreshExpiration()
    const timer = window.setTimeout(refreshExpiration, Math.max(0, expiresAt - Date.now()))
    return () => window.clearTimeout(timer)
  }, [isBlackjackInvite, message.gameResponse, message.sentAt])

  useEffect(() => {
    if (message.gameResponse) setIsGameResponsePending(false)
  }, [message.gameResponse])

  useEffect(() => {
    if (!isGameResponsePending) return undefined
    const timer = window.setTimeout(() => setIsGameResponsePending(false), 10_000)
    return () => window.clearTimeout(timer)
  }, [isGameResponsePending])

  return (
    <>
      <article className={messageClassName}>
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
              {t('chat.fileIcon')}
            </span>
            <span>{attachmentLabel}</span>
          </a>
        ) : null}
        {!isPending && showSenderName && !isSelf && message.sender ? (
          <span className="message-sender-name">{message.sender}</span>
        ) : null}
        {!isPending && isBlackjackInvite ? (
          <div className="game-invite-card">
            <span className="game-invite-icon" aria-hidden="true">♠</span>
            <strong>{t('chat.blackjackTitle')}</strong>
            <p>{t('chat.blackjackInvite')}</p>
            {!isSelf && message.gameId && !message.gameResponse && !isGameInviteExpired ? (
              <div className="game-invite-actions">
                <button type="button" disabled={isGameResponsePending} onClick={() => {
                  setIsGameResponsePending(true)
                  onGameResponse?.(message.gameId, true)
                }}>
                  {t('chat.gameAccept')}
                </button>
                <button type="button" disabled={isGameResponsePending} onClick={() => {
                  setIsGameResponsePending(true)
                  onGameResponse?.(message.gameId, false)
                }}>
                  {t('chat.gameReject')}
                </button>
              </div>
            ) : null}
            {message.gameResponse || isGameInviteExpired || isSelf || isGameResponsePending ? (
              <span className="game-invite-response">
                {message.gameResponse === 'accept'
                  ? t('chat.gameInviteAccepted')
                  : message.gameResponse === 'reject'
                    ? t('chat.gameInviteRejected')
                    : isGameResponsePending
                      ? t('chat.blackjackProcessing')
                      : isGameInviteExpired
                      ? t('chat.gameInviteExpired')
                      : t('chat.gameInvitePending')}
              </span>
            ) : null}
          </div>
        ) : null}
        {!isPending && !isBlackjackInvite && hasText ? <p>{message.text}</p> : null}
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
                aria-label={t('chat.imagePreviewClose')}
                title={t('chat.imagePreviewClose')}
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
