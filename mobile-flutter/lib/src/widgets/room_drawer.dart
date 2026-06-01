import 'package:flutter/material.dart';

import '../view_models/chat_view_model.dart';

class RoomDrawer extends StatelessWidget {
  const RoomDrawer({required this.viewModel, super.key});

  final ChatViewModel viewModel;

  @override
  Widget build(BuildContext context) {
    final user = viewModel.user!;
    final colorScheme = Theme.of(context).colorScheme;

    return Drawer(
      child: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 24,
                    backgroundColor: colorScheme.primaryContainer,
                    foregroundColor: colorScheme.onPrimaryContainer,
                    child: Text(user.displayName.characters.first),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          user.displayName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.titleMedium
                              ?.copyWith(fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(height: 3),
                        Row(
                          children: [
                            Icon(
                              viewModel.isConnected
                                  ? Icons.circle
                                  : Icons.circle_outlined,
                              size: 10,
                              color: viewModel.isConnected
                                  ? Colors.green.shade600
                                  : colorScheme.outline,
                            ),
                            const SizedBox(width: 6),
                            Text(
                              viewModel.isConnected ? '即時連線中' : '重新連線中',
                              style: Theme.of(context).textTheme.bodySmall
                                  ?.copyWith(
                                    color: colorScheme.onSurfaceVariant,
                                  ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const Divider(height: 1),
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.symmetric(vertical: 8),
                itemCount: viewModel.rooms.length,
                itemBuilder: (context, index) {
                  final room = viewModel.rooms[index];
                  final selected = room.id == viewModel.activeRoom?.id;
                  return Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 2,
                    ),
                    child: ListTile(
                      selected: selected,
                      selectedTileColor: colorScheme.primaryContainer
                          .withValues(alpha: 0.56),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      leading: CircleAvatar(
                        backgroundColor: selected
                            ? colorScheme.primary
                            : colorScheme.surfaceContainerHighest,
                        foregroundColor: selected
                            ? colorScheme.onPrimary
                            : colorScheme.onSurfaceVariant,
                        child: Text(room.name.characters.first),
                      ),
                      title: Text(
                        room.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      subtitle: Text(
                        room.lastMessage.isEmpty ? '尚無訊息' : room.lastMessage,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      trailing: room.unreadCount > 0
                          ? Badge(label: Text('${room.unreadCount}'))
                          : null,
                      onTap: () {
                        Navigator.of(context).pop();
                        viewModel.selectRoom(room);
                      },
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
