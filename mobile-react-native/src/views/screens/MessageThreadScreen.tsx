import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ConversationRecord, CurrentUser } from '../../models/types';
import { useMessageThreadViewModel } from '../../viewmodels/thread/useMessageThreadViewModel';
import { MessageBubble } from '../components/message/MessageBubble';
import { messageThreadStyles } from '../styles/messageThread';
import { sharedStyles } from '../styles/shared';

export function MessageThreadScreen({
  user,
  conversation,
  onBack,
}: {
  user: CurrentUser;
  conversation: ConversationRecord;
  onBack: () => void;
}) {
  const vm = useMessageThreadViewModel(user, conversation);

  return (
    <SafeAreaView style={sharedStyles.safeArea}>
      <View style={messageThreadStyles.header}>
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={messageThreadStyles.backButton}
        >
          <Text style={messageThreadStyles.backButtonText}>‹</Text>
        </Pressable>
        <View style={messageThreadStyles.titleBlock}>
          <Text numberOfLines={1} style={messageThreadStyles.title}>
            {conversation.display_name}
          </Text>
          <Text style={messageThreadStyles.subtitle}>
            {vm.isConnected ? '即時連線中' : '重新連線中'}
          </Text>
        </View>
      </View>

      {vm.error ? (
        <View style={sharedStyles.inlineBanner}>
          <Text style={sharedStyles.inlineBannerText}>{vm.error}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              vm.retryRealtimeConnection();
            }}
            style={sharedStyles.inlineBannerButton}
          >
            <Text style={sharedStyles.inlineBannerButtonText}>重試</Text>
          </Pressable>
        </View>
      ) : null}

      {vm.isLoading ? (
        <View style={sharedStyles.listState}>
          <ActivityIndicator color="#0f766e" />
          <Text style={sharedStyles.listStateText}>載入訊息...</Text>
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={[
              messageThreadStyles.content,
              vm.messages.length === 0 ? messageThreadStyles.contentEmpty : null,
            ]}
            refreshControl={
              <RefreshControl
                refreshing={vm.isRefreshing}
                onRefresh={() => {
                  vm.loadMessages(true);
                }}
                tintColor="#0f766e"
              />
            }
          >
            {vm.messages.length === 0 ? (
              <View style={sharedStyles.emptyState}>
                <Text style={sharedStyles.emptyStateTitle}>還沒有訊息</Text>
                <Text style={sharedStyles.emptyStateText}>
                  這個聊天室尚未有歷史訊息。
                </Text>
              </View>
            ) : (
              vm.messages.map((message, index) => (
                <MessageBubble
                  currentUserId={user.id}
                  key={`${message.conversation_id}-${message.time ?? index}-${index}`}
                  message={message}
                />
              ))
            )}
          </ScrollView>

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={messageThreadStyles.composerBar}>
              <TextInput
                multiline
                onChangeText={vm.setDraftMessage}
                onSubmitEditing={() => {
                  vm.sendMessage();
                }}
                placeholder={vm.isConnected ? '輸入訊息' : '等待即時連線...'}
                placeholderTextColor="#94a3b8"
                returnKeyType="send"
                style={messageThreadStyles.composerInput}
                value={vm.draftMessage}
              />
              <Pressable
                accessibilityRole="button"
                disabled={!vm.draftMessage.trim() || !vm.isConnected || vm.isSending}
                onPress={() => {
                  vm.sendMessage();
                }}
                style={({ pressed }) => [
                  messageThreadStyles.sendButton,
                  !vm.draftMessage.trim() || !vm.isConnected || vm.isSending
                    ? messageThreadStyles.sendButtonDisabled
                    : null,
                  pressed && vm.draftMessage.trim() && vm.isConnected && !vm.isSending
                    ? messageThreadStyles.sendButtonPressed
                    : null,
                ]}
              >
                {vm.isSending ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={messageThreadStyles.sendButtonText}>送出</Text>
                )}
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </>
      )}
    </SafeAreaView>
  );
}
