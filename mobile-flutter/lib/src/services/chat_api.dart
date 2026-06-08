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
    final users = await loadUsers();
    final normalized = displayName.trim().toLowerCase();
    for (final user in users) {
      if (user.displayName.toLowerCase() == normalized) {
        return UserProfile(id: user.id, displayName: user.displayName);
      }
    }

    throw const ApiException('找不到這個帳號。');
  }

  Future<List<ApiUser>> loadUsers({String currentUserId = ''}) async {
    final uri = Uri.parse('$apiBaseUrl/users').replace(
      queryParameters: currentUserId.isEmpty
          ? null
          : {'user_id': currentUserId},
    );
    final response = await http.get(uri);
    if (response.statusCode != 200) {
      throw const ApiException('載入使用者失敗。');
    }

    final users = jsonDecode(response.body) as List<dynamic>;
    return users
        .map((rawUser) => ApiUser.fromJson(rawUser as Map<String, dynamic>))
        .where((user) => user.id.isNotEmpty && user.displayName.isNotEmpty)
        .toList();
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
        online: friend['online'] == true,
        lastSeen: parseDate(friend['last_seen']),
      );
    }).toList();
  }

  Future<void> addFriend({
    required UserProfile user,
    required String displayName,
  }) async {
    final response = await http.post(
      Uri.parse('$apiBaseUrl/friends'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'user_id': user.id, 'display_name': displayName}),
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw const ApiException('送出好友邀請失敗。');
    }
  }

  Future<void> deleteFriend({
    required UserProfile user,
    required String friendId,
  }) async {
    final response = await http.post(
      Uri.parse('$apiBaseUrl/friends/delete'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'user_id': user.id, 'friend_id': friendId}),
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw const ApiException('刪除好友失敗。');
    }
  }

  Future<List<ChatRoom>> loadGroups(UserProfile user) async {
    final uri = Uri.parse(
      '$apiBaseUrl/groups',
    ).replace(queryParameters: {'user_id': user.id});
    final response = await http.get(uri);
    if (response.statusCode != 200) {
      throw const ApiException('載入群組失敗。');
    }

    final groups = jsonDecode(response.body) as List<dynamic>;
    return groups.map((rawGroup) {
      final group = rawGroup as Map<String, dynamic>;
      final groupId = group['group_id'].toString();
      final memberIds = (group['member_ids'] as List<dynamic>? ?? [])
          .map((memberId) => memberId.toString())
          .toList();
      return ChatRoom(
        id: groupId,
        name: group['name'].toString(),
        recipientId: groupId,
        conversationId: group['conversation_id'].toString(),
        memberIds: memberIds,
        isGroup: true,
      );
    }).toList();
  }

  Future<ChatRoom> createGroup({
    required UserProfile user,
    required String name,
    required List<String> memberIds,
  }) async {
    final response = await http.post(
      Uri.parse('$apiBaseUrl/groups'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'user_id': user.id,
        'name': name,
        'member_ids': memberIds,
      }),
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw const ApiException('建立群組失敗。');
    }

    final group = jsonDecode(response.body) as Map<String, dynamic>;
    final groupId = group['group_id'].toString();
    return ChatRoom(
      id: groupId,
      name: group['name'].toString(),
      recipientId: groupId,
      conversationId: group['conversation_id'].toString(),
      memberIds: (group['member_ids'] as List<dynamic>? ?? [])
          .map((memberId) => memberId.toString())
          .toList(),
      isGroup: true,
    );
  }

  Future<void> leaveGroup({
    required UserProfile user,
    required String groupId,
  }) async {
    final response = await http.post(
      Uri.parse('$apiBaseUrl/groups/leave'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'user_id': user.id, 'group_id': groupId}),
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw const ApiException('離開群組失敗。');
    }
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
        memberIds: (conversation['member_ids'] as List<dynamic>? ?? [])
            .map((memberId) => memberId.toString())
            .toList(),
        lastMessage: conversation['last_message']?.toString() ?? '',
        lastMessageAt: parseDate(conversation['last_message_at']),
        lastMessageIsSelf:
            conversation['last_message_sender_id']?.toString() == user.id,
        lastMessageReadAt: parseDate(conversation['last_message_read_at']),
        unreadCount: (conversation['unread_count'] as num?)?.toInt() ?? 0,
        isFriend: conversation['is_friend'] == true,
        isGroup: conversation['is_group'] == true,
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
