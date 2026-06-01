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
      ]);

      final mergedRooms = <String, ChatRoom>{stockRoom.id: stockRoom};
      for (final room in [...results[0], ...results[1]]) {
        final existing = mergedRooms[room.id];
        mergedRooms[room.id] = existing == null
            ? room
            : room.copyWith(isFriend: existing.isFriend || room.isFriend);
      }

      rooms = mergedRooms.values.toList();
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

  Future<void> logout() async {
    await _profileStore.clear();
    await _realtime.close();
    user = null;
    rooms = const [];
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
    rooms = rooms.map((room) {
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
        unreadCount: room.id == activeRoom?.id ? 0 : room.unreadCount + 1,
      );
    }).toList();
    notifyListeners();
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
