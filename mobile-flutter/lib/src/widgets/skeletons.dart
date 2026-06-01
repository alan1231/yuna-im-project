import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';

class ChatShellSkeleton extends StatelessWidget {
  const ChatShellSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: const [
            _SkeletonBox(width: 160, height: 36),
            SizedBox(height: 20),
            _SkeletonBox(width: double.infinity, height: 52),
            SizedBox(height: 12),
            _SkeletonBox(width: double.infinity, height: 52),
            Spacer(),
          ],
        ),
      ),
    );
  }
}

class MessageListSkeleton extends StatelessWidget {
  const MessageListSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: const [
        _SkeletonBox(width: 220, height: 44),
        SizedBox(height: 10),
        Align(
          alignment: Alignment.centerRight,
          child: _SkeletonBox(width: 260, height: 56),
        ),
        SizedBox(height: 10),
        _SkeletonBox(width: 180, height: 44),
        SizedBox(height: 10),
        Align(
          alignment: Alignment.centerRight,
          child: _SkeletonBox(width: 210, height: 44),
        ),
      ],
    );
  }
}

class _SkeletonBox extends StatelessWidget {
  const _SkeletonBox({required this.width, required this.height});

  final double width;
  final double height;

  @override
  Widget build(BuildContext context) {
    return Shimmer.fromColors(
      baseColor: Theme.of(context).colorScheme.surfaceContainerHighest,
      highlightColor: Theme.of(context).colorScheme.surface,
      child: Container(
        width: width,
        height: height,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
        ),
      ),
    );
  }
}
