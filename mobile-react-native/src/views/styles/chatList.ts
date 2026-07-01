import { StyleSheet } from 'react-native';

export const chatListStyles = StyleSheet.create({
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 18,
  },
  eyebrow: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 8,
  },
  title: {
    color: '#0f172a',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitle: {
    color: '#64748b',
    fontSize: 14,
    marginTop: 6,
  },
  logoutButton: {
    backgroundColor: '#e2e8f0',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  logoutText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
  },
  searchWrap: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  searchInput: {
    backgroundColor: '#ffffff',
    borderColor: '#dbe2ea',
    borderRadius: 16,
    borderWidth: 1,
    color: '#0f172a',
    fontSize: 15,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  contentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
});
