import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:http/http.dart' as http;
import 'package:fl_chart/fl_chart.dart';
import 'package:path_provider/path_provider.dart';
import '../../main.dart';
import '../../services/auth_service.dart';
import '../../constants/api_constants.dart';
import 'pricing_settings_screen.dart';


class AdminDashboard extends StatefulWidget {
  const AdminDashboard({super.key});
  @override
  State<AdminDashboard> createState() => _AdminDashboardState();
}

class _AdminDashboardState extends State<AdminDashboard> {
  int _tab = 0;

  Future<void> _exportRevenueToCSV(BuildContext context) async {
    try {
      final auth = context.read<AuthService>();
      final histRes = await http.get(Uri.parse(ApiConstants.earningsHistory), headers: auth.authHeaders);
      final data = jsonDecode(histRes.body);
      final history = data['history'] ?? [];

      if (history.isEmpty) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('No revenue history available to export.')),
          );
        }
        return;
      }

      StringBuffer csv = StringBuffer();
      csv.writeln('Date,Total Revenue (Rs.),Orders Count');
      for (var row in history) {
        csv.writeln('${row['date']},${row['total']},${row['count']}');
      }

      final directory = await getApplicationDocumentsDirectory();
      final file = File('${directory.path}/revenue_report.csv');
      await file.writeAsString(csv.toString());

      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Exported: ${file.path}'),
            backgroundColor: AppColors.success,
            duration: const Duration(seconds: 5),
            action: SnackBarAction(
              label: 'OK',
              textColor: Colors.white,
              onPressed: () {},
            ),
          ),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Export failed: $e'), backgroundColor: AppColors.error),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Admin Panel'),
        actions: [
          PopupMenuButton<String>(
            icon: const Icon(Icons.settings),
            onSelected: (val) {
              if (val == 'pricing') {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const PricingSettingsScreen()),
                );
              } else if (val == 'export') {
                _exportRevenueToCSV(context);
              } else if (val == 'logout') {
                auth.logout();
              }
            },
            itemBuilder: (ctx) => [
              const PopupMenuItem(
                value: 'pricing',
                child: Row(
                  children: [
                    Icon(Icons.tune, color: AppColors.warning, size: 20),
                    SizedBox(width: 10),
                    Text('Pricing Settings'),
                  ],
                ),
              ),
              const PopupMenuItem(
                value: 'export',
                child: Row(
                  children: [
                    Icon(Icons.file_download, color: AppColors.success, size: 20),
                    SizedBox(width: 10),
                    Text('Export Revenue'),
                  ],
                ),
              ),
              const PopupMenuItem(
                value: 'logout',
                child: Row(
                  children: [
                    Icon(Icons.logout, color: AppColors.error, size: 20),
                    SizedBox(width: 10),
                    Text('Sign Out'),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
      body: IndexedStack(
        index: _tab,
        children: const [
          DashboardTab(),
          OrdersAdminTab(),
          ResourcesTab(),
          EarningsTab(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        backgroundColor: AppColors.surface,
        indicatorColor: AppColors.warning.withOpacity(0.2),
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        destinations: const [
          NavigationDestination(icon: Icon(Icons.dashboard_outlined), selectedIcon: Icon(Icons.dashboard, color: AppColors.warning), label: 'Dashboard'),
          NavigationDestination(icon: Icon(Icons.list_alt_outlined), selectedIcon: Icon(Icons.list_alt, color: AppColors.warning), label: 'Orders'),
          NavigationDestination(icon: Icon(Icons.layers_outlined), selectedIcon: Icon(Icons.layers, color: AppColors.warning), label: 'Resources'),
          NavigationDestination(icon: Icon(Icons.bar_chart_outlined), selectedIcon: Icon(Icons.bar_chart, color: AppColors.warning), label: 'Earnings'),
        ],
      ),
    );
  }
}

// ─── DASHBOARD TAB ────────────────────────────────────────────────────────────
class DashboardTab extends StatefulWidget {
  const DashboardTab({super.key});
  @override
  State<DashboardTab> createState() => _DashboardTabState();
}

class _DashboardTabState extends State<DashboardTab> {
  Map<String, dynamic>? _stats;
  bool _loading = true;

  @override
  void initState() { super.initState(); _loadStats(); }

  Future<void> _loadStats() async {
    setState(() => _loading = true);
    try {
      final auth = context.read<AuthService>();
      final res = await http.get(Uri.parse(ApiConstants.dashboardStats), headers: auth.authHeaders);
      final data = jsonDecode(res.body);
      if (mounted) setState(() { _stats = data['stats']; _loading = false; });

    } catch (_) { if (mounted) setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _loadStats,
      color: AppColors.warning,
      child: _loading
        ? const Center(child: CircularProgressIndicator(color: AppColors.warning))
        : SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(20),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Overview', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
              const SizedBox(height: 4),
              const Text("Today's summary", style: TextStyle(color: AppColors.textMuted, fontSize: 14)),
              const SizedBox(height: 20),
              GridView.count(
                crossAxisCount: 2,
                crossAxisSpacing: 14,
                mainAxisSpacing: 14,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                childAspectRatio: 1.1,
                children: [
                  _statCard('Orders Today', '${_stats?['todayOrders'] ?? 0}', Icons.print_rounded, AppColors.primary),
                  _statCard('Earnings Today', 'Rs. ${_stats?['todayEarnings'] ?? 0}', Icons.currency_rupee, AppColors.success),
                  _statCard('Paper Stock', '${_stats?['paperStock'] ?? 0} sheets', Icons.description_rounded, AppColors.secondary),
                  _statCard('Pending Orders', '${_stats?['pendingOrders'] ?? 0}', Icons.hourglass_empty, AppColors.warning),
                ],
              ),
            ]),
          ),
    );
  }

  Widget _statCard(String label, String value, IconData icon, Color color) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: AppColors.card,
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: color.withOpacity(0.2)),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(color: color.withOpacity(0.15), borderRadius: BorderRadius.circular(10)),
          child: Icon(icon, color: color, size: 20),
        ),
        const SizedBox(height: 4),
        Text(value, style: TextStyle(color: color, fontSize: 18, fontWeight: FontWeight.bold)),
        Text(label, style: const TextStyle(color: AppColors.textMuted, fontSize: 11)),
      ],
    ),
  );
}


