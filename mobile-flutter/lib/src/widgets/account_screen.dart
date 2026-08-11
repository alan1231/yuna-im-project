import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../view_models/chat_view_model.dart';

class AccountScreen extends ConsumerStatefulWidget {
  const AccountScreen({super.key});

  @override
  ConsumerState<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends ConsumerState<AccountScreen> {
  final TextEditingController _controller = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final viewModel = ref.watch(chatViewModelProvider);

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Spacer(),
              Text(
                'Yuna IM',
                style: Theme.of(
                  context,
                ).textTheme.displaySmall?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 12),
              const Text('輸入顯示名稱來建立或登入聊天帳號。'),
              const SizedBox(height: 28),
              TextField(
                controller: _controller,
                textInputAction: TextInputAction.done,
                decoration: const InputDecoration(
                  labelText: '顯示名稱',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _passwordController,
                obscureText: true,
                textInputAction: TextInputAction.done,
                decoration: const InputDecoration(
                  labelText: '密碼',
                  hintText: '至少 8 個字元',
                  border: OutlineInputBorder(),
                ),
                onSubmitted: (_) => _login(),
              ),
              if (viewModel.error.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text(
                  viewModel.error,
                  style: const TextStyle(color: Colors.red),
                ),
              ],
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: FilledButton(
                      onPressed: viewModel.isSubmittingName ? null : _login,
                      child: const Text('登入'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: viewModel.isSubmittingName ? null : _create,
                      child: const Text('建立'),
                    ),
                  ),
                ],
              ),
              const Spacer(flex: 2),
            ],
          ),
        ),
      ),
    );
  }

  void _login() {
    ref
        .read(chatViewModelProvider)
        .createOrLogin(
          displayName: _controller.text,
          password: _passwordController.text,
          create: false,
        );
  }

  void _create() {
    ref
        .read(chatViewModelProvider)
        .createOrLogin(
          displayName: _controller.text,
          password: _passwordController.text,
          create: true,
        );
  }
}
