import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CurrentUser } from '../../models/types';
import { useChatListViewModel } from '../../viewmodels/chat/useChatListViewModel';
import { ConversationRow } from '../components/conversation/ConversationRow';
import { chatListStyles } from '../styles/chatList';
import { sharedStyles } from '../styles/shared';
import { MessageThreadScreen } from './MessageThreadScreen';

export function ChatListScreen({
  user,
  onLogout,
}: {
  user: CurrentUser;
  onLogout: () => Promise<void>;
}) {
  const vm = useChatListViewModel(user);

  if (vm.activeConversation) {
    return (
      <MessageThreadScreen
        conversation={vm.activeConversation}
        user={user}
        onBack={() => {
          vm.closeConversation();
        }}
      />
    );
  }

  return (
    <SafeAreaView style={sharedStyles.safeArea}>
      <View style={chatListStyles.header}>
        <View>
          <Text style={chatListStyles.eyebrow}>YUNA IM</Text>
          <Text style={chatListStyles.title}>聊天室</Text>
          <Text style={chatListStyles.subtitle}>{user.displayName}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            onLogout();
          }}
          style={chatListStyles.logoutButton}
        >
          <Text style={chatListStyles.logoutText}>登出</Text>
        </Pressable>
      </View>

      {vm.error ? (
        <View style={sharedStyles.inlineBanner}>
          <Text style={sharedStyles.inlineBannerText}>{vm.error}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              vm.loadConversations(true);
            }}
            style={sharedStyles.inlineBannerButton}
          >
            <Text style={sharedStyles.inlineBannerButtonText}>重試</Text>
          </Pressable>
        </View>
      ) : null}

      {!vm.isLoading && vm.conversations.length > 0 ? (
        <View style={chatListStyles.searchWrap}>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            onChangeText={vm.setSearchText}
            placeholder="搜尋聊天室"
            placeholderTextColor="#94a3b8"
            style={chatListStyles.searchInput}
            value={vm.searchText}
          />
        </View>
      ) : null}

      {vm.isLoading ? (
        <View style={sharedStyles.listState}>
          <ActivityIndicator color="#0f766e" />
          <Text style={sharedStyles.listStateText}>載入聊天室列表...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            chatListStyles.content,
            vm.filteredConversations.length === 0
              ? chatListStyles.contentEmpty
              : null,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={vm.isRefreshing}
              onRefresh={() => {
                vm.loadConversations(true);
              }}
              tintColor="#0f766e"
            />
          }
        >
          {vm.conversations.length === 0 ? (
            <View style={sharedStyles.emptyState}>
              <Text style={sharedStyles.emptyStateTitle}>還沒有聊天室</Text>
              <Text style={sharedStyles.emptyStateText}>
                先在網頁版或其他裝置建立好友與對話，這裡就會同步顯示。
              </Text>
            </View>
          ) : vm.filteredConversations.length === 0 ? (
            <View style={sharedStyles.emptyState}>
              <Text style={sharedStyles.emptyStateTitle}>找不到聊天室</Text>
              <Text style={sharedStyles.emptyStateText}>換個名稱或訊息內容搜尋。</Text>
            </View>
          ) : (
            vm.filteredConversations.map(conversation => (
              <ConversationRow
                conversation={conversation}
                key={conversation.conversation_id}
                onPress={() => vm.openConversation(conversation)}
              />
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
