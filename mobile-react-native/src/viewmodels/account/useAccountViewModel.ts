import { useState } from 'react';
import { ApiService } from '../../services/api.service';
import { AccountMode, ApiUser, CurrentUser } from '../../models/types';

export function useAccountViewModel(
  onAuthenticated: (user: CurrentUser) => Promise<void>,
) {
  const [mode, setMode] = useState<AccountMode>('login');
  const [displayName, setDisplayName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showWakeHint, setShowWakeHint] = useState(false);
  const [error, setError] = useState('');

  const normalizedName = displayName.trim();
  const canSubmit = normalizedName.length > 0 && !isSubmitting;

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

  const persistUser = async (user: ApiUser) => {
    await onAuthenticated(ApiService.toCurrentUser(user));
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
          const user = await ApiService.createUser(normalizedName);
          await persistUser(user);
          return;
        }

        const users = await ApiService.fetchUsers();
        const user = users.find(
          item =>
            item.display_name.toLowerCase() === normalizedName.toLowerCase(),
        );

        if (!user) {
          setError('找不到這個帳號，請確認名稱是否正確。');
          return;
        }

        await persistUser(user);
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
    isSubmitting,
    showWakeHint,
    error,
    canSubmit,
    copy,
    switchMode,
    submit,
  };
}
