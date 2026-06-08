import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/legacy.dart';

import '../core/config.dart';
import '../core/utils.dart';
import '../models/chat_message.dart';
import '../models/chat_room.dart';
import '../models/user_profile.dart';
import '../services/chat_api.dart';
import '../services/profile_store.dart';
import '../services/realtime_service.dart';

final chatViewModelProvider = ChangeNotifierProvider<ChatViewModel>((ref) {
  return ChatViewModel(
    api: const ChatApi(),
    profileStore: const ProfileStore(),
    realtime: RealtimeService(),
  );
});

class ChatViewModel extends ChangeNotifier {
  ChatViewModel({
    required ChatApi api,
    required ProfileStore profileStore,
    required RealtimeService realtime,
  }) : _api = api,
       _profileStore = profileStore,
       _realtime = realtime {
    unawaited(restoreProfile());
  }

  final ChatApi _api;
  final ProfileStore _profileStore;
  final RealtimeService _realtime;
  final Map<String, List<ChatMessage>> _messagesByConversation = {};
  final Set<String> _loadedConversationIds = {};

  UserProfile? user;
  List<ChatRoom> rooms = const [];
  List<ApiUser> availableUsers = const [];
  ChatRoom? activeRoom;
  bool isRestoring = true;
  bool isLoadingChat = false;
  bool isSubmittingName = false;
  bool isConnected = false;
  String error = '';

  List<ChatMessage> get activeMessages {
    return _messagesByConversation[activeRoom?.conversationId] ?? const [];
  }

  Future<void> restoreProfile() async {
    final restoredProfile = await _profileStore.restore();
    user = restoredProfile;
    isRestoring = false;
    notifyListeners();

    if (restoredProfile != null) {
      await loadInitialChat(restoredProfile);
    }
  }

  Future<void> createOrLogin({
    required String displayName,
    required bool create,
  }) async {
    final name = displayName.trim();
    if (name.isEmpty) return;

    isSubmittingName = true;
    error = '';
    notifyListeners();

    try {
      final profile = create
          ? await _api.createUser(name)
          : await _api.loginByDisplayName(name);
      await _profileStore.save(profile);
      user = profile;
      notifyListeners();
      await loadInitialChat(profile);
    } on ApiException catch (apiError) {
      error = apiError.message;
    } catch (_) {
      error = '無法連線到 Go 後端。';
    } finally {
      isSubmittingName = false;
      notifyListeners();
    }
  }

  Future<void> loadInitialChat(UserProfile profile) async {
    final stockRoom = ChatRoom(
      id: stockBotId,
      name: stockBotName,
      recipientId: stockBotId,
      conversationId: conversationIdFor(profile.id, stockBotId),
    );

    isLoadingChat = true;
    rooms = [stockRoom];
    activeRoom = stockRoom;
    error = '';
    notifyListeners();

    try {
      final results = await Future.wait([
        _api.loadFriends(profile),
        _api.loadConversations(profile),
        _api.loadGroups(profile),
        _api.loadUsers(currentUserId: profile.id),
      ]);

      final mergedRooms = <String, ChatRoom>{stockRoom.id: stockRoom};
      for (final room in [
        ...results[0] as List<ChatRoom>,
        ...results[1] as List<ChatRoom>,
        ...results[2] as List<ChatRoom>,
      ]) {
        final existing = mergedRooms[room.id];
        mergedRooms[room.id] = existing == null
            ? room
            : room.copyWith(
                isFriend: existing.isFriend || room.isFriend,
                isGroup: existing.isGroup || room.isGroup,
                memberIds: room.memberIds.isEmpty
                    ? existing.memberIds
                    : room.memberIds,
                online: existing.online || room.online,
                lastSeen: room.lastSeen ?? existing.lastSeen,
              );
      }

      rooms = _sortRooms(mergedRooms.values.toList());
      availableUsers = results[3] as List<ApiUser>;
      activeRoom = mergedRooms[activeRoom?.id] ?? stockRoom;
      notifyListeners();

      await loadMessagesForRoom(stockRoom);
      _connectWebSocket(profile, stockRoom);
    } catch (_) {
      error = '聊天資料載入失敗。';
    } finally {
      isLoadingChat = false;
      notifyListeners();
    }
  }

  Future<void> loadMessagesForRoom(ChatRoom room) async {
    final currentUser = user;
    if (currentUser == null ||
        _loadedConversationIds.contains(room.conversationId)) {
      return;
    }

    try {
      final messages = await _api.loadMessages(user: currentUser, room: room);
      _messagesByConversation[room.conversationId] = messages;
      _loadedConversationIds.add(room.conversationId);
      notifyListeners();
    } catch (_) {
      error = '訊息載入失敗。';
      notifyListeners();
    }
  }

