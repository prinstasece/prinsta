import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:flutter/services.dart';
import '../services/auth_service.dart';
import '../constants/api_constants.dart';
import '../main.dart';
import 'register_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> with SingleTickerProviderStateMixin {
  final _identifierCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  bool _obscure = true;
  bool _loading = false;
  String? _error;
  final GoogleSignIn _googleSignIn = GoogleSignIn(
    serverClientId: '534651137120-o0acbi2mgtclfmcqf5o8auu30jo1n0pg.apps.googleusercontent.com',
  );
  late AnimationController _animCtrl;
  late Animation<double> _fadeAnim;

  @override
  void initState() {
    super.initState();
    _animCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 800));
    _fadeAnim = CurvedAnimation(parent: _animCtrl, curve: Curves.easeOut);
    _animCtrl.forward();
  }

  @override
  void dispose() {
    _animCtrl.dispose();
    _identifierCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (_identifierCtrl.text.trim().isEmpty || _passwordCtrl.text.isEmpty) {
      setState(() => _error = 'Please enter your credentials.');
      return;
    }
    setState(() { _loading = true; _error = null; });
    final result = await context.read<AuthService>().login(
      _identifierCtrl.text.trim(),
      _passwordCtrl.text,
    );
    if (!mounted) return;
    setState(() => _loading = false);
    if (result['success'] != true) {
      setState(() => _error = result['message']);
    }
  }

  void _showServerConfigDialog() {
    final ipCtrl = TextEditingController(text: ApiConstants.baseUrl);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Server Settings'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Specify your PC\'s Wi-Fi IP address or Server URL:',
              style: TextStyle(fontSize: 13, color: AppColors.textMuted),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: ipCtrl,
              decoration: const InputDecoration(
                labelText: 'Server URL / IP',
                prefixIcon: Icon(Icons.dns),
                hintText: 'http://10.13.238.148:3000',
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () async {
              await ApiConstants.setCustomBaseUrl('');
              if (mounted) {
                Navigator.pop(ctx);
                setState(() {});
              }
            },
            child: const Text('Reset Default'),
          ),
          ElevatedButton(
            onPressed: () async {
              await ApiConstants.setCustomBaseUrl(ipCtrl.text);
              if (mounted) {
                Navigator.pop(ctx);
                setState(() {});
              }
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: FadeTransition(
          opacity: _fadeAnim,
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 28),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SizedBox(height: 20),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const SizedBox(width: 48),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(24),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.1),
                            blurRadius: 16,
                            spreadRadius: 2,
                          ),
                        ],
                      ),
                      child: Image.asset(
                        'assets/images/logo.png',
                        width: 90,
                        height: 90,
                        fit: BoxFit.contain,
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.dns_outlined, color: AppColors.primary),
                      tooltip: 'Server IP Settings',
                      onPressed: _showServerConfigDialog,
                    ),
                  ],
                ),

                const SizedBox(height: 24),
                // Wordmark: prin (navy), sta (gold)
                Center(
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        'prin',
                        style: TextStyle(
                          color: AppColors.primary,
                          fontSize: 34,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      Text(
                        'sta',
                        style: TextStyle(
                          color: AppColors.secondary,
                          fontSize: 34,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 6),
                const Text(
                  'SECE Print Ordering System',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppColors.textMuted, fontSize: 14, fontWeight: FontWeight.w600),
                ),

                  const SizedBox(height: 50),

                  // Error
                  if (_error != null) ...[
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: AppColors.error.withOpacity(0.15),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: AppColors.error.withOpacity(0.4)),
                      ),
                      child: Column(
                        children: [
                          Row(
                            children: [
                              const Icon(Icons.error_outline, color: AppColors.error, size: 18),
                              const SizedBox(width: 10),
                              Expanded(child: Text(_error!, style: const TextStyle(color: AppColors.error, fontSize: 13))),
                            ],
                          ),
                          const SizedBox(height: 8),
                          InkWell(
                            onTap: _showServerConfigDialog,
                            child: const Padding(
                              padding: EdgeInsets.symmetric(vertical: 4),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.end,
                                children: [
                                  Icon(Icons.settings, size: 14, color: AppColors.primary),
                                  SizedBox(width: 4),
                                  Text(
                                    'Change Server IP',
                                    style: TextStyle(color: AppColors.primary, fontSize: 12, fontWeight: FontWeight.bold, decoration: TextDecoration.underline),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],

                  // Identifier field
                  TextField(
                    controller: _identifierCtrl,
                    style: const TextStyle(color: AppColors.text),
                    keyboardType: TextInputType.emailAddress,
                    decoration: const InputDecoration(
                      labelText: 'Email / Register Number / Username',
                      prefixIcon: Icon(Icons.person_outline, color: AppColors.textMuted),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Password field
                  TextField(
                    controller: _passwordCtrl,
                    obscureText: _obscure,
                    style: const TextStyle(color: AppColors.text),
                    onSubmitted: (_) => _login(),
                    decoration: InputDecoration(
                      labelText: 'Password',
                      prefixIcon: const Icon(Icons.lock_outline, color: AppColors.textMuted),
                      suffixIcon: IconButton(
                        icon: Icon(_obscure ? Icons.visibility_off : Icons.visibility, color: AppColors.textMuted),
                        onPressed: () => setState(() => _obscure = !_obscure),
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),

                  // Forgot password
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton(
                      onPressed: () => _showForgotPassword(),
                      child: const Text('Forgot Password?', style: TextStyle(color: AppColors.primary)),
                    ),
                  ),
                  const SizedBox(height: 24),

                  // Login button
                  SizedBox(
                    height: 54,
                    child: ElevatedButton(
                      onPressed: _loading ? null : _login,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      ),
                      child: _loading
                          ? const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5))
                          : const Text('Login', style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold, color: Colors.white)),
                    ),
                  ),
                  const SizedBox(height: 24),

                  // OR Divider
                  const Row(
                    children: [
                      Expanded(child: Divider(color: AppColors.border, height: 1)),
                      Padding(
                        padding: EdgeInsets.symmetric(horizontal: 16),
                        child: Text('OR', style: TextStyle(color: AppColors.textMuted, fontSize: 13, fontWeight: FontWeight.w600)),
                      ),
                      Expanded(child: Divider(color: AppColors.border, height: 1)),
                    ],
                  ),
                  const SizedBox(height: 24),

                  // Google Login Button
                  GestureDetector(
                    onTap: _loading ? null : _startGoogleLogin,
                    child: Container(
                      height: 52,
                      margin: const EdgeInsets.symmetric(horizontal: 4),
                      child: CustomPaint(
                        painter: BeveledGoogleButtonPainter(
                          backgroundColor: const Color(0xFFE5E7EB), // Light grey
                          borderColor: const Color(0xFF1E293B), // Dark slate
                          shadowColor: const Color(0xFF4F46E5), // Indigo/purple accent
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            if (_loading)
                              const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF1E293B)),
                                ),
                              )
                            else ...[
                              Image.asset(
                                'assets/images/google_logo.png',
                                height: 22,
                                width: 22,
                              ),
                              const SizedBox(width: 12),
                              const Text(
                                'Sign in with Google',
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.bold,
                                  color: Color(0xFF1F2937),
                                  letterSpacing: 0.5,
                                ),
                              ),
                            ]
                          ],
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),




                  // Register link
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Text("New student? ", style: TextStyle(color: AppColors.textMuted)),
                      GestureDetector(
                        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const RegisterScreen())),
                        child: const Text('Register here', style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.w600)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  Align(
                    alignment: Alignment.centerRight,
                    child: GestureDetector(
                      onTap: () => _showAboutUs(context),
                      child: const Text(
                        'About Us',
                        style: TextStyle(
                          color: AppColors.textMuted,
                          fontSize: 11,
                          decoration: TextDecoration.underline,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 40),
                ],
              ),
            ),
          ),
        ),
      );
    }

  void _showAboutUs(BuildContext context) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: AppColors.card,
        title: const Text('About Printsta', style: TextStyle(fontWeight: FontWeight.bold)),
        content: const Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Made by Kavin GS, Kavin SSG, Karthegaeyen K, Abhishek C', style: TextStyle(fontSize: 13, color: AppColors.text)),
            SizedBox(height: 8),
            Row(
              children: [
                Text('Made by dept of ECE ', style: TextStyle(fontSize: 13, color: AppColors.text)),
                Text('❤️', style: TextStyle(fontSize: 13, color: Colors.red)),
              ],
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Close')),
        ],
      ),
    );
  }

  Future<void> _startGoogleLogin() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      const platform = MethodChannel('com.sece.printsta_app/auth');
      final String? deviceEmail = await platform.invokeMethod<String>('chooseDeviceAccount');
      if (deviceEmail != null && deviceEmail.isNotEmpty) {
        if (!deviceEmail.toLowerCase().endsWith('@sece.ac.in')) {
          setState(() {
            _loading = false;
            _error = 'Only @sece.ac.in Google accounts are allowed.';
          });
          return;
        }
        await _processGoogleAuth(deviceEmail);
      } else {
        setState(() {
          _loading = false;
        });
      }
    } catch (e) {
      try {
        try {
          await _googleSignIn.signOut();
        } catch (_) {}

        final GoogleSignInAccount? googleUser = await _googleSignIn.signIn();
        if (googleUser == null) {
          setState(() {
            _loading = false;
          });
          return;
        }

        if (!googleUser.email.toLowerCase().endsWith('@sece.ac.in')) {
          setState(() {
            _loading = false;
            _error = 'Only @sece.ac.in Google accounts are allowed.';
          });
          return;
        }
        await _processGoogleAuth(googleUser.email);
      } catch (err) {
        setState(() {
          _loading = false;
          _error = 'Google Sign-In failed: $err';
        });
      }
    }
  }

  void _showCustomEmailInputDialog() {
    return;
    final emailCtrl = TextEditingController();
    String? dialogError;

    showDialog(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              backgroundColor: AppColors.card,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
              title: Row(
                children: [
                  Image.asset(
                    'assets/images/google_logo.png',
                    height: 24,
                    width: 24,
                  ),
                  const SizedBox(width: 10),
                  const Text('Google SSO', style: TextStyle(fontWeight: FontWeight.bold, color: AppColors.text)),
                ],
              ),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Sign in with your college Gmail account:',
                    style: TextStyle(fontSize: 13, color: AppColors.textMuted),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: emailCtrl,
                    style: const TextStyle(color: AppColors.text),
                    keyboardType: TextInputType.emailAddress,
                    decoration: InputDecoration(
                      labelText: 'College Email ID',
                      hintText: 'e.g. kavin.v2025ece@sece.ac.in',
                      errorText: dialogError,
                    ),
                  ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Cancel', style: TextStyle(color: AppColors.textMuted)),
                ),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    minimumSize: const Size(130, 44),
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                  onPressed: () async {
                    final enteredEmail = emailCtrl.text.trim();
                    if (enteredEmail.isEmpty) {
                      setDialogState(() => dialogError = 'Email is required');
                      return;
                    }
                    if (!enteredEmail.toLowerCase().endsWith('@sece.ac.in')) {
                      setDialogState(() => dialogError = 'Enter valid college Gmail');
                      return;
                    }
                    setDialogState(() => dialogError = null);
                    Navigator.pop(context); // Close email prompt
                    
                    await _processGoogleAuth(enteredEmail);
                  },
                  child: const Text('Continue', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                ),
              ],
            );
          },
        );
      },
    );
  }



  Future<void> _processGoogleAuth(String email) async {
    setState(() { _loading = true; _error = null; });
    try {
      // Build Google ID Token representation (mock SSO JWT)
      final String mockHeader = base64Url.encode(utf8.encode(jsonEncode({'alg': 'HS256', 'typ': 'JWT'})));
      final String mockPayload = base64Url.encode(utf8.encode(jsonEncode({
        'email': email,
        'given_name': email.split('.').first,
        'family_name': '',
        'name': email.split('@').first.replaceAll('.', ' ')
      })));
      final String mockToken = '$mockHeader.$mockPayload.mock_signature';

      final res = await context.read<AuthService>().loginWithGoogle(mockToken);
      if (!mounted) return;

      if (res['success'] == true) {
        if (res['profileIncomplete'] == true) {
          setState(() => _loading = false);
          _showCompleteProfileDialog();
        } else {
          // Success! Navigator should auto-redirect based on state. If not, AuthService triggers notifyListeners.
          setState(() => _loading = false);
        }
      } else {
        setState(() {
          _loading = false;
          _error = res['message'] ?? 'Google authentication failed.';
        });
      }
    } catch (err) {
      setState(() {
        _loading = false;
        _error = 'Google authentication encountered an error.';
      });
    }
  }

  Future<void> _showCompleteProfileDialog() async {
    final regCtrl = TextEditingController();
    final phoneCtrl = TextEditingController();
    String? dialogError;

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              backgroundColor: AppColors.card,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
              title: const Text('Complete Profile', style: TextStyle(fontWeight: FontWeight.bold, color: AppColors.text)),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Almost there! Enter your student details to complete registration:',
                    style: TextStyle(fontSize: 13, color: AppColors.textMuted),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: regCtrl,
                    style: const TextStyle(color: AppColors.text),
                    keyboardType: TextInputType.number,
                    maxLength: 12,
                    decoration: InputDecoration(
                      labelText: 'Register Number (12 digits)',
                      counterText: '',
                      errorText: dialogError,
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: phoneCtrl,
                    style: const TextStyle(color: AppColors.text),
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(
                      labelText: 'Phone Number',
                    ),
                  ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () async {
                    // If cancelled, log out of incomplete session
                    await context.read<AuthService>().logout();
                    if (context.mounted) Navigator.pop(context);
                  },
                  child: const Text('Cancel', style: TextStyle(color: AppColors.textMuted)),
                ),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(backgroundColor: AppColors.primary),
                  onPressed: () async {
                    final regNum = regCtrl.text.trim();
                    final phoneNum = phoneCtrl.text.trim();
                    if (regNum.isEmpty || regNum.length != 12) {
                      setDialogState(() => dialogError = 'Enter a valid 12-digit register number');
                      return;
                    }
                    setDialogState(() => dialogError = null);
                    
                    Navigator.pop(context); // Close complete profile dialog
                    setState(() { _loading = true; });
                    
                    final result = await context.read<AuthService>().completeGoogleProfile(regNum, phoneNum);
                    if (!mounted) return;
                    setState(() { _loading = false; });
                    
                    if (result['success'] == true) {
                      // Profile completion done! Fetch profile to update app state.
                      await context.read<AuthService>().fetchProfile();
                    } else {
                      setState(() {
                        _error = result['message'] ?? 'Failed to update student profile';
                      });
                      // Log out on profile save error to allow retry
                      await context.read<AuthService>().logout();
                    }
                  },
                  child: const Text('Save Profile', style: TextStyle(color: Colors.white)),
                ),
              ],
            );
          },
        );
      },
    );
  }

  void _showForgotPassword() {
    final emailCtrl = TextEditingController();
    final otpCtrl = TextEditingController();
    final newPassCtrl = TextEditingController();
    int step = 0;
    String? resolvedEmail;
    String? errorMessage;
    bool modalLoading = false;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) => Padding(
          padding: EdgeInsets.only(
            left: 24, right: 24, top: 24,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 24,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('Reset Password', style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              if (errorMessage != null) ...[
                Text(errorMessage!, style: const TextStyle(color: AppColors.error, fontSize: 13, fontWeight: FontWeight.w600)),
                const SizedBox(height: 12),
              ],
              if (step == 0) ...[
                TextField(
                  controller: emailCtrl,
                  style: const TextStyle(color: AppColors.text),
                  decoration: const InputDecoration(
                    labelText: 'Email or Register Number',
                    hintText: 'e.g. 722825106001 or kavin@sece.ac.in',
                  ),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  height: 48,
                  child: ElevatedButton(
                    onPressed: modalLoading ? null : () async {
                      final emailVal = emailCtrl.text.trim();
                      if (emailVal.isEmpty) {
                        setModalState(() => errorMessage = 'Email or register number is required.');
                        return;
                      }
                      setModalState(() {
                        modalLoading = true;
                        errorMessage = null;
                      });
                      final res = await context.read<AuthService>().forgotPassword(emailVal);
                      setModalState(() => modalLoading = false);
                      if (res['success'] == true) {
                        resolvedEmail = res['studentEmail'];
                        setModalState(() => step = 1);
                      } else {
                        setModalState(() => errorMessage = res['error'] ?? res['message'] ?? 'Error occurred.');
                      }
                    },
                    child: modalLoading
                      ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                      : const Text('Send OTP'),
                  ),
                ),
              ] else if (step == 1) ...[
                Text('Enter the 6-digit OTP sent to: ${resolvedEmail ?? "your email"}', style: const TextStyle(color: AppColors.textMuted, fontSize: 13)),
                const SizedBox(height: 12),
                TextField(
                  controller: otpCtrl,
                  keyboardType: TextInputType.number,
                  maxLength: 6,
                  style: const TextStyle(color: AppColors.text, fontSize: 24, letterSpacing: 8),
                  textAlign: TextAlign.center,
                  decoration: const InputDecoration(counterText: '', labelText: 'OTP'),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  height: 48,
                  child: ElevatedButton(
                    onPressed: modalLoading ? null : () async {
                      final otpVal = otpCtrl.text.trim();
                      if (otpVal.length != 6) {
                        setModalState(() => errorMessage = 'Enter 6-digit OTP.');
                        return;
                      }
                      setModalState(() {
                        modalLoading = true;
                        errorMessage = null;
                      });
                      final res = await context.read<AuthService>().verifyResetOtp(resolvedEmail ?? '', otpVal);
                      setModalState(() => modalLoading = false);
                      if (res['success'] == true) {
                        setModalState(() => step = 2);
                      } else {
                        setModalState(() => errorMessage = res['error'] ?? res['message'] ?? 'Invalid OTP.');
                      }
                    },
                    child: modalLoading
                      ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                      : const Text('Verify OTP'),
                  ),
                ),
              ] else ...[
                TextField(
                  controller: newPassCtrl,
                  obscureText: true,
                  style: const TextStyle(color: AppColors.text),
                  decoration: const InputDecoration(labelText: 'New Password (min 8 chars)'),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  height: 48,
                  child: ElevatedButton(
                    onPressed: modalLoading ? null : () async {
                      final passVal = newPassCtrl.text;
                      if (passVal.length < 8) {
                        setModalState(() => errorMessage = 'Password must be at least 8 characters.');
                        return;
                      }
                      setModalState(() {
                        modalLoading = true;
                        errorMessage = null;
                      });
                      final res = await context.read<AuthService>().resetPassword(
                        resolvedEmail ?? '',
                        otpCtrl.text.trim(),
                        passVal,
                      );
                      setModalState(() => modalLoading = false);
                      if (res['success'] == true) {
                        Navigator.pop(ctx); // Close bottom sheet
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Password reset successfully. Please login.'), backgroundColor: AppColors.success)
                        );
                      } else {
                        setModalState(() => errorMessage = res['error'] ?? res['message'] ?? 'Reset failed.');
                      }
                    },
                    child: modalLoading
                      ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                      : const Text('Reset Password'),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class BeveledGoogleButtonPainter extends CustomPainter {
  final Color backgroundColor;
  final Color borderColor;
  final Color shadowColor;

  BeveledGoogleButtonPainter({
    required this.backgroundColor,
    required this.borderColor,
    required this.shadowColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final double bevel = 12.0;

    // Draw shadow first (offset slightly bottom and right)
    final shadowPaint = Paint()
      ..color = shadowColor
      ..style = PaintingStyle.fill;

    final shadowPath = Path();
    shadowPath.moveTo(2, 2);
    shadowPath.lineTo(size.width - bevel + 2, 2);
    shadowPath.lineTo(size.width + 2, bevel + 2);
    shadowPath.lineTo(size.width + 2, size.height + 2);
    shadowPath.lineTo(2, size.height + 2);
    shadowPath.close();
    canvas.drawPath(shadowPath, shadowPaint);

    // Draw main button background
    final bgPaint = Paint()
      ..color = backgroundColor
      ..style = PaintingStyle.fill;

    final mainPath = Path();
    mainPath.moveTo(0, 0);
    mainPath.lineTo(size.width - bevel, 0);
    mainPath.lineTo(size.width, bevel);
    mainPath.lineTo(size.width, size.height);
    mainPath.lineTo(0, size.height);
    mainPath.close();
    canvas.drawPath(mainPath, bgPaint);

    // Draw border
    final borderPaint = Paint()
      ..color = borderColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.0;
    canvas.drawPath(mainPath, borderPaint);

    // Draw the tiny accent line on the bevel (a small inner line)
    final accentPaint = Paint()
      ..color = borderColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.0;

    // Just a small tick on the bevel
    canvas.drawLine(
      Offset(size.width - bevel, 0),
      Offset(size.width - bevel, 4),
      accentPaint,
    );
    canvas.drawLine(
      Offset(size.width, bevel),
      Offset(size.width - 4, bevel),
      accentPaint,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

