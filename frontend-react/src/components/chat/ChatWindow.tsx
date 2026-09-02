import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useChatViewModel } from '../../hooks/useChatViewModel'
import { updateAvatar } from '../../api/chatApi'
import ChatComposer from './ChatComposer.jsx'
import ChatHeader from './ChatHeader'
import MessageList from './MessageList.jsx'
import RoomList from './RoomList.jsx'
import VoiceCallBar from './VoiceCallBar.jsx'
import VideoCallBar from './VideoCallBar.jsx'
import BlackjackPanel from './BlackjackPanel.jsx'
import EmulatorPanel from './EmulatorPanel.jsx'
import { useChatUiStore } from '../../stores/chatUiStore'
import { useAuthStore } from '../../stores/authStore'
import type { ApiUser, ChatRoom, CurrentUser } from '../../types/chat'

type ChatWindowProps = {
  currentUser: CurrentUser
  onLogout: () => void
}

type AvatarChange = {
  avatarUrl: string
  avatarStyle?: string
  avatarSeed?: string
  avatarBackground?: string
}

export default function ChatWindow({ currentUser, onLogout }: ChatWindowProps) {
  const { t } = useTranslation()
  const mobileView = useChatUiStore((state) => state.mobileView)
  const setMobileView = useChatUiStore((state) => state.setMobileView)
  const setCurrentUser = useAuthStore((state) => state.setCurrentUser)
  const [wasMobile, setWasMobile] = useState(() => window.matchMedia('(max-width: 768px)').matches)
  const {
    rooms,
    availableUsers,
    activeRoom,
    activeRoomId,
    messages,
    game,
    pendingGameAction,
    userInput,
    setUserInput,
    fileAttachment,
    isConnected,
    connectionError,
    isWakingBackend,
    roomError,
    canSend,
    voiceCall,
    videoCall,
    setVoiceRemoteElement,
    setVideoRemoteElement,
    setVideoLocalElement,
    selectRoom,
    startChatWithUser,
    startChatByDisplayName,
    deleteConversation,
    createGroup,
    leaveGroup,
    attachFile,
    clearFileAttachment,
    refreshFriends,
    refreshUsers,
    wakeBackend,
    sendMessage,
    sendGameInvite,
    respondToGameInvite,
    sendGameAction,
    closeGamePanel,
    startVoiceCall,
    acceptVoiceCall,
    rejectVoiceCall,
    endVoiceCall,
    toggleVoiceMute,
    startVideoCall,
    acceptVideoCall,
    rejectVideoCall,
    endVideoCall,
    toggleVideoMute,
    toggleVideoCamera,
  } = useChatViewModel(currentUser)
  const typedActiveRoom = activeRoom as ChatRoom | undefined
  const [showEmulator, setShowEmulator] = useState(false)

  const openRoom = (roomId: string) => {
    selectRoom(roomId)
    setMobileView('chat')
  }

  const openUserChat = (user: ApiUser) => {
    startChatWithUser(user)
    setMobileView('chat')
  }

  const activeRoomMemberNames = useMemo(() => {
    if (!typedActiveRoom?.isGroup) return []

    const namesById = new Map([[currentUser.id, currentUser.displayName]])
    availableUsers.forEach((user: ApiUser) => {
      namesById.set(user.user_id, user.display_name)
    })

    return (typedActiveRoom.memberIds || []).map((memberId: string) => namesById.get(memberId) || memberId)
  }, [typedActiveRoom, availableUsers, currentUser.displayName, currentUser.id])

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
        onAvatarChange={async (avatar: AvatarChange) => {
          const user = await updateAvatar(avatar.avatarUrl)
          setCurrentUser({
            ...currentUser,
            avatarUrl: user.avatar_url || avatar.avatarUrl,
            avatarStyle: avatar.avatarStyle,
            avatarSeed: avatar.avatarSeed,
            avatarBackground: avatar.avatarBackground,
          })
        }}
        onSelect={openRoom}
        onStartChat={openUserChat}
        onStartChatByDisplayName={startChatByDisplayName}
        onDeleteConversation={deleteConversation}
        onCreateGroup={createGroup}
        onRefreshContacts={refreshUsers}
        onRefreshUsers={refreshUsers}
        onLogout={onLogout}
        onOpenEmulator={() => setShowEmulator(true)}
      />

      <VoiceCallBar
        voiceCall={voiceCall}
        onAccept={acceptVoiceCall}
        onReject={rejectVoiceCall}
        onEnd={endVoiceCall}
        onToggleMute={toggleVoiceMute}
        remoteAudioRef={setVoiceRemoteElement}
      />

      <VideoCallBar
        videoCall={videoCall}
        onAccept={acceptVideoCall}
        onReject={rejectVideoCall}
        onEnd={endVideoCall}
        onToggleMute={toggleVideoMute}
        onToggleCamera={toggleVideoCamera}
        remoteVideoRef={setVideoRemoteElement}
        localVideoRef={setVideoLocalElement}
      />

      {typedActiveRoom ? (
        <section className="chat-panel">
          <ChatHeader
            isConnected={isConnected}
            room={typedActiveRoom}
            memberNames={activeRoomMemberNames}
            canStartVoiceCall={!typedActiveRoom.isGroup && voiceCall.status === 'idle' && videoCall.status === 'idle'}
            canStartVideoCall={!typedActiveRoom.isGroup && voiceCall.status === 'idle' && videoCall.status === 'idle'}
            onBack={() => setMobileView('rooms')}
            onLeaveGroup={() => leaveGroup(typedActiveRoom.id)}
            onStartVoiceCall={startVoiceCall}
            onStartVideoCall={startVideoCall}
          />

          {connectionError ? (
            <div className="connection-error">
              <span>{connectionError}</span>
              <button type="button" onClick={wakeBackend} disabled={isWakingBackend}>
                {isWakingBackend ? t('chat.wakingBackend') : t('chat.wakeBackend')}
              </button>
            </div>
          ) : null}

          <MessageList
            messages={messages}
            activeRoom={typedActiveRoom}
            onGameResponse={respondToGameInvite}
          />

          <BlackjackPanel game={game} currentUserId={currentUser.id} opponentOnline={typedActiveRoom.online} pendingAction={pendingGameAction} onAction={sendGameAction} onClose={() => closeGamePanel(typedActiveRoom.conversationId)} />

          <ChatComposer
            value={userInput}
            onChange={setUserInput}
            fileAttachment={fileAttachment}
            allowAttachments
            allowGames={!typedActiveRoom.isGroup}
            canSend={canSend}
            placeholder={t('chat.messagePlaceholder', { name: typedActiveRoom.name })}
            submitLabel={t('chat.send')}
            onAttachFile={attachFile}
            onClearFile={clearFileAttachment}
            onSend={sendMessage}
            onGameInvite={sendGameInvite}
          />
        </section>
      ) : null}
      {showEmulator ? <EmulatorPanel onClose={() => setShowEmulator(false)} /> : null}
    </main>
  )
}
