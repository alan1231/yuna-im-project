import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { ConversationRecord, formatConversationTime } from '../../../models/types';
import { conversationRowStyles } from '../../styles/conversationRow';

export function ConversationRow({
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
        conversationRowStyles.row,
        pressed ? conversationRowStyles.rowPressed : null,
      ]}
    >
      <View style={conversationRowStyles.avatar}>
        <Text style={conversationRowStyles.avatarText}>{initial}</Text>
      </View>
      <View style={conversationRowStyles.body}>
        <View style={conversationRowStyles.topLine}>
          <Text numberOfLines={1} style={conversationRowStyles.name}>
            {conversation.display_name}
          </Text>
          {lastMessageTime ? (
            <Text style={conversationRowStyles.time}>{lastMessageTime}</Text>
          ) : null}
        </View>
        <View style={conversationRowStyles.bottomLine}>
          <Text numberOfLines={1} style={conversationRowStyles.preview}>
            {lastMessage}
          </Text>
          {unreadCount > 0 ? (
            <View style={conversationRowStyles.unreadBadge}>
              <Text style={conversationRowStyles.unreadBadgeText}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </View>
          ) : (
            <Text style={conversationRowStyles.kind}>{label}</Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}
