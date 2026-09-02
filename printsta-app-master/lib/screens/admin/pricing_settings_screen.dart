import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:http/http.dart' as http;
import '../../main.dart';
import '../../services/auth_service.dart';
import '../../constants/api_constants.dart';

class PricingSettingsScreen extends StatefulWidget {
  const PricingSettingsScreen({super.key});
  @override
  State<PricingSettingsScreen> createState() => _PricingSettingsScreenState();
}

class _PricingSettingsScreenState extends State<PricingSettingsScreen> {
  bool _loading = true;
  final _bwSingleCtrl = TextEditingController();
  final _bwDoubleCtrl = TextEditingController();
  final _cSingleCtrl = TextEditingController();
  final _cDoubleCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _bwSingleCtrl.dispose();
    _bwDoubleCtrl.dispose();
    _cSingleCtrl.dispose();
    _cDoubleCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final res = await http.get(Uri.parse(ApiConstants.pricing));
      final data = jsonDecode(res.body);
      if (mounted) {
        setState(() {
          _bwSingleCtrl.text = '${data['bwSingleRate'] ?? 2}';
          _bwDoubleCtrl.text = '${data['bwDoubleRate'] ?? 3}';
          _cSingleCtrl.text = '${data['colorSingleRate'] ?? 5}';
          _cDoubleCtrl.text = '${data['colorDoubleRate'] ?? 7}';
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    if (_passwordCtrl.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter admin password to confirm.')));
      return;
    }
    setState(() => _saving = true);
    try {
      final auth = context.read<AuthService>();
      final res = await http.post(
        Uri.parse(ApiConstants.verifyPriceChange),
        headers: auth.authHeaders,
        body: jsonEncode({
          'password': _passwordCtrl.text,
          'newBwSingleRate': double.tryParse(_bwSingleCtrl.text) ?? 2.0,
          'newBwDoubleRate': double.tryParse(_bwDoubleCtrl.text) ?? 3.0,
          'newColorSingleRate': double.tryParse(_cSingleCtrl.text) ?? 5.0,
          'newColorDoubleRate': double.tryParse(_cDoubleCtrl.text) ?? 7.0,
          'adminName': auth.name ?? 'Admin',

        }),
      );
      final data = jsonDecode(res.body);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(data['message'] ?? (data['success'] == true ? 'Pricing updated!' : 'Failed')),
          backgroundColor: data['success'] == true ? AppColors.success : AppColors.error,
        ));
        if (data['success'] == true) {
          _passwordCtrl.clear();
          _load();
        }
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
    setState(() => _saving = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Pricing Settings'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.warning))
          : SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text('Update print rates', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 4),
                  const Text('Requires admin password verification', style: TextStyle(color: AppColors.textMuted, fontSize: 13)),
                  const SizedBox(height: 24),
                  _sectionLabel('Black & White'),
                  const SizedBox(height: 12),
                  Row(children: [
                    Expanded(child: _priceField(_bwSingleCtrl, 'Single Sided (per page)')),
                    const SizedBox(width: 14),
                    Expanded(child: _priceField(_bwDoubleCtrl, 'Double Sided (per sheet)')),
                  ]),
                  const SizedBox(height: 20),
                  _sectionLabel('Color'),
                  const SizedBox(height: 12),
                  Row(children: [
                    Expanded(child: _priceField(_cSingleCtrl, 'Single Sided (per page)')),
                    const SizedBox(width: 14),
                    Expanded(child: _priceField(_cDoubleCtrl, 'Double Sided (per sheet)')),
                  ]),
                  const SizedBox(height: 24),
                  TextField(
                    controller: _passwordCtrl,
                    obscureText: true,
                    style: const TextStyle(color: AppColors.text),
                    decoration: const InputDecoration(
                      labelText: 'Admin Password (to confirm)',
                      prefixIcon: Icon(Icons.lock_outline, color: AppColors.textMuted),
                    ),
                  ),
                  const SizedBox(height: 20),
                  SizedBox(
                    height: 52,
                    child: ElevatedButton(
                      onPressed: _saving ? null : _save,
                      style: ElevatedButton.styleFrom(backgroundColor: AppColors.warning),
                      child: _saving
                          ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                          : const Text('Update Pricing', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                    ),
                  ),
                ],
              ),
            ),
    );
  }

  Widget _sectionLabel(String label) => Text(label, style: const TextStyle(color: AppColors.warning, fontWeight: FontWeight.w600, fontSize: 15));

  Widget _priceField(TextEditingController ctrl, String label) => TextField(
        controller: ctrl,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        style: const TextStyle(color: AppColors.text, fontSize: 20, fontWeight: FontWeight.bold),
        decoration: InputDecoration(
          labelText: label,
          prefixText: 'Rs. ',
          prefixStyle: const TextStyle(color: AppColors.textMuted),
        ),
      );
}
