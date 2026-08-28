import { useTranslation } from 'react-i18next'

export default function BlackjackPanel({ game, currentUserId, onAction }) {
  const { t } = useTranslation()
  if (!game) return null

  const playerIds = game.player_ids || []
  const opponentId = playerIds.find((id) => id !== currentUserId) || playerIds[0]
  const hand = game.hands?.[currentUserId] || []
  const opponentHand = game.hands?.[opponentId] || []
  const isMyTurn = game.status === 'playing' && game.current_turn === currentUserId

  const renderCards = (cards, label) => (
    <div className="blackjack-hand">
      <span>{label}</span>
      <div className="blackjack-cards">
        {cards.map((card) => (
          <img key={card} src={`/blackjack/cards/${card}.jpg`} alt={card} />
        ))}
      </div>
    </div>
  )

  return (
    <section className="blackjack-panel" aria-label={t('chat.blackjackTitle')}>
      <div className="blackjack-panel-heading">
        <span className="blackjack-suit" aria-hidden="true">♠</span>
        <div>
          <p className="eyebrow">Neon Ghost Game</p>
          <h2>{t('chat.blackjackTitle')}</h2>
        </div>
        <span className="blackjack-status">
          {game.status === 'finished' ? t('chat.blackjackFinished') : game.status === 'canceled' ? t('chat.blackjackCanceled') : isMyTurn ? t('chat.blackjackYourTurn') : t('chat.blackjackOpponentTurn')}
        </span>
      </div>
      {renderCards(opponentHand, t('chat.blackjackOpponent'))}
      {renderCards(hand, t('chat.blackjackYou'))}
      {game.status === 'canceled' ? (
        <div className="blackjack-actions">
          <p className="blackjack-result">{t('chat.blackjackCanceled')}</p>
          <button type="button" onClick={() => onAction?.(game.game_id, 'restart')}>{t('chat.blackjackRestart')}</button>
        </div>
      ) : game.status === 'finished' ? (
        <div className="blackjack-actions">
          <p className="blackjack-result">{game.winner === 'draw' ? t('chat.blackjackDraw') : game.winner === currentUserId ? t('chat.blackjackWin') : t('chat.blackjackLose')}</p>
          <button type="button" onClick={() => onAction?.(game.game_id, 'restart')}>{t('chat.blackjackRestart')}</button>
        </div>
      ) : (
        <div className="blackjack-actions">
          <button type="button" disabled={!isMyTurn} onClick={() => onAction?.(game.game_id, 'hit')}>{t('chat.blackjackHit')}</button>
          <button type="button" disabled={!isMyTurn} onClick={() => onAction?.(game.game_id, 'stand')}>{t('chat.blackjackStand')}</button>
          <button type="button" onClick={() => onAction?.(game.game_id, 'cancel')}>{t('chat.blackjackCancel')}</button>
        </div>
      )}
    </section>
  )
}
