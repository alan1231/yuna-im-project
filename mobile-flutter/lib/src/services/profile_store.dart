import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../core/config.dart';
import '../models/user_profile.dart';

class ProfileStore {
  const ProfileStore();

  Future<UserProfile?> restore() async {
    final prefs = await SharedPreferences.getInstance();
    final rawProfile = prefs.getString(profileStorageKey);
    if (rawProfile == null) return null;
    return UserProfile.fromJson(jsonDecode(rawProfile) as Map<String, dynamic>);
  }

  Future<void> save(UserProfile profile) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(profileStorageKey, jsonEncode(profile.toJson()));
  }

  Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(profileStorageKey);
  }
}
