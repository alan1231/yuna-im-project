const stockHeaderPattern = /^([A-Z0-9.-]+)\s+今日股價:\s*([+-]?\d+(?:\.\d+)?)$/i
const changePattern = /^漲跌幅:\s*([+-]?\d+(?:\.\d+)?)%$/
const latestDividendPattern = /^最近一次股利:\s*([+-]?\d+(?:\.\d+)?)\s+\(([^)]+)\)$/
const dividendTotalPattern = /^近 12 個月股利合計:\s*([+-]?\d+(?:\.\d+)?)$/
const dividendRecordPattern = /^-\s*([^:]+):\s*([+-]?\d+(?:\.\d+)?)$/
const queryErrorPattern = /^查詢\s+(.+?)\s+股價時發生錯誤，請稍後再試。$/
const notFoundPattern = /^找不到\s+(.+?)\s+的股價資料，請確認股票代號是否正確。$/
const invalidSymbolPattern = /^股票代號格式不正確/

function formatPricePreview(value) {
  if (!Number.isFinite(value)) return '-'
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)
}

export function parseStockReply(text) {
  const lines = String(text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length < 3) return null

  const headerMatch = lines[0].match(stockHeaderPattern)
  const changeMatch = lines[1].match(changePattern)
  if (!headerMatch || !changeMatch) return null

  const latestDividendMatch = lines
    .find((line) => line.startsWith('最近一次股利:'))
    ?.match(latestDividendPattern)
  const dividendTotalMatch = lines
    .find((line) => line.startsWith('近 12 個月股利合計:'))
    ?.match(dividendTotalPattern)
  const noDividendData = lines.includes('股利發放情況: 暫無股利資料')
  const dividendRecords = lines
    .map((line) => line.match(dividendRecordPattern))
    .filter(Boolean)
    .map((match) => ({
      date: match[1],
      amount: Number.parseFloat(match[2]),
    }))

  return {
    symbol: headerMatch[1],
    price: Number.parseFloat(headerMatch[2]),
    changePercent: Number.parseFloat(changeMatch[1]),
    latestDividend: latestDividendMatch
      ? {
          amount: Number.parseFloat(latestDividendMatch[1]),
          date: latestDividendMatch[2],
        }
      : null,
    trailingDividendTotal: dividendTotalMatch
      ? Number.parseFloat(dividendTotalMatch[1])
      : null,
    dividendRecords,
    noDividendData,
  }
}

export function localizeStockText(text) {
  const value = String(text ?? '').trim()
  if (!value) return ''

  const queryErrorMatch = value.match(queryErrorPattern)
  if (queryErrorMatch) {
    return `查詢 ${queryErrorMatch[1]} 時發生錯誤，請稍後再試。`
  }

  const notFoundMatch = value.match(notFoundPattern)
  if (notFoundMatch) {
    return `找不到 ${notFoundMatch[1]} 的股價資料。`
  }

  if (invalidSymbolPattern.test(value)) {
    return '股票代號格式不正確。'
  }

  return value
}

export function formatStockPreview(text) {
  const stockReply = parseStockReply(text)
  if (stockReply) {
    return `${stockReply.symbol} ${formatPricePreview(stockReply.price)}`
  }

  return localizeStockText(text)
}
