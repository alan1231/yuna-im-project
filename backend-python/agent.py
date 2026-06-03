from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import math
import os
import re
import threading
import time

STOCK_BOT_ID = "stock_bot"
STOCK_BOT_NAME = "Stock_Bot"
DEFAULT_MONGO_URI = "mongodb://localhost:27017/?directConnection=true"
DEFAULT_DATABASE_NAME = "yuna_chat"
PENDING_LOOKBACK_MINUTES = 20


def get_env(name, fallback):
    value = os.getenv(name, "").strip()
    return value or fallback


def get_messages_collection():
    from pymongo import MongoClient

    # The bot communicates with Go through MongoDB: it watches user messages and
    # writes bot replies back into the same messages collection.
    client = MongoClient(get_env("MONGO_URI", DEFAULT_MONGO_URI))
    db = client[get_env("DATABASE_NAME", DEFAULT_DATABASE_NAME)]
    return db["messages"]


class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path not in ("/", "/healthz"):
            self.send_response(404)
            self.end_headers()
            return

        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.end_headers()
        self.wfile.write(b"stock bot running\n")

    def log_message(self, format, *args):
        return


def start_health_server():
    port = int(get_env("PORT", "10001"))
    server = ThreadingHTTPServer(("0.0.0.0", port), HealthHandler)
    print(f"Health server listening on :{port}", flush=True)
    server.serve_forever()

def extract_stock_symbol(command_text):
    text = command_text.strip().upper()
    has_dollar_prefix = text.startswith("$")
    match = re.match(r"^\$?([A-Z0-9.\-]+)", text)
    if not match:
        return None

    symbol = match.group(1)
    if re.fullmatch(r"\d{4}", symbol):
        return symbol

    if has_dollar_prefix and re.fullmatch(r"[A-Z]{1,5}(?:[.\-][A-Z]{1,5})?", symbol):
        return symbol

    if re.fullmatch(r"[A-Z]{2,5}(?:[.\-][A-Z]{1,5})?", text):
        return symbol

    return None

def parse_stock_command(command_text):
    # Only stock-like messages should trigger the bot. Normal chat text is
    # ignored so the bot can live inside the same IM message stream.
    text = command_text.strip().upper()
    symbol = extract_stock_symbol(text)
    if symbol:
        return symbol, None

    first_token = text.lstrip("$").split(maxsplit=1)[0] if text else ""
    looks_like_stock_query = (
        text.startswith("$")
        or re.fullmatch(r"\d+", first_token or "")
        or re.fullmatch(r"[A-Z0-9.\-]+", text or "")
    )

    if looks_like_stock_query:
        return None, (
            "股票代號格式不正確，請輸入 4 位數台股代號或美股代號，"
            "例如：2337、$2337、AVGO、$TSM。"
        )

    return None, None

def normalize_stock_symbol(raw_symbol):
    symbol = raw_symbol.strip().upper()
    symbol = symbol.lstrip("$").strip()

    # 台股常用 4 位數代號，例如 $2337，自動補 Yahoo Finance 的 .TW 後綴。
    if re.fullmatch(r"\d{4}", symbol):
        return f"{symbol}.TW"

    return symbol

def format_dividend_summary(dividends, limit=5):
    if dividends.empty:
        return "暫無股利資料"

    dividends = dividends.sort_index()
    last_date = dividends.index[-1]
    last_amount = float(dividends.iloc[-1])

    one_year_ago = dividends.index[-1] - timedelta(days=365)
    trailing_year_total = float(dividends[dividends.index >= one_year_ago].sum())

    recent_records = []
    for date, amount in dividends.tail(limit).items():
        recent_records.append(f"{date.strftime('%Y-%m-%d')}: {float(amount):.2f}")

    return {
        "latest": f"{last_amount:.2f} ({last_date.strftime('%Y-%m-%d')})",
        "trailing_12_months_total": round(trailing_year_total, 2),
        "recent_records": recent_records,
    }

