import { KeyboardAvoidingView, Platform, SafeAreaView, StatusBar } from 'react-native'
import { LoadingScreen } from './src/components/LoadingScreen'
import { AccountScreen } from './src/screens/AccountScreen'
import { ChatScreen } from './src/screens/ChatScreen'
import { styles } from './src/styles/appStyles'
import { useChatViewModel } from './src/viewModels/useChatViewModel'

export default function App() {
  const {
    activeMessages,
    activeRoom,
    accountError,
    attachment,
    availableUsers,
    clearAttachment,
    connectionError,
    createOrLogin,
    createGroup,
    deleteFriend,
    dismissRoomError,
    friendRequests,
    isConnected,
    isLoadingChat,
    isPreparingAttachment,
    isRestoring,
    isSubmittingProfile,
    isStockBotPending,
    isWakingBackend,
    leaveGroup,
    logout,
    mobileView,
    openMessageAttachment,
    pickAttachment,
    profile,
    refreshRooms,
    respondToFriendRequest,
    roomError,
    rooms,
    selectRoom,
    sendMessage,
    showRooms,
    startChatWithUser,
    submitAddFriend,
    wakeAndReload,
  } = useChatViewModel()

  if (isRestoring) return <LoadingScreen />

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      {!profile ? (
        <AccountScreen
          error={accountError}
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
            attachment={attachment}
            availableUsers={availableUsers}
            clearAttachment={clearAttachment}
            connectionError={connectionError}
            currentUserId={profile.id}
            friendRequests={friendRequests}
            error={roomError}
            isConnected={isConnected}
            isLoadingChat={isLoadingChat}
            isPreparingAttachment={isPreparingAttachment}
            isStockBotPending={isStockBotPending}
            isWakingBackend={isWakingBackend}
            mobileView={mobileView}
            onAddFriend={submitAddFriend}
            onCreateGroup={createGroup}
            onDeleteFriend={deleteFriend}
            onDismissError={dismissRoomError}
            onLeaveGroup={leaveGroup}
            onLogout={logout}
            onOpenMessageAttachment={openMessageAttachment}
            onPickAttachment={pickAttachment}
            onRefreshRooms={refreshRooms}
            onRespondToFriendRequest={respondToFriendRequest}
            onShowRooms={showRooms}
            onSelectRoom={selectRoom}
            onSendMessage={sendMessage}
            onStartChatWithUser={startChatWithUser}
            onWakeBackend={wakeAndReload}
            profile={profile}
            rooms={rooms}
          />
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  )
}
