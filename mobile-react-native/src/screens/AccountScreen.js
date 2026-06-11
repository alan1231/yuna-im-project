import { useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { styles } from '../styles/appStyles'

export function AccountScreen({ error, isSubmitting, onSubmit }) {
  const [displayName, setDisplayName] = useState('')
  const [mode, setMode] = useState('login')
  const submit = () => onSubmit(displayName, mode === 'create')

  return (
    <View style={styles.accountScreen}>
      <View style={styles.accountEntry}>
        <View style={styles.accountBrand}>
          <Text style={styles.brandEyebrow}>REAL-TIME CHAT</Text>
          <Text style={styles.brandTitle}>Yuna IM</Text>
          <Text style={styles.brandCopy}>即時聊天、好友對話與行情小幫手。</Text>
          <View style={styles.featureList}>
            <Text style={styles.featurePill}>聊天</Text>
            <Text style={styles.featurePill}>行情</Text>
            <Text style={styles.featurePill}>即時</Text>
          </View>
        </View>
        <View style={styles.accountPanel}>
          <View style={styles.accountPanelHeading}>
            <Text style={styles.panelKicker}>START</Text>
            <Text style={styles.panelTitle}>
              {mode === 'login' ? '登入帳號' : '建立帳號'}
            </Text>
            <Text style={styles.accountCopy}>
              {mode === 'login'
                ? '用你的顯示名稱回到聊天室。'
                : '建立一個 demo 使用者開始聊天。'}
            </Text>
          </View>

          <View style={styles.modeSwitch}>
            <Pressable
              onPress={() => setMode('login')}
              style={[styles.modeButton, mode === 'login' && styles.activeModeButton]}
            >
              <Text
                style={[
                  styles.modeButtonText,
                  mode === 'login' && styles.activeModeButtonText,
                ]}
              >
                登入
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setMode('create')}
              style={[styles.modeButton, mode === 'create' && styles.activeModeButton]}
            >
              <Text
                style={[
                  styles.modeButtonText,
                  mode === 'create' && styles.activeModeButtonText,
                ]}
              >
                建立
              </Text>
            </Pressable>
          </View>

          <Text style={styles.fieldLabel}>顯示名稱</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isSubmitting}
            maxLength={32}
            onChangeText={setDisplayName}
            placeholder="輸入顯示名稱"
            placeholderTextColor="#8b95a1"
            style={styles.input}
            value={displayName}
          />
          {error ? <Text style={styles.accountMessageError}>{error}</Text> : null}
          <Pressable
            disabled={isSubmitting || !displayName.trim()}
            onPress={submit}
            style={[
              styles.accountSubmit,
              (isSubmitting || !displayName.trim()) && styles.accountSubmitDisabled,
            ]}
          >
            <Text
              style={[
                styles.accountSubmitText,
                (isSubmitting || !displayName.trim()) &&
                styles.accountSubmitDisabledText,
              ]}
            >
              {isSubmitting
                ? '處理中'
                : mode === 'login'
                  ? '登入'
                  : '建立帳號'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}