def format_stock_reply(stock_data):
    if not stock_data:
        return "查無股價資料，請確認代號是否正確。"

    if stock_data.get("status") == "not_found":
        return f"找不到 {stock_data['symbol']} 的股價資料，請確認股票代號是否正確。"

    if stock_data.get("status") == "error":
        return f"查詢 {stock_data['symbol']} 股價時發生錯誤，請稍後再試。"

    dividend = stock_data["dividend"]
    if isinstance(dividend, dict):
        dividend_text = (
            f"最近一次股利: {dividend['latest']}\n"
            f"近 12 個月股利合計: {dividend['trailing_12_months_total']:.2f}\n"
            f"近期股利紀錄:\n- " + "\n- ".join(dividend["recent_records"])
        )
    else:
        dividend_text = f"股利發放情況: {dividend}"

    return (
        f"{stock_data['symbol']} 今日股價: {stock_data['price']}\n"
        f"漲跌幅: {stock_data['change_pct']}%\n"
        f"{dividend_text}"
    )


def build_stock_reply(user_text):
    symbol, validation_error = parse_stock_command(user_text)
    if validation_error:
        return validation_error
    if not symbol:
        return None

    print(f"🔍 正在查詢股價: {symbol}", flush=True)
    stock_data = get_stock_price(symbol)
    return format_stock_reply(stock_data)


def has_bot_reply(messages_col, message):
    sent_at = message.get("time")
    message_id = str(message.get("_id", ""))
    if message_id:
        exact_reply_query = {
            "sender_id": STOCK_BOT_ID,
            "recipient_id": message.get("sender_id"),
            "conversation_id": message.get("conversation_id"),
            "is_ai": True,
            "reply_to_message_id": message_id,
        }
        if messages_col.count_documents(exact_reply_query, limit=1) > 0:
            return True

    query = {
        "sender_id": STOCK_BOT_ID,
        "recipient_id": message.get("sender_id"),
        "conversation_id": message.get("conversation_id"),
        "is_ai": True,
    }
    if sent_at:
        query["time"] = {"$gte": sent_at}

    symbol, validation_error = parse_stock_command(str(message.get("text", "")).upper())
    if symbol and not validation_error:
        query["text"] = {"$regex": "^" + re.escape(symbol)}

    return messages_col.count_documents(query, limit=1) > 0


def insert_bot_reply(messages_col, message, reply_text):
    messages_col.insert_one({
        "sender": STOCK_BOT_NAME,
        "sender_id": STOCK_BOT_ID,
        "recipient_id": message["sender_id"],
        "conversation_id": message["conversation_id"],
        "text": reply_text,
        "time": datetime.now(timezone.utc),
        "is_ai": True,
        "reply_to_message_id": str(message.get("_id", "")),
    })
    print("📤 已回覆股價資訊", flush=True)


def process_stock_message(messages_col, message):
    sender_id = message.get("sender_id")
    conversation_id = message.get("conversation_id")
    if not sender_id or not conversation_id:
        print("略過缺少 sender_id 或 conversation_id 的訊息", flush=True)
        return

    reply_text = build_stock_reply(str(message.get("text", "")).upper())
    if not reply_text:
        return

    insert_bot_reply(messages_col, message, reply_text)


def process_recent_unanswered_messages(messages_col):
    since = datetime.now(timezone.utc) - timedelta(minutes=PENDING_LOOKBACK_MINUTES)
    query = {
        "recipient_id": STOCK_BOT_ID,
        "sender": {"$ne": STOCK_BOT_NAME},
        "is_ai": {"$ne": True},
        "time": {"$gte": since},
    }

    for message in messages_col.find(query).sort("time", 1).limit(20):
        if has_bot_reply(messages_col, message):
            continue
        print("補處理睡眠期間收到的股票查詢", flush=True)
        process_stock_message(messages_col, message)