// ─── ORDERS ADMIN TAB ─────────────────────────────────────────────────────────
class OrdersAdminTab extends StatefulWidget {
  const OrdersAdminTab({super.key});
  @override
  State<OrdersAdminTab> createState() => _OrdersAdminTabState();
}

class _OrdersAdminTabState extends State<OrdersAdminTab> {
  List<dynamic> _orders = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final auth = context.read<AuthService>();
      final res = await http.get(Uri.parse(ApiConstants.adminOrders), headers: auth.authHeaders);
      final data = jsonDecode(res.body);
      if (data['success'] == true && mounted) setState(() { _orders = data['orders'] ?? []; _loading = false; });
    } catch (_) { if (mounted) setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.warning,
      child: _loading
        ? const Center(child: CircularProgressIndicator(color: AppColors.warning))
        : ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: _orders.length,
            itemBuilder: (_, i) {
              final o = _orders[i];
              return Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(14)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                    Text(o['tokenNumber'] ?? '', style: const TextStyle(color: AppColors.warning, fontWeight: FontWeight.bold)),
                    Text('Rs. ${o['amount'] ?? 0}', style: const TextStyle(color: AppColors.success, fontWeight: FontWeight.bold)),
                  ]),
                  const SizedBox(height: 4),
                  Text(o['studentName'] ?? '', style: const TextStyle(color: AppColors.text, fontWeight: FontWeight.w600)),
                  Text(o['registerNumber'] ?? '', style: const TextStyle(color: AppColors.textMuted, fontSize: 13)),
                  Text(o['fileName'] ?? '', style: const TextStyle(color: AppColors.textMuted, fontSize: 12), overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 6),
                  Row(children: [
                    _chip(o['colorMode'] == 'color' ? 'Color' : 'B&W'),
                    const SizedBox(width: 6),
                    _chip('${o['copies'] ?? 1} copy'),
                    const SizedBox(width: 6),
                    _chip(o['pageSize'] ?? 'A4'),
                  ]),
                ]),
              );
            },
          ),
    );
  }

  Widget _chip(String label) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
    decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(6)),
    child: Text(label, style: const TextStyle(color: AppColors.textMuted, fontSize: 11)),
  );
}

