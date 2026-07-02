import 'package:flutter/material.dart';

import '../models/chat_room.dart';
import '../models/user_profile.dart';
import '../view_models/chat_view_model.dart';

class RoomDrawer extends StatefulWidget {
  const RoomDrawer({required this.viewModel, super.key});

  final ChatViewModel viewModel;

  @override
  State<RoomDrawer> createState() => _RoomDrawerState();
}

class _RoomDrawerState extends State<RoomDrawer> {
  final TextEditingController _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final user = widget.viewModel.user!;
    final colorScheme = Theme.of(context).colorScheme;
    final searchText = _searchController.text.trim().toLowerCase();
    final rooms = widget.viewModel.rooms.where((room) {
      if (searchText.isEmpty) return true;
      return '${room.name} ${room.lastMessage}'.toLowerCase().contains(
        searchText,
      );
    }).toList();
    final roomRecipientIds = widget.viewModel.rooms
        .map((room) => room.recipientId)
        .toSet();
    final users = searchText.isEmpty
        ? const <ApiUser>[]
        : widget.viewModel.availableUsers.where((apiUser) {
            if (apiUser.id == user.id ||
                roomRecipientIds.contains(apiUser.id)) {
              return false;
            }
            return apiUser.displayName.toLowerCase().contains(searchText);
          }).toList();

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
                    child: Text(_initial(user.displayName)),
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
                              widget.viewModel.isConnected
                                  ? Icons.circle
                                  : Icons.circle_outlined,
                              size: 10,
                              color: widget.viewModel.isConnected
                                  ? Colors.green.shade600
                                  : colorScheme.outline,
                            ),
                            const SizedBox(width: 6),
                            Text(
                              widget.viewModel.isConnected ? '即時連線中' : '重新連線中',
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
                  IconButton(
                    tooltip: '登出',
                    onPressed: widget.viewModel.logout,
                    icon: const Icon(Icons.logout),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 2, 16, 10),
              child: SearchBar(
                controller: _searchController,
                hintText: '搜尋聊天室或使用者',
                leading: const Icon(Icons.search),
                trailing: [
                  if (_searchController.text.isNotEmpty)
                    IconButton(
                      tooltip: '清除',
                      onPressed: () {
                        _searchController.clear();
                        setState(() {});
                      },
                      icon: const Icon(Icons.close),
                    ),
                ],
                onChanged: (_) => setState(() {}),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(
                children: [
                  Expanded(
                    child: FilledButton.tonalIcon(
                      onPressed: () => _showAddFriendDialog(context),
                      icon: const Icon(Icons.person_add_alt_1),
                      label: const Text('加好友'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: FilledButton.tonalIcon(
                      onPressed: () => _showCreateGroupDialog(context),
                      icon: const Icon(Icons.group_add),
                      label: const Text('建群'),
                    ),
                  ),
                ],
              ),
            ),
            const Divider(height: 18),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(10, 0, 10, 12),
                children: [
                  for (final room in rooms)
                    _RoomTile(room: room, viewModel: widget.viewModel),
                  for (final apiUser in users)
                    _UserSearchTile(
                      user: apiUser,
                      onTap: () {
                        Navigator.of(context).pop();
                        widget.viewModel.startChatWithUser(apiUser);
                      },
                    ),
                  if (rooms.isEmpty && users.isEmpty)
                    Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(
                        '找不到聊天室或使用者',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: colorScheme.onSurfaceVariant),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _showAddFriendDialog(BuildContext context) async {
    final controller = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('新增好友'),
          content: TextField(
            controller: controller,
            autofocus: true,
            maxLength: 32,
            decoration: const InputDecoration(
              labelText: '顯示名稱',
              hintText: '輸入對方的顯示名稱',
            ),
            onSubmitted: (value) => Navigator.of(context).pop(value),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('取消'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(controller.text),
              child: const Text('送出'),
            ),
          ],
        );
      },
    );
    controller.dispose();
    if (name == null || name.trim().isEmpty) return;
    await widget.viewModel.addFriend(name);
  }

  Future<void> _showCreateGroupDialog(BuildContext context) async {
      final friends = widget.viewModel.rooms
          .where(
          (room) => room.isFriend && !room.isGroup,
          )
          .toList();
    final nameController = TextEditingController();
    final selectedIds = <String>{};
    final result = await showDialog<_CreateGroupResult>(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              title: const Text('建立群組'),
              content: SizedBox(
                width: double.maxFinite,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextField(
                      controller: nameController,
                      autofocus: true,
                      maxLength: 32,
                      decoration: const InputDecoration(
                        labelText: '群組名稱',
                        hintText: '例如 專案討論',
                      ),
                    ),
                    Flexible(
                      child: ListView(
                        shrinkWrap: true,
                        children: [
                          for (final friend in friends)
                            CheckboxListTile(
                              value: selectedIds.contains(friend.recipientId),
                              onChanged: (_) {
                                setDialogState(() {
                                  if (!selectedIds.add(friend.recipientId)) {
                                    selectedIds.remove(friend.recipientId);
                                  }
                                });
                              },
                              title: Text(friend.name),
                              subtitle: Text(_presenceText(friend)),
                              secondary: CircleAvatar(
                                child: Text(_initial(friend.name)),
                              ),
                            ),
                          if (friends.isEmpty)
                            const Padding(
                              padding: EdgeInsets.symmetric(vertical: 18),
                              child: Text('目前沒有好友可加入群組'),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('取消'),
                ),
                FilledButton(
                  onPressed: selectedIds.isEmpty
                      ? null
                      : () => Navigator.of(context).pop(
                          _CreateGroupResult(
                            nameController.text,
                            selectedIds.toList(),
                          ),
                        ),
                  child: const Text('建立'),
                ),
              ],
            );
          },
        );
      },
    );
    nameController.dispose();
    if (result == null ||
        result.name.trim().isEmpty ||
        result.memberIds.isEmpty) {
      return;
    }
    await widget.viewModel.createGroup(
      name: result.name,
      memberIds: result.memberIds,
    );
    if (!context.mounted) return;
    Navigator.of(context).pop();
  }
}

