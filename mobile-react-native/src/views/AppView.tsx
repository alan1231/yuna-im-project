import React from 'react';
import {
  ActivityIndicator,
  StatusBar,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { CurrentUser } from '../models/types';
import { AccountScreen } from './screens/AccountScreen';
import { ChatListScreen } from './screens/ChatListScreen';
import { sharedStyles } from './styles/shared';

type AppViewProps = {
  currentUser: CurrentUser | null;
  isRestoringUser: boolean;
  onAuthenticated: (user: CurrentUser) => Promise<void>;
  onLogout: () => Promise<void>;
};

export function AppView({
  currentUser,
  isRestoringUser,
  onAuthenticated,
  onLogout,
}: AppViewProps) {
  const isDarkMode = useColorScheme() === 'dark';

  if (isRestoringUser) {
    return (
      <SafeAreaProvider>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <SafeAreaView style={sharedStyles.safeArea}>
          <View style={sharedStyles.listState}>
            <ActivityIndicator color="#0f766e" />
            <Text style={sharedStyles.listStateText}>恢復登入狀態...</Text>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      {currentUser ? (
        <ChatListScreen user={currentUser} onLogout={onLogout} />
      ) : (
        <AccountScreen onAuthenticated={onAuthenticated} />
      )}
    </SafeAreaProvider>
  );
}
