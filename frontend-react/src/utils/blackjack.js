export const BLACKJACK_INVITE_TIMEOUT_MS = 5 * 60 * 1000

export const blackjackInviteExpiresAt = (sentAt) => new Date(sentAt).getTime() + BLACKJACK_INVITE_TIMEOUT_MS

export const applyBlackjackInviteResponse = (messages, response) => {
  if (response.gameType !== 'blackjack' || !['accept', 'reject'].includes(response.gameAction)) return messages
  return messages.map((message) => (
    message.gameType === 'blackjack' && message.gameAction === 'invite' && message.gameId === response.gameId
      ? { ...message, gameResponse: response.gameAction }
      : message
  ))
}

export const shouldReplaceBlackjackGame = (currentGame, incomingGame) => (
  currentGame?.game_id !== incomingGame.game_id
  || (currentGame.revision ?? 0) < (incomingGame.revision ?? 0)
)
