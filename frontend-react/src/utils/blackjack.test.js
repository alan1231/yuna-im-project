import { describe, expect, it } from 'vitest'
import {
  BLACKJACK_INVITE_TIMEOUT_MS,
  applyBlackjackInviteResponse,
  blackjackInviteExpiresAt,
  shouldReplaceBlackjackGame,
} from './blackjack'

describe('blackjack UI state helpers', () => {
  it('expires invitations after five minutes', () => {
    const sentAt = '2026-08-31T00:00:00.000Z'
    expect(blackjackInviteExpiresAt(sentAt)).toBe(new Date(sentAt).getTime() + BLACKJACK_INVITE_TIMEOUT_MS)
  })

  it('marks the matching invitation as accepted', () => {
    const messages = [
      { gameType: 'blackjack', gameAction: 'invite', gameId: 'game-1' },
      { gameType: 'blackjack', gameAction: 'invite', gameId: 'game-2' },
    ]
    const result = applyBlackjackInviteResponse(messages, {
      gameType: 'blackjack', gameAction: 'accept', gameId: 'game-1',
    })
    expect(result[0].gameResponse).toBe('accept')
    expect(result[1].gameResponse).toBeUndefined()
  })

  it('rejects stale revisions only for the same game', () => {
    expect(shouldReplaceBlackjackGame({ game_id: 'a', revision: 3 }, { game_id: 'a', revision: 2 })).toBe(false)
    expect(shouldReplaceBlackjackGame({ game_id: 'a', revision: 3 }, { game_id: 'b', revision: 1 })).toBe(true)
  })
})
