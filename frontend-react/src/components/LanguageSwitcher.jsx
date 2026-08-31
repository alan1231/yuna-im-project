import { useTranslation } from 'react-i18next'

const LOCALES = [
  { label: 'ZH', value: 'zh-TW' },
  { label: 'EN', value: 'en' },
]

export default function LanguageSwitcher() {
  const { i18n } = useTranslation()

  const switchLanguage = (language) => {
    i18n.changeLanguage(language)
    document.documentElement.lang = language
    window.localStorage.setItem('yuna-im-locale', language)
  }

  return (
    <div className="language-switcher" aria-label="Language selector">
      {LOCALES.map((locale) => (
        <button
          key={locale.value}
          type="button"
          className={i18n.language === locale.value ? 'language-switcher-active' : ''}
          aria-pressed={i18n.language === locale.value}
          onClick={() => switchLanguage(locale.value)}
        >
          {locale.label}
        </button>
      ))}
    </div>
  )
}
