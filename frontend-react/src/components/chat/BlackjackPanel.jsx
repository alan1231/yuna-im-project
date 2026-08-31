import { useTranslation } from 'react-i18next'

export default function BlackjackPanel({ game, currentUserId, onAction }) {
  const { t } = useTranslation()
  if (!game) return null

  const playerIds = game.player_ids || []
  const opponentId = playerIds.find((id) => id !== currentUserId) || playerIds[0]
  const hand = game.hands?.[currentUserId] || []
  const opponentHand = game.hands?.[opponentId] || []
  const isMyTurn = game.status === 'playing' && game.current_turn === currentUserId
  const isPlaying = game.status === 'playing'
  const handScore = game.scores?.[currentUserId] ?? 0
  const opponentScore = game.scores?.[opponentId] ?? 0
  const statusLabel = game.status === 'finished'
    ? t('chat.blackjackFinished')
    : game.status === 'canceled'
      ? t('chat.blackjackCanceled')
      : isMyTurn
        ? t('chat.blackjackYourTurn')
        : t('chat.blackjackOpponentTurn')

  const renderHand = (cards, label, score, active, owner) => (
    <div className={`blackjack-player blackjack-player-${owner} ${active ? 'is-active' : ''}`}>
      <div className="blackjack-player-meta">
        <span className="blackjack-player-label">
          <i aria-hidden="true" />
          {label}
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
      </div>
    </div>
  )

  return (
    <section className={`blackjack-panel blackjack-panel-${game.status}`} aria-label={t('chat.blackjackTitle')}>
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
      </div>

      <div className="blackjack-table">
        {renderHand(opponentHand, t('chat.blackjackOpponent'), opponentScore, isPlaying && !isMyTurn, 'opponent')}
        <div className="blackjack-table-center" aria-hidden="true">
          <span className="blackjack-rule">BLACKJACK PAYS 3 TO 2</span>
          <div className="blackjack-deck"><i /><i /><i /></div>
          <span className="blackjack-turn-marker">{isMyTurn ? 'YOUR MOVE' : '21'}</span>
        </div>
        {renderHand(hand, t('chat.blackjackYou'), handScore, isMyTurn, 'self')}
      </div>

      {game.status === 'canceled' ? (
        <div className="blackjack-actions blackjack-actions-result">
          <p className="blackjack-result">{t('chat.blackjackCanceled')}</p>
          <button type="button" onClick={() => onAction?.(game.game_id, 'restart')}>{t('chat.blackjackRestart')}</button>
        </div>
      ) : game.status === 'finished' ? (
        <div className="blackjack-actions blackjack-actions-result">
          <p className="blackjack-result">{game.winner === 'draw' ? t('chat.blackjackDraw') : game.winner === currentUserId ? t('chat.blackjackWin') : t('chat.blackjackLose')}</p>
          <button type="button" onClick={() => onAction?.(game.game_id, 'restart')}>{t('chat.blackjackRestart')}</button>
        </div>
      ) : (
        <div className="blackjack-actions">
          <button className="blackjack-action-primary" type="button" disabled={!isMyTurn} onClick={() => onAction?.(game.game_id, 'hit')}><span>＋</span>{t('chat.blackjackHit')}</button>
          <button type="button" disabled={!isMyTurn} onClick={() => onAction?.(game.game_id, 'stand')}><span>◆</span>{t('chat.blackjackStand')}</button>
          <button className="blackjack-action-cancel" type="button" onClick={() => onAction?.(game.game_id, 'cancel')}>{t('chat.blackjackCancel')}</button>
        </div>
      )}
    </section>
  )
}
