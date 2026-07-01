import { useCallback, useEffect, useState } from 'react';
import { ApiService } from '../../services/api.service';
import { ConversationRecord, CurrentUser } from '../../models/types';

export function useChatListViewModel(user: CurrentUser) {
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
        await ApiService.wakeBackend();
        const nextConversations = await ApiService.fetchConversations(user.id);
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

  const openConversation = (conversation: ConversationRecord) => {
    setActiveConversation(conversation);
  };

  const closeConversation = async () => {
    setActiveConversation(null);
    await loadConversations(true);
  };

  return {
    conversations,
    filteredConversations,
    isLoading,
    isRefreshing,
    error,
    searchText,
    setSearchText,
    activeConversation,
    openConversation,
    closeConversation,
    loadConversations,
  };
}
