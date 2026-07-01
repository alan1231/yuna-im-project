import { StyleSheet } from 'react-native';

export const conversationRowStyles = StyleSheet.create({
  row: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 20,
    flexDirection: 'row',
    marginBottom: 12,
    padding: 14,
  },
  rowPressed: {
    transform: [{ scale: 0.995 }],
    opacity: 0.96,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#dbeafe',
    borderRadius: 18,
    height: 52,
    justifyContent: 'center',
    marginRight: 14,
    width: 52,
  },
  avatarText: {
    color: '#1d4ed8',
    fontSize: 18,
    fontWeight: '800',
  },
  body: {
    flex: 1,
  },
  topLine: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  name: {
    color: '#0f172a',
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    marginRight: 12,
  },
  time: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
  },
  bottomLine: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  preview: {
    color: '#475569',
    flex: 1,
    fontSize: 14,
    marginRight: 10,
  },
  kind: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '700',
  },
  unreadBadge: {
    alignItems: 'center',
    backgroundColor: '#dc2626',
    borderRadius: 999,
    justifyContent: 'center',
    minWidth: 24,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  unreadBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
});
