import { useState } from 'react'
import { Image, Pressable, Text, TextInput, View } from 'react-native'
import { formatFileSize } from '../models/chat'
import { styles } from '../styles/appStyles'

export function Composer({
  attachment,
  disabled,
  isPreparingAttachment = false,
  onAttachPress,
  onClearAttachment,
  onSend,
  placeholder = '輸入訊息',
  sendLabel = '送出',
  variant = 'chat',
}) {
  const [text, setText] = useState('')

  const submit = async () => {
    const shouldClear = await Promise.resolve(onSend(text))
    if (shouldClear) setText('')
  }

  const hasImageAttachment = attachment?.type?.startsWith('image/')

  return (
    <View style={styles.composerShell}>
      {attachment ? (
        <View style={styles.attachmentPreview}>
          {hasImageAttachment ? (
            <Image source={{ uri: attachment.url }} style={styles.attachmentPreviewImage} />
          ) : (
            <View style={styles.attachmentPreviewIcon}>
              <Text style={styles.attachmentPreviewIconText}>檔</Text>
            </View>
          )}
          <View style={styles.attachmentPreviewBody}>
            <Text numberOfLines={1} style={styles.attachmentPreviewName}>
              {attachment.name}
            </Text>
            <Text style={styles.attachmentPreviewMeta}>
              {isPreparingAttachment
                ? '附件處理中...'
                : attachment.wasCompressed
                  ? `${formatFileSize(attachment.size) || '待傳送附件'} · 已壓縮`
                  : formatFileSize(attachment.size) || '待傳送附件'}
            </Text>
          </View>
          <Pressable onPress={onClearAttachment} style={styles.attachmentRemoveButton}>
            <Text style={styles.attachmentRemoveButtonText}>×</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.composer}>
        <Pressable
          disabled={disabled}
          onPress={onAttachPress}
          style={[styles.attachButton, disabled && styles.disabledSendButton]}
        >
          <Text style={styles.attachButtonText}>{isPreparingAttachment ? '…' : '＋'}</Text>
        </Pressable>
        <TextInput
          editable={!disabled}
          multiline
          onChangeText={setText}
          onSubmitEditing={submit}
          placeholder={isPreparingAttachment ? '正在處理附件...' : placeholder}
          placeholderTextColor="#8a8f91"
          style={styles.composerInput}
          value={text}
        />
        <Pressable
          disabled={disabled || (!text.trim() && !attachment)}
          onPress={submit}
          style={[
            styles.sendButton,
            variant === 'stock' && styles.sendButtonStock,
            (disabled || (!text.trim() && !attachment)) && styles.disabledSendButton,
          ]}
        >
          <Text style={styles.sendButtonText}>{sendLabel}</Text>
        </Pressable>
      </View>
    </View>
  )
}
