import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/auth_service.dart';
import '../main.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});
  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _firstNameCtrl = TextEditingController();
  final _lastNameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _regNoCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  String _department = 'CSE';
  String _batch = '2022-2026';
  bool _obscure = true;
  bool _loading = false;
  String? _error;
  String? _success;
  String? _regNoFeedback;
  Color _regNoFeedbackColor = AppColors.error;
  String? _emailFeedback;
  Color _emailFeedbackColor = AppColors.error;


  final List<String> _departments = ['CSE', 'ECE', 'EEE', 'MECH', 'IT', 'AIDS', 'AIML', 'CSBS', 'CCE', 'Cyber Security'];
  final List<String> _batches = [
    '2021-2025', '2022-2026', '2023-2027', '2024-2028',
    '2025-2029', '2026-2030', '2027-2031', '2028-2032',
    '2029-2033'
  ];

  final Map<String, String> _regDeptCodes = {
    '205': 'IT',
    '149': 'Cyber Security',
    '148': 'AIML',
    '251': 'CSE',
    '105': 'EEE',
    '114': 'MECH',
    '244': 'CSBS',
    '134': 'CCE',
    '106': 'ECE',
    '243': 'AIDS'
  };

  final Map<String, String> _emailDeptCodes = {
    'ece': 'ECE', 'cse': 'CSE', 'mech': 'MECH', 'eee': 'EEE',
    'cys': 'Cyber Security', 'aiml': 'AIML', 'aids': 'AIDS',
    'cce': 'CCE', 'it': 'IT', 'csbs': 'CSBS'
  };

  @override
  void initState() {
    super.initState();
    _regNoCtrl.addListener(_onRegNoChanged);
    _emailCtrl.addListener(_onEmailChanged);
  }

  @override
  void dispose() {
    _regNoCtrl.removeListener(_onRegNoChanged);
    _emailCtrl.removeListener(_onEmailChanged);
    _firstNameCtrl.dispose(); _lastNameCtrl.dispose();
    _emailCtrl.dispose(); _phoneCtrl.dispose();
    _regNoCtrl.dispose(); _passwordCtrl.dispose();
    super.dispose();
  }

  void _onRegNoChanged() {
    final reg = _regNoCtrl.text.trim();
    if (reg.isEmpty) {
      setState(() => _regNoFeedback = null);
      return;
    }
    if (reg.length != 12) {
      setState(() {
        _regNoFeedback = 'Register number must be exactly 12 digits.';
        _regNoFeedbackColor = AppColors.error;
      });
      return;
    }
    if (!RegExp(r'^\d{12}$').hasMatch(reg)) {
      setState(() {
        _regNoFeedback = 'Register number must contain digits only.';
        _regNoFeedbackColor = AppColors.error;
      });
      return;
    }
    if (!reg.startsWith('7228')) {
      setState(() {
        _regNoFeedback = 'First 4 digits must be 7228 (SECE code).';
        _regNoFeedbackColor = AppColors.error;
      });
      return;
    }
    final deptCode = reg.substring(6, 9);
    final dept = _regDeptCodes[deptCode];
    if (dept == null) {
      setState(() {
        _regNoFeedback = 'Dept code "$deptCode" is not valid.';
        _regNoFeedbackColor = AppColors.error;
      });
    } else {
      final yearJoinedDigits = reg.substring(4, 6);
      final year = int.tryParse(yearJoinedDigits);
      String? calculatedBatch;
      if (year != null) {
        calculatedBatch = "20$year-20${year + 4}";
      }
      setState(() {
        _regNoFeedback = null;
        if (_departments.contains(dept)) {
          _department = dept;
        }
        if (calculatedBatch != null && _batches.contains(calculatedBatch)) {
          _batch = calculatedBatch;
        }
      });
    }
  }

  void _onEmailChanged() {
    final email = _emailCtrl.text.trim().toLowerCase();
    if (email.isEmpty) {
      setState(() => _emailFeedback = null);
      return;
    }
    if (!email.endsWith('@sece.ac.in')) {
      setState(() {
        _emailFeedback = 'Only SECE college emails allowed (@sece.ac.in).';
        _emailFeedbackColor = AppColors.error;
      });
      return;
    }

    final local = email.split('@')[0];
    final regExp = RegExp(r'^[a-z]+\.[a-z]+([\d]{4})(ece|cse|mech|eee|cys|aiml|aids|cce|it|csbs)$');
    final match = regExp.firstMatch(local);
    if (match == null) {
      setState(() {
        _emailFeedback = 'Format: name.initial2025ece@sece.ac.in';
        _emailFeedbackColor = AppColors.error;
      });
      return;
    }

    setState(() {
      _emailFeedback = '✓ Valid SECE email';
      _emailFeedbackColor = AppColors.success;
    });

    final year = int.tryParse(match.group(1) ?? '');
    final deptCode = match.group(2);
    if (year != null) {
      final calculatedBatch = '$year-${year + 4}';
      if (_batches.contains(calculatedBatch)) {
        setState(() {
          _batch = calculatedBatch;
        });
      }
    }
    if (deptCode != null) {
      final dept = _emailDeptCodes[deptCode];
      if (dept != null && _departments.contains(dept)) {
        setState(() {
          _department = dept;
        });
      }
    }
  }


  Future<void> _register() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() { _loading = true; _error = null; _success = null; });
    final result = await context.read<AuthService>().register(
      firstName: _firstNameCtrl.text.trim(),
      lastName: _lastNameCtrl.text.trim(),
      email: _emailCtrl.text.trim(),
      phone: _phoneCtrl.text.trim(),
      password: _passwordCtrl.text,
      registerNumber: _regNoCtrl.text.trim(),
      department: _department,
      batch: _batch,
    );
    if (!mounted) return;
    setState(() => _loading = false);
    if (result['success'] == true) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Registration successful! Please login.')),
      );
      Navigator.pop(context);
    } else {
      setState(() => _error = result['message'] ?? 'Registration failed.');
    }
  }

  Future<void> _showVerificationDialog(String email) async {
    final otpCtrl = TextEditingController();
    String? dialogError;
    bool dialogLoading = false;

    await showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              backgroundColor: AppColors.card,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
              title: const Text('Email Verification', style: TextStyle(fontWeight: FontWeight.bold, color: AppColors.text)),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'We have sent a 6-digit verification code to: $email\n\nPlease enter it below to complete registration:',
                    style: const TextStyle(fontSize: 13, color: AppColors.textMuted),
                  ),
                  const SizedBox(height: 16),
                  if (dialogError != null) ...[
                    Text(dialogError!, style: const TextStyle(color: AppColors.error, fontSize: 13, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 12),
                  ],
                  TextField(
                    controller: otpCtrl,
                    style: const TextStyle(color: AppColors.text, fontSize: 22, letterSpacing: 6),
                    keyboardType: TextInputType.number,
                    maxLength: 6,
                    textAlign: TextAlign.center,
                    decoration: const InputDecoration(
                      counterText: '',
                      labelText: 'OTP Code',
                    ),
                  ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: dialogLoading ? null : () => Navigator.pop(context),
                  child: const Text('Cancel', style: TextStyle(color: AppColors.textMuted)),
                ),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    minimumSize: const Size(110, 44),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                  onPressed: dialogLoading ? null : () async {
                    final otpVal = otpCtrl.text.trim();
                    if (otpVal.length != 6) {
                      setDialogState(() => dialogError = 'OTP must be 6 digits.');
                      return;
                    }
                    setDialogState(() {
                      dialogLoading = true;
                      dialogError = null;
                    });
                    final res = await context.read<AuthService>().verifyEmailRegister(email, otpVal);
                    if (!mounted) return;
                    if (res['success'] == true) {
                      Navigator.pop(context, true); // Pop with success status
                    } else {
                      setDialogState(() {
                        dialogLoading = false;
                        dialogError = res['message'] ?? 'Verification failed.';
                      });
                    }
                  },
                  child: dialogLoading
                    ? const SizedBox(height: 16, width: 16, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                    : const Text('Verify', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                ),
              ],
            );
          },
        );
      },
    ).then((success) {
      if (success == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Email verified successfully! You can now log in.'), backgroundColor: AppColors.success)
        );
        Navigator.pop(context); // Pop registration screen
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Student Registration'),
        leading: IconButton(icon: const Icon(Icons.arrow_back_ios), onPressed: () => Navigator.pop(context)),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_error != null) _statusBox(_error!, AppColors.error),
              if (_success != null) _statusBox(_success!, AppColors.success),
              if (_error != null || _success != null) const SizedBox(height: 16),

              Row(children: [
                Expanded(child: _field(_firstNameCtrl, 'First Name', Icons.person_outline, validator: _required)),
                const SizedBox(width: 12),
                Expanded(child: _field(_lastNameCtrl, 'Last Name', Icons.person_outline, validator: _required)),
              ]),
              const SizedBox(height: 16),
              _field(_emailCtrl, 'College Email (@sece.ac.in)', Icons.email_outlined,
                keyboardType: TextInputType.emailAddress,
                validator: (v) {
                  if (v == null || v.isEmpty) return 'Required';
                  if (!v.toLowerCase().endsWith('@sece.ac.in')) return 'Must be @sece.ac.in email';
                  return null;
                }),
              if (_emailFeedback != null) ...[
                const SizedBox(height: 4),
                Padding(
                  padding: const EdgeInsets.only(left: 8.0),
                  child: Text(_emailFeedback!, style: TextStyle(color: _emailFeedbackColor, fontSize: 12, fontWeight: FontWeight.w600)),
                ),
              ],
              const SizedBox(height: 16),
              _field(_phoneCtrl, 'Phone Number', Icons.phone_outlined,
                keyboardType: TextInputType.phone,
                validator: _required),
              const SizedBox(height: 16),
              _field(_regNoCtrl, 'Register Number', Icons.badge_outlined, validator: _required),
              if (_regNoFeedback != null) ...[
                const SizedBox(height: 4),
                Padding(
                  padding: const EdgeInsets.only(left: 8.0),
                  child: Text(_regNoFeedback!, style: TextStyle(color: _regNoFeedbackColor, fontSize: 12, fontWeight: FontWeight.w600)),
                ),
              ],

              const SizedBox(height: 16),
              _dropdown('Department', _department, _departments, (v) => setState(() => _department = v!)),
              const SizedBox(height: 16),
              _dropdown('Batch', _batch, _batches, (v) => setState(() => _batch = v!)),
              const SizedBox(height: 16),
              TextFormField(
                controller: _passwordCtrl,
                obscureText: _obscure,
                style: const TextStyle(color: AppColors.text),
                decoration: InputDecoration(
                  labelText: 'Password (min 8 characters)',
                  prefixIcon: const Icon(Icons.lock_outline, color: AppColors.textMuted),
                  suffixIcon: IconButton(
                    icon: Icon(_obscure ? Icons.visibility_off : Icons.visibility, color: AppColors.textMuted),
                    onPressed: () => setState(() => _obscure = !_obscure),
                  ),
                ),
                validator: (v) {
                  if (v == null || v.isEmpty) return 'Required';
                  if (v.length < 8) return 'Min 8 characters';
                  return null;
                },
              ),
              const SizedBox(height: 32),
              SizedBox(
                height: 54,
                child: ElevatedButton(
                  onPressed: _loading ? null : _register,
                  child: _loading
                    ? const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5))
                    : const Text('Create Account', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white)),
                ),
              ),
              const SizedBox(height: 16),
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Already have an account? Login', style: TextStyle(color: AppColors.primary)),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _field(TextEditingController ctrl, String label, IconData icon,
      {TextInputType? keyboardType, String? Function(String?)? validator}) {
    return TextFormField(
      controller: ctrl,
      keyboardType: keyboardType,
      style: const TextStyle(color: AppColors.text),
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon, color: AppColors.textMuted),
      ),
      validator: validator,
    );
  }

  Widget _dropdown(String label, String value, List<String> items, void Function(String?) onChanged) {
    return DropdownButtonFormField<String>(
      value: value,
      dropdownColor: AppColors.card,
      style: const TextStyle(color: AppColors.text),
      decoration: InputDecoration(labelText: label),
      items: items.map((e) => DropdownMenuItem(value: e, child: Text(e))).toList(),
      onChanged: onChanged,
    );
  }

  Widget _statusBox(String msg, Color color) => Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: color.withOpacity(0.15),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: color.withOpacity(0.4)),
    ),
    child: Text(msg, style: TextStyle(color: color, fontSize: 13)),
  );

  String? _required(String? v) => (v == null || v.isEmpty) ? 'Required' : null;
}