// ─── STAFF TAB ────────────────────────────────────────────────────────────────
class StaffTab extends StatefulWidget {
  const StaffTab({super.key});
  @override
  State<StaffTab> createState() => _StaffTabState();
}

class _StaffTabState extends State<StaffTab> {
  List<dynamic> _staff = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final auth = context.read<AuthService>();
      final res = await http.get(Uri.parse(ApiConstants.adminStaff), headers: auth.authHeaders);
      final data = jsonDecode(res.body);
      if (data['success'] == true && mounted) setState(() { _staff = data['staff'] ?? []; _loading = false; });
    } catch (_) { if (mounted) setState(() => _loading = false); }
  }

  Future<void> _deleteStaff(String id, String name) async {
    final passCtrl = TextEditingController();
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.card,
        title: const Text('Delete Staff', style: TextStyle(color: AppColors.text)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Remove $name from staff? Enter admin password to confirm:', style: const TextStyle(color: AppColors.textMuted)),
            const SizedBox(height: 16),
            TextField(
              controller: passCtrl,
              obscureText: true,
              style: const TextStyle(color: AppColors.text),
              decoration: const InputDecoration(
                labelText: 'Admin Password',
                prefixIcon: Icon(Icons.lock_outline, color: AppColors.textMuted),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete', style: TextStyle(color: AppColors.error)),
          ),
        ],
      ),
    );

    if (confirm == true) {
      final password = passCtrl.text.trim();
      if (password.isEmpty) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Password is required to delete staff.')),
          );
        }
        return;
      }

      try {
        final auth = context.read<AuthService>();
        final response = await http.delete(
          Uri.parse(ApiConstants.deleteStaff(id)),
          headers: auth.authHeaders,
          body: jsonEncode({'password': password}),
        );
        final data = jsonDecode(response.body);
        if (data['success'] == true) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Staff account deleted successfully!'), backgroundColor: AppColors.success),
            );
          }
          _load();
        } else {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(data['message'] ?? 'Failed to delete staff.'), backgroundColor: AppColors.error),
            );
          }
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.error),
          );
        }
      }
    }
    passCtrl.dispose();
  }


  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.warning,
      child: _loading
        ? const Center(child: CircularProgressIndicator(color: AppColors.warning))
        : _staff.isEmpty
          ? const Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              Icon(Icons.people_outline, color: AppColors.textMuted, size: 64),
              SizedBox(height: 16),
              Text('No staff accounts', style: TextStyle(color: AppColors.textMuted)),
            ]))
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _staff.length,
              itemBuilder: (_, i) {
                final s = _staff[i];
                final isActive = s['isActive'] == true;
                return Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(14)),
                  child: Row(children: [
                    Container(
                      width: 44, height: 44,
                      decoration: BoxDecoration(
                        color: isActive ? AppColors.success.withOpacity(0.15) : AppColors.surface,
                        borderRadius: BorderRadius.circular(22),
                      ),
                      child: Icon(Icons.person, color: isActive ? AppColors.success : AppColors.textMuted),
                    ),
                    const SizedBox(width: 14),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(s['name'] ?? '', style: const TextStyle(color: AppColors.text, fontWeight: FontWeight.w600)),

                      Text('@${s['username'] ?? ''}', style: const TextStyle(color: AppColors.textMuted, fontSize: 13)),
                    ])),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: isActive ? AppColors.success.withOpacity(0.15) : AppColors.surface,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(isActive ? 'Online' : 'Offline', style: TextStyle(color: isActive ? AppColors.success : AppColors.textMuted, fontSize: 11, fontWeight: FontWeight.bold)),
                    ),
                    const SizedBox(width: 8),
                    IconButton(
                      icon: const Icon(Icons.delete_outline, color: AppColors.error),
                      onPressed: () => _deleteStaff(s['id']?.toString() ?? s['_id']?.toString() ?? '', s['name'] ?? ''),
                    ),
                  ]),
                );
              },
            ),
    );
  }
}