def is_valid_number(value):
    try:
        return value is not None and not math.isnan(float(value))
    except (TypeError, ValueError):
        return False

def get_fast_info_value(info, key):
    try:
        return info[key]
    except Exception:
        pass

    try:
        return info.get(key)
    except Exception:
        return None

def get_last_price(stock):
    info = stock.fast_info
    price = get_fast_info_value(info, "last_price")
    if is_valid_number(price):
        return float(price)

    history = stock.history(period="5d")
    if history.empty or "Close" not in history:
        return None

    close_prices = history["Close"].dropna()
    if close_prices.empty:
        return None

    return float(close_prices.iloc[-1])

def get_previous_close(stock, fallback_price):
    try:
        info = stock.fast_info
        prev_close = get_fast_info_value(info, "previous_close")
        if is_valid_number(prev_close):
            return float(prev_close)
    except Exception:
        pass

    try:
        prev_close = stock.info.get("regularMarketPreviousClose")
        if is_valid_number(prev_close):
            return float(prev_close)
    except Exception:
        pass

    return fallback_price

def get_stock_price(raw_symbol):
    symbol = normalize_stock_symbol(raw_symbol)

    try:
        import yfinance as yf
        
        stock = yf.Ticker(symbol)
        try:
            price = get_last_price(stock)
        except Exception:
            return {
                "status": "error",
                "symbol": symbol,
            }

        if not is_valid_number(price):
            return {
                "status": "not_found",
                "symbol": symbol,
            }
        
        # 漲跌幅計算（當前價格 vs 昨收價格）
        # yfinance 的 fast_info 有時沒提供 previous_close，改用 regular_market_previous_close。
        prev_close = get_previous_close(stock, price)
        change_pct = 0
        if prev_close:
            change_pct = ((price - prev_close) / prev_close) * 100

        # 抓取股利資訊。yfinance 的 dividends 日期是除息日，不一定等同實際入帳日。
        try:
            dividends = stock.dividends
            dividend_summary = format_dividend_summary(dividends)
        except Exception:
            dividend_summary = "暫無股利資料"

        return {
            "status": "ok",
            "symbol": symbol,
            "price": round(price, 2),
            "change_pct": round(change_pct, 2),
            "dividend": dividend_summary
        }
    except ImportError as e:
        print(f"Missing dependency: {e}")
        return {
            "status": "error",
            "symbol": symbol,
        }
    except Exception as e:
        print(f"Error: {e}")
        return {
            "status": "error",
            "symbol": symbol,
        }

def start_ai_agent():
    print("🤖 股價助手已啟動！請在聊天室輸入如 '2337'、'$2337'、'AVGO' 或 '$TSM'", flush=True)

    # Change Stream requires MongoDB replica set mode. The pipeline keeps this
    # worker scoped to messages sent to the stock bot and prevents reply loops.
    pipeline = [{
        "$match": {
            "operationType": "insert",
            "fullDocument.recipient_id": STOCK_BOT_ID,
            "fullDocument.sender": {"$ne": STOCK_BOT_NAME},
            "fullDocument.is_ai": {"$ne": True},
        }
    }]

    while True:
        try:
            messages_col = get_messages_collection()
            process_recent_unanswered_messages(messages_col)

            with messages_col.watch(pipeline) as stream:
                print("📡 正在監聽聊天室訊息", flush=True)

                for change in stream:
                    new_msg = change['fullDocument']
                    if new_msg.get("sender") == STOCK_BOT_NAME or new_msg.get("is_ai") is True:
                        continue

                    process_stock_message(messages_col, new_msg)
        except KeyboardInterrupt:
            raise
        except Exception as e:
            print(f"Agent 監聽中斷，3 秒後重連：{e}", flush=True)
            time.sleep(3)

if __name__ == "__main__":
    threading.Thread(target=start_health_server, daemon=True).start()
    start_ai_agent()
