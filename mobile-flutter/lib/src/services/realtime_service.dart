import 'dart:async';
import 'dart:convert';

import 'package:web_socket_channel/web_socket_channel.dart';

import '../core/config.dart';
import '../models/chat_room.dart';
import '../models/user_profile.dart';
import 'chat_api.dart';

class RealtimeService {
  RealtimeService(this._api);

  final ChatApi _api;
  WebSocketChannel? _socket;
  StreamSubscription<dynamic>? _subscription;

  Future<void> connect({
    required UserProfile user,
    required ChatRoom room,
    required void Function(Map<String, dynamic> event) onEvent,
    required void Function() onDisconnected,
  }) async {
    await close();

    final ticket = await _api.createWebSocketTicket();
    final uri = Uri.parse(wsBaseUrl).replace(
      queryParameters: {
        'ticket': ticket,
        'conversation_id': room.conversationId,
      },
    );
    final socket = WebSocketChannel.connect(uri);
    _socket = socket;
    _subscription = socket.stream.listen(
      (rawEvent) {
        final event = jsonDecode(rawEvent.toString());
        if (event is Map<String, dynamic>) {
          onEvent(event);
        }
      },
      onDone: onDisconnected,
      onError: (_) => onDisconnected(),
    );
  }

  void sendActiveConversation(ChatRoom room) {
    _socket?.sink.add(
      jsonEncode({
        'type': 'active_conversation',
        'conversation_id': room.conversationId,
      }),
    );
  }

  void sendMessage({
    required UserProfile user,
    required ChatRoom room,
    required String text,
  }) {
    _socket?.sink.add(
      jsonEncode({
        'sender': user.displayName,
        'sender_id': user.id,
        'recipient_id': room.recipientId,
        'conversation_id': room.conversationId,
        'text': text,
        'attachment_url': '',
        'attachment_name': '',
        'attachment_type': '',
        'attachment_size': 0,
      }),
    );
  }

  Future<void> close() async {
    await _subscription?.cancel();
    await _socket?.sink.close();
    _subscription = null;
    _socket = null;
  }
}
