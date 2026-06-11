import React, {useMemo, useState} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';

type AccountMode = 'login' | 'create';

type ApiUser = {
  user_id: string;
  display_name: string;
};

type CurrentUser = {
  id: string;
  displayName: string;
};

const API_URL = Platform.select({
  android: 'http://10.0.2.2:8080',
  default: 'http://localhost:8080',
});

const createLocalUserId = () => {
  const randomPart = Math.random().toString(36).slice(2);
  return `user-${Date.now()}-${randomPart}`;
};

const requestJson = async <T,>(input: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(input, init);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
};

const fetchUsers = () => requestJson<ApiUser[]>(`${API_URL}/users`);

const createUser = (displayName: string) =>
  requestJson<ApiUser>(`${API_URL}/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      user_id: createLocalUserId(),
      display_name: displayName,
    }),
  });

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      {currentUser ? (
        <HomeScreen user={currentUser} onLogout={() => setCurrentUser(null)} />
      ) : (
        <AccountScreen onAuthenticated={setCurrentUser} />
      )}
    </SafeAreaProvider>
  );
}

function AccountScreen({
  onAuthenticated,
}: {
  onAuthenticated: (user: CurrentUser) => void;
}) {
  const [mode, setMode] = useState<AccountMode>('login');
  const [displayName, setDisplayName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showWakeHint, setShowWakeHint] = useState(false);
  const [error, setError] = useState('');
  const normalizedName = displayName.trim();
  const canSubmit = normalizedName.length > 0 && !isSubmitting;

  const copy = useMemo(() => {
    if (mode === 'login') {
      return {
        title: '登入帳號',
        body: '輸入既有顯示名稱，回到你的聊天與行情小幫手。',
        submit: '登入',
      };
    }

    return {
      title: '建立帳號',
      body: '建立顯示名稱，開始使用 Yuna IM。',
      submit: '建立帳號',
    };
  }, [mode]);

  const switchMode = (nextMode: AccountMode) => {
    setMode(nextMode);
    setError('');
    setShowWakeHint(false);
  };

  const persistUser = (user: ApiUser) => {
    onAuthenticated({
      id: user.user_id,
      displayName: user.display_name,
    });
  };

  const submit = async () => {
    if (!canSubmit) return;

    setIsSubmitting(true);
    setShowWakeHint(false);
    setError('');

    const wakeHintTimer = setTimeout(() => {
      setShowWakeHint(true);
    }, 1200);

    try {
      if (mode === 'create') {
        const user = await createUser(normalizedName);
        persistUser(user);
        return;
      }

      const users = await fetchUsers();
      const user = users.find(
        item =>
          item.display_name.toLowerCase() === normalizedName.toLowerCase(),
      );

      if (!user) {
        setError('找不到這個帳號，請確認名稱是否正確。');
        return;
      }

      persistUser(user);
    } catch (requestError) {
      if (
        mode === 'create' &&
        requestError instanceof Error &&
        requestError.message.includes('409')
      ) {
        setError('這個顯示名稱已經被使用。');
        return;
      }

      setError(
        mode === 'login'
          ? '登入失敗，請確認 Go 後端已啟動。'
          : '建立帳號失敗，請確認 Go 後端已啟動。',
      );
    } finally {
      clearTimeout(wakeHintTimer);
      setShowWakeHint(false);
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          <View style={styles.brandMark}>
            <Text style={styles.brandInitial}>Y</Text>
          </View>

          <View style={styles.header}>
            <Text style={styles.eyebrow}>YUNA IM</Text>
            <Text style={styles.title}>{copy.title}</Text>
            <Text style={styles.subtitle}>{copy.body}</Text>
          </View>

          <View style={styles.modeSwitch} accessibilityRole="tablist">
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{selected: mode === 'login'}}
              onPress={() => switchMode('login')}
              style={[
                styles.modeButton,
                mode === 'login' ? styles.modeButtonActive : null,
              ]}>
              <Text
                style={[
                  styles.modeButtonText,
                  mode === 'login' ? styles.modeButtonTextActive : null,
                ]}>
                登入
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{selected: mode === 'create'}}
              onPress={() => switchMode('create')}
              style={[
                styles.modeButton,
                mode === 'create' ? styles.modeButtonActive : null,
              ]}>
              <Text
                style={[
                  styles.modeButtonText,
                  mode === 'create' ? styles.modeButtonTextActive : null,
                ]}>
                註冊
              </Text>
            </Pressable>
          </View>

          <View style={styles.form}>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>顯示名稱</Text>
              <TextInput
                autoCapitalize="none"
                autoComplete="nickname"
                maxLength={32}
                onChangeText={setDisplayName}
                onSubmitEditing={submit}
                placeholder="輸入你的顯示名稱"
                placeholderTextColor="#9ca3af"
                returnKeyType="done"
                style={styles.input}
                value={displayName}
              />
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {!error && showWakeHint ? (
              <Text style={styles.infoText}>後端正在喚醒，請稍候。</Text>
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={!canSubmit}
              onPress={submit}
              style={({pressed}) => [
                styles.submitButton,
                !canSubmit ? styles.submitButtonDisabled : null,
                pressed && canSubmit ? styles.submitButtonPressed : null,
              ]}>
              {isSubmitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.submitButtonText}>{copy.submit}</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function HomeScreen({
  user,
  onLogout,
}: {
  user: CurrentUser;
  onLogout: () => void;
}) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.homeContent}>
        <View style={styles.brandMarkSmall}>
          <Text style={styles.brandInitialSmall}>Y</Text>
        </View>
        <Text style={styles.homeTitle}>歡迎回來</Text>
        <Text style={styles.homeName}>{user.displayName}</Text>
        <Text style={styles.homeCopy}>登入成功，下一步可以接聊天室列表。</Text>
        <Pressable
          accessibilityRole="button"
          onPress={onLogout}
          style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>登出</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f6f7fb',
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  brandMark: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#0f766e',
    borderRadius: 18,
    height: 72,
    justifyContent: 'center',
    marginBottom: 26,
    shadowColor: '#0f172a',
    shadowOffset: {width: 0, height: 12},
    shadowOpacity: 0.14,
    shadowRadius: 18,
    width: 72,
  },
  brandInitial: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '800',
  },
  header: {
    alignItems: 'center',
    marginBottom: 26,
  },
  eyebrow: {
    color: '#0f766e',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 10,
  },
  title: {
    color: '#111827',
    fontSize: 34,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    color: '#64748b',
    fontSize: 16,
    lineHeight: 23,
    marginTop: 10,
    textAlign: 'center',
  },
  modeSwitch: {
    backgroundColor: '#e6ebf2',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 4,
    marginBottom: 24,
    padding: 4,
  },
  modeButton: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
  },
  modeButtonActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#0f172a',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  modeButtonText: {
    color: '#64748b',
    fontSize: 15,
    fontWeight: '800',
  },
  modeButtonTextActive: {
    color: '#0f766e',
  },
  form: {
    gap: 16,
  },
  fieldGroup: {
    gap: 8,
  },
  label: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '700',
  },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#d7dee8',
    borderRadius: 8,
    borderWidth: 1,
    color: '#111827',
    fontSize: 16,
    minHeight: 54,
    paddingHorizontal: 16,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  infoText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  submitButton: {
    alignItems: 'center',
    backgroundColor: '#0f766e',
    borderRadius: 8,
    justifyContent: 'center',
    marginTop: 6,
    minHeight: 54,
  },
  submitButtonDisabled: {
    backgroundColor: '#8cc4bd',
  },
  submitButtonPressed: {
    backgroundColor: '#115e59',
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
  },
  homeContent: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  brandMarkSmall: {
    alignItems: 'center',
    backgroundColor: '#0f766e',
    borderRadius: 14,
    height: 56,
    justifyContent: 'center',
    marginBottom: 22,
    width: 56,
  },
  brandInitialSmall: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '800',
  },
  homeTitle: {
    color: '#111827',
    fontSize: 28,
    fontWeight: '800',
  },
  homeName: {
    color: '#0f766e',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 8,
  },
  homeCopy: {
    color: '#64748b',
    fontSize: 16,
    lineHeight: 23,
    marginTop: 12,
    textAlign: 'center',
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#0f766e',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 28,
    minHeight: 48,
    paddingHorizontal: 32,
  },
  secondaryButtonText: {
    color: '#0f766e',
    fontSize: 16,
    fontWeight: '800',
  },
});

export default App;
