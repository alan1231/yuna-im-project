import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import LanguageSwitcher from '../LanguageSwitcher.jsx'
import AvatarSettings from './AvatarSettings.jsx'

const groupFormSchema = z.object({
  groupName: z.string().trim().min(1).max(32),
})

const formatPresence = (room, t, language) => {
  if (room.online) return t('chat.presence.online')
  if (!room.lastSeen) return t('chat.presence.offline')

  const lastSeen = new Date(room.lastSeen)
  if (Number.isNaN(lastSeen.getTime())) return t('chat.presence.offline')
  if (lastSeen.getFullYear() < 2000) return t('chat.presence.offline')

  const diffMinutes = Math.max(0, Math.floor((Date.now() - lastSeen.getTime()) / 60000))
  let lastSeenLabel
  if (diffMinutes < 1) lastSeenLabel = t('chat.presence.justNow')
  else if (diffMinutes < 60) lastSeenLabel = t('chat.presence.minutesAgo', { count: diffMinutes })
  else {
    const diffHours = Math.floor(diffMinutes / 60)
    if (diffHours < 24) lastSeenLabel = t('chat.presence.hoursAgo', { count: diffHours })
    else {
      const diffDays = Math.floor(diffHours / 24)
      lastSeenLabel = diffDays < 7
        ? t('chat.presence.daysAgo', { count: diffDays })
        : t('chat.presence.date', {
          date: lastSeen.toLocaleDateString(language, { month: 'long', day: 'numeric' }),
        })
    }
  }

  return t('chat.presence.offlineWithLastSeen', { time: lastSeenLabel })
}

const formatRoomPreview = (room, t) => {
  const preview = room.lastMessage || room.description
  if (preview === '已傳送檔案' || preview === 'Sent a file') return t('chat.sentAttachment')
  return preview
}

