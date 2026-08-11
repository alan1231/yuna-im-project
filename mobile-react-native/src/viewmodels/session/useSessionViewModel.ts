import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CurrentUser } from '../../models/types';
import { ApiService } from '../../services/api.service';

const CURRENT_USER_STORAGE_KEY = 'yuna-im-current-user';

export function useSessionViewModel() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isRestoringUser, setIsRestoringUser] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const restoreUser = async () => {
      try {
        const rawUser = await AsyncStorage.getItem(CURRENT_USER_STORAGE_KEY);
        if (!rawUser) return;

        const storedUser = JSON.parse(rawUser) as CurrentUser;
        if (!storedUser.id || !storedUser.displayName || !storedUser.token) {
          await AsyncStorage.removeItem(CURRENT_USER_STORAGE_KEY);
          return;
        }
        ApiService.setAuthToken(storedUser.token);
        const user = await ApiService.fetchCurrentUser();
        if (!isMounted) return;
        setCurrentUser(ApiService.toCurrentUser(user, storedUser.token));
      } catch (restoreError) {
        console.error('User restore failed:', restoreError);
        await AsyncStorage.removeItem(CURRENT_USER_STORAGE_KEY);
      } finally {
        if (isMounted) {
          setIsRestoringUser(false);
        }
      }
    };

    restoreUser();

    return () => {
      isMounted = false;
    };
  }, []);

  const persistCurrentUser = async (user: CurrentUser) => {
    ApiService.setAuthToken(user.token);
    await AsyncStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(user));
    setCurrentUser(user);
  };

  const logout = async () => {
    try {
      await ApiService.logout();
    } catch (logoutError) {
      console.warn('Server logout failed:', logoutError);
    }
    ApiService.setAuthToken('');
    await AsyncStorage.removeItem(CURRENT_USER_STORAGE_KEY);
    setCurrentUser(null);
  };

  return {
    currentUser,
    isRestoringUser,
    persistCurrentUser,
    logout,
  };
}
