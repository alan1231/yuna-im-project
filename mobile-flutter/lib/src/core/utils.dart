import 'dart:math';

String conversationIdFor(String userA, String userB) {
  final ids = [userA.trim(), userB.trim()]..sort();
  return 'dm:${ids[0]}:${ids[1]}';
}

String createLocalUserId() {
  final random = Random().nextInt(1 << 32).toRadixString(36);
  return 'mobile-${DateTime.now().millisecondsSinceEpoch}-$random';
}

DateTime? parseDate(dynamic value) {
  if (value == null) return null;
  final text = value.toString();
  if (text.isEmpty || text == '<nil>') return null;
  return DateTime.tryParse(text)?.toLocal();
}

String formatTime(DateTime date) {
  final hour = date.hour.toString().padLeft(2, '0');
  final minute = date.minute.toString().padLeft(2, '0');
  return '$hour:$minute';
}
