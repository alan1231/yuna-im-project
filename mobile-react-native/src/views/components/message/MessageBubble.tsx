import React from 'react';
import { Text, View } from 'react-native';
import { formatConversationTime } from '../../../models/types';
import { messageThreadStyles } from '../../styles/messageThread';

export function MessageBubble({
  currentUserId,
  message,
}: {
  currentUserId: string;
  message: {
    sender?: string;
    sender_id: string;
    text?: string;
    attachment_name?: string;
    time?: string;
  };
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
        messageThreadStyles.bubbleRow,
        isSelf ? messageThreadStyles.bubbleRowSelf : null,
      ]}
    >
      <View
        style={[
          messageThreadStyles.bubble,
          isSelf ? messageThreadStyles.bubbleSelf : null,
        ]}
      >
        {!isSelf && message.sender ? (
          <Text style={messageThreadStyles.sender}>{message.sender}</Text>
        ) : null}
        <Text
          style={[messageThreadStyles.text, isSelf ? messageThreadStyles.textSelf : null]}
        >
          {displayText}
        </Text>
        {time ? (
          <Text
            style={[messageThreadStyles.time, isSelf ? messageThreadStyles.timeSelf : null]}
          >
            {time}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
