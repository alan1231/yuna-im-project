package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

const stockBotName = "行情小幫手"

type yahooChartResponse struct {
	Chart struct {
		Result []struct {
			Meta struct {
				Symbol             string   `json:"symbol"`
				RegularMarketPrice *float64 `json:"regularMarketPrice"`
				ChartPreviousClose *float64 `json:"chartPreviousClose"`
				PreviousClose      *float64 `json:"previousClose"`
			} `json:"meta"`
			Timestamp  []int64 `json:"timestamp"`
			Indicators struct {
				Quote []struct {
					Close []*float64 `json:"close"`
				} `json:"quote"`
			} `json:"indicators"`
			Events struct {
				Dividends map[string]struct {
					Amount float64 `json:"amount"`
					Date   int64   `json:"date"`
				} `json:"dividends"`
			} `json:"events"`
		} `json:"result"`
		Error interface{} `json:"error"`
	} `json:"chart"`
}

type stockDividend struct {
	Amount float64
	Date   time.Time
}

type stockData struct {
	Status    string
	Symbol    string
	Price     float64
	ChangePct float64
	Dividends []stockDividend
}

func processStockBotMessage(ctx context.Context, client *mongo.Client, message bson.M, messageID interface{}) {
	botCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()

	replyText := buildStockReply(botCtx, stringValue(message["text"]))
	if replyText == "" {
		return
	}

	reply := bson.M{
		"sender":              stockBotName,
		"sender_id":           stockBotID,
		"recipient_id":        stringValue(message["sender_id"]),
		"conversation_id":     stringValue(message["conversation_id"]),
		"text":                replyText,
		"time":                time.Now(),
		"is_ai":               true,
		"read_at":             nil,
		"reply_to_message_id": fmt.Sprint(messageID),
	}

	if _, err := client.Database(databaseName).Collection(collectionName).InsertOne(ctx, reply); err != nil {
		log.Printf("行情小幫手回覆寫入 MongoDB 失敗: %v", err)
	}
}

func buildStockReply(ctx context.Context, userText string) string {
	symbol, validationError := parseStockCommand(userText)
	if validationError != "" {
		return validationError
	}
	if symbol == "" {
		return ""
	}

	stock, err := fetchStockData(ctx, normalizeStockSymbol(symbol))
	if err != nil {
		log.Printf("股票資料查詢失敗: %v", err)
		return fmt.Sprintf("查詢 %s 股價時發生錯誤，請稍後再試。", normalizeStockSymbol(symbol))
	}

	return formatStockReply(stock)
}

func parseStockCommand(commandText string) (string, string) {
	text := strings.TrimSpace(strings.ToUpper(commandText))
	if text == "" {
		return "", ""
	}

	hasDollarPrefix := strings.HasPrefix(text, "$")
	match := regexp.MustCompile(`^\$?([A-Z0-9.\-]+)`).FindStringSubmatch(text)
	if len(match) < 2 {
		return "", ""
	}

	symbol := match[1]
	if regexp.MustCompile(`^\d{4}$`).MatchString(symbol) {
		return symbol, ""
	}
	if hasDollarPrefix && regexp.MustCompile(`^[A-Z]{1,5}(?:[.\-][A-Z]{1,5})?$`).MatchString(symbol) {
		return symbol, ""
	}
	if regexp.MustCompile(`^[A-Z]{2,5}(?:[.\-][A-Z]{1,5})?$`).MatchString(text) {
		return symbol, ""
	}

	firstToken := ""
	if text != "" {
		firstToken = strings.Split(strings.TrimLeft(text, "$"), " ")[0]
	}
	looksLikeStockQuery := strings.HasPrefix(text, "$") ||
		regexp.MustCompile(`^\d+$`).MatchString(firstToken) ||
		regexp.MustCompile(`^[A-Z0-9.\-]+$`).MatchString(text)

	if looksLikeStockQuery {
		return "", "股票代號格式不正確，請輸入 4 位數台股代號或美股代號，例如：2337、$2337、AVGO、$TSM。"
	}

	return "", ""
}

func normalizeStockSymbol(rawSymbol string) string {
	symbol := strings.TrimSpace(strings.ToUpper(rawSymbol))
	symbol = strings.TrimPrefix(symbol, "$")
	if regexp.MustCompile(`^\d{4}$`).MatchString(symbol) {
		return symbol + ".TW"
	}
	return symbol
}

