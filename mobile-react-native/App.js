import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { stockBotId } from './src/config/runtime'
import { formatRoomTime, formatTime, messageKey } from './src/models/chat'
import { useChatViewModel } from './src/viewModels/useChatViewModel'

export default function App() {
  const viewModel = useChatViewModel()
  const {
    activeMessages,
    activeRoom,
    availableUsers,
    createOrLogin,
    dismissError,
    error,
    isConnected,
    isLoadingChat,
    isRestoring,
    isSubmittingProfile,
    logout,
    mobileView,
    profile,
    refreshRooms,
    rooms,
    selectRoom,
    sendMessage,
    showRooms,
    startChatWithUser,
  } = viewModel

  if (isRestoring) {
    return (
      <SafeAreaView style={styles.centerScreen}>
        <ActivityIndicator size="large" color="#245c4f" />
        <Text style={styles.mutedText}>正在載入 Yuna IM</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      {!profile ? (
        <AccountScreen
          error={error}
          isSubmitting={isSubmittingProfile}
          onSubmit={createOrLogin}
        />
      ) : (
        <KeyboardAvoidingView
          style={styles.keyboardRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ChatScreen
            activeMessages={activeMessages}
            activeRoom={activeRoom}
            availableUsers={availableUsers}
            currentUserId={profile.id}
            error={error}
            isConnected={isConnected}
            isLoadingChat={isLoadingChat}
            mobileView={mobileView}
            onDismissError={dismissError}
            onLogout={logout}
            onRefreshRooms={refreshRooms}
            onShowRooms={showRooms}
            onSelectRoom={selectRoom}
            onSendMessage={sendMessage}
            onStartChatWithUser={startChatWithUser}
            profile={profile}
            rooms={rooms}
          />
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  )
}

function AccountScreen({ error, isSubmitting, onSubmit }) {
  const [displayName, setDisplayName] = useState('')
  const [mode, setMode] = useState('login')
  const submit = () => onSubmit(displayName, mode === 'create')

  return (
    <View style={styles.accountScreen}>
      <View style={styles.accountEntry}>
        <View style={styles.accountBrand}>
          <Text style={styles.brandEyebrow}>REAL-TIME CHAT</Text>
          <Text style={styles.brandTitle}>Yuna IM</Text>
          <Text style={styles.brandCopy}>即時聊天、好友對話與行情小幫手。</Text>
          <View style={styles.featureList}>
            <Text style={styles.featurePill}>聊天</Text>
            <Text style={styles.featurePill}>行情</Text>
            <Text style={styles.featurePill}>即時</Text>
          </View>
        </View>

        <View style={styles.accountPanel}>
          <View style={styles.accountPanelHeading}>
            <Text style={styles.panelKicker}>START</Text>
            <Text style={styles.panelTitle}>
              {mode === 'login' ? '登入帳號' : '建立帳號'}
            </Text>
            <Text style={styles.accountCopy}>
              {mode === 'login'
                ? '用你的顯示名稱回到聊天室。'
                : '建立一個 demo 使用者開始聊天。'}
            </Text>
          </View>

          <View style={styles.modeSwitch}>
            <Pressable
              onPress={() => setMode('login')}
              style={[styles.modeButton, mode === 'login' && styles.activeModeButton]}
            >
              <Text
                style={[
                  styles.modeButtonText,
                  mode === 'login' && styles.activeModeButtonText,
                ]}
              >
                登入
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setMode('create')}
              style={[styles.modeButton, mode === 'create' && styles.activeModeButton]}
            >
              <Text
                style={[
                  styles.modeButtonText,
                  mode === 'create' && styles.activeModeButtonText,
                ]}
              >
                建立
              </Text>
            </Pressable>
          </View>

          <Text style={styles.fieldLabel}>顯示名稱</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isSubmitting}
            maxLength={32}
            onChangeText={setDisplayName}
            placeholder="輸入顯示名稱"
            placeholderTextColor="#8b95a1"
            style={styles.input}
            value={displayName}
          />
          {error ? <Text style={styles.accountMessageError}>{error}</Text> : null}
          <Pressable
            disabled={isSubmitting || !displayName.trim()}
            onPress={submit}
            style={[
              styles.accountSubmit,
              (isSubmitting || !displayName.trim()) && styles.accountSubmitDisabled,
            ]}
          >
            <Text
              style={[
                styles.accountSubmitText,
                (isSubmitting || !displayName.trim()) &&
                  styles.accountSubmitDisabledText,
              ]}
            >
              {isSubmitting
                ? '處理中'
                : mode === 'login'
                  ? '登入'
                  : '建立帳號'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}

function ChatScreen({
  activeMessages,
  activeRoom,
  availableUsers,
  currentUserId,
  error,
  isConnected,
  isLoadingChat,
  mobileView,
  onDismissError,
  onLogout,
  onRefreshRooms,
  onShowRooms,
  onSelectRoom,
  onSendMessage,
  onStartChatWithUser,
  profile,
  rooms,
}) {
  if (mobileView === 'rooms') {
    return (
      <View style={styles.chatScreen}>
        <RoomListScreen
          activeRoomId={activeRoom?.id || ''}
          availableUsers={availableUsers}
          error={error}
          isLoadingChat={isLoadingChat}
          onDismissError={onDismissError}
          onLogout={onLogout}
          onRefreshRooms={onRefreshRooms}
          onSelectRoom={onSelectRoom}
          onStartChatWithUser={onStartChatWithUser}
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
          <View style={styles.chatAvatar}>
            <Text style={styles.chatAvatarText}>{initials(activeRoom?.name || 'Y')}</Text>
          </View>
          <View style={styles.chatTitleBlock}>
            <Text style={styles.eyebrow}>
              {activeRoom?.id === stockBotId ? 'MARKET CHAT' : 'DIRECT MESSAGE'}
            </Text>
            <Text style={styles.headerTitle}>{activeRoom?.name || 'Yuna IM'}</Text>
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
              {isConnected ? '已連線' : '離線'}
            </Text>
          </View>
          <Pressable onPress={onLogout} style={styles.headerButton}>
            <Text style={styles.headerButtonText}>登出</Text>
          </Pressable>
        </View>
      </View>

      {error ? (
        <Pressable onPress={onDismissError} style={styles.notice}>
          <Text style={styles.noticeText}>{error}</Text>
        </Pressable>
      ) : null}

      <FlatList
        data={activeMessages}
        keyExtractor={(message) => messageKey(message)}
        contentContainerStyle={styles.messageList}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>還沒有訊息</Text>
            <Text style={styles.emptyText}>傳送第一則訊息開始對話。</Text>
          </View>
        }
        renderItem={({ item }) => (
          <MessageBubble message={item} isSelf={item.senderId === currentUserId} />
        )}
      />
      <Composer disabled={!activeRoom} onSend={onSendMessage} />
    </View>
  )
}

function RoomListScreen({
  activeRoomId,
  availableUsers,
  error,
  isLoadingChat,
  onDismissError,
  onLogout,
  onRefreshRooms,
  onSelectRoom,
  onStartChatWithUser,
  profile,
  rooms,
}) {
  const [searchText, setSearchText] = useState('')
  const normalizedSearch = searchText.trim().toLowerCase()
  const roomRecipientIds = useMemo(
    () => new Set(rooms.map((room) => room.recipientId)),
    [rooms],
  )
  const visibleRooms = normalizedSearch
    ? rooms.filter((room) =>
        `${room.name} ${room.lastMessage || ''}`.toLowerCase().includes(normalizedSearch),
      )
    : rooms
  const visibleUsers = normalizedSearch
    ? availableUsers.filter((user) => {
        return (
          !roomRecipientIds.has(user.id) &&
          user.displayName.toLowerCase().includes(normalizedSearch)
        )
      })
    : []

  return (
    <View style={styles.roomScreen}>
      <View style={styles.roomSidebarHeader}>
        <View style={styles.menuButton}>
          <View style={styles.menuLine} />
          <View style={styles.menuLine} />
          <View style={styles.menuLine} />
        </View>
        <View style={styles.roomHeaderText}>
          <Text style={styles.roomScreenTitle}>聊天室</Text>
          <Text style={styles.roomScreenSubtitle}>{profile.displayName}</Text>
        </View>
        <Pressable onPress={onLogout} style={styles.headerButton}>
          <Text style={styles.headerButtonText}>登出</Text>
        </Pressable>
      </View>

      {error ? (
        <Pressable onPress={onDismissError} style={styles.notice}>
          <Text style={styles.noticeText}>{error}</Text>
        </Pressable>
      ) : null}

      <View style={styles.sidebarSearch}>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setSearchText}
          placeholder="搜尋聊天室或使用者"
          placeholderTextColor="#8b95a1"
          style={styles.searchInput}
          value={searchText}
        />
      </View>

      <FlatList
        data={[...visibleRooms, ...visibleUsers.map(userToRoomListCandidate)]}
        keyExtractor={(item) => item.listKey || `room:${item.id}`}
        contentContainerStyle={styles.roomList}
        ListHeaderComponent={
          <Pressable onPress={onRefreshRooms} style={styles.refreshRow}>
            <Text style={styles.refreshRowText}>
              {isLoadingChat ? '正在刷新...' : '刷新聊天室'}
            </Text>
          </Pressable>
        }
        ListEmptyComponent={
          <Text style={styles.emptyMenu}>
            {normalizedSearch ? '找不到符合的聊天室。' : '目前沒有聊天室。'}
          </Text>
        }
        renderItem={({ item }) => {
          if (item.kind === 'user') {
            return (
              <RoomListItem
                isActive={false}
                name={item.name}
                online={item.online}
                preview="開始新對話"
                unreadCount={0}
                onPress={() => onStartChatWithUser(item.user)}
              />
            )
          }

          return (
            <RoomListItem
              isActive={activeRoomId === item.id}
              name={item.name}
              online={item.online}
              preview={roomPreview(item)}
              time={formatRoomTime(item.lastMessageAt)}
              unreadCount={item.unreadCount}
              onPress={() => onSelectRoom(item)}
            />
          )
        }}
      />
    </View>
  )
}

function RoomListItem({
  isActive,
  name,
  online,
  onPress,
  preview,
  time,
  unreadCount,
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.roomItem, isActive && styles.roomItemActive]}
    >
      <View style={styles.roomAvatar}>
        <Text style={styles.roomAvatarText}>{initials(name)}</Text>
        {online ? <View style={styles.roomOnlineDot} /> : null}
      </View>
      <View style={styles.roomContent}>
        <View style={styles.roomTopline}>
          <Text numberOfLines={1} style={styles.roomName}>
            {name}
          </Text>
          {time ? <Text style={styles.roomTime}>{time}</Text> : null}
        </View>
        <View style={styles.roomBottomline}>
          <Text numberOfLines={1} style={styles.roomPreview}>
            {preview}
          </Text>
          {unreadCount > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  )
}

function userToRoomListCandidate(user) {
  return {
    kind: 'user',
    listKey: `user:${user.id}`,
    name: user.displayName,
    online: user.online,
    user,
  }
}

function roomPreview(room) {
  if (room.lastMessage) return room.lastMessage
  if (room.id === stockBotId) return '輸入股票代號查詢行情'
  if (room.isFriend) return room.online ? '在線上' : '好友'
  return '開始對話'
}

function MessageBubble({ isSelf, message }) {
  return (
    <View style={[styles.messageRow, isSelf && styles.selfMessageRow]}>
      <View style={[styles.messageBubble, isSelf && styles.selfMessageBubble]}>
        {!isSelf ? <Text style={styles.senderText}>{message.sender}</Text> : null}
        <Text style={[styles.messageText, isSelf && styles.selfMessageText]}>
          {message.text}
        </Text>
        <Text style={[styles.timeText, isSelf && styles.selfTimeText]}>
          {formatTime(message.sentAt)}
        </Text>
      </View>
    </View>
  )
}

function initials(name) {
  return String(name || '?').slice(0, 1).toUpperCase()
}

function Composer({ disabled, onSend }) {
  const [text, setText] = useState('')

  const submit = () => {
    if (onSend(text)) setText('')
  }

  return (
    <View style={styles.composer}>
      <TextInput
        editable={!disabled}
        multiline
        onChangeText={setText}
        onSubmitEditing={submit}
        placeholder="輸入訊息"
        placeholderTextColor="#8a8f91"
        style={styles.composerInput}
        value={text}
      />
      <Pressable
        disabled={disabled || !text.trim()}
        onPress={submit}
        style={[
          styles.sendButton,
          (disabled || !text.trim()) && styles.disabledSendButton,
        ]}
      >
        <Text style={styles.sendButtonText}>送出</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f6f7f9',
  },
  keyboardRoot: {
    flex: 1,
  },
  centerScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#f6f7f9',
  },
  mutedText: {
    color: '#697586',
    fontSize: 14,
  },
  accountScreen: {
    flex: 1,
    justifyContent: 'center',
    padding: 18,
    backgroundColor: '#f6f7f9',
  },
  accountEntry: {
    overflow: 'hidden',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d9dee7',
    backgroundColor: '#ffffff',
    shadowColor: '#121926',
    shadowOpacity: 0.12,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 4,
  },
  accountBrand: {
    minHeight: 212,
    padding: 24,
    justifyContent: 'flex-end',
    gap: 12,
    backgroundColor: '#162330',
  },
  eyebrow: {
    color: '#0f766e',
    fontSize: 11,
    fontWeight: '900',
  },
  brandEyebrow: {
    color: '#9edbd5',
    fontSize: 11,
    fontWeight: '900',
  },
  brandTitle: {
    color: '#ffffff',
    fontSize: 42,
    lineHeight: 46,
    fontWeight: '900',
  },
  brandCopy: {
    color: '#d5e3f3',
    fontSize: 16,
    lineHeight: 24,
  },
  featureList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  featurePill: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    color: '#ffffff',
    backgroundColor: 'rgba(255,255,255,0.12)',
    fontSize: 13,
    fontWeight: '900',
  },
  accountPanel: {
    padding: 22,
    gap: 16,
    backgroundColor: '#ffffff',
  },
  accountPanelHeading: {
    gap: 7,
  },
  panelKicker: {
    color: '#115e59',
    fontSize: 12,
    fontWeight: '900',
  },
  panelTitle: {
    color: '#17202a',
    fontSize: 30,
    lineHeight: 35,
    fontWeight: '900',
  },
  accountCopy: {
    color: '#697586',
    fontSize: 15,
    lineHeight: 23,
  },
  modeSwitch: {
    padding: 4,
    flexDirection: 'row',
    gap: 4,
    borderRadius: 8,
    backgroundColor: '#eef1f5',
  },
  modeButton: {
    flex: 1,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  activeModeButton: {
    backgroundColor: '#ffffff',
    shadowColor: '#121926',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  modeButtonText: {
    color: '#697586',
    fontWeight: '800',
  },
  activeModeButtonText: {
    color: '#115e59',
  },
  fieldLabel: {
    color: '#17202a',
    fontWeight: '800',
    marginBottom: -8,
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: '#d9dee7',
    borderRadius: 8,
    paddingHorizontal: 14,
    color: '#17202a',
    backgroundColor: '#ffffff',
    fontSize: 16,
  },
  accountMessageError: {
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffd1cc',
    color: '#b42318',
    backgroundColor: '#fff1f0',
    lineHeight: 21,
  },
  accountSubmit: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#0f766e',
  },
  accountSubmitDisabled: {
    backgroundColor: '#e5e9ef',
  },
  accountSubmitText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 16,
  },
  accountSubmitDisabledText: {
    color: '#8b95a1',
  },
  chatScreen: {
    flex: 1,
    margin: 0,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  roomScreen: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  roomSidebarHeader: {
    minHeight: 62,
    paddingHorizontal: 10,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#d9dee7',
    backgroundColor: '#f8fafc',
  },
  menuButton: {
    width: 34,
    height: 34,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 8,
  },
  menuLine: {
    width: 20,
    height: 2,
    borderRadius: 999,
    backgroundColor: '#697586',
  },
  roomHeaderText: {
    minWidth: 0,
    flex: 1,
  },
  roomScreenTitle: {
    color: '#17202a',
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
  },
  roomScreenSubtitle: {
    color: '#697586',
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
  },
  sidebarSearch: {
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 6,
  },
  searchInput: {
    minHeight: 38,
    paddingHorizontal: 10,
    color: '#17202a',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d9dee7',
    borderRadius: 8,
    fontSize: 15,
  },
  roomList: {
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  refreshRow: {
    minHeight: 38,
    marginBottom: 4,
    paddingHorizontal: 10,
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#eaf5f3',
  },
  refreshRowText: {
    color: '#115e59',
    fontWeight: '900',
  },
  emptyMenu: {
    margin: 12,
    color: '#697586',
    fontSize: 13,
  },
  roomItem: {
    minHeight: 72,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 8,
  },
  roomItemActive: {
    backgroundColor: '#eaf5f3',
  },
  roomAvatar: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 23,
    backgroundColor: '#0f766e',
  },
  roomAvatarText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '900',
  },
  roomOnlineDot: {
    position: 'absolute',
    right: 1,
    bottom: 1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#f8fafc',
    backgroundColor: '#16a34a',
  },
  roomContent: {
    minWidth: 0,
    flex: 1,
    gap: 4,
  },
  roomTopline: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roomBottomline: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roomName: {
    minWidth: 0,
    flex: 1,
    color: '#17202a',
    fontSize: 16,
    fontWeight: '900',
  },
  roomPreview: {
    minWidth: 0,
    flex: 1,
    color: '#697586',
    fontSize: 14,
  },
  roomTime: {
    color: '#697586',
    fontSize: 13,
    fontWeight: '700',
  },
  header: {
    minHeight: 82,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#d9dee7',
    backgroundColor: '#ffffff',
    gap: 12,
  },
  chatHeaderMain: {
    minWidth: 0,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  backButtonText: {
    color: '#697586',
    fontSize: 34,
    lineHeight: 34,
  },
  chatAvatar: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: '#0f766e',
  },
  chatAvatarText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 17,
  },
  chatTitleBlock: {
    minWidth: 0,
    flex: 1,
    gap: 3,
  },
  headerTitle: {
    color: '#17202a',
    fontSize: 20,
    fontWeight: '900',
  },
  headerActions: {
    alignItems: 'flex-end',
    gap: 8,
  },
  status: {
    minHeight: 24,
    paddingHorizontal: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: '#eef1f5',
  },
  statusConnected: {
    backgroundColor: '#d9f3ee',
  },
  statusText: {
    color: '#697586',
    fontSize: 12,
    fontWeight: '900',
  },
  statusConnectedText: {
    color: '#0f766e',
  },
  headerButton: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#d9dee7',
  },
  headerButtonText: {
    color: '#17202a',
    fontWeight: '800',
  },
  notice: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cfe6ff',
    backgroundColor: '#edf6ff',
  },
  noticeText: {
    color: '#41546d',
  },
  roomRail: {
    minHeight: 64,
    paddingVertical: 10,
    paddingLeft: 12,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#d9dee7',
  },
  refreshChip: {
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    backgroundColor: '#eef1f5',
  },
  refreshChipText: {
    color: '#115e59',
    fontWeight: '800',
  },
  roomChip: {
    height: 42,
    maxWidth: 174,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    marginRight: 8,
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  activeRoomChip: {
    backgroundColor: '#eaf5f3',
  },
  roomChipText: {
    color: '#17202a',
    fontWeight: '800',
  },
  activeRoomChipText: {
    color: '#115e59',
  },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f766e',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  messageList: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 18,
    backgroundColor: '#ffffff',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyTitle: {
    color: '#17202a',
    fontSize: 18,
    fontWeight: '800',
  },
  emptyText: {
    color: '#697586',
    marginTop: 6,
  },
  messageRow: {
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  selfMessageRow: {
    alignItems: 'flex-end',
  },
  messageBubble: {
    maxWidth: '82%',
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#d9dee7',
  },
  selfMessageBubble: {
    backgroundColor: '#0f766e',
    borderColor: '#0f766e',
  },
  senderText: {
    color: '#697586',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 3,
  },
  messageText: {
    color: '#17202a',
    fontSize: 16,
    lineHeight: 22,
  },
  selfMessageText: {
    color: '#ffffff',
  },
  timeText: {
    color: '#697586',
    fontSize: 11,
    alignSelf: 'flex-end',
    marginTop: 5,
  },
  selfTimeText: {
    color: '#bce7df',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: '#d9dee7',
    backgroundColor: '#ffffff',
  },
  composerInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d9dee7',
    backgroundColor: '#ffffff',
    color: '#17202a',
    fontSize: 16,
  },
  sendButton: {
    width: 66,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#0f766e',
  },
  disabledSendButton: {
    opacity: 0.45,
  },
  sendButtonText: {
    color: '#ffffff',
    fontWeight: '800',
  },
})
