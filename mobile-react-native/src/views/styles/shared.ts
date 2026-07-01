import { StyleSheet } from 'react-native';

export const sharedStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f6f7fb',
  },
  listState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  listStateText: {
    color: '#475569',
    fontSize: 14,
    marginTop: 12,
  },
  inlineBanner: {
    alignItems: 'center',
    backgroundColor: '#fff7ed',
    borderColor: '#fdba74',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginBottom: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inlineBannerText: {
    color: '#9a3412',
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    paddingRight: 12,
  },
  inlineBannerButton: {
    backgroundColor: '#fed7aa',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inlineBannerButtonText: {
    color: '#9a3412',
    fontSize: 12,
    fontWeight: '800',
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 22,
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  emptyStateTitle: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  emptyStateText: {
    color: '#64748b',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
});
