import { useMemo, useState } from 'react'

const formatPresence = (room) => {
  if (room.online) return '在線'
  if (!room.lastSeen) return '最近上線時間未知'

  const lastSeen = new Date(room.lastSeen)
  if (Number.isNaN(lastSeen.getTime())) return '最近上線時間未知'
  if (lastSeen.getFullYear() < 2000) return '最近上線時間未知'

  const diffMinutes = Math.max(0, Math.floor((Date.now() - lastSeen.getTime()) / 60000))
  if (diffMinutes < 1) return '上線於不久前'
  if (diffMinutes < 60) return `最近上線於 ${diffMinutes} 分鐘前`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `最近上線於 ${diffHours} 小時前`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `最近上線於 ${diffDays} 天前`

  return `最近上線於 ${lastSeen.toLocaleDateString('zh-TW', {
    month: 'long',
    day: 'numeric',
  })}`
}

export default function RoomList({
  rooms,
  availableUsers,
  activeRoomId,
  error = '',
  currentUser,
  onSelect,
  onStartChat,
  onAddFriend,
  onRefreshFriends,
  onLogout,
}) {
  const [friendName, setFriendName] = useState('')
  const [searchText, setSearchText] = useState('')
  const [contactSearchText, setContactSearchText] = useState('')
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isAddFriendModalOpen, setIsAddFriendModalOpen] = useState(false)
  const [drawerView, setDrawerView] = useState('menu')
  const normalizedSearch = searchText.trim().toLowerCase()
  const normalizedContactSearch = contactSearchText.trim().toLowerCase()

  const visibleRooms = useMemo(() => {
    if (!normalizedSearch) return rooms

    return rooms.filter((room) => {
      return `${room.name} ${room.description}`.toLowerCase().includes(normalizedSearch)
    })
  }, [normalizedSearch, rooms])

  const visibleUsers = useMemo(() => {
    if (!normalizedSearch) return []

    const roomRecipientIds = new Set(rooms.map((room) => room.recipientId))
    const candidates = availableUsers.filter((user) => !roomRecipientIds.has(user.user_id))

    return candidates.filter((user) => {
      return user.display_name.toLowerCase().includes(normalizedSearch)
    })
  }, [availableUsers, normalizedSearch, rooms])

  const friendRooms = useMemo(() => {
    return rooms.filter((room) => room.id !== 'stock_bot' && room.isFriend)
  }, [rooms])

  const visibleFriendRooms = useMemo(() => {
    if (!normalizedContactSearch) return friendRooms

    return friendRooms.filter((room) => {
      return room.name.toLowerCase().includes(normalizedContactSearch)
    })
  }, [friendRooms, normalizedContactSearch])

  const hasVisibleTargets = visibleRooms.length > 0 || visibleUsers.length > 0

  const openDrawer = () => {
    setDrawerView('menu')
    setIsMenuOpen(true)
  }

  const closeDrawer = () => {
    setIsMenuOpen(false)
  }

  const openContacts = () => {
    setDrawerView('contacts')
    onRefreshFriends()
  }

  const selectContact = (roomId) => {
    onSelect(roomId)
    closeDrawer()
  }

  const submitFriend = (event) => {
    event.preventDefault()
    const name = friendName.trim()
    if (!name) return

    onAddFriend(name)
    setFriendName('')
  }

  return (
    <aside className="room-sidebar" aria-label="聊天清單">
      {isMenuOpen ? (
        <button type="button" className="drawer-backdrop" aria-label="關閉選單" onClick={closeDrawer} />
      ) : null}

      <aside className={`side-drawer ${isMenuOpen ? 'side-drawer-open' : ''}`} aria-label="主選單">
        {drawerView === 'menu' ? (
          <>
            <div className="drawer-profile">
              <span className="drawer-avatar">{currentUser.displayName.slice(0, 1).toUpperCase()}</span>
              <div className="drawer-profile-text">
                <strong>{currentUser.displayName}</strong>
                <span>目前使用者</span>
              </div>
              <button type="button" className="drawer-close" aria-label="關閉選單" onClick={closeDrawer}>
                ×
              </button>
            </div>

            <div className="drawer-menu">
              <button type="button" className="drawer-menu-item" onClick={openContacts}>
                <span className="drawer-menu-icon">◎</span>
                <span>聯絡人</span>
              </button>

              <button type="button" className="drawer-menu-item" onClick={onLogout}>
                <span className="drawer-menu-icon">↪</span>
                <span>登出</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="drawer-toolbar">
              <button
                type="button"
                className="drawer-back-button"
                aria-label="返回主選單"
                onClick={() => setDrawerView('menu')}
              >
                ‹
              </button>
              <h3>聯絡人</h3>
              <button type="button" className="drawer-close" aria-label="關閉選單" onClick={closeDrawer}>
                ×
              </button>
            </div>

            <div className="drawer-search">
              <input
                value={contactSearchText}
                type="search"
                placeholder="搜尋"
                autoComplete="off"
                onChange={(event) => setContactSearchText(event.target.value)}
              />
            </div>

            <nav className="drawer-contact-list" aria-label="好友列表">
              {visibleFriendRooms.map((friend) => (
                <button
                  key={friend.id}
                  type="button"
                  className="drawer-contact-item"
                  onClick={() => selectContact(friend.id)}
                >
                  <span className="room-avatar">{friend.initials}</span>
                  <span className="drawer-contact-content">
                    <span className="drawer-contact-topline">
                      <strong>{friend.name}</strong>
                      {friend.lastMessageAt ? <time>{friend.lastMessageAt}</time> : null}
                    </span>
                    <span className="drawer-contact-bottomline">
                      <span className={`presence-text ${friend.online ? 'presence-online' : ''}`}>
                        {formatPresence(friend)}
                      </span>
                      {friend.lastMessageIsSelf ? (
                        <span
                          className={`read-checks ${friend.lastMessageReadAt ? 'read-checks-read' : ''}`}
                          aria-label={friend.lastMessageReadAt ? '已讀' : '未讀'}
                          title={friend.lastMessageReadAt ? '已讀' : '未讀'}
                        >
                          <span />
                          {friend.lastMessageReadAt ? <span /> : null}
                        </span>
                      ) : null}
                      {!friend.lastMessageIsSelf && friend.unreadCount ? (
                        <span className="unread-badge">
                          {friend.unreadCount > 99 ? '99+' : friend.unreadCount}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
              ))}
              {!visibleFriendRooms.length ? <p className="drawer-empty">尚無符合的好友</p> : null}
            </nav>

            <div className="drawer-contact-footer">
              <button type="button" className="drawer-add-toggle" onClick={() => setIsAddFriendModalOpen(true)}>
                添加聯絡人
              </button>
            </div>
          </>
        )}
      </aside>

      {isAddFriendModalOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setIsAddFriendModalOpen(false)
          }}
        >
          <form className="add-contact-modal" onSubmit={submitFriend}>
            <div className="modal-header">
              <h3>添加聯絡人</h3>
              <button
                type="button"
                className="modal-close"
                aria-label="關閉新增聯絡人"
                onClick={() => setIsAddFriendModalOpen(false)}
              >
                ×
              </button>
            </div>
            <label>
              <span>送出好友邀請</span>
              <input
                value={friendName}
                type="text"
                maxLength="32"
                placeholder="輸入朋友名稱"
                autoComplete="off"
                onChange={(event) => setFriendName(event.target.value)}
              />
            </label>
            {error ? <p className="room-error">{error}</p> : null}
            <button type="submit" disabled={!friendName.trim()}>
              新增
            </button>
          </form>
        </div>
      ) : null}

      <div className="room-sidebar-header">
        <button type="button" className="menu-button" aria-label="開啟選單" onClick={openDrawer}>
          <span />
          <span />
          <span />
        </button>
        <div>
          <p className="eyebrow">Messages</p>
          <h2>聊天室</h2>
        </div>
      </div>

      <div className="sidebar-search">
        <input
          value={searchText}
          type="search"
          placeholder="搜尋聊天或使用者"
          autoComplete="off"
          onChange={(event) => setSearchText(event.target.value)}
        />
      </div>

      <nav className="room-list" aria-label="聊天與使用者清單">
        {visibleRooms.map((room) => (
          <button
            key={room.id}
            type="button"
            className={`room-item ${room.id === activeRoomId ? 'room-item-active' : ''}`}
            onClick={() => onSelect(room.id)}
          >
            <span className="room-avatar">{room.initials}</span>
            <span className="room-content">
              <span className="room-topline">
                <span className="room-name">{room.name}</span>
                {room.lastMessageAt ? <time className="room-time">{room.lastMessageAt}</time> : null}
              </span>
              <span className="room-bottomline">
                <span className="room-preview">{room.lastMessage || room.description}</span>
                {room.lastMessageIsSelf ? (
                  <span
                    className={`read-checks ${room.lastMessageReadAt ? 'read-checks-read' : ''}`}
                    aria-label={room.lastMessageReadAt ? '已讀' : '未讀'}
                    title={room.lastMessageReadAt ? '已讀' : '未讀'}
                  >
                    <span />
                    {room.lastMessageReadAt ? <span /> : null}
                  </span>
                ) : null}
                {!room.lastMessageIsSelf && room.unreadCount ? (
                  <span className="unread-badge">{room.unreadCount > 99 ? '99+' : room.unreadCount}</span>
                ) : null}
              </span>
            </span>
          </button>
        ))}
        {visibleUsers.map((user) => (
          <button
            key={user.user_id}
            type="button"
            className="room-item user-menu-item"
            onClick={() => onStartChat(user)}
          >
            <span className="room-avatar">{user.display_name.slice(0, 1).toUpperCase()}</span>
            <span className="room-content">
              <span className="room-topline">
                <span className="room-name">{user.display_name}</span>
              </span>
              <span className="room-bottomline">
                <span className="room-preview">可直接聊天</span>
              </span>
            </span>
          </button>
        ))}

        {!hasVisibleTargets ? <p className="empty-menu">沒有符合的聊天或使用者</p> : null}
      </nav>
    </aside>
  )
}