class _RoomTile extends StatelessWidget {
  const _RoomTile({required this.room, required this.viewModel});

  final ChatRoom room;
  final ChatViewModel viewModel;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final selected = room.id == viewModel.activeRoom?.id;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: ListTile(
        selected: selected,
        selectedTileColor: colorScheme.primaryContainer.withValues(alpha: 0.56),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        leading: CircleAvatar(
          backgroundColor: selected
              ? colorScheme.primary
              : colorScheme.surfaceContainerHighest,
          foregroundColor: selected
              ? colorScheme.onPrimary
              : colorScheme.onSurfaceVariant,
          child: room.isGroup
              ? const Icon(Icons.groups_2, size: 20)
              : Text(_initial(room.name)),
        ),
        title: Text(
          room.name,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
        subtitle: Row(
          children: [
            if (room.lastMessageIsSelf)
              Icon(
                room.lastMessageReadAt == null ? Icons.done : Icons.done_all,
                size: 14,
                color: colorScheme.onSurfaceVariant,
              ),
            if (room.lastMessageIsSelf) const SizedBox(width: 3),
            Expanded(
              child: Text(
                room.lastMessage.isEmpty
                    ? (room.isGroup
                          ? '${room.memberIds.length} 位成員'
                          : _presenceText(room))
                    : room.lastMessage,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        trailing: _RoomActions(room: room, viewModel: viewModel),
        onTap: () {
          Navigator.of(context).pop();
          viewModel.selectRoom(room);
        },
      ),
    );
  }
}

class _RoomActions extends StatelessWidget {
  const _RoomActions({required this.room, required this.viewModel});

  final ChatRoom room;
  final ChatViewModel viewModel;

  @override
  Widget build(BuildContext context) {
    if (room.unreadCount > 0) {
      return Badge(
        label: Text(room.unreadCount > 99 ? '99+' : '${room.unreadCount}'),
      );
    }
    return PopupMenuButton<String>(
      tooltip: '聊天室操作',
      onSelected: (value) async {
        if (value == 'delete_friend') await viewModel.deleteFriend(room);
        if (value == 'leave_group') await viewModel.leaveGroup(room);
      },
      itemBuilder: (context) => [
        if (room.isFriend && !room.isGroup)
          const PopupMenuItem(
            value: 'delete_friend',
            child: ListTile(
              leading: Icon(Icons.person_remove),
              title: Text('刪除好友'),
            ),
          ),
        if (room.isGroup)
          const PopupMenuItem(
            value: 'leave_group',
            child: ListTile(leading: Icon(Icons.logout), title: Text('離開群組')),
          ),
      ],
    );
  }
}

class _UserSearchTile extends StatelessWidget {
  const _UserSearchTile({required this.user, required this.onTap});

  final ApiUser user;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: CircleAvatar(child: Text(_initial(user.displayName))),
      title: Text(user.displayName),
      subtitle: const Text('開始私訊'),
      trailing: const Icon(Icons.chat_bubble_outline),
      onTap: onTap,
    );
  }
}

class _CreateGroupResult {
  const _CreateGroupResult(this.name, this.memberIds);

  final String name;
  final List<String> memberIds;
}

String _initial(String value) {
  final trimmed = value.trim();
  return trimmed.isEmpty ? '?' : trimmed.characters.first.toUpperCase();
}

String _presenceText(ChatRoom room) {
  if (room.online) return '在線';
  final lastSeen = room.lastSeen;
  if (lastSeen == null || lastSeen.year < 2000) return '尚無訊息';
  final diff = DateTime.now().difference(lastSeen);
  if (diff.inMinutes < 1) return '剛剛在線';
  if (diff.inHours < 1) return '${diff.inMinutes} 分鐘前在線';
  if (diff.inDays < 1) return '${diff.inHours} 小時前在線';
  if (diff.inDays < 7) return '${diff.inDays} 天前在線';
  return '${lastSeen.month}/${lastSeen.day} 在線';
}
