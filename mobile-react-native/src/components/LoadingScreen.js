import { ActivityIndicator, SafeAreaView, Text } from 'react-native'
import { styles } from '../styles/appStyles'

export function LoadingScreen() {
  return (
    <SafeAreaView style={styles.centerScreen}>
      <ActivityIndicator size="large" color="#245c4f" />
      <Text style={styles.mutedText}>正在載入 Yuna IM</Text>
    </SafeAreaView>
  )
}
