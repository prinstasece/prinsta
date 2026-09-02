import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:http/http.dart' as http;
import '../constants/api_constants.dart';

class AuthService extends ChangeNotifier {
  String? _token;
  String? _role;
  String? _name;
  Map<String, dynamic>? _profile;

  bool get isLoggedIn => _token != null;
  String? get role => _role;
  String? get name => _name;
  String? get token => _token;
  Map<String, dynamic>? get profile => _profile;

  Future<void> loadFromStorage() async {
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString('token');
    _role = prefs.getString('role');
    _name = prefs.getString('name');
    notifyListeners();
  }

  Future<Map<String, dynamic>> login(String identifier, String password) async {
    try {
      final response = await http.post(
        Uri.parse(ApiConstants.login),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'identifier': identifier, 'password': password}),
      ).timeout(const Duration(seconds: 15));

      final data = jsonDecode(response.body);
      if (data['success'] == true) {
        if (data['role'] == 'staff') {
          return {'success': false, 'message': 'Staff login is only allowed on the web portal.'};
        }
        _token = data['token'];
        _role = data['role'];
        _name = data['name'];
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('token', _token!);
        await prefs.setString('role', _role!);
        await prefs.setString('name', _name ?? '');
        notifyListeners();
        return {'success': true};
      }
      return {'success': false, 'message': data['message'] ?? 'Login failed'};
    } catch (e) {
      return {'success': false, 'message': 'Cannot connect to server. Make sure backend is running.'};
    }
  }

  Future<Map<String, dynamic>> loginWithGoogle(String googleToken) async {
    try {
      final response = await http.post(
        Uri.parse('${ApiConstants.baseUrl}/auth/google'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'token': googleToken}),
      ).timeout(const Duration(seconds: 15));

      final data = jsonDecode(response.body);
      if (response.statusCode == 403) {
        return {'success': false, 'message': 'Only SECE college Google accounts (@sece.ac.in) are allowed. Please sign in with your college email.'};
      }
      if (data['success'] == true) {
        _token = data['token'];
        _role = 'student';
        _name = data['studentName'] ?? 'Student';
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('token', _token!);
        await prefs.setString('role', _role!);
        await prefs.setString('name', _name ?? '');
        notifyListeners();
        return {
          'success': true,
          'profileIncomplete': data['profileIncomplete'] == true
        };
      }
      return {'success': false, 'message': data['message'] ?? 'Google authentication failed.'};
    } catch (e) {
      return {'success': false, 'message': 'Cannot connect to server. Make sure backend is running.'};
    }
  }

  Future<Map<String, dynamic>> completeGoogleProfile(String registerNumber, String phone) async {
    if (_token == null) return {'success': false, 'message': 'Not authenticated'};
    try {
      final response = await http.patch(
        Uri.parse('${ApiConstants.baseUrl}/auth/student/profile'),
        headers: authHeaders,
        body: jsonEncode({
          'registerNumber': registerNumber,
          'phone': phone,
        }),
      ).timeout(const Duration(seconds: 15));

      final data = jsonDecode(response.body);
      if (data['success'] == true) {
        return {'success': true};
      }
      return {'success': false, 'message': data['message'] ?? 'Failed to update profile.'};
    } catch (e) {
      return {'success': false, 'message': 'Cannot connect to server.'};
    }
  }

  Future<List<String>> fetchStudentEmails() async {
    try {
      final response = await http.get(Uri.parse(ApiConstants.studentEmails)).timeout(const Duration(seconds: 10));
      final data = jsonDecode(response.body);
      if (data['success'] == true && data['emails'] != null) {
        return List<String>.from(data['emails']);
      }
      return [];
    } catch (_) {
      return [];
    }
  }

  Future<Map<String, dynamic>> register({
    required String firstName,
    required String lastName,
    required String email,
    required String phone,
    required String password,
    required String registerNumber,
    required String department,
    required String batch,
  }) async {
    try {
      final response = await http.post(
        Uri.parse(ApiConstants.studentRegister),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'firstName': firstName,
          'lastName': lastName,
          'email': email,
          'phone': phone,
          'password': password,
          'registerNumber': registerNumber,
          'department': department,
          'batch': batch,
        }),
      ).timeout(const Duration(seconds: 15));
      final data = jsonDecode(response.body);
      return data;
    } catch (e) {
      return {'success': false, 'message': 'Cannot connect to server.'};
    }
  }

  Future<void> fetchProfile() async {
    if (_token == null) return;
    try {
      final response = await http.get(
        Uri.parse(ApiConstants.studentMe),
        headers: authHeaders,
      ).timeout(const Duration(seconds: 10));
      final data = jsonDecode(response.body);
      if (data['success'] == true) {
        _profile = data['student'];
        notifyListeners();
      }
    } catch (_) {}
  }

  Future<void> logout() async {
    _token = null;
    _role = null;
    _name = null;
    _profile = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('token');
    await prefs.remove('role');
    await prefs.remove('name');
    await prefs.remove('notified_orders');
    notifyListeners();
  }

  Map<String, String> get authHeaders => {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer $_token',
  };

  Future<Map<String, dynamic>> forgotPassword(String identifier) async {
    try {
      final response = await http.post(
        Uri.parse(ApiConstants.forgotPassword),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'email': identifier}),
      ).timeout(const Duration(seconds: 15));
      final data = jsonDecode(response.body);
      return data;
    } catch (e) {
      return {'success': false, 'message': 'Cannot connect to server.'};
    }
  }

  Future<Map<String, dynamic>> verifyResetOtp(String email, String otp) async {
    try {
      final response = await http.post(
        Uri.parse(ApiConstants.verifyOtp),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'email': email, 'otp': otp}),
      ).timeout(const Duration(seconds: 15));
      final data = jsonDecode(response.body);
      return data;
    } catch (e) {
      return {'success': false, 'message': 'Cannot connect to server.'};
    }
  }

  Future<Map<String, dynamic>> resetPassword(String email, String otp, String newPassword) async {
    try {
      final response = await http.post(
        Uri.parse(ApiConstants.resetPassword),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'email': email, 'otp': otp, 'newPassword': newPassword}),
      ).timeout(const Duration(seconds: 15));
      final data = jsonDecode(response.body);
      return data;
    } catch (e) {
      return {'success': false, 'message': 'Cannot connect to server.'};
    }
  }

  Future<Map<String, dynamic>> verifyEmailRegister(String email, String otp) async {
    try {
      final response = await http.post(
        Uri.parse('${ApiConstants.baseUrl}/auth/student/verify-email'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'email': email, 'otp': otp}),
      ).timeout(const Duration(seconds: 15));
      final data = jsonDecode(response.body);
      return data;
    } catch (e) {
      return {'success': false, 'message': 'Cannot connect to server.'};
    }
  }
}

