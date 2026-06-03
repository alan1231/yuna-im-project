import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getChangeClass } from '../../utils/stockChange'
import { localizeStockText, parseStockReply } from '../../utils/stockReply'

const formatNumber = (value, language, options = {}) => {
  if (!Number.isFinite(value)) return '-'
  return new Intl.NumberFormat(language, {
    minimumFractionDigits: options.minimumFractionDigits ?? 2,
    maximumFractionDigits: options.maximumFractionDigits ?? 2,
  }).format(value)
}

function StockReplyCard({ stock, language, t }) {
  const trendClass =
    stock.changePercent > 0
      ? 'stock-card-value-up'
      : stock.changePercent < 0
        ? 'stock-card-value-down'
        : ''

  return (
    <div className="stock-card" aria-label={`${stock.symbol} stock quote`}>
      <header className="stock-card-header">
        <span className="stock-card-kicker">{t('chat.stockBotName')}</span>
        <strong>{stock.symbol}</strong>
      </header>

      <div className="stock-card-metrics">
        <section>
          <span>{t('stockCard.price')}</span>
          <strong>{formatNumber(stock.price, language)}</strong>
        </section>
        <section>
          <span>{t('stockCard.change')}</span>
          <strong className={trendClass}>{formatNumber(stock.changePercent, language)}%</strong>
        </section>
      </div>

      <div className="stock-card-dividend">
        {stock.noDividendData ? (
          <p>{t('stockCard.noDividends')}</p>
        ) : (
          <>
            <div className="stock-card-dividend-summary">
              <span>{t('stockCard.latestDividend')}</span>
              <strong>
                {stock.latestDividend
                  ? `${formatNumber(stock.latestDividend.amount, language)} (${stock.latestDividend.date})`
                  : '-'}
              </strong>
            </div>
            <div className="stock-card-dividend-summary">
              <span>{t('stockCard.trailingTotal')}</span>
              <strong>
                {stock.trailingDividendTotal === null
                  ? '-'
                  : formatNumber(stock.trailingDividendTotal, language)}
              </strong>
            </div>
          </>
        )}
      </div>

      {stock.dividendRecords.length > 0 ? (
        <div className="stock-card-records">
          {stock.dividendRecords.map((record) => (
            <div key={`${record.date}-${record.amount}`}>
              <span>{record.date}</span>
              <strong>{formatNumber(record.amount, language)}</strong>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default function MessageBubble({ message }) {
  const { i18n, t } = useTranslation()
  const [isImagePreviewOpen, setIsImagePreviewOpen] = useState(false)
  const imagePreviewModal = useRef(null)
  const isSelf = Boolean(message.isSelf)
  const isPending = Boolean(message.isPending)
  const hasText = Boolean(message.text)
  const hasAttachment = Boolean(message.attachmentUrl)
  const isImageAttachment = message.attachmentType?.startsWith('image/')
  const attachmentLabel = message.attachmentName || t('chat.file')
  const changeClass = getChangeClass(message)
  const stockReply = !isSelf && !isPending ? parseStockReply(message.text) : null
  const displayText = localizeStockText(message.text, t)
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
    stockReply ? 'message-stock-card' : '',
  ]
    .filter(Boolean)
    .join(' ')

  useEffect(() => {
    if (isImagePreviewOpen) {
      imagePreviewModal.current?.focus()
    }
  }, [isImagePreviewOpen])

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
        {isPending ? (
          <div className="typing-indicator" aria-label={t('chat.stockBotTyping')}>
            <span />
            <span />
            <span />
          </div>
        ) : null}
        {!isPending && stockReply ? (
          <StockReplyCard stock={stockReply} language={i18n.language} t={t} />
        ) : null}
        {!isPending && hasText && !stockReply ? <p className={changeClass}>{displayText}</p> : null}
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
