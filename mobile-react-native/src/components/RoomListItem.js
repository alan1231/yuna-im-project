import { Pressable, Text, View } from 'react-native'
import { styles } from '../styles/appStyles'
import { initials } from '../utils/chatViewHelpers'

export function RoomListItem({
  actionLabel,
  actionTone = 'default',
  actionVariant = 'text',
  isActive,
  name,
  online,
  onPress,
  onSecondaryAction,
  preview,
  time,
  unreadCount,
  variant = 'default',
}) {
  return (
    <View
      style={[
        variant === 'drawer' ? styles.drawerRoomRow : styles.roomRow,
        isActive && styles.roomItemActive,
      ]}
    >
      <Pressable
        onPress={onPress}
        style={[
          variant === 'drawer' ? styles.drawerRoomItem : styles.roomItem,
          onSecondaryAction && styles.roomItemWithAction,
        ]}
      >
        <View style={variant === 'drawer' ? styles.drawerRoomAvatar : styles.roomAvatar}>
          <Text
            style={variant === 'drawer' ? styles.drawerRoomAvatarText : styles.roomAvatarText}
          >
            {initials(name)}
          </Text>
          {online ? <View style={styles.roomOnlineDot} /> : null}
        </View>
        <View style={styles.roomContent}>
          <View style={styles.roomTopline}>
            <Text numberOfLines={1} style={styles.roomName}>
              {name}
            </Text>
            {time ? <Text style={styles.roomTime}>{time}</Text> : null}
          </View>
          <View style={styles.roomBottomline}>
            <Text numberOfLines={1} style={styles.roomPreview}>
              {preview}
            </Text>
            {unreadCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
      {onSecondaryAction ? (
        <Pressable
          onPress={onSecondaryAction}
          style={[
            actionVariant === 'filled'
              ? styles.roomActionButtonFilled
              : styles.roomActionButton,
            actionTone === 'danger' && styles.roomActionButtonDanger,
          ]}
        >
          <Text
            style={[
              actionVariant === 'filled'
                ? styles.roomActionButtonFilledText
                : styles.roomActionButtonText,
              actionTone === 'danger' && styles.roomActionButtonDangerText,
            ]}
          >
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}
