import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

const resources = {
  'zh-TW': {
    translation: {
      account: {
        eyebrow: 'Account',
        title: {
          login: '登入帳號',
          create: '建立你的帳號',
        },
        copy: {
          login: '輸入既有顯示名稱，回到你的聊天與股票機器人。',
          create: '輸入一個尚未使用的顯示名稱後，就可以開始聊天。',
        },
        modeLabel: '帳號模式',
        login: '登入',
        create: '建立',
        displayName: '顯示名稱',
        placeholder: '例如 Yuna',
        wakeHint: '免費雲端服務正在喚醒，第一次連線可能需要稍等。',
        submitting: '處理中',
        submitCreate: '建立帳號',
        errors: {
          duplicateName: '這個顯示名稱已被使用，請換一個名稱。',
          createFailed: '建立帳號失敗，請確認 Go 後端已啟動。',
          loginNotFound: '找不到這個帳號，請確認名稱是否正確。',
          loginFailed: '登入失敗，請確認 Go 後端已啟動。',
        },
      },
    },
  },
  en: {
    translation: {
      account: {
        eyebrow: 'Account',
        title: {
          login: 'Sign in',
          create: 'Create your account',
        },
        copy: {
          login: 'Enter an existing display name to return to chat and the stock bot.',
          create: 'Enter an unused display name to start chatting.',
        },
        modeLabel: 'Account mode',
        login: 'Sign in',
        create: 'Create',
        displayName: 'Display name',
        placeholder: 'For example, Yuna',
        wakeHint: 'The free cloud service is waking up. The first connection may take a moment.',
        submitting: 'Working',
        submitCreate: 'Create account',
        errors: {
          duplicateName: 'This display name is already in use. Please choose another name.',
          createFailed: 'Account creation failed. Confirm the Go backend is running.',
          loginNotFound: 'No account was found for this name.',
          loginFailed: 'Sign in failed. Confirm the Go backend is running.',
        },
      },
    },
  },
}

i18n.use(initReactI18next).init({
  resources,
  lng: window.localStorage.getItem('yuna-im-locale') || 'zh-TW',
  fallbackLng: 'zh-TW',
  interpolation: {
    escapeValue: false,
  },
})

export default i18n
