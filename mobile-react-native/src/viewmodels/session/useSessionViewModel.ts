import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CurrentUser } from '../../models/types';

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
        if (storedUser.id && storedUser.displayName && isMounted) {
          setCurrentUser(storedUser);
        }
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
    await AsyncStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(user));
    setCurrentUser(user);
  };

  const logout = async () => {
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
