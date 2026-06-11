import { useMemo, useState } from 'react'
import {
  Animated,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { formatRoomTime } from '../models/chat'
import { styles } from '../styles/appStyles'
import { roomPreview, userToRoomListCandidate } from '../utils/chatViewHelpers'
import { RoomListItem } from '../components/RoomListItem'

export function RoomListScreen({
  activeRoomId,
  availableUsers,
  connectionError,
  connectionLabel,
  error,
  friendRequests,
  isConnected,
  isLoadingChat,
  isWakingBackend,
  onAddFriend,
  onCreateGroup,
  onDeleteFriend,
  onDismissError,
  onLogout,
  onRefreshRooms,
  onRespondToFriendRequest,
  onSelectRoom,
  onStartChatWithUser,
  onWakeBackend,
  profile,
  rooms,
}) {
  const [searchText, setSearchText] = useState('')
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [shouldRenderDrawer, setShouldRenderDrawer] = useState(false)
  const [drawerView, setDrawerView] = useState('menu')
  const [contactSearchText, setContactSearchText] = useState('')
  const [isAddFriendModalOpen, setIsAddFriendModalOpen] = useState(false)
  const [isCreateGroupModalOpen, setIsCreateGroupModalOpen] = useState(false)
  const [friendName, setFriendName] = useState('')
  const [groupName, setGroupName] = useState('')
  const [selectedGroupMemberIds, setSelectedGroupMemberIds] = useState([])
  const drawerProgress = useState(() => new Animated.Value(0))[0]
  const normalizedSearch = searchText.trim().toLowerCase()
  const normalizedContactSearch = contactSearchText.trim().toLowerCase()
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

  const friendRooms = useMemo(() => {
    return rooms.filter((room) => room.id !== 'stock_bot' && room.isFriend && !room.isGroup)
  }, [rooms])

  const groupRooms = useMemo(() => {
    return rooms.filter((room) => room.isGroup)
  }, [rooms])

  const visibleFriendRooms = useMemo(() => {
    if (!normalizedContactSearch) return friendRooms
    return friendRooms.filter((room) =>
      room.name.toLowerCase().includes(normalizedContactSearch),
    )
  }, [friendRooms, normalizedContactSearch])

  const openDrawer = () => {
    setDrawerView('menu')
    setShouldRenderDrawer(true)
    setIsMenuOpen(true)
    Animated.timing(drawerProgress, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start()
  }

  const closeDrawer = () => {
    setIsMenuOpen(false)
    Animated.timing(drawerProgress, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setShouldRenderDrawer(false)
        setDrawerView('menu')
      }
    })
  }

  const drawerTranslateX = drawerProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-320, 0],
  })

  const submitAddFriend = async () => {
    const submitted = await onAddFriend(friendName)
    if (!submitted) return
    setFriendName('')
    setIsAddFriendModalOpen(false)
    closeDrawer()
  }

  const toggleGroupMember = (memberId) => {
    setSelectedGroupMemberIds((currentIds) =>
      currentIds.includes(memberId)
        ? currentIds.filter((id) => id !== memberId)
        : [...currentIds, memberId],
    )
  }

  const submitCreateGroup = async () => {
    const submitted = await onCreateGroup({
      name: groupName,
      memberIds: selectedGroupMemberIds,
    })
    if (!submitted) return
    setGroupName('')
    setSelectedGroupMemberIds([])
    setIsCreateGroupModalOpen(false)
    closeDrawer()
  }

  return (
    <View style={styles.roomScreen}>
      {shouldRenderDrawer ? (
        <Animated.View
          pointerEvents={isMenuOpen ? 'auto' : 'none'}
          style={[styles.drawerBackdrop, { opacity: drawerProgress }]}
        >
          <Pressable onPress={closeDrawer} style={styles.drawerBackdropTouch} />
        </Animated.View>
      ) : null}

      {shouldRenderDrawer ? (
        <Animated.View
          style={[
            styles.sideDrawer,
            { transform: [{ translateX: drawerTranslateX }] },
          ]}
        >
          {drawerView === 'menu' ? (
            <>
              <View style={styles.drawerProfile}>
                <View style={styles.drawerAvatar}>
                  <Text style={styles.drawerAvatarText}>
                    {profile.displayName.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.drawerProfileText}>
                  <Text numberOfLines={1} style={styles.drawerProfileName}>
                    {profile.displayName}
                  </Text>
                  <Text style={styles.drawerProfileMeta}>Current user</Text>
                </View>
                <Pressable
                  accessibilityLabel="關閉選單"
                  onPress={closeDrawer}
                  style={styles.drawerClose}
                >
                  <Text style={styles.drawerCloseText}>×</Text>
                </Pressable>
              </View>

              <View style={styles.drawerMenu}>
                <Pressable
                  onPress={() => {
                    setDrawerView('contacts')
                    onRefreshRooms()
                  }}
                  style={styles.drawerMenuItem}
                >
                  <Text style={styles.drawerMenuIcon}>◎</Text>
                  <Text style={styles.drawerMenuLabel}>聯絡人</Text>
                </Pressable>
                <Pressable
                  onPress={() => setIsCreateGroupModalOpen(true)}
                  style={styles.drawerMenuItem}
                >
                  <Text style={styles.drawerMenuIcon}>#</Text>
                  <Text style={styles.drawerMenuLabel}>建立群組</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    closeDrawer()
                    onLogout()
                  }}
                  style={styles.drawerMenuItem}
                >
                  <Text style={styles.drawerMenuIcon}>↪</Text>
                  <Text style={styles.drawerMenuLabel}>登出</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <View style={styles.drawerToolbar}>
                <Pressable
                  accessibilityLabel="返回主選單"
                  onPress={() => setDrawerView('menu')}
                  style={styles.drawerBackButton}
                >
                  <Text style={styles.drawerBackButtonText}>‹</Text>
                </Pressable>
                <Text style={styles.drawerToolbarTitle}>聯絡人</Text>
                <Pressable
                  accessibilityLabel="關閉選單"
                  onPress={closeDrawer}
                  style={styles.drawerClose}
                >
                  <Text style={styles.drawerCloseText}>×</Text>
                </Pressable>
              </View>

              <View style={styles.drawerSearch}>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={setContactSearchText}
                  placeholder="搜尋聯絡人"
                  placeholderTextColor="#7f90a3"
                  style={styles.drawerSearchInput}
                  value={contactSearchText}
                />
              </View>

              <ScrollView contentContainerStyle={styles.drawerContactList}>
                {friendRequests.length ? (
                  <View style={styles.drawerSection}>
                    <Text style={styles.drawerSectionTitle}>好友邀請</Text>
                    {friendRequests.map((request) => (
                      <View key={request.id} style={styles.friendRequestCard}>
                        <View style={styles.friendRequestText}>
                          <Text style={styles.friendRequestName}>
                            {request.fromDisplayName}
                          </Text>
                          <Text style={styles.friendRequestMeta}>想加入你的好友</Text>
                        </View>
                        <View style={styles.friendRequestActions}>
                          <Pressable
                            onPress={() =>
                              onRespondToFriendRequest(request.id, false)
                            }
                            style={styles.friendRequestGhostButton}
                          >
                            <Text style={styles.friendRequestGhostButtonText}>拒絕</Text>
                          </Pressable>
                          <Pressable
                            onPress={() =>
                              onRespondToFriendRequest(request.id, true)
                            }
                            style={styles.friendRequestPrimaryButton}
                          >
                            <Text style={styles.friendRequestPrimaryButtonText}>接受</Text>
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null}

                <View style={styles.drawerSection}>
                  <Text style={styles.drawerSectionTitle}>好友</Text>
                  {visibleFriendRooms.length ? (
                    visibleFriendRooms.map((item) => (
                      <RoomListItem
                        key={item.id}
                        actionLabel="刪除"
                        actionTone="danger"
                        isActive={false}
                        name={item.name}
                        online={item.online}
                        preview={roomPreview(item)}
                        time={formatRoomTime(item.lastMessageAt)}
                        unreadCount={item.unreadCount}
                        onPress={() => {
                          closeDrawer()
                          setDrawerView('menu')
                          onSelectRoom(item)
                        }}
                        onSecondaryAction={() => onDeleteFriend(item.id)}
                        variant="drawer"
                      />
                    ))
                  ) : (
                    <Text style={styles.drawerEmpty}>目前沒有聯絡人。</Text>
                  )}
                </View>

                <View style={styles.drawerSection}>
                  <Text style={styles.drawerSectionTitle}>群組</Text>
                  {groupRooms.length ? (
                    groupRooms.map((item) => (
                      <RoomListItem
                        key={item.id}
                        isActive={false}
                        name={item.name}
                        online={false}
                        preview={roomPreview(item)}
                        time={formatRoomTime(item.lastMessageAt)}
                        unreadCount={item.unreadCount}
                        onPress={() => {
                          closeDrawer()
                          setDrawerView('menu')
                          onSelectRoom(item)
                        }}
                        variant="drawer"
                      />
                    ))
                  ) : (
                    <Text style={styles.drawerEmpty}>目前沒有群組。</Text>
                  )}
                </View>

                <View style={styles.drawerContactFooter}>
                  <Pressable
                    onPress={() => setIsAddFriendModalOpen(true)}
                    style={styles.drawerPrimaryAction}
                  >
                    <Text style={styles.drawerPrimaryActionText}>新增好友</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </>
          )}
        </Animated.View>
      ) : null}

      <Modal
        animationType="fade"
        transparent
        visible={isAddFriendModalOpen}
        onRequestClose={() => setIsAddFriendModalOpen(false)}
      >
        <Pressable
          onPress={() => setIsAddFriendModalOpen(false)}
          style={styles.modalBackdrop}
        >
          <Pressable onPress={() => {}} style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>新增好友</Text>
              <Pressable
                onPress={() => setIsAddFriendModalOpen(false)}
                style={styles.modalCloseButton}
              >
                <Text style={styles.modalCloseButtonText}>×</Text>
              </Pressable>
            </View>
            <Text style={styles.modalCopy}>輸入朋友名稱並送出邀請。</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setFriendName}
              placeholder="輸入朋友名稱"
              placeholderTextColor="#8b95a1"
              style={styles.input}
              value={friendName}
            />
            <Pressable
              disabled={!friendName.trim()}
              onPress={submitAddFriend}
              style={[
                styles.accountSubmit,
                !friendName.trim() && styles.accountSubmitDisabled,
              ]}
            >
              <Text
                style={[
                  styles.accountSubmitText,
                  !friendName.trim() && styles.accountSubmitDisabledText,
                ]}
              >
                送出邀請
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={isCreateGroupModalOpen}
        onRequestClose={() => setIsCreateGroupModalOpen(false)}
      >
        <Pressable
          onPress={() => setIsCreateGroupModalOpen(false)}
          style={styles.modalBackdrop}
        >
          <Pressable onPress={() => {}} style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>建立群組</Text>
              <Pressable
                onPress={() => setIsCreateGroupModalOpen(false)}
                style={styles.modalCloseButton}
              >
                <Text style={styles.modalCloseButtonText}>×</Text>
              </Pressable>
            </View>
            <TextInput
              autoCorrect={false}
              onChangeText={setGroupName}
              placeholder="群組名稱"
              placeholderTextColor="#8b95a1"
              style={styles.input}
              value={groupName}
            />
            <ScrollView style={styles.groupPicker}>
              {friendRooms.map((friend) => {
                const isSelected = selectedGroupMemberIds.includes(friend.recipientId)
                return (
                  <Pressable
                    key={friend.id}
                    onPress={() => toggleGroupMember(friend.recipientId)}
                    style={[
                      styles.groupPickerRow,
                      isSelected && styles.groupPickerRowSelected,
                    ]}
                  >
                    <View style={styles.groupPickerAvatar}>
                      <Text style={styles.groupPickerAvatarText}>
                        {friend.name.slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.groupPickerBody}>
                      <Text style={styles.groupPickerName}>{friend.name}</Text>
                      <Text style={styles.groupPickerMeta}>
                        {friend.online ? '在線上' : '離線'}
                      </Text>
                    </View>
                    <Text style={styles.groupPickerCheck}>
                      {isSelected ? '✓' : '+'}
                    </Text>
                  </Pressable>
                )
              })}
              {!friendRooms.length ? (
                <Text style={styles.drawerEmpty}>至少需要一位好友才能建立群組。</Text>
              ) : null}
            </ScrollView>
            <Pressable
              disabled={!groupName.trim() || !selectedGroupMemberIds.length}
              onPress={submitCreateGroup}
              style={[
                styles.accountSubmit,
                (!groupName.trim() || !selectedGroupMemberIds.length) &&
                  styles.accountSubmitDisabled,
              ]}
            >
              <Text
                style={[
                  styles.accountSubmitText,
                  (!groupName.trim() || !selectedGroupMemberIds.length) &&
                    styles.accountSubmitDisabledText,
                ]}
              >
                建立群組
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <View style={styles.roomSidebarHeader}>
        <Pressable onPress={openDrawer} style={styles.menuButton}>
          <View style={styles.menuLine} />
          <View style={styles.menuLine} />
          <View style={styles.menuLine} />
        </Pressable>
        <View style={styles.roomHeaderText}>
          <Text style={styles.roomScreenTitle}>聊天室</Text>
        </View>
        <View style={[styles.status, isConnected && styles.statusConnected]}>
          <Text
            style={[
              styles.statusText,
              isConnected && styles.statusConnectedText,
            ]}
          >
            {connectionLabel}
          </Text>
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
