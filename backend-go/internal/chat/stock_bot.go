package chat

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

const stockBotName = "行情小幫手"

const (
	stockBotRequestTimeout = 12 * time.Second
	stockSourceTimeout     = 3 * time.Second
	stockDividendTimeout   = 1200 * time.Millisecond
	stockCacheTTL          = 90 * time.Second
	stockErrorCacheTTL     = 10 * time.Second
)

var stockHTTPClient = &http.Client{Timeout: 4 * time.Second}

type stockCacheEntry struct {
	data      stockData
	expiresAt time.Time
}

var stockCache = struct {
	sync.Mutex
	entries map[string]stockCacheEntry
}{
	entries: map[string]stockCacheEntry{},
}

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

type twseStockInfoResponse struct {
	MessageArray []struct {
		Code          string `json:"c"`
		Name          string `json:"n"`
		Price         string `json:"z"`
		PreviousClose string `json:"y"`
	} `json:"msgArray"`
	ResponseCode string `json:"rtcode"`
}

type twseStockDayResponse struct {
	Status string     `json:"stat"`
	Data   [][]string `json:"data"`
}

type twseStockDayAllRow struct {
	Code         string `json:"Code"`
	ClosingPrice string `json:"ClosingPrice"`
	Change       string `json:"Change"`
}

type finMindDividendResponse struct {
	Message string               `json:"msg"`
	Status  int                  `json:"status"`
	Data    []finMindDividendRow `json:"data"`
}

type finMindDividendRow struct {
	StockID                   string  `json:"stock_id"`
	CashEarningsDistribution  float64 `json:"CashEarningsDistribution"`
	CashExDividendTradingDate string  `json:"CashExDividendTradingDate"`
	Date                      string  `json:"date"`
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
	Source    string
}

func processStockBotMessage(ctx context.Context, client *mongo.Client, message bson.M, messageID interface{}) {
	botCtx, cancel := context.WithTimeout(ctx, stockBotRequestTimeout)
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
	if stock, ok := getCachedStockData(symbol); ok {
		return stock, nil
	}

	stock, err := fetchFastStockData(ctx, symbol)
	if err == nil && stock.Status == "ok" {
		if dividends, dividendErr := fetchStockDividendsWithTimeout(ctx, symbol); dividendErr == nil && len(dividends) > 0 {
			stock.Dividends = dividends
			stock.Source += "+finmind-dividend"
		} else if yahooStock, yahooErr := fetchYahooStockDataWithTimeout(ctx, symbol, stockDividendTimeout); yahooErr == nil && yahooStock.Status == "ok" {
			stock.Dividends = yahooStock.Dividends
		}
		setCachedStockData(symbol, stock)
		return stock, nil
	}

	yahooStock, yahooErr := fetchYahooStockDataWithTimeout(ctx, symbol, stockSourceTimeout)
	if yahooErr == nil && yahooStock.Status == "ok" {
		if len(yahooStock.Dividends) == 0 {
			if dividends, dividendErr := fetchStockDividendsWithTimeout(ctx, symbol); dividendErr == nil && len(dividends) > 0 {
				yahooStock.Dividends = dividends
				yahooStock.Source += "+finmind-dividend"
			}
		}
		setCachedStockData(symbol, yahooStock)
		return yahooStock, nil
	}

	if yahooErr != nil {
		log.Printf("Yahoo 股票查詢失敗: symbol=%s err=%v", symbol, yahooErr)
	}
	if err != nil {
		log.Printf("快速股票查詢失敗: symbol=%s err=%v", symbol, err)
	}
	if stock.Status != "" {
		setCachedStockData(symbol, stock)
		return stock, nil
	}
	if yahooStock.Status != "" {
		setCachedStockData(symbol, yahooStock)
		return yahooStock, nil
	}
	if err != nil {
		return stockData{}, err
	}
	return stockData{Status: "error", Symbol: symbol}, nil
}

func fetchFastStockData(ctx context.Context, symbol string) (stockData, error) {
	sourceCtx, cancel := context.WithTimeout(ctx, stockSourceTimeout)
	defer cancel()

	if isTaiwanStockSymbol(symbol) {
		return fetchFallbackStockData(sourceCtx, symbol)
	}
	return fetchStooqStockData(sourceCtx, symbol)
}

