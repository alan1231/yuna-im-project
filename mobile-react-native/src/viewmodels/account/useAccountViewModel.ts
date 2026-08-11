import { useState } from 'react';
import { ApiService } from '../../services/api.service';
import { AccountMode, CurrentUser } from '../../models/types';

const utf8ByteLength = (value: string) =>
  Array.from(value).reduce((total, character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return total + (codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4);
  }, 0);

export function useAccountViewModel(
  onAuthenticated: (user: CurrentUser) => Promise<void>,
) {
  const [mode, setMode] = useState<AccountMode>('login');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showWakeHint, setShowWakeHint] = useState(false);
  const [error, setError] = useState('');

  const normalizedName = displayName.trim();
  const passwordBytes = utf8ByteLength(password);
  const canSubmit = normalizedName.length > 0 && passwordBytes >= 8 && passwordBytes <= 72 && !isSubmitting;

  const copy =
    mode === 'login'
      ? {
          title: '登入帳號',
          body: '輸入既有顯示名稱，回到你的聊天。',
          submit: '登入',
        }
      : {
          title: '建立帳號',
          body: '建立顯示名稱，開始使用 Yuna IM。',
          submit: '建立帳號',
        };

  const switchMode = (nextMode: AccountMode) => {
    setMode(nextMode);
    setError('');
    setShowWakeHint(false);
  };

  const persistUser = async (response: { token: string; user: { user_id: string; display_name: string } }) => {
    ApiService.setAuthToken(response.token);
    await onAuthenticated(ApiService.toCurrentUser(response.user, response.token));
  };

  const runWithBackendWake = async (action: () => Promise<void>) => {
    setIsSubmitting(true);
    setShowWakeHint(false);
    setError('');

    const wakeHintTimer = setTimeout(() => {
      setShowWakeHint(true);
    }, 1200);

    try {
      await ApiService.wakeBackend();
      await action();
    } finally {
      clearTimeout(wakeHintTimer);
      setShowWakeHint(false);
      setIsSubmitting(false);
    }
  };

  const submit = async () => {
    if (!canSubmit) return;

    try {
      await runWithBackendWake(async () => {
        if (mode === 'create') {
          await persistUser(await ApiService.register(normalizedName, password));
          return;
        }

        await persistUser(await ApiService.login(normalizedName, password));
      });
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
          ? '登入失敗，請確認雲端服務可連線。'
          : '建立帳號失敗，請確認雲端服務可連線。',
      );
    }
  };

  return {
    mode,
    displayName,
    setDisplayName,
    password,
    setPassword,
    isSubmitting,
    showWakeHint,
    error,
    canSubmit,
    copy,
    switchMode,
    submit,
  };
}
