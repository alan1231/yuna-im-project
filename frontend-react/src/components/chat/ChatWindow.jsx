import { useEffect, useState } from 'react'
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
    selectRoom,
    startChatWithUser,
    addFriend,
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
        onRefreshFriends={refreshFriends}
        onLogout={onLogout}
      />

      <section className="chat-panel">
        <ChatHeader isConnected={isConnected} room={activeRoom} onBack={() => setMobileView('rooms')} />

        {connectionError ? <p className="connection-error">{connectionError}</p> : null}

        <MessageList messages={messages} activeRoom={activeRoom} onQuickStockQuery={sendMessage} />

        <ChatComposer
          value={userInput}
          onChange={setUserInput}
          fileAttachment={fileAttachment}
          allowAttachments={activeRoom.id !== 'stock_bot'}
          canSend={canSend}
          placeholder={
            activeRoom.id === 'stock_bot'
              ? t('chat.stockPlaceholder')
              : t('chat.messagePlaceholder', { name: activeRoom.name })
          }
          submitLabel={activeRoom.id === 'stock_bot' ? t('chat.analyze') : t('chat.send')}
          onAttachFile={attachFile}
          onClearFile={clearFileAttachment}
          onSend={sendMessage}
        />
      </section>
    </main>
  )
}
