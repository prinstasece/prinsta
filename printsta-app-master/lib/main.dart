import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'services/auth_service.dart';
import 'services/notification_service.dart';
import 'constants/api_constants.dart';
import 'screens/login_screen.dart';
import 'screens/student/student_dashboard.dart';
import 'screens/admin/admin_dashboard.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(
    ChangeNotifierProvider(
      create: (_) => AuthService(),
      child: const PrintstaApp(),
    ),
  );
}

class PrintstaApp extends StatelessWidget {
  const PrintstaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Prinsta SECE',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.theme,
      home: const AuthWrapper(),
    );
  }
}

class AuthWrapper extends StatefulWidget {
  const AuthWrapper({super.key});
  @override
  State<AuthWrapper> createState() => _AuthWrapperState();
}

class _AuthWrapperState extends State<AuthWrapper> {
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    final start = DateTime.now();
    await ApiConstants.loadBaseUrl();
    
    // Initialise notifications + WorkManager background polling
    try {
      await NotificationService.init();
    } catch (e) {
      print("Failed to initialize notifications: $e");
    }

    await context.read<AuthService>().loadFromStorage();
    final elapsed = DateTime.now().difference(start);
    if (elapsed.inMilliseconds < 1500) {
      await Future.delayed(Duration(milliseconds: 1500 - elapsed.inMilliseconds));
    }
    setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return Scaffold(
        backgroundColor: Colors.white,
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Image.asset(
                'assets/images/logo.png',
                width: 130,
                height: 130,
                fit: BoxFit.contain,
              ),
              const SizedBox(height: 20),
              const Text(
                'Prinsta',
                style: TextStyle(
                  fontSize: 34,
                  fontWeight: FontWeight.bold,
                  color: AppColors.primary,
                  letterSpacing: 1.5,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Sri Eshwar College of Engineering',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppColors.secondary,
                  letterSpacing: 0.8,
                ),
              ),
            ],
          ),
        ),
      );
    }
    final auth = context.watch<AuthService>();
    if (!auth.isLoggedIn) {
      NotificationService.stopPolling();
      return const LoginScreen();
    }
    switch (auth.role) {
      case 'student':
        NotificationService.startPolling(); // poll while student is active
        return const StudentDashboard();
      case 'admin':
        NotificationService.stopPolling();
        return const AdminDashboard();
      case 'staff':
        NotificationService.stopPolling();
        Future.microtask(() => auth.logout());
        return const LoginScreen();
      default:
        NotificationService.stopPolling();
        return const LoginScreen();
    }
  }
}

class AppColors {
  static const Color primary = Color(0xFF1A2A4A); // Navy
  static const Color primaryDark = Color(0xFF0F1F3D);
  static const Color secondary = Color(0xFFF5A623); // Gold
  static const Color background = Color(0xFFF8F9FC); // Light Gray Background
  static const Color surface = Color(0xFFFFFFFF); // White Surface
  static const Color card = Color(0xFFFFFFFF);
  static const Color text = Color(0xFF111827); // Dark text
  static const Color textMuted = Color(0xFF6B7280); // Gray text
  static const Color error = Color(0xFFDC2626);
  static const Color success = Color(0xFF16A34A);
  static const Color warning = Color(0xFFF5A623);
  static const Color border = Color(0xFFE5E7EB);
}

class AppTheme {
  static ThemeData get theme => ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: AppColors.background,
        colorScheme: const ColorScheme.light(
          primary: AppColors.primary,
          secondary: AppColors.secondary,
          surface: AppColors.surface,
          error: AppColors.error,
        ),
        fontFamily: 'sans-serif',
        appBarTheme: const AppBarTheme(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
          elevation: 0,
          centerTitle: true,
        ),
        cardTheme: CardThemeData(
          color: AppColors.card,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: const BorderSide(color: AppColors.border, width: 0.8),
          ),
          elevation: 0,
          shadowColor: const Color(0x181A2A4A),
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primary,
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            padding: const EdgeInsets.symmetric(vertical: 16),
            textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: Color(0xFF1A2A4A), width: 1.5),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: Color(0xFF1A2A4A), width: 1.5),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: Color(0xFF1A2A4A), width: 2.0),
          ),
          labelStyle: const TextStyle(color: Color(0xFF6B7280)),
          hintStyle: const TextStyle(color: Color(0xFF6B7280)),
        ),
        textTheme: const TextTheme(
          bodyLarge: TextStyle(color: AppColors.text),
          bodyMedium: TextStyle(color: AppColors.text),
          titleLarge: TextStyle(color: AppColors.text, fontWeight: FontWeight.bold),
          titleMedium: TextStyle(color: AppColors.text, fontWeight: FontWeight.w600),
          headlineSmall: TextStyle(color: AppColors.text, fontWeight: FontWeight.bold),
        ),
      );
}