  Future<void> selectRoom(ChatRoom room) async {
    activeRoom = room;
    rooms = rooms
        .map(
          (item) => item.id == room.id ? item.copyWith(unreadCount: 0) : item,
        )
        .toList();
    notifyListeners();

    await loadMessagesForRoom(room);
    _realtime.sendActiveConversation(room);
  }

  void sendMessage(String rawText) {
    final currentUser = user;
    final room = activeRoom;
    final text = rawText.trim();
    if (currentUser == null || room == null || text.isEmpty) return;

    _realtime.sendMessage(user: currentUser, room: room, text: text);
  }

  Future<void> startChatWithUser(ApiUser targetUser) async {
    final currentUser = user;
    if (currentUser == null || targetUser.id == currentUser.id) return;

    final room = ChatRoom(
      id: targetUser.id,
      name: targetUser.displayName,
      recipientId: targetUser.id,
      conversationId: conversationIdFor(currentUser.id, targetUser.id),
      online: targetUser.online,
      lastSeen: targetUser.lastSeen,
    );
    _upsertRoom(room);
    await selectRoom(rooms.firstWhere((item) => item.id == room.id));
  }

  Future<void> refreshRooms() async {
    final currentUser = user;
    if (currentUser == null) return;
    await loadInitialChat(currentUser);
  }

  Future<void> addFriend(String displayName) async {
    final currentUser = user;
    final name = displayName.trim();
    if (currentUser == null || name.isEmpty) return;

    try {
      await _api.addFriend(user: currentUser, displayName: name);
      error = '好友邀請已送出。';
      await refreshRooms();
    } on ApiException catch (apiError) {
      error = apiError.message;
    } catch (_) {
      error = '送出好友邀請失敗。';
    }
    notifyListeners();
  }

  Future<void> deleteFriend(ChatRoom room) async {
    final currentUser = user;
    if (currentUser == null) return;

    try {
      await _api.deleteFriend(user: currentUser, friendId: room.recipientId);
      rooms = rooms
          .map(
            (item) =>
                item.id == room.id ? item.copyWith(isFriend: false) : item,
          )
          .toList();
      error = '';
    } on ApiException catch (apiError) {
      error = apiError.message;
    } catch (_) {
      error = '刪除好友失敗。';
    }
    notifyListeners();
  }

  Future<void> createGroup({
    required String name,
    required List<String> memberIds,
  }) async {
    final currentUser = user;
    final trimmedName = name.trim();
    if (currentUser == null || trimmedName.isEmpty || memberIds.isEmpty) return;

    try {
      final room = await _api.createGroup(
        user: currentUser,
        name: trimmedName,
        memberIds: memberIds,
      );
      _upsertRoom(room);
      await selectRoom(room);
      error = '';
    } on ApiException catch (apiError) {
      error = apiError.message;
    } catch (_) {
      error = '建立群組失敗。';
    }
    notifyListeners();
  }

  Future<void> leaveGroup(ChatRoom room) async {
    final currentUser = user;
    if (currentUser == null || !room.isGroup) return;

    try {
      await _api.leaveGroup(user: currentUser, groupId: room.id);
      rooms = rooms.where((item) => item.id != room.id).toList();
      activeRoom = rooms.isEmpty ? null : rooms.first;
      error = '';
    } on ApiException catch (apiError) {
      error = apiError.message;
    } catch (_) {
      error = '離開群組失敗。';
    }
    notifyListeners();
  }

  Future<void> logout() async {
    await _profileStore.clear();
    await _realtime.close();
    user = null;
    rooms = const [];
    availableUsers = const [];
    activeRoom = null;
    _messagesByConversation.clear();
    _loadedConversationIds.clear();
    isConnected = false;
    error = '';
    notifyListeners();
  }

  void dismissError() {
    error = '';
    notifyListeners();
  }

  void _connectWebSocket(UserProfile profile, ChatRoom room) {
    _realtime.connect(
      user: profile,
      room: room,
      onEvent: _handleSocketEvent,
      onDisconnected: () {
        isConnected = false;
        notifyListeners();
      },
    );
    isConnected = true;
    notifyListeners();
    _realtime.sendActiveConversation(room);
  }

  void _handleSocketEvent(Map<String, dynamic> event) {
    final type = event['type']?.toString();
    final payload = event['payload'];
    if (payload is! Map<String, dynamic>) return;

    if (type == 'message') {
      _appendMessage(ChatMessage.fromJson(payload));
    } else if (type == 'read_receipt') {
      _applyReadReceipt(ChatMessage.fromJson(payload));
    } else if (type == 'friend_added') {
      final currentUser = user;
      if (currentUser != null) unawaited(refreshRooms());
    } else if (type == 'group_added') {
      _handleGroupAdded(payload);
    }
  }

