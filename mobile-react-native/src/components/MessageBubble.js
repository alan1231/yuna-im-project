import { Image, Pressable, Text, View } from 'react-native'
import { formatFileSize, formatTime } from '../models/chat'
import { styles } from '../styles/appStyles'
import { localizeStockText, parseStockReply } from '../utils/stockReply'

function formatMetric(value) {
  if (!Number.isFinite(value)) return '-'
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)
}

export function MessageBubble({
  isGroup = false,
  isSelf,
  message,
  onOpenAttachment,
  onPreviewImage,
}) {
  const hasAttachment = Boolean(message.attachmentUrl)
  const isImageAttachment = message.attachmentType?.startsWith('image/')
  const isPending = Boolean(message.isPending)
  const stockReply = !isSelf && !isPending ? parseStockReply(message.text) : null
  const displayText = localizeStockText(message.text)

  return (
    <View style={[styles.messageRow, isSelf && styles.selfMessageRow]}>
      <View style={[styles.messageBubble, isSelf && styles.selfMessageBubble]}>
        {!isSelf && isGroup ? <Text style={styles.senderText}>{message.sender}</Text> : null}
        {isPending ? (
          <View style={styles.typingIndicator}>
            <View style={styles.typingDot} />
            <View style={styles.typingDot} />
            <View style={styles.typingDot} />
          </View>
        ) : null}
        {!isPending && stockReply ? (
          <View style={styles.stockCard}>
            <View style={styles.stockCardHeader}>
              <Text style={styles.stockCardKicker}>行情小幫手</Text>
              <Text style={styles.stockCardSymbol}>{stockReply.symbol}</Text>
            </View>
            <View style={styles.stockCardMetrics}>
              <View style={styles.stockCardMetric}>
                <Text style={styles.stockCardMetricLabel}>價格</Text>
                <Text style={styles.stockCardMetricValue}>
                  {formatMetric(stockReply.price)}
                </Text>
              </View>
              <View style={styles.stockCardMetric}>
                <Text style={styles.stockCardMetricLabel}>漲跌幅</Text>
                <Text
                  style={[
                    styles.stockCardMetricValue,
                    stockReply.changePercent > 0
                      ? styles.stockCardValueUp
                      : stockReply.changePercent < 0
                        ? styles.stockCardValueDown
                        : null,
                  ]}
                >
                  {formatMetric(stockReply.changePercent)}%
                </Text>
              </View>
            </View>
            <View style={styles.stockCardDividend}>
              {stockReply.noDividendData ? (
                <Text style={styles.stockCardEmpty}>暫無股利資料</Text>
              ) : (
                <>
                  <View style={styles.stockCardSummaryRow}>
                    <Text style={styles.stockCardSummaryLabel}>最近一次股利</Text>
                    <Text style={styles.stockCardSummaryValue}>
                      {stockReply.latestDividend
                        ? `${formatMetric(stockReply.latestDividend.amount)} (${stockReply.latestDividend.date})`
                        : '-'}
                    </Text>
                  </View>
                  <View style={styles.stockCardSummaryRow}>
                    <Text style={styles.stockCardSummaryLabel}>近 12 個月股利</Text>
                    <Text style={styles.stockCardSummaryValue}>
                      {stockReply.trailingDividendTotal === null
                        ? '-'
                        : formatMetric(stockReply.trailingDividendTotal)}
                    </Text>
                  </View>
                </>
              )}
            </View>
            {stockReply.dividendRecords.length ? (
              <View style={styles.stockCardRecords}>
                {stockReply.dividendRecords.map((record) => (
                  <View
                    key={`${record.date}-${record.amount}`}
                    style={styles.stockCardRecordRow}
                  >
                    <Text style={styles.stockCardRecordDate}>{record.date}</Text>
                    <Text style={styles.stockCardRecordAmount}>
                      {formatMetric(record.amount)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
        {!isPending && message.text && !stockReply ? (
          <Text style={[styles.messageText, isSelf && styles.selfMessageText]}>
            {displayText}
          </Text>
        ) : null}
        {hasAttachment ? (
          <View style={styles.messageAttachment}>
            {isImageAttachment ? (
              <Pressable
                onPress={() =>
                  onPreviewImage?.({
                    uri: message.attachmentUrl,
                    name: message.attachmentName || 'image',
                  })
                }
              >
                <Image
                  source={{ uri: message.attachmentUrl }}
                  style={styles.messageAttachmentImage}
                />
              </Pressable>
            ) : (
              <Pressable
                onPress={() => onOpenAttachment?.(message)}
                style={styles.messageAttachmentFile}
              >
                <Text style={styles.messageAttachmentFileLabel}>附件</Text>
                <Text
                  numberOfLines={1}
                  style={[styles.messageAttachmentFileName, isSelf && styles.selfMessageText]}
                >
                  {message.attachmentName || '未命名檔案'}
                </Text>
                <Text style={[styles.messageAttachmentFileMeta, isSelf && styles.selfTimeText]}>
                  {formatFileSize(message.attachmentSize)}
                </Text>
                <Text
                  style={[styles.messageAttachmentActionText, isSelf && styles.selfMessageText]}
                >
                  點擊開啟或分享
                </Text>
              </Pressable>
            )}
          </View>
        ) : null}
        {!isPending ? (
          <View style={styles.messageFooter}>
            {isSelf ? (
              <Text style={[styles.readReceiptText, message.readAt && styles.readReceiptTextRead]}>
                {message.readAt ? '已讀' : '送達'}
              </Text>
            ) : null}
            <Text style={[styles.timeText, isSelf && styles.selfTimeText]}>
              {formatTime(message.sentAt)}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}
