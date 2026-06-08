class ChatRoom {
  const ChatRoom({
    required this.id,
    required this.name,
    required this.recipientId,
    required this.conversationId,
    this.memberIds = const [],
    this.lastMessage = '',
    this.lastMessageAt,
    this.lastMessageIsSelf = false,
    this.lastMessageReadAt,
    this.unreadCount = 0,
    this.isFriend = false,
    this.isGroup = false,
    this.online = false,
    this.lastSeen,
  });

  final String id;
  final String name;
  final String recipientId;
  final String conversationId;
  final List<String> memberIds;
  final String lastMessage;
  final DateTime? lastMessageAt;
  final bool lastMessageIsSelf;
  final DateTime? lastMessageReadAt;
  final int unreadCount;
  final bool isFriend;
  final bool isGroup;
  final bool online;
  final DateTime? lastSeen;

  ChatRoom copyWith({
    String? name,
    String? lastMessage,
    DateTime? lastMessageAt,
    bool? lastMessageIsSelf,
    DateTime? lastMessageReadAt,
    int? unreadCount,
    bool? isFriend,
    bool? isGroup,
    bool? online,
    DateTime? lastSeen,
    List<String>? memberIds,
  }) {
    return ChatRoom(
      id: id,
      name: name ?? this.name,
      recipientId: recipientId,
      conversationId: conversationId,
      memberIds: memberIds ?? this.memberIds,
      lastMessage: lastMessage ?? this.lastMessage,
      lastMessageAt: lastMessageAt ?? this.lastMessageAt,
      lastMessageIsSelf: lastMessageIsSelf ?? this.lastMessageIsSelf,
      lastMessageReadAt: lastMessageReadAt ?? this.lastMessageReadAt,
      unreadCount: unreadCount ?? this.unreadCount,
      isFriend: isFriend ?? this.isFriend,
      isGroup: isGroup ?? this.isGroup,
      online: online ?? this.online,
      lastSeen: lastSeen ?? this.lastSeen,
    );
  }
}
