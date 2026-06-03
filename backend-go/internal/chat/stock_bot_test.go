package chat

import "testing"

func TestParseStockCommand(t *testing.T) {
	tests := []struct {
		name           string
		input          string
		wantSymbol     string
		wantValidation bool
	}{
		{name: "taiwan ticker", input: "2330", wantSymbol: "2330"},
		{name: "taiwan ticker with dollar", input: "$2330", wantSymbol: "2330"},
		{name: "us ticker", input: "AVGO", wantSymbol: "AVGO"},
		{name: "us ticker with dollar", input: "$TSM", wantSymbol: "TSM"},
		{name: "normal chat", input: "hello world"},
		{name: "bad numeric stock-like input", input: "3", wantValidation: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotSymbol, gotValidation := parseStockCommand(tt.input)
			if gotSymbol != tt.wantSymbol {
				t.Fatalf("symbol = %q, want %q", gotSymbol, tt.wantSymbol)
			}
			if (gotValidation != "") != tt.wantValidation {
				t.Fatalf("validation = %q, want validation=%v", gotValidation, tt.wantValidation)
			}
		})
	}
}

func TestNormalizeStockSymbol(t *testing.T) {
	if got := normalizeStockSymbol("2330"); got != "2330.TW" {
		t.Fatalf("normalizeStockSymbol(2330) = %q", got)
	}
	if got := normalizeStockSymbol("$TSM"); got != "TSM" {
		t.Fatalf("normalizeStockSymbol($TSM) = %q", got)
	}
}
