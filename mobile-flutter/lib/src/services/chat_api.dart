import 'dart:convert';

import 'package:http/http.dart' as http;

import '../core/config.dart';
import '../core/utils.dart';
import '../models/chat_message.dart';
import '../models/chat_room.dart';
import '../models/user_profile.dart';

class ChatApi {
  const ChatApi();

  Future<UserProfile> createUser(String displayName) async {
    final userId = createLocalUserId();
    final response = await http.post(
      Uri.parse('$apiBaseUrl/users'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'user_id': userId, 'display_name': displayName}),
    );

    if (response.statusCode == 409) {
      throw const ApiException('這個顯示名稱已被使用。');
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw const ApiException('建立帳號失敗。');
    }

    final json = jsonDecode(response.body) as Map<String, dynamic>;
    return UserProfile(
      id: json['user_id'].toString(),
      displayName: json['display_name'].toString(),
    );
  }

  Future<UserProfile> loginByDisplayName(String displayName) async {
    final response = await http.get(Uri.parse('$apiBaseUrl/users'));
    if (response.statusCode != 200) {
      throw const ApiException('載入使用者失敗。');
    }

    final users = jsonDecode(response.body) as List<dynamic>;
    final normalized = displayName.trim().toLowerCase();
    for (final rawUser in users) {
      final user = rawUser as Map<String, dynamic>;
      if ((user['display_name']?.toString().toLowerCase() ?? '') ==
          normalized) {
        return UserProfile(
          id: user['user_id'].toString(),
          displayName: user['display_name'].toString(),
        );
      }
    }

    throw const ApiException('找不到這個帳號。');
  }

  Future<List<ChatRoom>> loadFriends(UserProfile user) async {
    final uri = Uri.parse(
      '$apiBaseUrl/friends',
    ).replace(queryParameters: {'user_id': user.id});
    final response = await http.get(uri);
    if (response.statusCode != 200) {
      throw const ApiException('載入好友失敗。');
    }

    final friends = jsonDecode(response.body) as List<dynamic>;
    return friends.map((rawFriend) {
      final friend = rawFriend as Map<String, dynamic>;
      final friendId = friend['friend_id'].toString();
      return ChatRoom(
        id: friendId,
        name: friend['display_name'].toString(),
        recipientId: friendId,
        conversationId: conversationIdFor(user.id, friendId),
        isFriend: true,
      );
    }).toList();
  }

  Future<List<ChatRoom>> loadConversations(UserProfile user) async {
    final uri = Uri.parse(
      '$apiBaseUrl/conversations',
    ).replace(queryParameters: {'user_id': user.id});
    final response = await http.get(uri);
    if (response.statusCode != 200) {
      throw const ApiException('載入聊天室失敗。');
    }

    final conversations = jsonDecode(response.body) as List<dynamic>;
    return conversations.map((rawConversation) {
      final conversation = rawConversation as Map<String, dynamic>;
      final recipientId = conversation['recipient_id'].toString();
      return ChatRoom(
        id: recipientId,
        name: conversation['display_name']?.toString() ?? recipientId,
        recipientId: recipientId,
        conversationId: conversation['conversation_id'].toString(),
        lastMessage: conversation['last_message']?.toString() ?? '',
        unreadCount: (conversation['unread_count'] as num?)?.toInt() ?? 0,
        isFriend: conversation['is_friend'] == true,
      );
    }).toList();
  }

  Future<List<ChatMessage>> loadMessages({
    required UserProfile user,
    required ChatRoom room,
  }) async {
    final uri = Uri.parse('$apiBaseUrl/messages').replace(
      queryParameters: {
        'user_id': user.id,
        'conversation_id': room.conversationId,
      },
    );
    final response = await http.get(uri);
    if (response.statusCode != 200) {
      throw const ApiException('載入訊息失敗。');
    }

    final messages = jsonDecode(response.body) as List<dynamic>;
    return messages
        .map(
          (rawMessage) =>
              ChatMessage.fromJson(rawMessage as Map<String, dynamic>),
        )
        .toList();
  }
}

class ApiException implements Exception {
  const ApiException(this.message);

  final String message;
}
