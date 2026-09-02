import 'dart:async';
import 'dart:convert';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../constants/api_constants.dart';

/// Handles local notifications and in-app order-status polling.
class NotificationService {
  static final _plugin = FlutterLocalNotificationsPlugin();
  static Timer? _pollTimer;

  // ── Init ──────────────────────────────────────────────────────────────────

  /// Call once from main() after WidgetsFlutterBinding.ensureInitialized().
  static Future<void> init() async {
    try {
      const androidSettings = AndroidInitializationSettings('@mipmap/ic_notification');
      await _plugin.initialize(
        const InitializationSettings(android: androidSettings),
      );

      final androidImplementation = _plugin
          .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin>();

      if (androidImplementation != null) {
        // Request POST_NOTIFICATIONS permission (Android 13+)
        await androidImplementation.requestNotificationsPermission();

        // Create high-importance notification channel explicitly
        const AndroidNotificationChannel channel = AndroidNotificationChannel(
          'printsta_ready_channel_v2',
          'Print Ready Alerts',
          description: 'Notifies you immediately when your document is printed and ready to collect',
          importance: Importance.max,
          playSound: true,
          enableVibration: true,
          showBadge: true,
        );
        await androidImplementation.createNotificationChannel(channel);
      }
    } catch (e) {
      print('NotificationService init error: $e');
    }
  }

  // ── Polling ───────────────────────────────────────────────────────────────

  /// Start polling – call this when a student logs in or opens dashboard.
  static void startPolling() {
    _pollTimer?.cancel();
    // Run immediately, then every 5 seconds for fast real-time status alerts
    checkOrderStatusAndNotify();
    _pollTimer = Timer.periodic(
      const Duration(seconds: 5),
      (_) => checkOrderStatusAndNotify(),
    );
  }

  /// Stop polling – call this on logout.
  static void stopPolling() {
    _pollTimer?.cancel();
    _pollTimer = null;
  }

  // ── Core check ────────────────────────────────────────────────────────────

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
          .timeout(const Duration(seconds: 10));

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

        if (status == 'ready' &&
            orderId.isNotEmpty &&
            !notifiedIds.contains(orderId)) {
          await _showReadyNotification(orderId.hashCode, tokenNum);
          newNotifiedIds.add(orderId);
        }
      }

      if (newNotifiedIds.length != notifiedIds.length) {
        await prefs.setStringList('notified_orders', newNotifiedIds);
      }
    } catch (_) {
      // Silently swallow errors.
    }
  }

  // ── Show notification ────────────────────────────────────────────────────

  static Future<void> _showReadyNotification(
      int id, String tokenNumber) async {
    try {
      const details = NotificationDetails(
        android: AndroidNotificationDetails(
          'printsta_ready_channel_v2',
          'Print Ready Alerts',
          channelDescription:
              'Notifies you when your document is printed and ready to collect',
          importance: Importance.max,
          priority: Priority.high,
          playSound: true,
          enableVibration: true,
          enableLights: true,
          icon: '@mipmap/ic_notification',
          largeIcon: DrawableResourceAndroidBitmap('@mipmap/ic_notification'),
        ),
      );
      await _plugin.show(
        id,
        'Print Job Ready! ✅',
        'Token $tokenNumber — Your document has been printed and is ready for pickup!',
        details,
      );
    } catch (e) {
      print('Error showing ready notification: $e');
    }
  }
}
