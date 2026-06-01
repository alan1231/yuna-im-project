import 'package:flutter/material.dart';

import 'screens/chat_shell.dart';

class YunaImMobileApp extends StatelessWidget {
  const YunaImMobileApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Yuna IM',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xff0f766e),
          brightness: Brightness.light,
        ),
        useMaterial3: true,
      ),
      home: const ChatShell(),
    );
  }
}
