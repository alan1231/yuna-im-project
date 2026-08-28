package chat

import "testing"

func TestBlackjackDeckHasUniqueCards(t *testing.T) {
	deck := blackjackDeck()
	if len(deck) != 52 {
		t.Fatalf("deck size = %d, want 52", len(deck))
	}
	seen := map[string]bool{}
	for _, card := range deck {
		if seen[card] {
			t.Fatalf("duplicate card %q", card)
		}
		seen[card] = true
	}
}

func TestBlackjackScoreTreatsAceAsOneWhenNeeded(t *testing.T) {
	if score := blackjackScore([]string{"spade01", "heart10", "club05"}); score != 16 {
		t.Fatalf("score = %d, want 16", score)
	}
	if score := blackjackScore([]string{"spade01", "heart10"}); score != 21 {
		t.Fatalf("score = %d, want 21", score)
	}
}
