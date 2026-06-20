import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

type AccountMode = 'login' | 'create';

type ApiUser = {
  user_id: string;
  display_name: string;
};

type CurrentUser = {
  id: string;
  displayName: string;
};

type ConversationRecord = {
  conversation_id: string;
  recipient_id: string;
  display_name: string;
  is_friend?: boolean;
  is_group?: boolean;
  last_message?: string;
  last_message_at?: string;
  unread_count?: number;
};

type ChatMessage = {
  sender?: string;
  sender_id: string;
  recipient_id?: string;
  conversation_id: string;
  text?: string;
  attachment_url?: string;
  attachment_name?: string;
  attachment_type?: string;
  attachment_size?: number;
  time?: string;
  read_at?: string | null;
};

const API_URL = 'https://yuna-im-project.onrender.com';
const WS_URL = 'wss://yuna-im-project.onrender.com/ws';
const CURRENT_USER_STORAGE_KEY = 'yuna-im-current-user';

const createLocalUserId = () => {
  const randomPart = Math.random().toString(36).slice(2);
  return `user-${Date.now()}-${randomPart}`;
};

const requestJson = async <T,>(
  input: string,
  init?: RequestInit,
): Promise<T> => {
  const response = await fetch(input, init);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
};

const fetchUsers = () => requestJson<ApiUser[]>(`${API_URL}/users`);

const fetchConversations = (userId: string) =>
  requestJson<ConversationRecord[]>(
    `${API_URL}/conversations?user_id=${encodeURIComponent(userId)}`,
  );

const fetchMessages = (userId: string, conversationId: string) => {
  const url = new URL(`${API_URL}/messages`);
  url.searchParams.set('user_id', userId);
  url.searchParams.set('conversation_id', conversationId);
  return requestJson<ChatMessage[]>(url.toString());
};

const getMessageKey = (message: ChatMessage) =>
  [
    message.sender_id,
    message.recipient_id ?? '',
    message.conversation_id,
    message.time ?? '',
    message.text ?? '',
    message.attachment_name ?? '',
    message.attachment_size ?? 0,
  ].join('|');

const wakeBackend = () =>
  requestJson<{ status: string; time: string }>(`${API_URL}/health`);

