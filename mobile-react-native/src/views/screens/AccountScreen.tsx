import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CurrentUser } from '../../models/types';
import { useAccountViewModel } from '../../viewmodels/account/useAccountViewModel';
import { accountStyles } from '../styles/account';
import { sharedStyles } from '../styles/shared';

export function AccountScreen({
  onAuthenticated,
}: {
  onAuthenticated: (user: CurrentUser) => Promise<void>;
}) {
  const vm = useAccountViewModel(onAuthenticated);

  return (
    <SafeAreaView style={sharedStyles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={accountStyles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={accountStyles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={accountStyles.brandMark}>
            <Text style={accountStyles.brandInitial}>Y</Text>
          </View>

          <View style={accountStyles.header}>
            <Text style={accountStyles.eyebrow}>YUNA IM</Text>
            <Text style={accountStyles.title}>{vm.copy.title}</Text>
            <Text style={accountStyles.subtitle}>{vm.copy.body}</Text>
          </View>

          <View style={accountStyles.modeSwitch} accessibilityRole="tablist">
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: vm.mode === 'login' }}
              onPress={() => vm.switchMode('login')}
              style={[
                accountStyles.modeButton,
                vm.mode === 'login' ? accountStyles.modeButtonActive : null,
              ]}
            >
              <Text
                style={[
                  accountStyles.modeButtonText,
                  vm.mode === 'login' ? accountStyles.modeButtonTextActive : null,
                ]}
              >
                登入
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: vm.mode === 'create' }}
              onPress={() => vm.switchMode('create')}
              style={[
                accountStyles.modeButton,
                vm.mode === 'create' ? accountStyles.modeButtonActive : null,
              ]}
            >
              <Text
                style={[
                  accountStyles.modeButtonText,
                  vm.mode === 'create' ? accountStyles.modeButtonTextActive : null,
                ]}
              >
                註冊
              </Text>
            </Pressable>
          </View>

          <View style={accountStyles.form}>
            <View style={accountStyles.fieldGroup}>
              <Text style={accountStyles.label}>顯示名稱</Text>
              <TextInput
                autoCapitalize="none"
                autoComplete="nickname"
                maxLength={32}
                onChangeText={vm.setDisplayName}
                onSubmitEditing={vm.submit}
                placeholder="輸入你的顯示名稱"
                placeholderTextColor="#9ca3af"
                returnKeyType="done"
                style={accountStyles.input}
                value={vm.displayName}
              />
            </View>

            <View style={accountStyles.fieldGroup}>
              <Text style={accountStyles.label}>密碼</Text>
              <TextInput
                autoCapitalize="none"
                autoComplete={vm.mode === 'login' ? 'current-password' : 'new-password'}
                maxLength={72}
                onChangeText={vm.setPassword}
                onSubmitEditing={vm.submit}
                placeholder="至少 8 個字元"
                placeholderTextColor="#9ca3af"
                returnKeyType="done"
                secureTextEntry
                style={accountStyles.input}
                value={vm.password}
              />
            </View>

            {vm.error ? <Text style={accountStyles.errorText}>{vm.error}</Text> : null}
            {!vm.error && vm.showWakeHint ? (
              <Text style={accountStyles.infoText}>後端正在喚醒，請稍候。</Text>
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={!vm.canSubmit}
              onPress={vm.submit}
              style={({ pressed }) => [
                accountStyles.submitButton,
                !vm.canSubmit ? accountStyles.submitButtonDisabled : null,
                pressed && vm.canSubmit ? accountStyles.submitButtonPressed : null,
              ]}
            >
              {vm.isSubmitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={accountStyles.submitButtonText}>{vm.copy.submit}</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
