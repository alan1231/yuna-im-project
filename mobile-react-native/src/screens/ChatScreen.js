import { useMemo, useState } from 'react'
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  Text,
  View,
} from 'react-native'
import { stockBotId } from '../config/runtime'
import { messageKey } from '../models/chat'
import { styles } from '../styles/appStyles'
import { Composer } from '../components/Composer'
import { MessageBubble } from '../components/MessageBubble'
import { RoomListScreen } from './RoomListScreen'

function dateKey(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'unknown'
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function formatDateLabel(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)

  if (dateKey(date) === dateKey(today)) return '今天'
  if (dateKey(date) === dateKey(yesterday)) return '昨天'

  const sameYear = date.getFullYear() === today.getFullYear()
  return date.toLocaleDateString('zh-TW', {
    year: sameYear ? undefined : 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function connectionLabel(isConnected, connectionState) {
  if (isConnected) return '已連線'
  if (connectionState === 'connecting') return '連線中'
  if (connectionState === 'reconnecting') return '重連中'
  if (connectionState === 'waking') return '喚醒中'
  return '離線'
}

export function ChatScreen({
  activeMessages,
  activeRoom,
  attachment,
  availableUsers,
  clearAttachment,
  connectionError,
  connectionState,
  currentUserId,
  error,
  friendRequests,
  isConnected,
  isLoadingChat,
  isPreparingAttachment,
  isStockBotPending,
  isWakingBackend,
  mobileView,
  onAddFriend,
  onCreateGroup,
  onDeleteFriend,
  onDismissError,
  onLeaveGroup,
  onLogout,
  onOpenMessageAttachment,
  onPickAttachment,
  onRefreshRooms,
  onRespondToFriendRequest,
  onShowRooms,
  onSelectRoom,
  onSendMessage,
  onStartChatWithUser,
  onWakeBackend,
  profile,
  rooms,
}) {
  const [previewImage, setPreviewImage] = useState(null)
  const [isMemberSheetOpen, setIsMemberSheetOpen] = useState(false)
  const realtimeLabel = connectionLabel(isConnected, connectionState)

  const memberNames = useMemo(() => {
    if (!activeRoom?.isGroup) return []
    const namesById = new Map([[profile.id, profile.displayName]])
    availableUsers.forEach((user) => namesById.set(user.id, user.displayName))
    rooms
      .filter((room) => room.isFriend)
      .forEach((room) => namesById.set(room.recipientId, room.name))
    return (activeRoom.memberIds || [])
      .map((memberId) => namesById.get(memberId) || memberId)
      .filter(Boolean)
  }, [activeRoom, availableUsers, profile, rooms])

  const messageItems = useMemo(() => {
    const items = []
    let previousDate = ''
    activeMessages.forEach((message, index) => {
      const currentDate = dateKey(message.sentAt)
      if (currentDate !== previousDate) {
        items.push({
          type: 'date',
          key: `date:${currentDate}:${index}`,
          label: formatDateLabel(message.sentAt),
        })
        previousDate = currentDate
      }

      items.push({
        type: 'message',
        key: `message:${messageKey(message)}`,
        message,
      })
    })
    return items
  }, [activeMessages])

  if (mobileView === 'rooms') {
    return (
      <View style={styles.chatScreen}>
        <RoomListScreen
          activeRoomId={activeRoom?.id || ''}
          availableUsers={availableUsers}
          connectionError={connectionError}
          connectionLabel={realtimeLabel}
          isConnected={isConnected}
          isWakingBackend={isWakingBackend}
          error={error}
          friendRequests={friendRequests}
          isLoadingChat={isLoadingChat}
          onAddFriend={onAddFriend}
          onCreateGroup={onCreateGroup}
          onDeleteFriend={onDeleteFriend}
          onDismissError={onDismissError}
          onLogout={onLogout}
          onRefreshRooms={onRefreshRooms}
          onRespondToFriendRequest={onRespondToFriendRequest}
          onSelectRoom={onSelectRoom}
          onStartChatWithUser={onStartChatWithUser}
          onWakeBackend={onWakeBackend}
          profile={profile}
          rooms={rooms}
        />
      </View>
    )
  }

  return (
    <View style={styles.chatScreen}>
      <View style={styles.header}>
        <View style={styles.chatHeaderMain}>
          <Pressable
            accessibilityLabel="回到聊天室列表"
            onPress={onShowRooms}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>‹</Text>
          </Pressable>
          <View style={styles.chatTitleBlock}>
            <Text style={styles.eyebrow}>
              {activeRoom?.id === stockBotId
                ? 'MARKET CHAT'
                : activeRoom?.isGroup
                  ? 'GROUP CHAT'
                  : 'DIRECT MESSAGE'}
            </Text>
            <Text style={styles.headerTitle}>{activeRoom?.name || 'Yuna IM'}</Text>
            {activeRoom?.isGroup && memberNames.length ? (
              <Text
                numberOfLines={1}
                onPress={() => setIsMemberSheetOpen(true)}
                style={styles.chatSubtitle}
              >
                {memberNames.join('、')}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.headerActions}>
          <View style={[styles.status, isConnected && styles.statusConnected]}>
            <Text
              style={[
                styles.statusText,
                isConnected && styles.statusConnectedText,
              ]}
            >
              {realtimeLabel}
            </Text>
          </View>
          {activeRoom?.isGroup ? (
            <Pressable
              onPress={() => onLeaveGroup(activeRoom.id)}
              style={[styles.headerButton, styles.headerButtonDanger]}
            >
              <Text style={[styles.headerButtonText, styles.headerButtonDangerText]}>
                退出
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {connectionError ? (
        <View style={styles.connectionError}>
          <Text style={styles.connectionErrorText}>{connectionError}</Text>
          <Pressable onPress={onWakeBackend} style={styles.connectionErrorButton}>
            <Text style={styles.connectionErrorButtonText}>
              {isWakingBackend ? '喚醒中' : '喚醒後端'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {error ? (
        <Pressable onPress={onDismissError} style={styles.notice}>
          <Text style={styles.noticeText}>{error}</Text>
        </Pressable>
      ) : null}

      <Modal
        animationType="fade"
        transparent
        visible={Boolean(previewImage)}
        onRequestClose={() => setPreviewImage(null)}
      >
        <Pressable
          onPress={() => setPreviewImage(null)}
          style={styles.imagePreviewBackdrop}
        >
          <Pressable onPress={() => {}} style={styles.imagePreviewContent}>
            <Pressable
              onPress={() => setPreviewImage(null)}
              style={styles.imagePreviewClose}
            >
              <Text style={styles.imagePreviewCloseText}>×</Text>
            </Pressable>
            {previewImage ? (
              <Image source={{ uri: previewImage.uri }} style={styles.imagePreviewFull} />
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        animationType="slide"
        transparent
        visible={isMemberSheetOpen}
        onRequestClose={() => setIsMemberSheetOpen(false)}
      >
        <Pressable
          onPress={() => setIsMemberSheetOpen(false)}
          style={styles.sheetBackdrop}
        >
          <Pressable onPress={() => {}} style={styles.sheetCard}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>群組成員</Text>
              <Pressable
                onPress={() => setIsMemberSheetOpen(false)}
                style={styles.modalCloseButton}
              >
                <Text style={styles.modalCloseButtonText}>×</Text>
              </Pressable>
            </View>
            <Text style={styles.sheetSubtitle}>{activeRoom?.name}</Text>
            <View style={styles.memberSheetList}>
              {memberNames.map((name) => (
                <View key={name} style={styles.memberSheetRow}>
                  <View style={styles.memberSheetAvatar}>
                    <Text style={styles.memberSheetAvatarText}>
                      {name.slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.memberSheetName}>{name}</Text>
                </View>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <FlatList
        data={messageItems}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.messageList}
        ListEmptyComponent={
          activeRoom?.id === stockBotId ? (
            <View style={styles.stockEmptyState}>
              <Text style={styles.stockEmptyKicker}>MARKET CHAT</Text>
              <Text style={styles.stockEmptyTitle}>{activeRoom?.name || '行情小幫手'}</Text>
              <Text style={styles.stockEmptyText}>
                直接輸入股票代號，快速查詢即時股價與近 12 個月股利。
              </Text>
              <View style={styles.stockQuickActions}>
                {['2330', '2317', 'NVDA', 'TSM'].map((symbol) => (
                  <Pressable
                    key={symbol}
                    disabled={isStockBotPending}
                    onPress={() => onSendMessage(symbol)}
                    style={styles.stockQuickAction}
                  >
                    <Text style={styles.stockQuickActionText}>{symbol}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.stockEmptyHint}>支援台股與美股代號。</Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                {activeRoom?.description || '傳送第一則訊息開始對話。'}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          if (item.type === 'date') {
            return <Text style={styles.messageDateDivider}>{item.label}</Text>
          }

          return (
            <MessageBubble
              isGroup={Boolean(activeRoom?.isGroup)}
              isSelf={item.message.senderId === currentUserId}
              message={item.message}
              onOpenAttachment={onOpenMessageAttachment}
              onPreviewImage={setPreviewImage}
            />
          )
        }}
      />
      <Composer
        attachment={attachment}
        disabled={!activeRoom || isPreparingAttachment}
        isPreparingAttachment={isPreparingAttachment}
        onAttachPress={onPickAttachment}
        onClearAttachment={clearAttachment}
        onSend={onSendMessage}
        placeholder={
          activeRoom?.id === stockBotId
            ? '輸入股票代號，例如 2330 或 NVDA'
            : `傳訊給 ${activeRoom?.name || '對方'}`
        }
        sendLabel={activeRoom?.id === stockBotId ? '查詢' : '送出'}
        variant={activeRoom?.id === stockBotId ? 'stock' : 'chat'}
      />
    </View>
  )
}
