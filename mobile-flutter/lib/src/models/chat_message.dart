import '../core/utils.dart';

class ChatMessage {
  const ChatMessage({
    required this.sender,
    required this.senderId,
    required this.recipientId,
    required this.conversationId,
    required this.text,
    required this.sentAt,
    this.attachmentUrl = '',
    this.attachmentName = '',
    this.attachmentType = '',
    this.attachmentSize = 0,
    this.readAt,
  });

  final String sender;
  final String senderId;
  final String recipientId;
  final String conversationId;
  final String text;
  final DateTime sentAt;
  final String attachmentUrl;
  final String attachmentName;
  final String attachmentType;
  final int attachmentSize;
  final DateTime? readAt;

  bool get hasAttachment => attachmentUrl.isNotEmpty;
  bool get hasImageAttachment => attachmentType.startsWith('image/');
  String get attachmentLabel => attachmentName.isEmpty ? '檔案' : attachmentName;

  bool isSelf(String userId) => senderId == userId;

  ChatMessage copyWith({DateTime? readAt}) {
    return ChatMessage(
      sender: sender,
      senderId: senderId,
      recipientId: recipientId,
      conversationId: conversationId,
      text: text,
      sentAt: sentAt,
      attachmentUrl: attachmentUrl,
      attachmentName: attachmentName,
      attachmentType: attachmentType,
      attachmentSize: attachmentSize,
      readAt: readAt ?? this.readAt,
    );
  }

  static ChatMessage fromJson(Map<String, dynamic> json) {
    final rawTime = json['time'] ?? json['sentAt'] ?? json['sent_at'];
    final rawReadAt = json['read_at'] ?? json['readAt'];
    final senderId = json['sender_id']?.toString() ?? '';
    final recipientId = json['recipient_id']?.toString() ?? '';
    final conversationId =
        json['conversation_id']?.toString() ??
        conversationIdFor(senderId, recipientId);

    return ChatMessage(
      sender: json['sender']?.toString() ?? 'Unknown',
      senderId: senderId,
      recipientId: recipientId,
      conversationId: conversationId,
      text: json['text']?.toString() ?? '',
      attachmentUrl:
          json['attachment_url']?.toString() ??
          json['attachmentUrl']?.toString() ??
          json['image_url']?.toString() ??
          '',
      attachmentName:
          json['attachment_name']?.toString() ??
          json['attachmentName']?.toString() ??
          json['image_name']?.toString() ??
          '',
      attachmentType:
          json['attachment_type']?.toString() ??
          json['attachmentType']?.toString() ??
          json['image_type']?.toString() ??
          '',
      attachmentSize:
          _intFromJson(json['attachment_size']) ??
          _intFromJson(json['attachmentSize']) ??
          _intFromJson(json['image_size']) ??
          0,
      sentAt: parseDate(rawTime) ?? DateTime.now(),
      readAt: parseDate(rawReadAt),
    );
  }
}

int? _intFromJson(Object? value) {
  if (value is num) return value.toInt();
  if (value is String) return int.tryParse(value);
  return null;
}
