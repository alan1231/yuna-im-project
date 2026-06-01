import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../view_models/chat_view_model.dart';
import '../widgets/account_screen.dart';
import '../widgets/chat_composer.dart';
import '../widgets/message_list.dart';
import '../widgets/room_drawer.dart';
import '../widgets/skeletons.dart';

class ChatShell extends ConsumerWidget {
  const ChatShell({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final viewModel = ref.watch(chatViewModelProvider);

    if (viewModel.isRestoring) {
      return const Scaffold(body: ChatShellSkeleton());
    }

    if (viewModel.user == null) {
      return const AccountScreen();
    }

    final colorScheme = Theme.of(context).colorScheme;
    final activeRoom = viewModel.activeRoom;

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Row(
          children: [
            CircleAvatar(
              radius: 18,
              backgroundColor: colorScheme.primaryContainer,
              foregroundColor: colorScheme.onPrimaryContainer,
              child: Text((activeRoom?.name ?? 'Y').characters.first),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    activeRoom?.name ?? 'Yuna IM',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Text(
                    viewModel.isConnected ? '即時同步' : '連線中斷',
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: '登出',
            onPressed: viewModel.logout,
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      drawer: RoomDrawer(viewModel: viewModel),
      body: ColoredBox(
        color: colorScheme.surfaceContainerLowest,
        child: Column(
          children: [
            if (viewModel.error.isNotEmpty)
              MaterialBanner(
                content: Text(viewModel.error),
                actions: [
                  TextButton(
                    onPressed: viewModel.dismissError,
                    child: const Text('關閉'),
                  ),
                ],
              ),
            Expanded(
              child: viewModel.isLoadingChat
                  ? const MessageListSkeleton()
                  : MessageList(
                      user: viewModel.user!,
                      messages: viewModel.activeMessages,
                    ),
            ),
            ChatComposer(
              enabled: viewModel.isConnected,
              activeRoom: viewModel.activeRoom,
              onSend: viewModel.sendMessage,
            ),
          ],
        ),
      ),
    );
  }
}
