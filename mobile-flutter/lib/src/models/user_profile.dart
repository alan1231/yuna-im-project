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
