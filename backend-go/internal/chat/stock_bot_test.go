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

func TestParseMarketNumber(t *testing.T) {
	tests := []struct {
		input string
		want  float64
	}{
		{input: "2,425.0000", want: 2425},
		{input: "222.8", want: 222.8},
		{input: "N/D", want: 0},
		{input: "-", want: 0},
	}

	for _, tt := range tests {
		if got := parseMarketNumber(tt.input); got != tt.want {
			t.Fatalf("parseMarketNumber(%q) = %v, want %v", tt.input, got, tt.want)
		}
	}
}

func TestExtractFinMindDividends(t *testing.T) {
	dividends := extractFinMindDividends([]finMindDividendRow{
		{CashEarningsDistribution: 5.00001118, CashExDividendTradingDate: "2025-12-11"},
		{CashEarningsDistribution: 0, CashExDividendTradingDate: "2025-10-01"},
		{CashEarningsDistribution: 4.50002042, CashExDividendTradingDate: "2025-06-12"},
		{CashEarningsDistribution: 6.00003573, Date: "2026-03-23"},
		{CashEarningsDistribution: 1, CashExDividendTradingDate: "bad-date"},
	})

	if len(dividends) != 3 {
		t.Fatalf("len(dividends) = %d, want 3", len(dividends))
	}
	if dividends[0].Date.Format("2006-01-02") != "2025-06-12" || dividends[0].Amount != 4.5 {
		t.Fatalf("first dividend = %+v, want 2025-06-12 amount 4.5", dividends[0])
	}
	if dividends[2].Date.Format("2006-01-02") != "2026-03-23" || dividends[2].Amount != 6 {
		t.Fatalf("last dividend = %+v, want 2026-03-23 amount 6", dividends[2])
	}
}