export default function RoomList({
  rooms,
  availableUsers,
  activeRoomId,
  error = '',
  currentUser,
  onSelect,
  onStartChat,
  onStartChatByDisplayName,
  onDeleteConversation,
  onCreateGroup,
  onRefreshContacts,
  onRefreshUsers,
  onLogout,
  onOpenEmulator,
  onAvatarChange,
}) {
  const { i18n, t } = useTranslation()
  const [selectedGroupMemberIds, setSelectedGroupMemberIds] = useState([])
  const [searchText, setSearchText] = useState('')
  const [contactSearchText, setContactSearchText] = useState('')
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isAddChatModalOpen, setIsAddChatModalOpen] = useState(false)
  const [isCreateGroupModalOpen, setIsCreateGroupModalOpen] = useState(false)
  const [drawerView, setDrawerView] = useState('menu')
  const [openChatMenuId, setOpenChatMenuId] = useState('')
  const [newChatSearch, setNewChatSearch] = useState('')
  const [isAvatarSettingsOpen, setIsAvatarSettingsOpen] = useState(false)
  const groupForm = useForm({
    resolver: zodResolver(groupFormSchema),
    defaultValues: {
      groupName: '',
    },
  })
  const groupName = groupForm.watch('groupName', '')
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

  const directRooms = useMemo(() => {
    return rooms.filter((room) => !room.isGroup)
  }, [rooms])

  const visibleDirectRooms = useMemo(() => {
    if (!normalizedContactSearch) return directRooms

    return directRooms.filter((room) => {
      return room.name.toLowerCase().includes(normalizedContactSearch)
    })
  }, [directRooms, normalizedContactSearch])

  const normalizedNewChatSearch = newChatSearch.trim().toLowerCase()
  const addableUsers = useMemo(() => {
    const directUserIds = new Set(rooms.filter((room) => !room.isGroup).map((room) => room.recipientId))
    return availableUsers
      .filter((user) => !directUserIds.has(user.user_id))
      .filter(
        (user) =>
          !normalizedNewChatSearch || user.display_name.toLowerCase().includes(normalizedNewChatSearch),
      )
  }, [availableUsers, rooms, normalizedNewChatSearch])

  const hasVisibleTargets = visibleRooms.length > 0 || visibleUsers.length > 0

  const openDrawer = () => {
    setDrawerView('menu')
    setIsMenuOpen(true)
  }

  const closeDrawer = () => {
    setIsMenuOpen(false)
    setOpenChatMenuId('')
  }

  const openContacts = () => {
    setDrawerView('contacts')
    onRefreshContacts()
  }

  const selectContact = (roomId) => {
    onSelect(roomId)
    setOpenChatMenuId('')
    closeDrawer()
  }

  const deleteConversation = (roomId) => {
    setOpenChatMenuId('')
    onDeleteConversation(roomId)
  }

  const handleStartChat = async (displayName) => {
    const success = await onStartChatByDisplayName(displayName)
    if (!success) return

    setIsAddChatModalOpen(false)
    setNewChatSearch('')
    closeDrawer()
  }

  const openNewChat = () => {
    onRefreshUsers?.()
    setIsAddChatModalOpen(true)
  }

  const openEmulator = () => {
    closeDrawer()
    onOpenEmulator?.()
  }

  const toggleGroupMember = (memberId) => {
    setSelectedGroupMemberIds((currentIds) =>
      currentIds.includes(memberId)
        ? currentIds.filter((id) => id !== memberId)
        : [...currentIds, memberId],
    )
  }

  const submitGroup = groupForm.handleSubmit(({ groupName: rawGroupName }) => {
    const name = rawGroupName.trim()
    if (!name || !selectedGroupMemberIds.length) return

    onCreateGroup({ name, memberIds: selectedGroupMemberIds })
    groupForm.reset()
    setSelectedGroupMemberIds([])
    setIsCreateGroupModalOpen(false)
    closeDrawer()
  })

  const visibleRecentRooms = visibleRooms.filter((room) => !room.isGroup)
  const visibleGroupRooms = visibleRooms.filter((room) => room.isGroup)

  const renderRoom = (room) => {
    const previewText = formatRoomPreview(room, t)

    return (
      <button
        key={room.id}
        type="button"
        className={`room-item ${room.id === activeRoomId ? 'room-item-active' : ''} ${!room.online && !room.isGroup ? 'room-item-offline' : ''}`}
        onClick={() => onSelect(room.id)}
      >
        <span className="room-avatar-wrap">
          {room.avatarUrl ? <img className="room-avatar room-avatar-image" src={room.avatarUrl} alt="" /> : <span className="room-avatar">{room.initials}</span>}
          {!room.isGroup ? <span className={`room-status-dot ${room.online ? 'room-status-dot-online' : 'room-status-dot-offline'}`} title={formatPresence(room, t, i18n.language)} aria-label={room.online ? t('chat.presence.online') : t('chat.presence.offline')} /> : null}
        </span>
        <span className="room-content">
          <span className="room-topline">
            <span className="room-name">{room.name}</span>
            {room.lastMessageAt ? <time className="room-time">{room.lastMessageAt}</time> : null}
          </span>
          <span className="room-bottomline">
            <span className="room-preview">{previewText}</span>
            {room.lastMessageIsSelf ? (
              <span
                className={`read-checks ${room.lastMessageReadAt ? 'read-checks-read' : ''}`}
                aria-label={room.lastMessageReadAt ? t('chat.read') : t('chat.unread')}
                title={room.lastMessageReadAt ? t('chat.read') : t('chat.unread')}
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
    )
  }

  return (
    <aside className="room-sidebar" aria-label={t('chat.roomListLabel')}>
      {isAvatarSettingsOpen ? (
        <AvatarSettings
          currentUser={currentUser}
          onClose={() => setIsAvatarSettingsOpen(false)}
          onSave={async (avatar) => {
            await onAvatarChange?.(avatar)
            setIsAvatarSettingsOpen(false)
          }}
        />
      ) : null}
      {isMenuOpen ? (
        <button type="button" className="drawer-backdrop" aria-label={t('chat.closeMenu')} onClick={closeDrawer} />
      ) : null}

      <aside className={`side-drawer ${isMenuOpen ? 'side-drawer-open' : ''}`} aria-label={t('chat.mainMenu')}>
        {drawerView === 'menu' ? (
          <>
            <div className="drawer-profile">
              <button type="button" className="drawer-avatar-button" onClick={() => setIsAvatarSettingsOpen(true)}>
                {currentUser.avatarUrl ? (
                  <img className="drawer-avatar-image" src={currentUser.avatarUrl} alt="" />
                ) : (
                  <span className="drawer-avatar">{currentUser.displayName.slice(0, 1).toUpperCase()}</span>
                )}
              </button>
              <div className="drawer-profile-text">
                <strong>{currentUser.displayName}</strong>
                <span>{t('chat.currentUser')}</span>
              </div>
              <button type="button" className="drawer-close" aria-label={t('chat.closeMenu')} onClick={closeDrawer}>
                ×
              </button>
            </div>

            <div className="drawer-menu">
              <button type="button" className="drawer-menu-item" onClick={openContacts}>
                <span className="drawer-menu-icon">◎</span>
                <span>{t('chat.contacts')}</span>
              </button>

              <button type="button" className="drawer-menu-item" onClick={() => setIsCreateGroupModalOpen(true)}>
                <span className="drawer-menu-icon">#</span>
                <span>{t('chat.createGroup')}</span>
              </button>

              <button type="button" className="drawer-menu-item" onClick={openEmulator}>
                <span className="drawer-menu-icon">▣</span>
                <span>{t('chat.emulatorOpen')}</span>
              </button>

              <button type="button" className="drawer-menu-item" onClick={onLogout}>
                <span className="drawer-menu-icon">↪</span>
                <span>{t('chat.logout')}</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="drawer-toolbar">
              <button
                type="button"
                className="drawer-back-button"
                aria-label={t('chat.backToMenu')}
                onClick={() => setDrawerView('menu')}
              >
                ‹
              </button>
              <h3>{t('chat.contacts')}</h3>
              <button type="button" className="drawer-close" aria-label={t('chat.closeMenu')} onClick={closeDrawer}>
                ×
              </button>
            </div>

            <div className="drawer-search">
              <input
                value={contactSearchText}
                type="search"
                placeholder={t('chat.contactSearch')}
                autoComplete="off"
                onChange={(event) => setContactSearchText(event.target.value)}
              />
            </div>

            <nav className="drawer-contact-list" aria-label={t('chat.contactsLabel')}>
              {visibleDirectRooms.map((room) => (
                <div key={room.id} className="drawer-contact-row">
                  <button type="button" className="drawer-contact-item" onClick={() => selectContact(room.id)}>
          {room.avatarUrl ? <img className="room-avatar room-avatar-image" src={room.avatarUrl} alt="" /> : <span className="room-avatar">{room.initials}</span>}
                    <span className="drawer-contact-content">
                      <span className="drawer-contact-topline">
                        <strong>{room.name}</strong>
                        {room.lastMessageAt ? <time>{room.lastMessageAt}</time> : null}
                      </span>
                      <span className="drawer-contact-bottomline">
                        <span className={`presence-text ${room.online ? 'presence-online' : ''}`}>
                          <i className={`presence-dot ${room.online ? 'presence-dot-online' : 'presence-dot-offline'}`} aria-hidden="true" />
                          {formatPresence(room, t, i18n.language)}
                        </span>
                        {room.lastMessageIsSelf ? (
                          <span
                            className={`read-checks ${room.lastMessageReadAt ? 'read-checks-read' : ''}`}
                            aria-label={room.lastMessageReadAt ? t('chat.read') : t('chat.unread')}
                            title={room.lastMessageReadAt ? t('chat.read') : t('chat.unread')}
                          >
                            <span />
                            {room.lastMessageReadAt ? <span /> : null}
                          </span>
                        ) : null}
                        {!room.lastMessageIsSelf && room.unreadCount ? (
                          <span className="unread-badge">
                            {room.unreadCount > 99 ? '99+' : room.unreadCount}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </button>
                  <div className="drawer-contact-actions">
                    <button
                      type="button"
                      className="drawer-contact-menu-button"
                      aria-label={t('chat.chatActionsLabel', { name: room.name })}
                      aria-expanded={openChatMenuId === room.id}
                      onClick={(event) => {
                        event.stopPropagation()
                        setOpenChatMenuId((currentId) => (currentId === room.id ? '' : room.id))
                      }}
                    >
                      ...
                    </button>
                    {openChatMenuId === room.id ? (
                      <div className="drawer-contact-menu">
                        <button type="button" onClick={() => selectContact(room.id)}>
                          {t('chat.startChat')}
                        </button>
                        <button type="button" className="danger-menu-item" onClick={() => deleteConversation(room.id)}>
                          {t('chat.deleteConversation')}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
              {!visibleDirectRooms.length ? <p className="drawer-empty">{t('chat.noChats')}</p> : null}
            </nav>

            <div className="drawer-contact-footer">
              <button
                type="button"
                className="drawer-add-toggle"
                onClick={openNewChat}
              >
                {t('chat.newChat')}
              </button>
            </div>
          </>
        )}
      </aside>

      {isAddChatModalOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setIsAddChatModalOpen(false)
          }}
        >
          <div className="add-contact-modal">
            <div className="modal-header">
              <h3>{t('chat.newChat')}</h3>
              <button
                type="button"
                className="modal-close"
                aria-label={t('chat.newChatClose')}
                onClick={() => setIsAddChatModalOpen(false)}
              >
                ×
              </button>
            </div>
            <input
              className="contact-search-input"
              type="search"
              value={newChatSearch}
              placeholder={t('chat.newChatPlaceholder')}
              autoComplete="off"
              onChange={(event) => setNewChatSearch(event.target.value)}
            />
            <nav className="add-contact-user-list" aria-label={t('chat.newChat')}>
              {addableUsers.length === 0 ? (
                <p className="drawer-empty">{t('chat.noUsersToAdd')}</p>
              ) : (
                addableUsers.map((user) => (
                  <button
                    type="button"
                    key={user.user_id}
                    className="add-contact-user-row"
                    onClick={() => handleStartChat(user.display_name)}
                  >
                    {user.avatar_url ? <img className="room-avatar room-avatar-image" src={user.avatar_url} alt="" /> : <span className="room-avatar">{user.display_name.slice(0, 1).toUpperCase()}</span>}
                    <span className="add-contact-user-name">{user.display_name}</span>
                    {user.online ? <span className="presence-online-dot" aria-label={t('chat.presence.online')} /> : null}
                  </button>
                ))
              )}
            </nav>
            {error ? <p className="room-error">{error}</p> : null}
          </div>
        </div>
      ) : null}

      {isCreateGroupModalOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setIsCreateGroupModalOpen(false)
          }}
        >
          <form className="add-contact-modal group-modal" onSubmit={submitGroup}>
            <div className="modal-header">
              <h3>{t('chat.createGroup')}</h3>
              <button
                type="button"
                className="modal-close"
                aria-label={t('chat.createGroupClose')}
                onClick={() => setIsCreateGroupModalOpen(false)}
              >
                ×
              </button>
            </div>
            <label>
              <span>{t('chat.groupName')}</span>
              <input
                {...groupForm.register('groupName')}
                type="text"
                maxLength="32"
                placeholder={t('chat.groupNamePlaceholder')}
                autoComplete="off"
              />
            </label>
            {groupForm.formState.errors.groupName ? (
              <p className="room-error">{t('chat.errors.groupNameRequired')}</p>
            ) : null}

            <div className="group-member-picker" aria-label={t('chat.groupMembers')}>
              {availableUsers.map((user) => {
                const isSelected = selectedGroupMemberIds.includes(user.user_id)

                return (
                  <label
                    key={user.user_id}
                    className={`group-member-option ${isSelected ? 'group-member-selected' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleGroupMember(user.user_id)}
                    />
                    {user.avatar_url ? <img className="room-avatar room-avatar-image" src={user.avatar_url} alt="" /> : <span className="room-avatar">{user.display_name.slice(0, 1).toUpperCase()}</span>}
                    <span className="group-member-content">
                      <strong>{user.display_name}</strong>
                      <span>{formatPresence({ online: user.online, lastSeen: user.last_seen }, t, i18n.language)}</span>
                    </span>
                    <span className="group-member-check" aria-hidden="true">
                      {isSelected ? '✓' : '+'}
                    </span>
                  </label>
                )
              })}
              {!availableUsers.length ? <p className="drawer-empty">{t('chat.noUsersToAdd')}</p> : null}
            </div>

            {error ? <p className="room-error">{error}</p> : null}
            <button type="submit" disabled={!groupName.trim() || !selectedGroupMemberIds.length}>
              {t('chat.createGroupSubmit')}
            </button>
          </form>
        </div>
      ) : null}

      <div className="room-sidebar-header">
        <button type="button" className="menu-button" aria-label={t('chat.openMenu')} onClick={openDrawer}>
          <span />
          <span />
          <span />
        </button>
        <div>
          <p className="eyebrow">Messages</p>
          <h2>{t('chat.roomsTitle')}</h2>
        </div>
        <LanguageSwitcher />
      </div>

      <div className="sidebar-search">
        <input
          value={searchText}
          type="search"
          placeholder={t('chat.sidebarSearchPlaceholder')}
          autoComplete="off"
          onChange={(event) => setSearchText(event.target.value)}
        />
      </div>

      <nav className="room-list" aria-label={t('chat.roomTargetsLabel')}>
        {visibleRecentRooms.length ? <li className="room-section-title">{t('chat.recentChats')}</li> : null}
        {visibleRecentRooms.map(renderRoom)}
        {visibleGroupRooms.length ? <li className="room-section-title">{t('chat.groups')}</li> : null}
        {visibleGroupRooms.map(renderRoom)}
        {visibleUsers.map((user) => (
          <button
            key={user.user_id}
            type="button"
            className="room-item user-menu-item"
            onClick={() => onStartChat(user)}
          >
            {user.avatar_url ? <img className="room-avatar room-avatar-image" src={user.avatar_url} alt="" /> : <span className="room-avatar">{user.display_name.slice(0, 1).toUpperCase()}</span>}
            <span className="room-content">
              <span className="room-topline">
                <span className="room-name">{user.display_name}</span>
              </span>
              <span className="room-bottomline">
                <span className="room-preview">{t('chat.directChat')}</span>
              </span>
            </span>
          </button>
        ))}

        {!hasVisibleTargets ? (
          rooms.length === 0 && !normalizedSearch ? (
            <div className="empty-chat-card">
              <strong>{t('chat.startChatEmptyTitle')}</strong>
              <span>{t('chat.startChatEmptyDescription')}</span>
              <button type="button" onClick={openNewChat}>{t('chat.startChat')}</button>
            </div>
          ) : (
            <p className="empty-menu">{t('chat.noTargets')}</p>
          )
        ) : null}
      </nav>
    </aside>
  )
}
