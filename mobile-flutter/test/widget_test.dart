import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_flutter/src/app.dart';

void main() {
  testWidgets('shows account screen when no profile is stored', (tester) async {
    SharedPreferences.setMockInitialValues({});

    await tester.pumpWidget(const ProviderScope(child: YunaImMobileApp()));
    await tester.pumpAndSettle();

    expect(find.text('Yuna IM'), findsOneWidget);
    expect(find.text('登入'), findsOneWidget);
    expect(find.text('建立'), findsOneWidget);
  });
}
