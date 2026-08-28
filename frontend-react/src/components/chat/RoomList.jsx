import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import LanguageSwitcher from '../LanguageSwitcher.jsx'

const groupFormSchema = z.object({
  groupName: z.string().trim().min(1).max(32),
})

const formatPresence = (room, t, language) => {
  if (room.online) return t('chat.presence.online')
  if (!room.lastSeen) return t('chat.presence.unknown')

  const lastSeen = new Date(room.lastSeen)
  if (Number.isNaN(lastSeen.getTime())) return t('chat.presence.unknown')
  if (lastSeen.getFullYear() < 2000) return t('chat.presence.unknown')

  const diffMinutes = Math.max(0, Math.floor((Date.now() - lastSeen.getTime()) / 60000))
  if (diffMinutes < 1) return t('chat.presence.justNow')
  if (diffMinutes < 60) return t('chat.presence.minutesAgo', { count: diffMinutes })

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return t('chat.presence.hoursAgo', { count: diffHours })

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return t('chat.presence.daysAgo', { count: diffDays })

  return t('chat.presence.date', {
    date: lastSeen.toLocaleDateString(language, { month: 'long', day: 'numeric' }),
  })
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
  onAddFriend,
  onDeleteFriend,
  onCreateGroup,
  onRefreshFriends,
  onRefreshUsers,
  onLogout,
}) {
  const { i18n, t } = useTranslation()
  const [selectedGroupMemberIds, setSelectedGroupMemberIds] = useState([])
  const [searchText, setSearchText] = useState('')
  const [contactSearchText, setContactSearchText] = useState('')
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isAddFriendModalOpen, setIsAddFriendModalOpen] = useState(false)
  const [isCreateGroupModalOpen, setIsCreateGroupModalOpen] = useState(false)
  const [drawerView, setDrawerView] = useState('menu')
  const [openFriendMenuId, setOpenFriendMenuId] = useState('')
  const [addFriendSearch, setAddFriendSearch] = useState('')
  const [friendInviteToast, setFriendInviteToast] = useState('')
  const groupForm = useForm({
    resolver: zodResolver(groupFormSchema),
    defaultValues: {
      groupName: '',
    },
  })
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
    return rooms.filter((room) => room.isFriend && !room.isGroup)
  }, [rooms])

  const visibleFriendRooms = useMemo(() => {
    if (!normalizedContactSearch) return friendRooms

    return friendRooms.filter((room) => {
      return room.name.toLowerCase().includes(normalizedContactSearch)
    })
  }, [friendRooms, normalizedContactSearch])

  const normalizedAddFriendSearch = addFriendSearch.trim().toLowerCase()
  const addableUsers = useMemo(() => {
    const friendUserIds = new Set(
      rooms.filter((room) => room.isFriend && !room.isGroup).map((room) => room.recipientId),
    )
    return availableUsers
      .filter((user) => !friendUserIds.has(user.user_id))
      .filter(
        (user) =>
          !normalizedAddFriendSearch || user.display_name.toLowerCase().includes(normalizedAddFriendSearch),
      )
  }, [availableUsers, rooms, normalizedAddFriendSearch])

  const hasVisibleTargets = visibleRooms.length > 0 || visibleUsers.length > 0

  const openDrawer = () => {
    setDrawerView('menu')
    setIsMenuOpen(true)
  }

  const closeDrawer = () => {
    setIsMenuOpen(false)
    setOpenFriendMenuId('')
  }

  const openContacts = () => {
    setDrawerView('contacts')
    onRefreshFriends()
  }

  const selectContact = (roomId) => {
    onSelect(roomId)
    setOpenFriendMenuId('')
    closeDrawer()
  }

  const deleteContact = (roomId) => {
    setOpenFriendMenuId('')
    onDeleteFriend(roomId)
  }

  const handleAddFriend = async (displayName) => {
    const success = await onAddFriend(displayName)
    if (!success) return

    setIsAddFriendModalOpen(false)
    setFriendInviteToast(t('chat.errors.friendInviteSent'))
    window.setTimeout(() => setFriendInviteToast(''), 3200)
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

  return (
    <aside className="room-sidebar" aria-label={t('chat.roomListLabel')}>
      {isMenuOpen ? (
        <button type="button" className="drawer-backdrop" aria-label={t('chat.closeMenu')} onClick={closeDrawer} />
      ) : null}

      <aside className={`side-drawer ${isMenuOpen ? 'side-drawer-open' : ''}`} aria-label={t('chat.mainMenu')}>
        {drawerView === 'menu' ? (
          <>
            <div className="drawer-profile">
              <span className="drawer-avatar">{currentUser.displayName.slice(0, 1).toUpperCase()}</span>
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
              {visibleFriendRooms.map((friend) => (
                <div key={friend.id} className="drawer-contact-row">
                  <button type="button" className="drawer-contact-item" onClick={() => selectContact(friend.id)}>
                    <span className="room-avatar">{friend.initials}</span>
                    <span className="drawer-contact-content">
                      <span className="drawer-contact-topline">
                        <strong>{friend.name}</strong>
                        {friend.lastMessageAt ? <time>{friend.lastMessageAt}</time> : null}
                      </span>
                      <span className="drawer-contact-bottomline">
                        <span className={`presence-text ${friend.online ? 'presence-online' : ''}`}>
                          {formatPresence(friend, t, i18n.language)}
                        </span>
                        {friend.lastMessageIsSelf ? (
                          <span
                            className={`read-checks ${friend.lastMessageReadAt ? 'read-checks-read' : ''}`}
                            aria-label={friend.lastMessageReadAt ? t('chat.read') : t('chat.unread')}
                            title={friend.lastMessageReadAt ? t('chat.read') : t('chat.unread')}
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
                  <div className="drawer-contact-actions">
                    <button
                      type="button"
                      className="drawer-contact-menu-button"
                      aria-label={t('chat.friendActionsLabel', { name: friend.name })}
                      aria-expanded={openFriendMenuId === friend.id}
                      onClick={(event) => {
                        event.stopPropagation()
                        setOpenFriendMenuId((currentId) => (currentId === friend.id ? '' : friend.id))
                      }}
                    >
                      ...
                    </button>
                    {openFriendMenuId === friend.id ? (
                      <div className="drawer-contact-menu">
                        <button type="button" onClick={() => selectContact(friend.id)}>
                          {t('chat.startChat')}
                        </button>
                        <button type="button" className="danger-menu-item" onClick={() => deleteContact(friend.id)}>
                          {t('chat.deleteFriend')}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
              {!visibleFriendRooms.length ? <p className="drawer-empty">{t('chat.noFriends')}</p> : null}
            </nav>

            <div className="drawer-contact-footer">
              <button
                type="button"
                className="drawer-add-toggle"
                onClick={() => {
                  onRefreshUsers?.()
                  setIsAddFriendModalOpen(true)
                }}
              >
                {t('chat.addContact')}
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
          <div className="add-contact-modal">
            <div className="modal-header">
              <h3>{t('chat.addContact')}</h3>
              <button
                type="button"
                className="modal-close"
                aria-label={t('chat.addContactClose')}
                onClick={() => setIsAddFriendModalOpen(false)}
              >
                ×
              </button>
            </div>
            <input
              className="contact-search-input"
              type="search"
              value={addFriendSearch}
              placeholder={t('chat.addFriendPlaceholder')}
              autoComplete="off"
              onChange={(event) => setAddFriendSearch(event.target.value)}
            />
            <nav className="add-contact-user-list" aria-label={t('chat.addContact')}>
              {addableUsers.length === 0 ? (
                <p className="drawer-empty">{t('chat.noUsersToAdd')}</p>
              ) : (
                addableUsers.map((user) => (
                  <button
                    type="button"
                    key={user.user_id}
                    className="add-contact-user-row"
                    onClick={() => handleAddFriend(user.display_name)}
                  >
                    <span className="room-avatar">{user.display_name.slice(0, 1).toUpperCase()}</span>
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

      {friendInviteToast ? <div className="friend-invite-toast" role="status">{friendInviteToast}</div> : null}

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
              {friendRooms.map((friend) => {
                const isSelected = selectedGroupMemberIds.includes(friend.recipientId)

                return (
                  <label
                    key={friend.id}
                    className={`group-member-option ${isSelected ? 'group-member-selected' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleGroupMember(friend.recipientId)}
                    />
                    <span className="room-avatar">{friend.initials}</span>
                    <span className="group-member-content">
                      <strong>{friend.name}</strong>
                      <span>{formatPresence(friend, t, i18n.language)}</span>
                    </span>
                    <span className="group-member-check" aria-hidden="true">
                      {isSelected ? '✓' : '+'}
                    </span>
                  </label>
                )
              })}
              {!friendRooms.length ? <p className="drawer-empty">{t('chat.noFriends')}</p> : null}
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
        {visibleRooms.map((room) => {
          const previewText = formatRoomPreview(room, t)

          return (
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
        })}
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
                <span className="room-preview">{t('chat.directChat')}</span>
              </span>
            </span>
          </button>
        ))}

        {!hasVisibleTargets ? <p className="empty-menu">{t('chat.noTargets')}</p> : null}
      </nav>
    </aside>
  )
}