func isTaiwanStockSymbol(symbol string) bool {
	return regexp.MustCompile(`^\d{4}\.TW$`).MatchString(symbol)
}

func fetchYahooStockDataWithTimeout(ctx context.Context, symbol string, timeout time.Duration) (stockData, error) {
	sourceCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	return fetchYahooStockData(sourceCtx, symbol)
}

func fetchStockDividendsWithTimeout(ctx context.Context, symbol string) ([]stockDividend, error) {
	if !isTaiwanStockSymbol(symbol) {
		return nil, nil
	}

	sourceCtx, cancel := context.WithTimeout(ctx, stockSourceTimeout)
	defer cancel()
	return fetchFinMindTaiwanStockDividends(sourceCtx, symbol)
}

func getCachedStockData(symbol string) (stockData, bool) {
	stockCache.Lock()
	defer stockCache.Unlock()

	entry, ok := stockCache.entries[symbol]
	if !ok {
		return stockData{}, false
	}
	if time.Now().After(entry.expiresAt) {
		delete(stockCache.entries, symbol)
		return stockData{}, false
	}
	return entry.data, true
}

func setCachedStockData(symbol string, stock stockData) {
	ttl := stockCacheTTL
	if stock.Status != "ok" {
		ttl = stockErrorCacheTTL
	}

	stockCache.Lock()
	defer stockCache.Unlock()

	stockCache.entries[symbol] = stockCacheEntry{
		data:      stock,
		expiresAt: time.Now().Add(ttl),
	}
}

func fetchYahooStockData(ctx context.Context, symbol string) (stockData, error) {
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

	resp, err := stockHTTPClient.Do(req)
	if err != nil {
		return stockData{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode == http.StatusForbidden {
			return stockData{Status: "error", Symbol: symbol}, nil
		}
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
		Source:    "yahoo",
	}, nil
}

func fetchFinMindTaiwanStockDividends(ctx context.Context, symbol string) ([]stockDividend, error) {
	ticker := strings.TrimSuffix(symbol, ".TW")
	taipei := time.FixedZone("Asia/Taipei", 8*60*60)
	startDate := time.Now().In(taipei).AddDate(-2, 0, 0).Format("2006-01-02")

	query := url.Values{}
	query.Set("dataset", "TaiwanStockDividend")
	query.Set("data_id", ticker)
	query.Set("start_date", startDate)
	if token := strings.TrimSpace(os.Getenv("FINMIND_TOKEN")); token != "" {
		query.Set("token", token)
	}

	endpoint := fmt.Sprintf("https://api.finmindtrade.com/api/v4/data?%s", query.Encode())
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "yuna-im-stock-bot/1.0")

	resp, err := stockHTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		log.Printf("FinMind 股利查詢 HTTP 狀態異常: symbol=%s status=%d", symbol, resp.StatusCode)
		return nil, nil
	}

	var payload finMindDividendResponse
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, err
	}
	if payload.Status != http.StatusOK {
		log.Printf("FinMind 股利查詢狀態異常: symbol=%s status=%d msg=%s", symbol, payload.Status, payload.Message)
		return nil, nil
	}

	return extractFinMindDividends(payload.Data), nil
}

func extractFinMindDividends(rows []finMindDividendRow) []stockDividend {
	dividends := make([]stockDividend, 0, len(rows))
	for _, row := range rows {
		amount := row.CashEarningsDistribution
		if amount <= 0 {
			continue
		}

		dateText := strings.TrimSpace(row.CashExDividendTradingDate)
		if dateText == "" {
			dateText = strings.TrimSpace(row.Date)
		}
		date, err := time.Parse("2006-01-02", dateText)
		if err != nil {
			continue
		}

		dividends = append(dividends, stockDividend{
			Amount: round(amount, 2),
			Date:   date,
		})
	}

	sort.Slice(dividends, func(i, j int) bool {
		return dividends[i].Date.Before(dividends[j].Date)
	})

	return dividends
}

