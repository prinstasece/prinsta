import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../constants/api_constants.dart';

/// Handles local notifications, permission requests, and in-app order-status polling.
class NotificationService {
  static final _plugin = FlutterLocalNotificationsPlugin();
  static Timer? _pollTimer;
  static bool _isInitialized = false;

  // Global callback for in-app banners when ready
  static Function(String token, String message)? onOrderReady;

  // ── Init ──────────────────────────────────────────────────────────────────

  /// Call once from main() after WidgetsFlutterBinding.ensureInitialized().
  static Future<void> init() async {
    if (_isInitialized) return;
    try {
      const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
      const initSettings = InitializationSettings(
        android: androidSettings,
      );

      await _plugin.initialize(
        initSettings,
        onDidReceiveNotificationResponse: (NotificationResponse response) {
          print('Notification clicked: ${response.payload}');
        },
      );

      final androidPlugin = _plugin.resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin>();

      if (androidPlugin != null) {
        // Create high-importance notification channel explicitly
        const AndroidNotificationChannel channel = AndroidNotificationChannel(
          'printsta_order_channel',
          'Print Ready Notifications',
          description: 'High priority alerts when your print orders are ready for collection',
          importance: Importance.max,
          playSound: true,
          enableVibration: true,
          showBadge: true,
        );
        await androidPlugin.createNotificationChannel(channel);
      }

      _isInitialized = true;
      print('NotificationService initialized successfully.');
    } catch (e) {
      print('NotificationService init error: $e');
    }
  }

  // ── Permission Request ───────────────────────────────────────────────────

  /// Prompt the user for notification permissions on app launch.
  /// If permanently denied, show an in-app dialog guiding to device settings.
  static Future<bool> requestPermission({BuildContext? context}) async {
    try {
      // 1. Check current status
      final status = await Permission.notification.status;
      print('Current notification permission status: $status');

      if (status.isGranted) {
        return true;
      }

      // 2. Request from OS
      final reqStatus = await Permission.notification.request();
      print('Requested notification permission result: $reqStatus');

      if (reqStatus.isGranted) {
        return true;
      }

      // 3. Fallback to flutter_local_notifications request
      final androidPlugin = _plugin.resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin>();
      final localGranted = await androidPlugin?.requestNotificationsPermission();
      if (localGranted == true) {
        return true;
      }

      // 4. If permanently denied and context provided, guide user to Settings
      if ((reqStatus.isPermanentlyDenied || reqStatus.isDenied) && context != null && context.mounted) {
        _showPermissionDialog(context);
      }

      return reqStatus.isGranted;
    } catch (e) {
      print('Error requesting notification permission: $e');
      return false;
    }
  }

  static void _showPermissionDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Row(
          children: [
            Icon(Icons.notifications_active, color: Color(0xFF1A2A4A), size: 28),
            SizedBox(width: 10),
            Text('Enable Notifications', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
          ],
        ),
        content: const Text(
          'Allow notification access so Printsta can instantly alert you the second your print job is ready for pickup!',
          style: TextStyle(fontSize: 14, color: Color(0xFF4B5563), height: 1.4),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Not Now', style: TextStyle(color: Color(0xFF6B7280))),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF1A2A4A),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            onPressed: () async {
              Navigator.pop(ctx);
              await openAppSettings();
            },
            child: const Text('Open Settings', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  // ── Polling ───────────────────────────────────────────────────────────────

  /// Start polling – call this when student logs in or opens the app.
  static void startPolling() {
    _pollTimer?.cancel();
    // Run immediately, then every 4 seconds for instant real-time alerts
    checkOrderStatusAndNotify();
    _pollTimer = Timer.periodic(
      const Duration(seconds: 4),
      (_) => checkOrderStatusAndNotify(),
    );
    print('NotificationService: Polling started (every 4s).');
  }

  /// Stop polling – call this on logout.
  static void stopPolling() {
    _pollTimer?.cancel();
    _pollTimer = null;
    print('NotificationService: Polling stopped.');
  }

  // ── Core Status Check & Trigger ──────────────────────────────────────────

  static Future<void> checkOrderStatusAndNotify() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('token');
      if (token == null || token.isEmpty) return;

      final response = await http
          .get(
            Uri.parse(ApiConstants.myOrders),
            headers: {
              'Authorization': 'Bearer $token',
              'Content-Type': 'application/json',
            },
          )
          .timeout(const Duration(seconds: 8));

      if (response.statusCode != 200) return;

      final data = jsonDecode(response.body) as Map<String, dynamic>;
      if (data['success'] != true || data['orders'] == null) return;

      final List orders       = data['orders'] as List;
      final notifiedIds       = prefs.getStringList('notified_orders') ?? [];
      final newNotifiedIds    = List<String>.from(notifiedIds);

      for (final o in orders) {
        final orderId  = (o['_id'] ?? o['id'] ?? '').toString();
        final status   = (o['status'] ?? 'waiting').toString();
        final tokenNum = (o['tokenNumber'] ?? '').toString();
        final fileName = (o['fileName'] ?? o['originalName'] ?? 'Document').toString();

        if (status == 'ready' &&
            orderId.isNotEmpty &&
            !notifiedIds.contains(orderId)) {
          print('🔔 Order ready found! Token: $tokenNum (ID: $orderId). Showing notification...');
          await _showReadyNotification(orderId.hashCode, tokenNum, fileName);
          newNotifiedIds.add(orderId);

          if (onOrderReady != null) {
            onOrderReady!(tokenNum, 'Token $tokenNum ($fileName) is printed and ready for pickup!');
          }
        }
      }

      if (newNotifiedIds.length != notifiedIds.length) {
        await prefs.setStringList('notified_orders', newNotifiedIds);
      }
    } catch (e) {
      // Silently ignore transient network timeout
    }
  }

  // ── Show Notification ────────────────────────────────────────────────────

  static Future<void> _showReadyNotification(
      int id, String tokenNumber, String fileName) async {
    try {
      const androidDetails = AndroidNotificationDetails(
        'printsta_order_channel',
        'Print Ready Notifications',
        channelDescription: 'High priority alerts when your print orders are ready for collection',
        importance: Importance.max,
        priority: Priority.high,
        playSound: true,
        enableVibration: true,
        icon: '@mipmap/ic_launcher',
        largeIcon: DrawableResourceAndroidBitmap('@mipmap/ic_launcher'),
        styleInformation: BigTextStyleInformation(''),
      );

      const details = NotificationDetails(android: androidDetails);

      await _plugin.show(
        id,
        'Print Ready for Pickup! 📄✅',
        'Token $tokenNumber — Your document "$fileName" is printed. Please collect it from the print shop.',
        details,
        payload: tokenNumber,
      );
      print('✅ Notification displayed successfully for Token: $tokenNumber');
    } catch (e) {
      print('❌ Error showing notification: $e');
    }
  }

  /// Test notification trigger (can be called from UI)
  static Future<void> showTestNotification() async {
    await _showReadyNotification(9999, 'SECE-TEST', 'Sample Assignment.pdf');
  }
}
