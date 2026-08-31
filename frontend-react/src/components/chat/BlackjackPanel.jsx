import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

export default function BlackjackPanel({ game, currentUserId, opponentOnline = true, pendingAction, onAction, onClose }) {
  const { t } = useTranslation()
  const [remainingSeconds, setRemainingSeconds] = useState(0)

  useEffect(() => {
    if (game?.status !== 'playing' || !game.deadline_at) {
      setRemainingSeconds(0)
      return undefined
    }
    const updateRemaining = () => {
      setRemainingSeconds(Math.max(0, Math.ceil((new Date(game.deadline_at).getTime() - Date.now()) / 1000)))
    }
    updateRemaining()
    const timer = window.setInterval(updateRemaining, 1000)
    return () => window.clearInterval(timer)
  }, [game?.deadline_at, game?.status])

  if (!game) return null

  const playerIds = game.player_ids || []
  const opponentId = playerIds.find((id) => id !== currentUserId) || playerIds[0]
  const hand = game.hands?.[currentUserId] || []
  const opponentHand = game.hands?.[opponentId] || []
  const opponentHiddenCards = game.hidden_card_counts?.[opponentId] || 0
  const isMyTurn = game.status === 'playing' && game.current_turn === currentUserId
  const isPlaying = game.status === 'playing'
  const isTerminal = game.status === 'finished' || game.status === 'canceled'
  const handScore = game.scores?.[currentUserId] ?? 0
  const opponentScore = game.scores?.[opponentId] ?? '?'
  const handState = game.player_states?.[currentUserId] || 'playing'
  const opponentState = opponentOnline ? game.player_states?.[opponentId] || 'playing' : 'offline'
  const isActionPending = pendingAction?.gameId === game.game_id
  const hasRequestedRestart = Boolean(game.restart_votes?.[currentUserId])
  const opponentRequestedRestart = Boolean(game.restart_votes?.[opponentId])
  const startingPlayerId = game.starting_player || playerIds[0]
  const startingPlayerLabel = startingPlayerId === currentUserId
    ? t('chat.blackjackYouStart')
    : t('chat.blackjackOpponentStarts')
  const statusLabel = game.status === 'finished'
    ? t('chat.blackjackFinished')
    : game.status === 'canceled'
      ? t('chat.blackjackCanceled')
      : isMyTurn
        ? t('chat.blackjackYourTurn')
        : t('chat.blackjackOpponentTurn')
  const resultReason = game.result_reason
    ? t(`chat.blackjackResultReasons.${game.result_reason}`)
    : ''
  const outcomeClass = game.status === 'finished'
    ? game.winner === 'draw'
      ? 'blackjack-panel-draw'
      : game.winner === currentUserId
        ? 'blackjack-panel-win'
        : 'blackjack-panel-lose'
    : ''

  const formatCountdown = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

  const renderHand = (cards, hiddenCardCount, label, score, playerState, active, owner) => (
    <div className={`blackjack-player blackjack-player-${owner} blackjack-player-${playerState} ${active ? 'is-active' : ''}`}>
      <div className="blackjack-player-meta">
        <span className="blackjack-player-label">
          <i aria-hidden="true" />
          {label}
          <em>{t(`chat.blackjackPlayerStates.${playerState}`)}</em>
        </span>
        <span className="blackjack-score" aria-label={`${label}: ${score}`}>
          <strong>{score}</strong>
          <small>/21</small>
        </span>
      </div>
      <div className="blackjack-cards" role="list">
        {cards.map((card, index) => (
          <img
            key={card}
            src={`/blackjack/cards/${card}.jpg`}
            alt={card}
            role="listitem"
            style={{ '--card-tilt': `${(index - (cards.length - 1) / 2) * 2.2}deg` }}
          />
        ))}
        {Array.from({ length: hiddenCardCount }, (_, index) => (
          <span key={`hidden-${index}`} className="blackjack-card-back" role="img" aria-label={t('chat.blackjackHiddenCard')} />
        ))}
      </div>
    </div>
  )

  return (
    <section className={`blackjack-panel blackjack-panel-${game.status} ${outcomeClass}`} aria-label={t('chat.blackjackTitle')}>
      <div className="blackjack-table-pattern" aria-hidden="true" />
      <div className="blackjack-panel-heading">
        <span className="blackjack-suit" aria-hidden="true"><b>♠</b><i>♦</i></span>
        <div className="blackjack-title-lockup">
          <p className="eyebrow">Neon Ghost Game</p>
          <h2>{t('chat.blackjackTitle')}</h2>
        </div>
        <span className={`blackjack-status ${isMyTurn ? 'is-your-turn' : ''}`}>
          <i aria-hidden="true" />
          {statusLabel}
        </span>
        {isPlaying ? <time className="blackjack-countdown" aria-label={t('chat.blackjackTimeRemaining')}>{formatCountdown(remainingSeconds)}</time> : null}
        {isTerminal ? (
          <button type="button" className="blackjack-close-button" aria-label={t('chat.blackjackClose')} title={t('chat.blackjackClose')} onClick={onClose}>
            ×
          </button>
        ) : null}
      </div>

      <div className="blackjack-table">
        {renderHand(opponentHand, opponentHiddenCards, t('chat.blackjackOpponent'), opponentScore, opponentState, isPlaying && !isMyTurn, 'opponent')}
        <div className="blackjack-table-center" aria-hidden="true">
          <span className="blackjack-rule">{startingPlayerLabel}</span>
          <div className="blackjack-deck"><i /><i /><i /></div>
          <span className="blackjack-turn-marker">{isMyTurn ? 'YOUR MOVE' : '21'}</span>
        </div>
        {renderHand(hand, 0, t('chat.blackjackYou'), handScore, handState, isMyTurn, 'self')}
      </div>

      {game.status === 'canceled' ? (
        <div className="blackjack-actions blackjack-actions-result">
          <p className="blackjack-result">{t('chat.blackjackCanceled')}</p>
          {resultReason ? <span className="blackjack-result-reason">{resultReason}</span> : null}
          {opponentRequestedRestart && !hasRequestedRestart ? <span className="blackjack-result-reason">{t('chat.blackjackOpponentReady')}</span> : null}
          <button type="button" disabled={isActionPending || hasRequestedRestart} onClick={() => onAction?.(game.game_id, 'restart')}>
            {hasRequestedRestart ? t('chat.blackjackWaitingRestart') : isActionPending ? t('chat.blackjackProcessing') : t('chat.blackjackRestart')}
          </button>
          <button type="button" className="blackjack-action-cancel" onClick={onClose}>{t('chat.blackjackClose')}</button>
        </div>
      ) : game.status === 'finished' ? (
        <div className="blackjack-actions blackjack-actions-result">
          <p className="blackjack-result">{game.winner === 'draw' ? t('chat.blackjackDraw') : game.winner === currentUserId ? t('chat.blackjackWin') : t('chat.blackjackLose')}</p>
          {resultReason ? <span className="blackjack-result-reason">{resultReason}</span> : null}
          {opponentRequestedRestart && !hasRequestedRestart ? <span className="blackjack-result-reason">{t('chat.blackjackOpponentReady')}</span> : null}
          <button type="button" disabled={isActionPending || hasRequestedRestart} onClick={() => onAction?.(game.game_id, 'restart')}>
            {hasRequestedRestart ? t('chat.blackjackWaitingRestart') : isActionPending ? t('chat.blackjackProcessing') : t('chat.blackjackRestart')}
          </button>
          <button type="button" className="blackjack-action-cancel" onClick={onClose}>{t('chat.blackjackClose')}</button>
        </div>
      ) : (
        <div className="blackjack-actions">
          <button className="blackjack-action-primary" type="button" disabled={!isMyTurn || isActionPending} onClick={() => onAction?.(game.game_id, 'hit')}><span>＋</span>{isActionPending ? t('chat.blackjackProcessing') : t('chat.blackjackHit')}</button>
          <button type="button" disabled={!isMyTurn || isActionPending} onClick={() => onAction?.(game.game_id, 'stand')}><span>◆</span>{t('chat.blackjackStand')}</button>
          <button className="blackjack-action-cancel" type="button" disabled={isActionPending} onClick={() => onAction?.(game.game_id, 'cancel')}>{t('chat.blackjackCancel')}</button>
        </div>
      )}
    </section>
  )
}