// ─── RESOURCES TAB ────────────────────────────────────────────────────────────
class ResourcesTab extends StatefulWidget {
  const ResourcesTab({super.key});
  @override
  State<ResourcesTab> createState() => _ResourcesTabState();
}

class _ResourcesTabState extends State<ResourcesTab> {
  int _sheets = 0;
  List<dynamic> _history = [];
  bool _loading = true;
  final _supplySheetsCtrl = TextEditingController();
  final _supplyNoteCtrl = TextEditingController();
  final _overrideSheetsCtrl = TextEditingController();
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _supplySheetsCtrl.dispose();
    _supplyNoteCtrl.dispose();
    _overrideSheetsCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final auth = context.read<AuthService>();
      final statusRes = await http.get(Uri.parse(ApiConstants.resourceStatus), headers: auth.authHeaders);
      final statusData = jsonDecode(statusRes.body);
      
      final historyRes = await http.get(Uri.parse(ApiConstants.baseUrl + '/resources/history'), headers: auth.authHeaders);
      final historyData = jsonDecode(historyRes.body);

      if (mounted) {
        setState(() {
          _sheets = statusData['paper']?['sheets'] ?? 0;
          _history = historyData['paperHistory'] ?? [];
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _supplyPaper(bool direct) async {
    final val = int.tryParse(_supplySheetsCtrl.text) ?? 0;
    if (val <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter valid sheet count.')));
      return;
    }
    setState(() => _submitting = true);
    try {
      final auth = context.read<AuthService>();
      final res = await http.post(
        Uri.parse(ApiConstants.baseUrl + '/resources/supply-paper'),
        headers: auth.authHeaders,
        body: jsonEncode({
          'sheets': val,
          'note': _supplyNoteCtrl.text.trim(),
          'direct': direct,
        }),
      );
      final data = jsonDecode(res.body);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(data['message'] ?? (data['success'] == true ? 'Supplied successfully!' : 'Failed')),
          backgroundColor: data['success'] == true ? AppColors.success : AppColors.error,
        ));
        if (data['success'] == true) {
          _supplySheetsCtrl.clear();
          _supplyNoteCtrl.clear();
          _load();
        }
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
    setState(() => _submitting = false);
  }

  Future<void> _overridePaper() async {
    final val = int.tryParse(_overrideSheetsCtrl.text);
    if (val == null || val < 0) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter valid sheets value.')));
      return;
    }
    setState(() => _submitting = true);
    try {
      final auth = context.read<AuthService>();
      final res = await http.put(
        Uri.parse(ApiConstants.baseUrl + '/resources/paper/override'),
        headers: auth.authHeaders,
        body: jsonEncode({'sheets': val}),
      );
      final data = jsonDecode(res.body);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(data['message'] ?? (data['success'] == true ? 'Stock overridden!' : 'Failed')),
          backgroundColor: data['success'] == true ? AppColors.success : AppColors.error,
        ));
        if (data['success'] == true) {
          _overrideSheetsCtrl.clear();
          _load();
        }
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
    setState(() => _submitting = false);
  }

  Color _progressColor(int sheets) {
    if (sheets <= 20) return AppColors.error;
    if (sheets <= 100) return AppColors.warning;
    return AppColors.success;
  }