func fetchStockData(ctx context.Context, symbol string) (stockData, error) {
	query := url.Values{}
	query.Set("range", "1y")
	query.Set("interval", "1d")
	query.Set("events", "div")

	endpoint := fmt.Sprintf("https://query1.finance.yahoo.com/v8/finance/chart/%s?%s", url.PathEscape(symbol), query.Encode())
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return stockData{}, err
	}
	req.Header.Set("User-Agent", "yuna-im-stock-bot/1.0")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return stockData{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return stockData{Status: "not_found", Symbol: symbol}, nil
	}

	var payload yahooChartResponse
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return stockData{}, err
	}
	if len(payload.Chart.Result) == 0 {
		return stockData{Status: "not_found", Symbol: symbol}, nil
	}

	result := payload.Chart.Result[0]
	price := firstFinite(result.Meta.RegularMarketPrice)
	if price == 0 {
		price = latestClose(result.Indicators.Quote)
	}
	if price == 0 {
		return stockData{Status: "not_found", Symbol: symbol}, nil
	}

	previousClose := firstFinite(result.Meta.PreviousClose)
	if previousClose == 0 {
		previousClose = previousCloseFromQuotes(result.Indicators.Quote)
	}
	if previousClose == 0 {
		previousClose = firstFinite(result.Meta.ChartPreviousClose)
	}
	if previousClose == 0 {
		previousClose = price
	}

	dividends := make([]stockDividend, 0, len(result.Events.Dividends))
	for _, dividend := range result.Events.Dividends {
		dividends = append(dividends, stockDividend{
			Amount: dividend.Amount,
			Date:   time.Unix(dividend.Date, 0).UTC(),
		})
	}
	sort.Slice(dividends, func(i, j int) bool {
		return dividends[i].Date.Before(dividends[j].Date)
	})

	changePct := 0.0
	if previousClose != 0 {
		changePct = ((price - previousClose) / previousClose) * 100
	}

	return stockData{
		Status:    "ok",
		Symbol:    symbol,
		Price:     round(price, 2),
		ChangePct: round(changePct, 2),
		Dividends: dividends,
	}, nil
}

func firstFinite(values ...*float64) float64 {
	for _, value := range values {
		if value != nil && !math.IsNaN(*value) && !math.IsInf(*value, 0) {
			return *value
		}
	}
	return 0
}

func latestClose(quotes []struct {
	Close []*float64 `json:"close"`
}) float64 {
	for _, quote := range quotes {
		for index := len(quote.Close) - 1; index >= 0; index-- {
			closePrice := quote.Close[index]
			if closePrice != nil && !math.IsNaN(*closePrice) && !math.IsInf(*closePrice, 0) {
				return *closePrice
			}
		}
	}
	return 0
}

func previousCloseFromQuotes(quotes []struct {
	Close []*float64 `json:"close"`
}) float64 {
	for _, quote := range quotes {
		seenLatest := false
		for index := len(quote.Close) - 1; index >= 0; index-- {
			closePrice := quote.Close[index]
			if closePrice == nil || math.IsNaN(*closePrice) || math.IsInf(*closePrice, 0) {
				continue
			}
			if !seenLatest {
				seenLatest = true
				continue
			}
			return *closePrice
		}
	}
	return 0
}

func formatStockReply(stock stockData) string {
	if stock.Status == "not_found" {
		return fmt.Sprintf("找不到 %s 的股價資料，請確認股票代號是否正確。", stock.Symbol)
	}
	if stock.Status == "error" {
		return fmt.Sprintf("查詢 %s 股價時發生錯誤，請稍後再試。", stock.Symbol)
	}

	return fmt.Sprintf(
		"%s 今日股價: %.2f\n漲跌幅: %.2f%%\n%s",
		stock.Symbol,
		stock.Price,
		stock.ChangePct,
		formatDividendSummary(stock.Dividends),
	)
}

func formatDividendSummary(dividends []stockDividend) string {
	if len(dividends) == 0 {
		return "股利發放情況: 暫無股利資料"
	}

	latest := dividends[len(dividends)-1]
	oneYearAgo := latest.Date.AddDate(0, 0, -365)
	trailingTotal := 0.0
	for _, dividend := range dividends {
		if !dividend.Date.Before(oneYearAgo) {
			trailingTotal += dividend.Amount
		}
	}

	start := len(dividends) - 5
	if start < 0 {
		start = 0
	}
	recentRecords := make([]string, 0, len(dividends)-start)
	for _, dividend := range dividends[start:] {
		recentRecords = append(recentRecords, fmt.Sprintf("%s: %.2f", dividend.Date.Format("2006-01-02"), dividend.Amount))
	}

	return fmt.Sprintf(
		"最近一次股利: %.2f (%s)\n近 12 個月股利合計: %.2f\n近期股利紀錄:\n- %s",
		latest.Amount,
		latest.Date.Format("2006-01-02"),
		round(trailingTotal, 2),
		strings.Join(recentRecords, "\n- "),
	)
}

func round(value float64, places int) float64 {
	factor := math.Pow10(places)
	return math.Round(value*factor) / factor
}

func stringValue(value interface{}) string {
	switch typedValue := value.(type) {
	case string:
		return typedValue
	default:
		return fmt.Sprint(typedValue)
	}
}
