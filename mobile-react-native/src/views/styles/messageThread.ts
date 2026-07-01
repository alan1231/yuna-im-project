import { StyleSheet } from 'react-native';

export const messageThreadStyles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    height: 44,
    justifyContent: 'center',
    marginRight: 12,
    width: 44,
  },
  backButtonText: {
    color: '#0f172a',
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 24,
    marginTop: -2,
  },
  titleBlock: {
    flex: 1,
  },
  title: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '800',
  },
  subtitle: {
    color: '#64748b',
    fontSize: 13,
    marginTop: 4,
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  contentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  bubbleRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  bubbleRowSelf: {
    justifyContent: 'flex-end',
  },
  bubble: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    maxWidth: '82%',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleSelf: {
    backgroundColor: '#0f766e',
  },
  sender: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 4,
  },
  text: {
    color: '#0f172a',
    fontSize: 15,
    lineHeight: 21,
  },
  textSelf: {
    color: '#ffffff',
  },
  time: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 6,
  },
  timeSelf: {
    color: 'rgba(255,255,255,0.8)',
  },
  composerBar: {
    alignItems: 'flex-end',
    backgroundColor: '#ffffff',
    borderTopColor: '#e2e8f0',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  composerInput: {
    backgroundColor: '#f8fafc',
    borderColor: '#dbe2ea',
    borderRadius: 16,
    borderWidth: 1,
    color: '#0f172a',
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
    maxHeight: 120,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: '#0f766e',
    borderRadius: 16,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 18,
  },
  sendButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  sendButtonPressed: {
    transform: [{ scale: 0.99 }],
  },
  sendButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
});
