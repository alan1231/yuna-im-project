export const resolveChangePercent = (data) => {
  const rawValue = data.changePercent ?? data.change_percent ?? data.percent
  const numericValue =
    typeof rawValue === 'number'
      ? rawValue
      : Number.parseFloat(String(rawValue ?? '').replace('%', ''))

  if (Number.isFinite(numericValue)) return numericValue

  const percentMatch = String(data.text ?? '').match(/[+-]?\d+(?:\.\d+)?\s*%/)
  if (!percentMatch) return null

  return Number.parseFloat(percentMatch[0].replace('%', ''))
}

export const getChangeClass = (message) => {
  if (message.changePercent > 0) return 'message-text-up'
  if (message.changePercent < 0) return 'message-text-down'
  return ''
}