func fetchFallbackStockData(ctx context.Context, symbol string) (stockData, error) {
	if isTaiwanStockSymbol(symbol) {
		stock, err := fetchTWSEStockData(ctx, symbol)
		if err == nil && stock.Status == "ok" {
			return stock, nil
		}
		if err != nil {
			log.Printf("TWSE 即時查詢失敗: symbol=%s err=%v", symbol, err)
		}
		if stock.Status != "" && stock.Status != "not_found" {
			log.Printf("TWSE 即時查詢未取得資料: symbol=%s status=%s", symbol, stock.Status)
		}
		stock, err = fetchTWSEStockDayAllData(ctx, symbol)
		if err == nil && stock.Status == "ok" {
			return stock, nil
		}
		if err != nil {
			log.Printf("TWSE 全市場日資料查詢失敗: symbol=%s err=%v", symbol, err)
		}
		return fetchTWSEStockDayData(ctx, symbol)
	}
	return fetchStooqStockData(ctx, symbol)
}

func fetchTWSEStockData(ctx context.Context, symbol string) (stockData, error) {
	ticker := strings.TrimSuffix(symbol, ".TW")
	for _, market := range []string{"tse", "otc"} {
		stock, err := fetchTWSEStockInfoForMarket(ctx, symbol, ticker, market)
		if err != nil {
			return stockData{}, err
		}
		if stock.Status == "ok" {
			return stock, nil
		}
	}
	return stockData{Status: "not_found", Symbol: symbol}, nil
}

func fetchTWSEStockInfoForMarket(ctx context.Context, symbol string, ticker string, market string) (stockData, error) {
	query := url.Values{}
	query.Set("ex_ch", fmt.Sprintf("%s_%s.tw", market, ticker))
	query.Set("json", "1")
	query.Set("delay", "0")

	endpoint := fmt.Sprintf("https://mis.twse.com.tw/stock/api/getStockInfo.jsp?%s", query.Encode())
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return stockData{}, err
	}
	req.Header.Set("User-Agent", "yuna-im-stock-bot/1.0")

	resp, err := stockHTTPClient.Do(req)
	if err != nil {
		return stockData{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		log.Printf("TWSE 即時查詢 HTTP 狀態異常: symbol=%s market=%s status=%d", symbol, market, resp.StatusCode)
		return stockData{Status: "error", Symbol: symbol}, nil
	}

	var payload twseStockInfoResponse
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return stockData{}, err
	}
	if payload.ResponseCode != "0000" || len(payload.MessageArray) == 0 {
		return stockData{Status: "not_found", Symbol: symbol}, nil
	}

	row := payload.MessageArray[0]
	price := parseMarketNumber(row.Price)
	previousClose := parseMarketNumber(row.PreviousClose)
	if price == 0 {
		return stockData{Status: "not_found", Symbol: symbol}, nil
	}

	changePct := 0.0
	if previousClose != 0 {
		changePct = ((price - previousClose) / previousClose) * 100
	}

	return stockData{
		Status:    "ok",
		Symbol:    symbol,
		Price:     round(price, 2),
		ChangePct: round(changePct, 2),
		Source:    fmt.Sprintf("twse-%s-live", market),
	}, nil
}

func fetchTWSEStockDayAllData(ctx context.Context, symbol string) (stockData, error) {
	ticker := strings.TrimSuffix(symbol, ".TW")
	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodGet,
		"https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL",
		nil,
	)
	if err != nil {
		return stockData{}, err
	}
	req.Header.Set("User-Agent", "yuna-im-stock-bot/1.0")

	resp, err := stockHTTPClient.Do(req)
	if err != nil {
		return stockData{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		log.Printf("TWSE 全市場日資料 HTTP 狀態異常: symbol=%s status=%d", symbol, resp.StatusCode)
		return stockData{Status: "error", Symbol: symbol}, nil
	}

	rows := []twseStockDayAllRow{}
	if err := json.NewDecoder(resp.Body).Decode(&rows); err != nil {
		return stockData{}, err
	}

	for _, row := range rows {
		if row.Code != ticker {
			continue
		}

		closePrice := parseMarketNumber(row.ClosingPrice)
		change := parseMarketNumber(strings.TrimPrefix(row.Change, "+"))
		if closePrice == 0 {
			return stockData{Status: "not_found", Symbol: symbol}, nil
		}

		previousClose := closePrice - change
		changePct := 0.0
		if previousClose != 0 {
			changePct = (change / previousClose) * 100
		}

		return stockData{
			Status:    "ok",
			Symbol:    symbol,
			Price:     round(closePrice, 2),
			ChangePct: round(changePct, 2),
			Source:    "twse-day-all",
		}, nil
	}

	return stockData{Status: "not_found", Symbol: symbol}, nil
}

