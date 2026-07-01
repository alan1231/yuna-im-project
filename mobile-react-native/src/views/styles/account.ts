import { StyleSheet } from 'react-native';

export const accountStyles = StyleSheet.create({
  keyboardView: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  brandMark: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#0f766e',
    borderRadius: 18,
    height: 72,
    justifyContent: 'center',
    marginBottom: 26,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    width: 72,
  },
  brandInitial: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 1,
  },
  header: {
    marginBottom: 28,
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
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginBottom: 10,
  },
  subtitle: {
    color: '#475569',
    fontSize: 15,
    lineHeight: 22,
  },
  modeSwitch: {
    backgroundColor: '#e2e8f0',
    borderRadius: 18,
    flexDirection: 'row',
    padding: 4,
    marginBottom: 20,
  },
  modeButton: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 14,
    paddingVertical: 12,
  },
  modeButtonActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  modeButtonText: {
    color: '#475569',
    fontSize: 15,
    fontWeight: '700',
  },
  modeButtonTextActive: {
    color: '#0f172a',
  },
  form: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  label: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderColor: '#cbd5e1',
    borderRadius: 16,
    borderWidth: 1,
    color: '#0f172a',
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 13,
    marginBottom: 10,
  },
  infoText: {
    color: '#0f766e',
    fontSize: 13,
    marginBottom: 10,
  },
  submitButton: {
    alignItems: 'center',
    backgroundColor: '#0f766e',
    borderRadius: 16,
    paddingVertical: 14,
  },
  submitButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  submitButtonPressed: {
    transform: [{ scale: 0.99 }],
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
});