  void _appendMessage(ChatMessage message) {
    final existingMessages = List<ChatMessage>.from(
      _messagesByConversation[message.conversationId] ?? [],
    );
    final messageKey = _messageKey(message);
    if (existingMessages.any((item) => _messageKey(item) == messageKey)) return;

    existingMessages.add(message);
    if (existingMessages.length > maxCachedMessagesPerConversation) {
      existingMessages.removeRange(
        0,
        existingMessages.length - maxCachedMessagesPerConversation,
      );
    }

    _messagesByConversation[message.conversationId] = existingMessages;
    rooms = _sortRooms(
      rooms.map((room) {
        if (room.conversationId != message.conversationId) return room;
        final preview = message.text.isNotEmpty
            ? message.text
            : message.hasImageAttachment
            ? '已傳送圖片'
            : message.hasAttachment
            ? '已傳送檔案'
            : '';
        return room.copyWith(
          lastMessage: preview,
          lastMessageAt: message.sentAt,
          lastMessageIsSelf: message.isSelf(user?.id ?? ''),
          lastMessageReadAt: message.readAt,
          unreadCount: room.id == activeRoom?.id ? 0 : room.unreadCount + 1,
        );
      }).toList(),
    );
    notifyListeners();
  }

  void _handleGroupAdded(Map<String, dynamic> payload) {
    final currentUser = user;
    if (currentUser == null) return;

    final groupId = payload['group_id']?.toString() ?? '';
    final conversationId = payload['conversation_id']?.toString() ?? '';
    final name = payload['name']?.toString() ?? '';
    if (groupId.isEmpty || conversationId.isEmpty || name.isEmpty) return;

    final memberIds = (payload['member_ids'] as List<dynamic>? ?? [])
        .map((memberId) => memberId.toString())
        .toList();
    if (!memberIds.contains(currentUser.id)) return;

    _upsertRoom(
      ChatRoom(
        id: groupId,
        name: name,
        recipientId: groupId,
        conversationId: conversationId,
        memberIds: memberIds,
        isGroup: true,
      ),
    );
  }

  void _upsertRoom(ChatRoom room) {
    final existingIndex = rooms.indexWhere((item) => item.id == room.id);
    if (existingIndex == -1) {
      rooms = _sortRooms([...rooms, room]);
      _messagesByConversation.putIfAbsent(room.conversationId, () => []);
      notifyListeners();
      return;
    }

    final existing = rooms[existingIndex];
    rooms = _sortRooms([
      ...rooms.take(existingIndex),
      existing.copyWith(
        name: room.name,
        isFriend: existing.isFriend || room.isFriend,
        isGroup: existing.isGroup || room.isGroup,
        memberIds: room.memberIds.isEmpty ? existing.memberIds : room.memberIds,
        online: existing.online || room.online,
        lastSeen: room.lastSeen ?? existing.lastSeen,
        lastMessage: room.lastMessage.isEmpty
            ? existing.lastMessage
            : room.lastMessage,
        lastMessageAt: room.lastMessageAt ?? existing.lastMessageAt,
        lastMessageIsSelf: room.lastMessage.isEmpty
            ? existing.lastMessageIsSelf
            : room.lastMessageIsSelf,
        lastMessageReadAt: room.lastMessageReadAt ?? existing.lastMessageReadAt,
      ),
      ...rooms.skip(existingIndex + 1),
    ]);
    _messagesByConversation.putIfAbsent(room.conversationId, () => []);
    notifyListeners();
  }

  List<ChatRoom> _sortRooms(List<ChatRoom> source) {
    final sorted = [...source];
    sorted.sort((a, b) {
      final aTime = a.lastMessageAt?.millisecondsSinceEpoch ?? 0;
      final bTime = b.lastMessageAt?.millisecondsSinceEpoch ?? 0;
      if (a.id == stockBotId && aTime == 0 && bTime == 0) return -1;
      if (b.id == stockBotId && aTime == 0 && bTime == 0) return 1;
      return bTime.compareTo(aTime);
    });
    return sorted;
  }

  void _applyReadReceipt(ChatMessage receipt) {
    final messages = _messagesByConversation[receipt.conversationId];
    if (messages == null) return;

    _messagesByConversation[receipt.conversationId] = messages.map((message) {
      final sameMessage =
          message.senderId == receipt.senderId &&
          message.recipientId == receipt.recipientId &&
          message.text == receipt.text &&
          message.sentAt.isAtSameMomentAs(receipt.sentAt);
      return sameMessage ? message.copyWith(readAt: receipt.readAt) : message;
    }).toList();
    notifyListeners();
  }

  String _messageKey(ChatMessage message) {
    return [
      message.senderId,
      message.recipientId,
      message.sentAt.toIso8601String(),
      message.text,
      message.attachmentName,
      message.attachmentSize.toString(),
      message.attachmentUrl.length.toString(),
    ].join('|');
  }

  @override
  void dispose() {
    _realtime.close();
    super.dispose();
  }
}