const createUser = (displayName: string) =>
  requestJson<ApiUser>(`${API_URL}/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      user_id: createLocalUserId(),
      display_name: displayName,
    }),
  });

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isRestoringUser, setIsRestoringUser] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const restoreUser = async () => {
      try {
        const rawUser = await AsyncStorage.getItem(CURRENT_USER_STORAGE_KEY);
        if (!rawUser) return;

        const storedUser = JSON.parse(rawUser) as CurrentUser;
        if (storedUser.id && storedUser.displayName && isMounted) {
          setCurrentUser(storedUser);
        }
      } catch (restoreError) {
        console.error('User restore failed:', restoreError);
        await AsyncStorage.removeItem(CURRENT_USER_STORAGE_KEY);
      } finally {
        if (isMounted) {
          setIsRestoringUser(false);
        }
      }
    };

    restoreUser();

    return () => {
      isMounted = false;
    };
  }, []);

  const persistCurrentUser = async (user: CurrentUser) => {
    await AsyncStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(user));
    setCurrentUser(user);
  };

  const logout = async () => {
    await AsyncStorage.removeItem(CURRENT_USER_STORAGE_KEY);
    setCurrentUser(null);
  };

  if (isRestoringUser) {
    return (
      <SafeAreaProvider>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.listState}>
            <ActivityIndicator color="#0f766e" />
            <Text style={styles.listStateText}>恢復登入狀態...</Text>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      {currentUser ? (
        <ChatListScreen user={currentUser} onLogout={logout} />
      ) : (
        <AccountScreen onAuthenticated={persistCurrentUser} />
      )}
    </SafeAreaProvider>
  );
}

function AccountScreen({
  onAuthenticated,
}: {
  onAuthenticated: (user: CurrentUser) => Promise<void>;
}) {
  const [mode, setMode] = useState<AccountMode>('login');
  const [displayName, setDisplayName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showWakeHint, setShowWakeHint] = useState(false);
  const [error, setError] = useState('');
  const normalizedName = displayName.trim();
  const canSubmit = normalizedName.length > 0 && !isSubmitting;

  const copy =
    mode === 'login'
      ? {
          title: '登入帳號',
          body: '輸入既有顯示名稱，回到你的聊天與行情小幫手。',
          submit: '登入',
        }
      : {
          title: '建立帳號',
          body: '建立顯示名稱，開始使用 Yuna IM。',
          submit: '建立帳號',
        };

  const switchMode = (nextMode: AccountMode) => {
    setMode(nextMode);
    setError('');
    setShowWakeHint(false);
  };

  const persistUser = async (user: ApiUser) => {
    await onAuthenticated({
      id: user.user_id,
      displayName: user.display_name,
    });
  };

  const runWithBackendWake = async (action: () => Promise<void>) => {
    setIsSubmitting(true);
    setShowWakeHint(false);
    setError('');

    const wakeHintTimer = setTimeout(() => {
      setShowWakeHint(true);
    }, 1200);

    try {
      await wakeBackend();
      await action();
    } finally {
      clearTimeout(wakeHintTimer);
      setShowWakeHint(false);
      setIsSubmitting(false);
    }
  };

  const submit = async () => {
    if (!canSubmit) return;

    try {
      await runWithBackendWake(async () => {
        if (mode === 'create') {
          const user = await createUser(normalizedName);
          await persistUser(user);
          return;
        }

        const users = await fetchUsers();
        const user = users.find(
          item =>
            item.display_name.toLowerCase() === normalizedName.toLowerCase(),
        );

        if (!user) {
          setError('找不到這個帳號，請確認名稱是否正確。');
          return;
        }

        await persistUser(user);
      });
    } catch (requestError) {
      if (
        mode === 'create' &&
        requestError instanceof Error &&
        requestError.message.includes('409')
      ) {
        setError('這個顯示名稱已經被使用。');
        return;
      }

      setError(
        mode === 'login'
          ? '登入失敗，請確認雲端服務可連線。'
          : '建立帳號失敗，請確認雲端服務可連線。',
      );
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brandMark}>
            <Text style={styles.brandInitial}>Y</Text>
          </View>

          <View style={styles.header}>
            <Text style={styles.eyebrow}>YUNA IM</Text>
            <Text style={styles.title}>{copy.title}</Text>
            <Text style={styles.subtitle}>{copy.body}</Text>
          </View>

          <View style={styles.modeSwitch} accessibilityRole="tablist">
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === 'login' }}
              onPress={() => switchMode('login')}
              style={[
                styles.modeButton,
                mode === 'login' ? styles.modeButtonActive : null,
              ]}
            >
              <Text
                style={[
                  styles.modeButtonText,
                  mode === 'login' ? styles.modeButtonTextActive : null,
                ]}
              >
                登入
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === 'create' }}
              onPress={() => switchMode('create')}
              style={[
                styles.modeButton,
                mode === 'create' ? styles.modeButtonActive : null,
              ]}
            >
              <Text
                style={[
                  styles.modeButtonText,
                  mode === 'create' ? styles.modeButtonTextActive : null,
                ]}
              >
                註冊
              </Text>
            </Pressable>
          </View>

          <View style={styles.form}>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>顯示名稱</Text>
              <TextInput
                autoCapitalize="none"
                autoComplete="nickname"
                maxLength={32}
                onChangeText={setDisplayName}
                onSubmitEditing={submit}
                placeholder="輸入你的顯示名稱"
                placeholderTextColor="#9ca3af"
                returnKeyType="done"
                style={styles.input}
                value={displayName}
              />
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {!error && showWakeHint ? (
              <Text style={styles.infoText}>後端正在喚醒，請稍候。</Text>
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={!canSubmit}
              onPress={submit}
              style={({ pressed }) => [
                styles.submitButton,
                !canSubmit ? styles.submitButtonDisabled : null,
                pressed && canSubmit ? styles.submitButtonPressed : null,
              ]}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.submitButtonText}>{copy.submit}</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ChatListScreen({
  user,
  onLogout,
}: {
  user: CurrentUser;
  onLogout: () => void;
}) {
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [searchText, setSearchText] = useState('');
  const [activeConversation, setActiveConversation] =
    useState<ConversationRecord | null>(null);
  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredConversations = normalizedSearch
    ? conversations.filter(conversation =>
        [
          conversation.display_name,
          conversation.last_message ?? '',
          conversation.is_group ? '群組' : '',
          conversation.is_friend ? '好友' : '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch),
      )
    : conversations;

  const loadConversations = useCallback(
    async (refreshing = false) => {
      if (refreshing) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError('');

      try {
        await wakeBackend();
        const nextConversations = await fetchConversations(user.id);
        setConversations(nextConversations);
      } catch (loadError) {
        console.error('Conversation load failed:', loadError);
        setError('聊天室列表載入失敗，請稍後再試。');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [user.id],
  );

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  if (activeConversation) {
    return (
      <MessageThreadScreen
        conversation={activeConversation}
        user={user}
        onBack={() => {
          setActiveConversation(null);
          loadConversations(true);
        }}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.chatListHeader}>
        <View>
          <Text style={styles.chatListEyebrow}>YUNA IM</Text>
          <Text style={styles.chatListTitle}>聊天室</Text>
          <Text style={styles.chatListSubtitle}>{user.displayName}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onLogout}
          style={styles.headerLogoutButton}
        >
          <Text style={styles.headerLogoutText}>登出</Text>
        </Pressable>
      </View>

      {error ? (
        <View style={styles.inlineBanner}>
          <Text style={styles.inlineBannerText}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => loadConversations(true)}
            style={styles.inlineBannerButton}
          >
            <Text style={styles.inlineBannerButtonText}>重試</Text>
          </Pressable>
        </View>
      ) : null}

      {!isLoading && conversations.length > 0 ? (
        <View style={styles.searchWrap}>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            onChangeText={setSearchText}
            placeholder="搜尋聊天室"
            placeholderTextColor="#94a3b8"
            style={styles.searchInput}
            value={searchText}
          />
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.listState}>
          <ActivityIndicator color="#0f766e" />
          <Text style={styles.listStateText}>載入聊天室列表...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.chatListContent,
            filteredConversations.length === 0
              ? styles.chatListContentEmpty
              : null,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => loadConversations(true)}
              tintColor="#0f766e"
            />
          }
        >
          {conversations.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateTitle}>還沒有聊天室</Text>
              <Text style={styles.emptyStateText}>
                先在網頁版或其他裝置建立好友與對話，這裡就會同步顯示。
              </Text>
            </View>
          ) : filteredConversations.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateTitle}>找不到聊天室</Text>
              <Text style={styles.emptyStateText}>換個名稱或訊息內容搜尋。</Text>
            </View>
          ) : (
            filteredConversations.map(conversation => (
              <ConversationRow
                conversation={conversation}
                key={conversation.conversation_id}
                onPress={() => setActiveConversation(conversation)}
              />
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function ConversationRow({
  conversation,
  onPress,
}: {
  conversation: ConversationRecord;
  onPress: () => void;
}) {
  const label = conversation.is_group
    ? '群組'
    : conversation.is_friend
    ? '好友'
    : '對話';
  const lastMessage = conversation.last_message?.trim() || '尚無可預覽訊息';
  const lastMessageTime = formatConversationTime(conversation.last_message_at);
  const unreadCount = conversation.unread_count ?? 0;
  const initial =
    conversation.display_name.trim().charAt(0).toUpperCase() || 'Y';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.conversationRow,
        pressed ? styles.conversationRowPressed : null,
      ]}
    >
      <View style={styles.conversationAvatar}>
        <Text style={styles.conversationAvatarText}>{initial}</Text>
      </View>
      <View style={styles.conversationBody}>
        <View style={styles.conversationTopLine}>
          <Text numberOfLines={1} style={styles.conversationName}>
            {conversation.display_name}
          </Text>
          {lastMessageTime ? (
            <Text style={styles.conversationTime}>{lastMessageTime}</Text>
          ) : null}
        </View>
        <View style={styles.conversationBottomLine}>
          <Text numberOfLines={1} style={styles.conversationPreview}>
            {lastMessage}
          </Text>
          {unreadCount > 0 ? (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </View>
          ) : (
            <Text style={styles.conversationKind}>{label}</Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function MessageThreadScreen({
  user,
  conversation,
  onBack,
}: {
  user: CurrentUser;
  conversation: ConversationRecord;
  onBack: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [draftMessage, setDraftMessage] = useState('');
  const [error, setError] = useState('');
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const shouldReconnectRef = useRef(true);

  const loadMessages = useCallback(
    async (refreshing = false) => {
      if (refreshing) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError('');

      try {
        await wakeBackend();
        const nextMessages = await fetchMessages(
          user.id,
          conversation.conversation_id,
        );
        setMessages(nextMessages.slice(-100));
      } catch (loadError) {
        console.error('Message load failed:', loadError);
        setError('訊息載入失敗，請稍後再試。');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [conversation.conversation_id, user.id],
  );

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const clearReconnectTimer = useCallback(() => {
    if (!reconnectTimerRef.current) return;
    clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
  }, []);

  const appendIncomingMessage = useCallback((incomingMessage: ChatMessage) => {
    setMessages(currentMessages => {
      const incomingKey = getMessageKey(incomingMessage);
      if (
        currentMessages.some(
          currentMessage => getMessageKey(currentMessage) === incomingKey,
        )
      ) {
        return currentMessages;
      }
      return [...currentMessages, incomingMessage].slice(-100);
    });
  }, []);

  const applyReadReceipt = useCallback((receipt: ChatMessage) => {
    setMessages(currentMessages =>
      currentMessages.map(message => {
        const isSameMessage =
          message.sender_id === receipt.sender_id &&
          message.recipient_id === receipt.recipient_id &&
          message.time === receipt.time &&
          message.text === receipt.text;
        return isSameMessage
          ? { ...message, read_at: receipt.read_at }
          : message;
      }),
    );
  }, []);

  const connectSocket = useCallback(() => {
    clearReconnectTimer();
    const existingSocket = socketRef.current;
    if (
      existingSocket &&
      (existingSocket.readyState === WebSocket.CONNECTING ||
        existingSocket.readyState === WebSocket.OPEN)
    ) {
      return;
    }

    const url = new URL(WS_URL);
    url.searchParams.set('user_id', user.id);
    url.searchParams.set('conversation_id', conversation.conversation_id);

    const socket = new WebSocket(url.toString());
    socketRef.current = socket;

    socket.onopen = () => {
      reconnectAttemptsRef.current = 0;
      setIsConnected(true);
      setError('');
      socket.send(
        JSON.stringify({
          type: 'active_conversation',
          conversation_id: conversation.conversation_id,
        }),
      );
    };

    socket.onmessage = event => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'message' && data.payload) {
          appendIncomingMessage(data.payload as ChatMessage);
          return;
        }

        if (data.type === 'read_receipt' && data.payload?.read_at) {
          applyReadReceipt(data.payload as ChatMessage);
        }
      } catch (socketError) {
        console.error('Invalid WebSocket event:', socketError);
      }
    };

    socket.onerror = () => {
      setError('即時連線中斷，正在重新連線。');
    };

    socket.onclose = () => {
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      setIsConnected(false);
      if (!shouldReconnectRef.current) return;

      reconnectAttemptsRef.current += 1;
      const retryDelay = Math.min(
        1000 * 2 ** (reconnectAttemptsRef.current - 1),
        10000,
      );
      reconnectTimerRef.current = setTimeout(() => {
        connectSocket();
      }, retryDelay);
    };
  }, [
    appendIncomingMessage,
    applyReadReceipt,
    clearReconnectTimer,
    conversation.conversation_id,
    user.id,
  ]);

  useEffect(() => {
    shouldReconnectRef.current = true;
    connectSocket();

    return () => {
      shouldReconnectRef.current = false;
      clearReconnectTimer();
      const socket = socketRef.current;
      socketRef.current = null;
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
    };
  }, [clearReconnectTimer, connectSocket]);

  const retryRealtimeConnection = async () => {
    shouldReconnectRef.current = true;
    clearReconnectTimer();
    reconnectAttemptsRef.current = 0;
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket) {
      socket.onclose = null;
      socket.close();
    }
    connectSocket();
    await loadMessages(true);
  };

  const sendMessage = async () => {
    const text = draftMessage.trim();
    const socket = socketRef.current;
    if (!text || !socket || socket.readyState !== WebSocket.OPEN || isSending) {
      return;
    }

    setIsSending(true);
    setError('');

    setDraftMessage('');

    try {
      socket.send(
        JSON.stringify({
          sender: user.displayName,
          sender_id: user.id,
          recipient_id: conversation.recipient_id,
          conversation_id: conversation.conversation_id,
          text,
          attachment_url: '',
          attachment_name: '',
          attachment_type: '',
          attachment_size: 0,
        }),
      );
    } catch (sendError) {
      console.error('Message send failed:', sendError);
      setError('訊息送出失敗，請稍後再試。');
      setDraftMessage(text);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.threadHeader}>
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>‹</Text>
        </Pressable>
        <View style={styles.threadTitleBlock}>
          <Text numberOfLines={1} style={styles.threadTitle}>
            {conversation.display_name}
          </Text>
          <Text style={styles.threadSubtitle}>
            {isConnected ? '即時連線中' : '重新連線中'}
          </Text>
        </View>
      </View>

      {error ? (
        <View style={styles.inlineBanner}>
          <Text style={styles.inlineBannerText}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={retryRealtimeConnection}
            style={styles.inlineBannerButton}
          >
            <Text style={styles.inlineBannerButtonText}>重試</Text>
          </Pressable>
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.listState}>
          <ActivityIndicator color="#0f766e" />
          <Text style={styles.listStateText}>載入訊息...</Text>
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={[
              styles.messageListContent,
              messages.length === 0 ? styles.chatListContentEmpty : null,
            ]}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={() => loadMessages(true)}
                tintColor="#0f766e"
              />
            }
          >
            {messages.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateTitle}>還沒有訊息</Text>
                <Text style={styles.emptyStateText}>
                  這個聊天室尚未有歷史訊息。
                </Text>
              </View>
            ) : (
              messages.map((message, index) => (
                <MessageBubble
                  currentUserId={user.id}
                  key={`${message.conversation_id}-${
                    message.time ?? index
                  }-${index}`}
                  message={message}
                />
              ))
            )}
          </ScrollView>

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.composerBar}>
              <TextInput
                multiline
                onChangeText={setDraftMessage}
                onSubmitEditing={sendMessage}
                placeholder={isConnected ? '輸入訊息' : '等待即時連線...'}
                placeholderTextColor="#94a3b8"
                returnKeyType="send"
                style={styles.composerInput}
                value={draftMessage}
              />
              <Pressable
                accessibilityRole="button"
                disabled={!draftMessage.trim() || !isConnected || isSending}
                onPress={sendMessage}
                style={({ pressed }) => [
                  styles.sendButton,
                  !draftMessage.trim() || !isConnected || isSending
                    ? styles.sendButtonDisabled
                    : null,
                  pressed && draftMessage.trim() && isConnected && !isSending
                    ? styles.sendButtonPressed
                    : null,
                ]}
              >
                {isSending ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.sendButtonText}>送出</Text>
                )}
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </>
      )}
    </SafeAreaView>
  );
}

function MessageBubble({
  currentUserId,
  message,
}: {
  currentUserId: string;
  message: ChatMessage;
}) {
  const isSelf = message.sender_id === currentUserId;
  const text = message.text?.trim();
  const attachmentName = message.attachment_name?.trim();
  const displayText =
    text || (attachmentName ? `已傳送檔案：${attachmentName}` : '已傳送檔案');
  const time = formatConversationTime(message.time);

  return (
    <View
      style={[
        styles.messageBubbleRow,
        isSelf ? styles.messageBubbleRowSelf : null,
      ]}
    >
      <View
        style={[styles.messageBubble, isSelf ? styles.messageBubbleSelf : null]}
      >
        {!isSelf && message.sender ? (
          <Text style={styles.messageSender}>{message.sender}</Text>
        ) : null}
        <Text
          style={[styles.messageText, isSelf ? styles.messageTextSelf : null]}
        >
          {displayText}
        </Text>
        {time ? (
          <Text
            style={[styles.messageTime, isSelf ? styles.messageTimeSelf : null]}
          >
            {time}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const formatConversationTime = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f6f7fb',
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  brandMark: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#0f766e',
    borderRadius: 18,
    height: 72,
    justifyContent: 'center',
    marginBottom: 26,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    width: 72,
  },
  brandInitial: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '800',
  },
  header: {
    alignItems: 'center',
    marginBottom: 26,
  },
  eyebrow: {
    color: '#0f766e',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 10,
  },
  title: {
    color: '#111827',
    fontSize: 34,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    color: '#64748b',
    fontSize: 16,
    lineHeight: 23,
    marginTop: 10,
    textAlign: 'center',
  },
  modeSwitch: {
    backgroundColor: '#e6ebf2',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 4,
    marginBottom: 24,
    padding: 4,
  },
  modeButton: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
  },
  modeButtonActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  modeButtonText: {
    color: '#64748b',
    fontSize: 15,
    fontWeight: '800',
  },
  modeButtonTextActive: {
    color: '#0f766e',
  },
  form: {
    gap: 16,
  },
  fieldGroup: {
    gap: 8,
  },
  label: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '700',
  },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#d7dee8',
    borderRadius: 8,
    borderWidth: 1,
    color: '#111827',
    fontSize: 16,
    minHeight: 54,
    paddingHorizontal: 16,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  infoText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  submitButton: {
    alignItems: 'center',
    backgroundColor: '#0f766e',
    borderRadius: 8,
    justifyContent: 'center',
    marginTop: 6,
    minHeight: 54,
  },
  submitButtonDisabled: {
    backgroundColor: '#8cc4bd',
  },
  submitButtonPressed: {
    backgroundColor: '#115e59',
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
  },
  chatListHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 16,
  },
  chatListEyebrow: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 4,
  },
  chatListTitle: {
    color: '#111827',
    fontSize: 28,
    fontWeight: '800',
  },
  chatListSubtitle: {
    color: '#64748b',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 3,
  },
  headerLogoutButton: {
    alignItems: 'center',
    borderColor: '#0f766e',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 18,
  },
  headerLogoutText: {
    color: '#0f766e',
    fontSize: 14,
    fontWeight: '800',
  },
  inlineBanner: {
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  inlineBannerText: {
    color: '#991b1b',
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  inlineBannerButton: {
    borderColor: '#b91c1c',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  inlineBannerButtonText: {
    color: '#b91c1c',
    fontSize: 13,
    fontWeight: '800',
  },
  listState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  listStateText: {
    color: '#64748b',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 12,
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  searchInput: {
    backgroundColor: '#ffffff',
    borderColor: '#d7dee8',
    borderRadius: 8,
    borderWidth: 1,
    color: '#111827',
    fontSize: 15,
    minHeight: 44,
    paddingHorizontal: 14,
  },
  chatListContent: {
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 28,
  },
  chatListContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    padding: 28,
  },
  emptyStateTitle: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  emptyStateText: {
    color: '#64748b',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  conversationRow: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 76,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  conversationRowPressed: {
    backgroundColor: '#f0fdfa',
  },
  conversationAvatar: {
    alignItems: 'center',
    backgroundColor: '#ccfbf1',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    marginRight: 12,
    width: 44,
  },
  conversationAvatarText: {
    color: '#0f766e',
    fontSize: 18,
    fontWeight: '800',
  },
  conversationBody: {
    flex: 1,
    gap: 7,
  },
  conversationTopLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  conversationName: {
    color: '#111827',
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
  },
  conversationTime: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
  },
  conversationBottomLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  conversationPreview: {
    color: '#64748b',
    flex: 1,
    fontSize: 14,
  },
  conversationKind: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '800',
  },
  unreadBadge: {
    alignItems: 'center',
    backgroundColor: '#0f766e',
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 22,
    minWidth: 22,
    paddingHorizontal: 7,
  },
  unreadBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  threadHeader: {
    alignItems: 'center',
    borderBottomColor: '#e2e8f0',
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 64,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  backButton: {
    alignItems: 'center',
    borderRadius: 8,
    height: 42,
    justifyContent: 'center',
    marginRight: 8,
    width: 42,
  },
  backButtonText: {
    color: '#0f766e',
    fontSize: 34,
    fontWeight: '700',
    lineHeight: 36,
  },
  threadTitleBlock: {
    flex: 1,
  },
  threadTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  threadSubtitle: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 3,
  },
  messageListContent: {
    flexGrow: 1,
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  messageBubbleRow: {
    alignItems: 'flex-start',
  },
  messageBubbleRowSelf: {
    alignItems: 'flex-end',
  },
  messageBubble: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: '82%',
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  messageBubbleSelf: {
    backgroundColor: '#0f766e',
    borderColor: '#0f766e',
  },
  messageSender: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 5,
  },
  messageText: {
    color: '#111827',
    fontSize: 15,
    lineHeight: 21,
  },
  messageTextSelf: {
    color: '#ffffff',
  },
  messageTime: {
    alignSelf: 'flex-end',
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 6,
  },
  messageTimeSelf: {
    color: '#ccfbf1',
  },
  composerBar: {
    alignItems: 'flex-end',
    backgroundColor: '#ffffff',
    borderTopColor: '#e2e8f0',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  composerInput: {
    backgroundColor: '#f8fafc',
    borderColor: '#d7dee8',
    borderRadius: 8,
    borderWidth: 1,
    color: '#111827',
    flex: 1,
    fontSize: 15,
    maxHeight: 112,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: '#0f766e',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 64,
    paddingHorizontal: 14,
  },
  sendButtonDisabled: {
    backgroundColor: '#8cc4bd',
  },
  sendButtonPressed: {
    backgroundColor: '#115e59',
  },
  sendButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
});

export default App;