  @override
  Widget build(BuildContext context) {
    final progress = (_sheets / 500.0).clamp(0.0, 1.0);
    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.warning,
      child: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.warning))
          : SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              physics: const AlwaysScrollableScrollPhysics(),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text('Resource Management', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 20),

                  // Stock Level Card
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: AppColors.card,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Column(
                      children: [
                        const Text('CURRENT PAPER STOCK', style: TextStyle(color: AppColors.textMuted, fontSize: 13, fontWeight: FontWeight.bold)),
                        const SizedBox(height: 10),
                        Text('$_sheets', style: const TextStyle(fontSize: 48, fontWeight: FontWeight.w800, color: AppColors.text)),

                        const Text('sheets', style: TextStyle(color: AppColors.textMuted, fontSize: 14)),
                        const SizedBox(height: 16),
                        LinearProgressIndicator(
                          value: progress,
                          backgroundColor: AppColors.border,
                          color: _progressColor(_sheets),
                          minHeight: 12,
                          borderRadius: BorderRadius.circular(6),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Supply Form Card
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: AppColors.card,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Supply Resources', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.warning)),
                        const SizedBox(height: 14),
                        TextField(
                          controller: _supplySheetsCtrl,
                          keyboardType: TextInputType.number,
                          style: const TextStyle(color: AppColors.text),
                          decoration: const InputDecoration(
                            labelText: 'Sheets to supply',
                            prefixIcon: Icon(Icons.layers, color: AppColors.textMuted),
                          ),
                        ),
                        const SizedBox(height: 14),
                        TextField(
                          controller: _supplyNoteCtrl,
                          style: const TextStyle(color: AppColors.text),
                          decoration: const InputDecoration(
                            labelText: 'Supply Notes (optional)',
                            prefixIcon: Icon(Icons.note_alt_outlined, color: AppColors.textMuted),
                          ),
                        ),
                        const SizedBox(height: 20),
                        Row(
                          children: [
                            Expanded(
                              child: ElevatedButton(
                                onPressed: _submitting ? null : () => _supplyPaper(false),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: AppColors.primary,
                                  foregroundColor: Colors.white,
                                  minimumSize: const Size(0, 48),
                                ),
                                child: const Text('Send to Staff', style: TextStyle(fontWeight: FontWeight.bold)),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: ElevatedButton(
                                onPressed: _submitting ? null : () => _supplyPaper(true),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: const Color(0xFF6B7280), // grey-600
                                  foregroundColor: Colors.white,
                                  minimumSize: const Size(0, 48),
                                ),
                                child: const Text('Add Directly', style: TextStyle(fontWeight: FontWeight.bold)),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Override Form Card
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: AppColors.card,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Override Stock', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.warning)),
                        const SizedBox(height: 14),
                        Row(
                          children: [
                            Expanded(
                              child: TextField(
                                controller: _overrideSheetsCtrl,
                                keyboardType: TextInputType.number,
                                style: const TextStyle(color: AppColors.text),
                                decoration: const InputDecoration(
                                  labelText: 'Set exact sheets count',
                                  prefixIcon: Icon(Icons.edit_note, color: AppColors.textMuted),
                                ),
                              ),
                            ),
                            const SizedBox(width: 14),
                            ElevatedButton(
                              onPressed: _submitting ? null : _overridePaper,
                              style: ElevatedButton.styleFrom(
                                  backgroundColor: AppColors.warning,
                                  foregroundColor: Colors.white,
                                  minimumSize: const Size(120, 52)),
                              child: const Text('Override', style: TextStyle(fontWeight: FontWeight.bold)),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),

                  // History List
                  if (_history.isNotEmpty) ...[
                    const Text('Supply History', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 12),
                    ..._history.map((h) {
                      final dateStr = h['confirmedAt'] ?? h['suppliedAt'] ?? '';
                      String formattedDate = '';
                      if (dateStr.isNotEmpty) {
                        try {
                          formattedDate = DateTime.parse(dateStr).toLocal().toString().substring(0, 16);
                        } catch (_) {}
                      }
                      final note = h['note'] ?? '';
                      return Container(
                        margin: const EdgeInsets.only(bottom: 10),
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: AppColors.card,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: AppColors.border),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text('${h['sheets']} sheets', style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.text)),
                                Text(
                                  h['confirmed'] == true ? 'CONFIRMED' : 'PENDING',
                                  style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    fontSize: 12,
                                    color: h['confirmed'] == true ? AppColors.success : AppColors.warning,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 6),
                            Text('Supplied by: ${h['suppliedBy'] ?? "-"} | Confirmed by: ${h['confirmedBy'] ?? "-"}', style: const TextStyle(color: AppColors.textMuted, fontSize: 12)),
                            if (note.isNotEmpty) ...[
                              const SizedBox(height: 4),
                              Text('Note: $note', style: const TextStyle(color: AppColors.textMuted, fontSize: 12, fontStyle: FontStyle.italic)),
                            ],
                            if (formattedDate.isNotEmpty) ...[
                              const SizedBox(height: 4),
                              Text(formattedDate, style: const TextStyle(color: AppColors.textMuted, fontSize: 11)),
                            ],
                          ],
                        ),
                      );
                    }),
                  ],
                ],
              ),
            ),
    );
  }
}

