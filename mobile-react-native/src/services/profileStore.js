import AsyncStorage from '@react-native-async-storage/async-storage'
import { profileStorageKey } from '../config/runtime'

export async function restoreProfile() {
  const rawProfile = await AsyncStorage.getItem(profileStorageKey)
  return rawProfile ? JSON.parse(rawProfile) : null
}

export async function saveProfile(profile) {
  await AsyncStorage.setItem(profileStorageKey, JSON.stringify(profile))
}

export async function clearProfile() {
  await AsyncStorage.removeItem(profileStorageKey)
}
