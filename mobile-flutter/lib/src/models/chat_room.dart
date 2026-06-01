class ChatRoom {
  const ChatRoom({
    required this.id,
    required this.name,
    required this.recipientId,
    required this.conversationId,
    this.lastMessage = '',
    this.unreadCount = 0,
    this.isFriend = false,
  });

  final String id;
  final String name;
  final String recipientId;
  final String conversationId;
  final String lastMessage;
  final int unreadCount;
  final bool isFriend;

  ChatRoom copyWith({
    String? name,
    String? lastMessage,
    int? unreadCount,
    bool? isFriend,
  }) {
    return ChatRoom(
      id: id,
      name: name ?? this.name,
      recipientId: recipientId,
      conversationId: conversationId,
      lastMessage: lastMessage ?? this.lastMessage,
      unreadCount: unreadCount ?? this.unreadCount,
      isFriend: isFriend ?? this.isFriend,
    );
  }
}