func fetchTWSEStockDayData(ctx context.Context, symbol string) (stockData, error) {
	ticker := strings.TrimSuffix(symbol, ".TW")
	query := url.Values{}
	query.Set("date", time.Now().In(time.FixedZone("Asia/Taipei", 8*60*60)).Format("20060102"))
	query.Set("stockNo", ticker)
	query.Set("response", "json")

	endpoint := fmt.Sprintf("https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?%s", query.Encode())
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return stockData{}, err
	}
	req.Header.Set("User-Agent", "yuna-im-stock-bot/1.0")

	resp, err := stockHTTPClient.Do(req)
	if err != nil {
		return stockData{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		log.Printf("TWSE 日資料查詢 HTTP 狀態異常: symbol=%s status=%d", symbol, resp.StatusCode)
		return stockData{Status: "error", Symbol: symbol}, nil
	}

	var payload twseStockDayResponse
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return stockData{}, err
	}
	if payload.Status != "OK" || len(payload.Data) == 0 {
		return stockData{Status: "not_found", Symbol: symbol}, nil
	}

	latest := payload.Data[len(payload.Data)-1]
	if len(latest) < 8 {
		return stockData{Status: "not_found", Symbol: symbol}, nil
	}

	closePrice := parseMarketNumber(latest[6])
	change := parseMarketNumber(strings.TrimPrefix(latest[7], "+"))
	if closePrice == 0 {
		return stockData{Status: "not_found", Symbol: symbol}, nil
	}

	previousClose := closePrice - change
	changePct := 0.0
	if previousClose != 0 {
		changePct = (change / previousClose) * 100
	}

	return stockData{
		Status:    "ok",
		Symbol:    symbol,
		Price:     round(closePrice, 2),
		ChangePct: round(changePct, 2),
		Source:    "twse-stock-day",
	}, nil
}

func fetchStooqStockData(ctx context.Context, symbol string) (stockData, error) {
	stooqSymbol := strings.ToLower(symbol)
	if !strings.Contains(stooqSymbol, ".") {
		stooqSymbol += ".us"
	}

	query := url.Values{}
	query.Set("s", stooqSymbol)
	query.Set("f", "sd2t2ohlcv")
	query.Set("h", "")
	query.Set("e", "csv")

	endpoint := fmt.Sprintf("https://stooq.com/q/l/?%s", query.Encode())
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return stockData{}, err
	}
	req.Header.Set("User-Agent", "yuna-im-stock-bot/1.0")

	resp, err := stockHTTPClient.Do(req)
	if err != nil {
		return stockData{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		log.Printf("Stooq 查詢 HTTP 狀態異常: symbol=%s stooq_symbol=%s status=%d", symbol, stooqSymbol, resp.StatusCode)
		return stockData{Status: "error", Symbol: symbol}, nil
	}

	records, err := csv.NewReader(resp.Body).ReadAll()
	if err != nil {
		return stockData{}, err
	}
	if len(records) < 2 || len(records[1]) < 7 || records[1][1] == "N/D" {
		return stockData{Status: "not_found", Symbol: symbol}, nil
	}

	open := parseMarketNumber(records[1][3])
	closePrice := parseMarketNumber(records[1][6])
	if closePrice == 0 {
		return stockData{Status: "not_found", Symbol: symbol}, nil
	}

	changePct := 0.0
	if open != 0 {
		changePct = ((closePrice - open) / open) * 100
	}

	return stockData{
		Status:    "ok",
		Symbol:    symbol,
		Price:     round(closePrice, 2),
		ChangePct: round(changePct, 2),
		Source:    "stooq",
	}, nil
}

func parseMarketNumber(value string) float64 {
	normalized := strings.ReplaceAll(strings.TrimSpace(value), ",", "")
	if normalized == "" || normalized == "-" || normalized == "N/D" {
		return 0
	}
	number, err := strconv.ParseFloat(normalized, 64)
	if err != nil || math.IsNaN(number) || math.IsInf(number, 0) {
		return 0
	}
	return number
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