// ─── EARNINGS TAB ─────────────────────────────────────────────────────────────
class EarningsTab extends StatefulWidget {
  const EarningsTab({super.key});
  @override
  State<EarningsTab> createState() => _EarningsTabState();
}

class _EarningsTabState extends State<EarningsTab> {
  Map<String, dynamic>? _summary;
  List<dynamic> _history = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    try {
      final auth = context.read<AuthService>();
      final summRes = await http.get(Uri.parse(ApiConstants.earningsSummary), headers: auth.authHeaders);
      final histRes = await http.get(Uri.parse(ApiConstants.earningsHistory), headers: auth.authHeaders);
      if (mounted) setState(() {
        _summary = jsonDecode(summRes.body)['summary'];
        _history = jsonDecode(histRes.body)['history'] ?? [];
        _loading = false;
      });
    } catch (_) { if (mounted) setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    return _loading
      ? const Center(child: CircularProgressIndicator(color: AppColors.warning))
      : SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Earnings', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
            const SizedBox(height: 20),
            Row(children: [
              Expanded(child: _summaryCard('Today', 'Rs. ${_summary?['today']?['earnings'] ?? 0}', AppColors.success)),
              const SizedBox(width: 12),
              Expanded(child: _summaryCard('This Week', 'Rs. ${_summary?['week']?['earnings'] ?? 0}', AppColors.primary)),
            ]),
            const SizedBox(height: 12),
            _summaryCard('This Month', 'Rs. ${_summary?['month']?['earnings'] ?? 0}', AppColors.warning),
            const SizedBox(height: 24),
            if (_history.isNotEmpty) ...[
              const Text('Last 30 Days', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
              const SizedBox(height: 16),
              SizedBox(
                height: 200,
                child: BarChart(
                  BarChartData(
                    barGroups: _history.asMap().entries.take(14).map((e) => BarChartGroupData(
                      x: e.key,
                      barRods: [BarChartRodData(
                        toY: (e.value['totalEarnings'] ?? 0).toDouble(),
                        color: AppColors.warning,
                        width: 16,
                        borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
                      )],
                    )).toList(),
                    gridData: const FlGridData(show: false),
                    borderData: FlBorderData(show: false),
                    titlesData: const FlTitlesData(show: false),
                  ),
                ),
              ),
              const SizedBox(height: 24),
              const Text('Daily Breakdown', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),

              const SizedBox(height: 12),
              ..._history.take(10).map((h) => Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(12)),
                child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                  Text(h['_id'] ?? '', style: const TextStyle(color: AppColors.textMuted)),
                  Text('Rs. ${h['totalEarnings'] ?? 0}', style: const TextStyle(color: AppColors.success, fontWeight: FontWeight.bold)),
                  Text('${h['orderCount'] ?? 0} orders', style: const TextStyle(color: AppColors.textMuted, fontSize: 12)),
                ]),
              )),
            ],
          ]),
        );
  }

  Widget _summaryCard(String label, String value, Color color) => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: AppColors.card,
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: color.withOpacity(0.2)),
    ),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: const TextStyle(color: AppColors.textMuted, fontSize: 13)),
      const SizedBox(height: 6),
      Text(value, style: TextStyle(color: color, fontSize: 20, fontWeight: FontWeight.bold)),
    ]),
  );
}
