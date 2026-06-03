import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useChatViewModel } from '../../hooks/useChatViewModel'
import ChatComposer from './ChatComposer.jsx'
import ChatHeader from './ChatHeader.jsx'
import MessageList from './MessageList.jsx'
import RoomList from './RoomList.jsx'

export default function ChatWindow({ currentUser, onLogout }) {
  const { t } = useTranslation()
  const [mobileView, setMobileView] = useState('rooms')
  const [wasMobile, setWasMobile] = useState(() => window.matchMedia('(max-width: 768px)').matches)
  const {
    rooms,
    availableUsers,
    activeRoom,
    activeRoomId,
    messages,
    userInput,
    setUserInput,
    fileAttachment,
    isConnected,
    connectionError,
    roomError,
    canSend,
    isStockBotPending,
    selectRoom,
    startChatWithUser,
    addFriend,
    createGroup,
    leaveGroup,
    attachFile,
    clearFileAttachment,
    refreshFriends,
    sendMessage,
  } = useChatViewModel(currentUser)

  const openRoom = (roomId) => {
    selectRoom(roomId)
    setMobileView('chat')
  }

  const openUserChat = (user) => {
    startChatWithUser(user)
    setMobileView('chat')
  }

  const activeRoomMemberNames = useMemo(() => {
    if (!activeRoom?.isGroup) return []

    const namesById = new Map([[currentUser.id, currentUser.displayName]])
    availableUsers.forEach((user) => {
      namesById.set(user.user_id, user.display_name)
    })

    return (activeRoom.memberIds || []).map((memberId) => namesById.get(memberId) || memberId)
  }, [activeRoom, availableUsers, currentUser.displayName, currentUser.id])

  useEffect(() => {
    const syncMobileView = () => {
      const isMobile = window.matchMedia('(max-width: 768px)').matches
      if (isMobile && !wasMobile) {
        setMobileView('chat')
      }
      setWasMobile(isMobile)
    }

    window.addEventListener('resize', syncMobileView)
    return () => {
      window.removeEventListener('resize', syncMobileView)
    }
  }, [wasMobile])

  return (
    <main
      className={`chat-shell ${
        mobileView === 'rooms' ? 'chat-shell-mobile-list' : 'chat-shell-mobile-chat'
      }`}
    >
      <RoomList
        rooms={rooms}
        availableUsers={availableUsers}
        activeRoomId={activeRoomId}
        error={roomError}
        currentUser={currentUser}
        onSelect={openRoom}
        onStartChat={openUserChat}
        onAddFriend={addFriend}
        onCreateGroup={createGroup}
        onRefreshFriends={refreshFriends}
        onLogout={onLogout}
      />

      <section className="chat-panel">
        <ChatHeader
          isConnected={isConnected}
          room={activeRoom}
          memberNames={activeRoomMemberNames}
          onBack={() => setMobileView('rooms')}
          onLeaveGroup={() => leaveGroup(activeRoom.id)}
        />

        {connectionError ? <p className="connection-error">{connectionError}</p> : null}

        <MessageList
          messages={messages}
          activeRoom={activeRoom}
          isStockBotPending={isStockBotPending}
          onQuickStockQuery={sendMessage}
        />

        <ChatComposer
          value={userInput}
          onChange={setUserInput}
          fileAttachment={fileAttachment}
          allowAttachments={activeRoom.id !== 'stock_bot'}
          variant={activeRoom.id === 'stock_bot' ? 'stock' : 'chat'}
          canSend={canSend}
          placeholder={
            activeRoom.id === 'stock_bot'
              ? t('chat.stockPlaceholder')
              : t('chat.messagePlaceholder', { name: activeRoom.name })
          }
          submitLabel={activeRoom.id === 'stock_bot' ? t('chat.query') : t('chat.send')}
          onAttachFile={attachFile}
          onClearFile={clearFileAttachment}
          onSend={sendMessage}
        />
      </section>
    </main>
  )
}
