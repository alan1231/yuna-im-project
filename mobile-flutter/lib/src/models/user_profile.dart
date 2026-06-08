class UserProfile {
  const UserProfile({required this.id, required this.displayName});

  final String id;
  final String displayName;

  Map<String, dynamic> toJson() => {'id': id, 'display_name': displayName};

  static UserProfile? fromJson(Map<String, dynamic>? json) {
    if (json == null) return null;
    final id = json['id']?.toString() ?? '';
    final displayName = json['display_name']?.toString() ?? '';
    if (id.isEmpty || displayName.isEmpty) return null;
    return UserProfile(id: id, displayName: displayName);
  }
}

class ApiUser {
  const ApiUser({
    required this.id,
    required this.displayName,
    this.online = false,
    this.lastSeen,
  });

  final String id;
  final String displayName;
  final bool online;
  final DateTime? lastSeen;

  static ApiUser fromJson(Map<String, dynamic> json) {
    return ApiUser(
      id: json['user_id']?.toString() ?? '',
      displayName: json['display_name']?.toString() ?? '',
      online: json['online'] == true,
      lastSeen: DateTime.tryParse(
        json['last_seen']?.toString() ?? '',
      )?.toLocal(),
    );
  }
}
