import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiService } from '../../services/api.service';
import {
  ChatMessage,
  ConversationRecord,
  CurrentUser,
  getMessageKey,
} from '../../models/types';

const WS_URL = 'wss://yuna-im-project.onrender.com/ws';

export function useMessageThreadViewModel(
  user: CurrentUser,
  conversation: ConversationRecord,
) {
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

        return isSameMessage ? { ...message, read_at: receipt.read_at } : message;
      }),
    );
  }, []);

  const loadMessages = useCallback(
    async (refreshing = false) => {
      if (refreshing) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError('');

      try {
        await ApiService.wakeBackend();
        const nextMessages = await ApiService.fetchMessages(
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

  return {
    messages,
    isLoading,
    isRefreshing,
    isConnected,
    isSending,
    draftMessage,
    setDraftMessage,
    error,
    loadMessages,
    retryRealtimeConnection,
    sendMessage,
  };
}
