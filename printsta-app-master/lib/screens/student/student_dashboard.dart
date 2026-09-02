import 'dart:io';
import 'dart:convert';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:file_picker/file_picker.dart';
import 'package:http/http.dart' as http;
import 'package:razorpay_flutter/razorpay_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../main.dart';
import '../../services/auth_service.dart';
import '../../constants/api_constants.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:path_provider/path_provider.dart';


class CartItem {
  final String id;
  final PlatformFile? file;
  int copies;
  String colorMode;
  String sides;
  String pageSize;
  String binding;
  String specialNote;
  int pages;
  bool selected;
  String orderType;

  CartItem({
    required this.id,
    this.file,
    this.copies = 1,
    this.colorMode = 'bw',
    this.sides = 'single',
    this.pageSize = 'A4',
    this.binding = 'none',
    this.specialNote = '',
    this.pages = 1,
    this.selected = true,
    this.orderType = 'print',
  });

  String get fileName => file?.name ?? 'Physical Xerox';
}

class StudentDashboard extends StatefulWidget {
  const StudentDashboard({super.key});
  @override
  State<StudentDashboard> createState() => _StudentDashboardState();
}

class _StudentDashboardState extends State<StudentDashboard> {
  int _tab = 0;
  final ValueNotifier<bool> _refreshOrdersNotifier = ValueNotifier<bool>(false);
  List<CartItem> cartList = [];

  @override
  void initState() {
    super.initState();
    _loadCartFromPrefs();
  }

  @override
  void dispose() {
    _refreshOrdersNotifier.dispose();
    super.dispose();
  }

  Future<void> _saveCartToPrefs() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final list = cartList.map((i) => {
        'id': i.id,
        'path': i.file?.path,
        'name': i.file?.name,
        'size': i.file?.size ?? 0,
        'copies': i.copies,
        'colorMode': i.colorMode,
        'sides': i.sides,
        'pageSize': i.pageSize,
        'binding': i.binding,
        'specialNote': i.specialNote,
        'pages': i.pages,
        'selected': i.selected,
        'orderType': i.orderType,
      }).toList();
      await prefs.setString('student_cart_items', jsonEncode(list));
      await prefs.setInt('student_cart_timestamp', DateTime.now().millisecondsSinceEpoch);
    } catch (_) {}
  }

  Future<void> _loadCartFromPrefs() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final ts = prefs.getInt('student_cart_timestamp') ?? 0;
      final now = DateTime.now().millisecondsSinceEpoch;
      final cutoff48h = 48 * 60 * 60 * 1000;
      if (now - ts > cutoff48h) {
        await prefs.remove('student_cart_items');
        await prefs.remove('student_cart_timestamp');
        return;
      }
      final raw = prefs.getString('student_cart_items');
      if (raw != null) {
        final list = jsonDecode(raw) as List;
        setState(() {
          cartList = list.map((m) => CartItem(
            id: m['id'],
            file: m['path'] != null ? PlatformFile(
              path: m['path'],
              name: m['name'] ?? 'Physical Xerox',
              size: m['size'] ?? 0,
            ) : null,
            copies: m['copies'] ?? 1,
            colorMode: m['colorMode'] ?? 'bw',
            sides: m['sides'] ?? 'single',
            pageSize: m['pageSize'] ?? 'A4',
            binding: m['binding'] ?? 'none',
            specialNote: m['specialNote'] ?? '',
            pages: m['pages'] ?? 1,
            selected: m['selected'] ?? true,
            orderType: (m['orderType'] == 'xerox' || (m['path'] == null && (m['name'] == 'Physical Xerox' || m['name'] == null))) ? 'xerox' : 'print',
          )).toList();
        });
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          _tab == 0
              ? 'Printsta'
              : _tab == 1
                  ? 'My Cart'
                  : _tab == 2
                      ? 'My Orders'
                      : 'Profile',
        ),
      ),
      body: IndexedStack(
        index: _tab,
        children: [
          UploadTab(
            refreshOrdersNotifier: _refreshOrdersNotifier,
            onTabChange: (index) => setState(() => _tab = index),
            cartList: cartList,
            onAddToCart: () {
              _saveCartToPrefs();
              setState(() => _tab = 1);
            },
          ),
          CartTab(
            cartList: cartList,
            refreshOrdersNotifier: _refreshOrdersNotifier,
            onTabChange: (index) => setState(() => _tab = index),
            onStateChanged: () {
              _saveCartToPrefs();
              setState(() {});
            },
          ),
          OrdersTab(refreshOrdersNotifier: _refreshOrdersNotifier),
          const ProfileTab(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        backgroundColor: AppColors.surface,
        indicatorColor: AppColors.primary.withOpacity(0.2),
        destinations: [
          const NavigationDestination(icon: Icon(Icons.upload_file_outlined), selectedIcon: Icon(Icons.upload_file, color: AppColors.primary), label: 'Upload'),
          NavigationDestination(
            icon: Badge(
              label: Text('${cartList.length}'),
              isLabelVisible: cartList.isNotEmpty,
              child: const Icon(Icons.shopping_cart_outlined),
            ),
            selectedIcon: Badge(
              label: Text('${cartList.length}'),
              isLabelVisible: cartList.isNotEmpty,
              child: const Icon(Icons.shopping_cart, color: AppColors.primary),
            ),
            label: 'My Cart',
          ),
          const NavigationDestination(icon: Icon(Icons.receipt_long_outlined), selectedIcon: Icon(Icons.receipt_long, color: AppColors.primary), label: 'My Orders'),
          const NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person, color: AppColors.primary), label: 'Profile'),
        ],
      ),
    );
  }
}

// ─── UPLOAD TAB ───────────────────────────────────────────────────────────────
class UploadTab extends StatefulWidget {
  final ValueNotifier<bool> refreshOrdersNotifier;
  final ValueChanged<int> onTabChange;
  final List<CartItem> cartList;
  final VoidCallback onAddToCart;

  const UploadTab({
    super.key,
    required this.refreshOrdersNotifier,
    required this.onTabChange,
    required this.cartList,
    required this.onAddToCart,
  });

  @override
  State<UploadTab> createState() => _UploadTabState();
}

class _UploadTabState extends State<UploadTab> {
  PlatformFile? _selectedFile;
  int _copies = 1;
  String _colorMode = 'bw';
  String _sides = 'single';
  String _pageSize = 'A4';
  String _binding = 'none';
  final _noteCtrl = TextEditingController();
  final _copiesCtrl = TextEditingController(text: '1');
  bool _loading = false;
  Map<String, dynamic>? _pricing;
  int _pdfPageCount = 1;
  String _orderType = 'print';
  bool _showXeroxInfo = false;
  final _pagesCtrl = TextEditingController(text: '1');

  @override
  void initState() {
    super.initState();
    _loadPricing();
    _copiesCtrl.addListener(() {
      final val = int.tryParse(_copiesCtrl.text) ?? 1;
      if (val != _copies) {
        setState(() {
          _copies = val.clamp(1, 99);
        });
      }
    });
    _pagesCtrl.addListener(() {
      final val = int.tryParse(_pagesCtrl.text) ?? 1;
      if (val != _pdfPageCount) {
        setState(() {
          _pdfPageCount = val.clamp(1, 1000);
        });
      }
    });
  }

  @override
  void dispose() {
    _noteCtrl.dispose();
    _copiesCtrl.dispose();
    _pagesCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadPricing() async {
    try {
      final res = await http.get(Uri.parse(ApiConstants.pricing));
      if (res.statusCode == 200) {
        setState(() => _pricing = jsonDecode(res.body));
      }
    } catch (_) {}
  }

  int get _estimatedPrice {
    if (_pricing == null) return 0;
    final pages = _pdfPageCount;
    final bwSingle = (_pricing!['bwSingleRate'] ?? 2).toInt();
    final bwDouble = (_pricing!['bwDoubleRate'] ?? 3).toInt();
    final cSingle = (_pricing!['colorSingleRate'] ?? 5).toInt();
    final cDouble = (_pricing!['colorDoubleRate'] ?? 7).toInt();

    final singleRate = _colorMode == 'color' ? cSingle : bwSingle;
    final doubleRate = _colorMode == 'color' ? cDouble : bwDouble;

    double pricePerCopy;
    if (_sides == 'single') {
      pricePerCopy = (pages * singleRate).toDouble();
    } else {
      final sheets = (pages / 2).floor();
      if (pages % 2 == 0) {
        pricePerCopy = (sheets * doubleRate).toDouble();
      } else {
        pricePerCopy = (sheets * doubleRate + 1 * singleRate).toDouble();
      }
    }
    if (_binding == 'calico' || _binding == 'spiral') {
      pricePerCopy += 30;
    }
    return (pricePerCopy * _copies).round();
  }

  Future<void> _updatePdfPageCount(String path) async {
    if (!path.toLowerCase().endsWith('.pdf')) {
      setState(() => _pdfPageCount = 1);
      return;
    }
    try {
      final file = File(path);
      final bytes = await file.readAsBytes();
      final content = String.fromCharCodes(bytes);
      
      final pageRegex = RegExp(r'/Type\s*/Page\b');
      final count = pageRegex.allMatches(content).length;
      
      if (count > 0) {
        setState(() => _pdfPageCount = count);
      } else {
        final countRegex = RegExp(r'/Count\s+(\d+)');
        final match = countRegex.firstMatch(content);
        if (match != null) {
          final val = int.tryParse(match.group(1) ?? '1') ?? 1;
          setState(() => _pdfPageCount = val);
        } else {
          setState(() => _pdfPageCount = 1);
        }
      }
    } catch (_) {
      setState(() => _pdfPageCount = 1);
    }
  }

  Future<void> _pickFile() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx'],
    );
    if (result != null) {
      final file = result.files.single;
      setState(() {
        _selectedFile = file;
      });
      if (file.path != null) {
        await _updatePdfPageCount(file.path!);
      }
    }
  }

  void _addToCart() {
    final isXerox = _orderType == 'xerox';
    if (!isXerox && _selectedFile == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: AppColors.error,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          margin: const EdgeInsets.all(16),
          content: const Row(
            children: [
              Icon(Icons.warning_amber_rounded, color: Colors.white),
              SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Please select a file first',
                  style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14),
                ),
              ),
            ],
          ),
        ),
      );
      return;
    }

    // Check for mixed order types in cart
    final hasPrint = widget.cartList.any((item) => (item.orderType) == 'print');
    final hasXerox = widget.cartList.any((item) => item.orderType == 'xerox');

    if (isXerox && hasPrint) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: AppColors.error,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          margin: const EdgeInsets.all(16),
          content: const Row(
            children: [
              Icon(Icons.warning_amber_rounded, color: Colors.white),
              SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Your cart already contains Print items. Please checkout or clear your cart first.',
                  style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14),
                ),
              ),
            ],
          ),
        ),
      );
      return;
    }
    if (!isXerox && hasXerox) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: AppColors.error,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          margin: const EdgeInsets.all(16),
          content: const Row(
            children: [
              Icon(Icons.warning_amber_rounded, color: Colors.white),
              SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Your cart already contains Xerox items. Please checkout or clear your cart first.',
                  style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14),
                ),
              ),
            ],
          ),
        ),
      );
      return;
    }

    final cartItem = CartItem(
      id: isXerox 
          ? 'cart_${DateTime.now().millisecondsSinceEpoch}_xerox'
          : 'cart_${DateTime.now().millisecondsSinceEpoch}_${_selectedFile!.name}',
      file: isXerox ? null : _selectedFile,
      copies: _copies,
      colorMode: _colorMode,
      sides: _sides,
      pageSize: _pageSize,
      binding: _binding,
      specialNote: _noteCtrl.text.trim(),
      pages: _pdfPageCount,
      orderType: _orderType,
      selected: true,
    );

    widget.cartList.add(cartItem);

    setState(() {
      _selectedFile = null;
      _copies = 1;
      _copiesCtrl.text = '1';
      _colorMode = 'bw';
      _sides = 'single';
      _pageSize = 'A4';
      _binding = 'none';
      _noteCtrl.clear();
      _pdfPageCount = 1;
      _orderType = 'print';
      _pagesCtrl.text = '1';
    });

    widget.onAddToCart();
  }



  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Order Option Dropdown with info-toggle button
          Row(
            children: [
              Expanded(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.card,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.textMuted.withOpacity(0.2)),
                  ),
                  child: DropdownButtonHideUnderline(
                    child: DropdownButton<String>(
                      value: _orderType,
                      isExpanded: true,
                      icon: const Icon(Icons.arrow_drop_down, color: AppColors.primary),
                      items: const [
                        DropdownMenuItem(value: 'print', child: Text('Print Document', style: TextStyle(fontWeight: FontWeight.bold))),
                        DropdownMenuItem(value: 'xerox', child: Text('Xerox / Photocopy', style: TextStyle(fontWeight: FontWeight.bold))),
                      ],
                      onChanged: (val) {
                        if (val != null) {
                          setState(() {
                            _orderType = val;
                            _showXeroxInfo = false;
                            if (_orderType == 'xerox') {
                              _selectedFile = null;
                              _pdfPageCount = int.tryParse(_pagesCtrl.text) ?? 1;
                            } else {
                              _pdfPageCount = 1;
                            }
                          });
                        }
                      },
                    ),
                  ),
                ),
              ),
              if (_orderType == 'xerox') ...[
                const SizedBox(width: 8),
                GestureDetector(
                  onTap: () => setState(() => _showXeroxInfo = !_showXeroxInfo),
                  child: Container(
                    width: 30,
                    height: 30,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: const Color(0xFFEFF6FF),
                      border: Border.all(color: const Color(0xFF3B82F6), width: 1.5),
                    ),
                    alignment: Alignment.center,
                    child: const Text('i', style: TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF1D4ED8), fontSize: 14)),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 12),

          // Xerox info box (toggled by i-button)
          if (_orderType == 'xerox' && _showXeroxInfo) ...[
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFEFF6FF),
                border: Border.all(color: const Color(0xFFBFDBFE)),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('How to fill “Pages to Xerox”:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12.5, color: Color(0xFF1E3A5F))),
                  SizedBox(height: 4),
                  Text(
                    'Count the physical sheets you will hand to staff.\n'
                    '\u2022 Single-sided: 10 sheets \u2192 enter 10\n'
                    '\u2022 Double-sided: 10 sheets \u2192 enter 10 (staff copies both sides, so 20 sides printed)\n'
                    'Price = Sheets \u00d7 Copies \u00d7 rate per side.',
                    style: TextStyle(fontSize: 12, color: Color(0xFF1E3A5F), height: 1.55),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
          ],

          if (_orderType == 'print') ...[
            const Text('Upload Document', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            const Text('Select a file to print', style: TextStyle(color: AppColors.textMuted, fontSize: 14)),
            const SizedBox(height: 20),

            // File picker
            GestureDetector(
              onTap: _pickFile,
              child: Container(
                height: 120,
                decoration: BoxDecoration(
                  color: AppColors.card,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: _selectedFile != null
                        ? AppColors.primary
                        : AppColors.textMuted.withOpacity(0.3),
                    width: 2,
                    style: BorderStyle.solid,
                  ),
                ),
                child: _selectedFile == null
                  ? const Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                      Icon(Icons.cloud_upload_outlined, color: AppColors.primary, size: 40),
                      SizedBox(height: 8),
                      Text('Tap to select file', style: TextStyle(color: AppColors.textMuted)),
                      Text('PDF, PNG, JPG, DOC supported', style: TextStyle(color: AppColors.textMuted, fontSize: 12)),
                    ])
                  : Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                      const Icon(Icons.description, color: AppColors.success, size: 40),
                      const SizedBox(height: 8),
                      Text(_selectedFile!.name, style: const TextStyle(color: AppColors.text, fontWeight: FontWeight.w600), overflow: TextOverflow.ellipsis),
                      Text('${(_selectedFile!.size / 1024).toStringAsFixed(1)} KB', style: const TextStyle(color: AppColors.textMuted, fontSize: 12)),
                    ]),
              ),
            ),
            const SizedBox(height: 20),
          ],

          if (_orderType == 'xerox') ...[
            const Text('Xerox Request', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            const Text('Enter Xerox options. No file upload required.', style: TextStyle(color: AppColors.textMuted, fontSize: 14)),
            const SizedBox(height: 20),
          ],

          // Options card
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(16)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Print Options', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
                const SizedBox(height: 16),

                // Copies
                Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                  const Text('Copies', style: TextStyle(color: AppColors.textMuted)),
                  Row(children: [
                    _circleBtn(Icons.remove, () {
                      final val = (int.tryParse(_copiesCtrl.text) ?? 1) - 1;
                      _copiesCtrl.text = val.clamp(1, 99).toString();
                    }),
                    Container(
                      width: 50,
                      height: 36,
                      margin: const EdgeInsets.symmetric(horizontal: 8),
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: const Color(0xFF1A2A4A), width: 1.5),
                      ),
                      child: Theme(
                        data: Theme.of(context).copyWith(
                          textSelectionTheme: const TextSelectionThemeData(
                            selectionColor: Colors.transparent,
                            selectionHandleColor: Colors.transparent,
                            cursorColor: Colors.transparent,
                          ),
                        ),
                        child: TextFormField(
                          controller: _copiesCtrl,
                          keyboardType: TextInputType.number,
                          textAlign: TextAlign.center,
                          textAlignVertical: TextAlignVertical.center,
                          maxLength: 2,
                          showCursor: false,
                          enableInteractiveSelection: false,
                          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.text),
                          decoration: const InputDecoration(
                            counterText: '',
                            isCollapsed: true,
                            contentPadding: EdgeInsets.zero,
                            border: InputBorder.none,
                            enabledBorder: InputBorder.none,
                            focusedBorder: InputBorder.none,
                            filled: false,
                          ),
                          onChanged: (val) {
                            final parsed = int.tryParse(val) ?? 1;
                            setState(() {
                              _copies = parsed.clamp(1, 99);
                            });
                          },
                        ),
                      ),
                    ),
                    _circleBtn(Icons.add, () {
                      final val = (int.tryParse(_copiesCtrl.text) ?? 1) + 1;
                      _copiesCtrl.text = val.clamp(1, 99).toString();
                    }),
                  ]),
                ]),
                if (_orderType == 'xerox') ...[
                  const SizedBox(height: 14),
                  Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                    const Text('Pages to Copy', style: TextStyle(color: AppColors.textMuted)),
                    Row(children: [
                      _circleBtn(Icons.remove, () {
                        final val = (int.tryParse(_pagesCtrl.text) ?? 1) - 1;
                        _pagesCtrl.text = val.clamp(1, 1000).toString();
                      }),
                      Container(
                        width: 60,
                        height: 36,
                        margin: const EdgeInsets.symmetric(horizontal: 8),
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: const Color(0xFF1A2A4A), width: 1.5),
                        ),
                        child: Theme(
                          data: Theme.of(context).copyWith(
                            textSelectionTheme: const TextSelectionThemeData(
                              selectionColor: Colors.transparent,
                              selectionHandleColor: Colors.transparent,
                              cursorColor: Colors.transparent,
                            ),
                          ),
                          child: TextFormField(
                            controller: _pagesCtrl,
                            keyboardType: TextInputType.number,
                            textAlign: TextAlign.center,
                            textAlignVertical: TextAlignVertical.center,
                            maxLength: 4,
                            showCursor: false,
                            enableInteractiveSelection: false,
                            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.text),
                            decoration: const InputDecoration(
                              counterText: '',
                              isCollapsed: true,
                              contentPadding: EdgeInsets.zero,
                              border: InputBorder.none,
                              enabledBorder: InputBorder.none,
                              focusedBorder: InputBorder.none,
                              filled: false,
                            ),
                            onChanged: (val) {
                              final parsed = int.tryParse(val) ?? 1;
                              setState(() {
                                _pdfPageCount = parsed.clamp(1, 1000);
                              });
                            },
                          ),
                        ),
                      ),
                      _circleBtn(Icons.add, () {
                        final val = (int.tryParse(_pagesCtrl.text) ?? 1) + 1;
                        _pagesCtrl.text = val.clamp(1, 1000).toString();
                      }),
                    ]),
                  ]),
                ],
                const SizedBox(height: 14),

                // Color mode
                const Text('Color Mode', style: TextStyle(color: AppColors.textMuted, fontSize: 13)),
                const SizedBox(height: 8),
                Row(children: [
                  _optionChip('Black & White', _colorMode == 'bw', () => setState(() => _colorMode = 'bw')),
                  const SizedBox(width: 10),
                  _optionChip('Color', _colorMode == 'color', () => setState(() => _colorMode = 'color')),
                ]),
                const SizedBox(height: 14),

                // Sides
                const Text('Sides', style: TextStyle(color: AppColors.textMuted, fontSize: 13)),
                const SizedBox(height: 8),
                Row(children: [
                  _optionChip('Single Sided', _sides == 'single', () => setState(() => _sides = 'single')),
                  const SizedBox(width: 10),
                  _optionChip('Double Sided', _sides == 'double', () => setState(() => _sides = 'double')),
                ]),
                const SizedBox(height: 14),

                // Page size
                const Text('Page Size', style: TextStyle(color: AppColors.textMuted, fontSize: 13)),
                const SizedBox(height: 8),
                Row(children: [
                  _optionChip('A4', _pageSize == 'A4', () => setState(() => _pageSize = 'A4')),
                  const SizedBox(width: 10),
                  _optionChip('A3', _pageSize == 'A3', () => setState(() => _pageSize = 'A3')),
                ]),
                const SizedBox(height: 14),

                // Binding Option Dropdown
                const Text('Binding Option', style: TextStyle(color: AppColors.textMuted, fontSize: 13)),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  value: _binding,
                  dropdownColor: AppColors.surface,
                  style: const TextStyle(color: AppColors.text, fontSize: 15),
                  decoration: const InputDecoration(
                    contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  ),
                  items: const [
                    DropdownMenuItem(value: 'none', child: Text('None')),
                    DropdownMenuItem(value: 'calico', child: Text('Calico binding (+₹30)')),
                    DropdownMenuItem(value: 'spiral', child: Text('Spiral binding (+₹30)')),
                  ],
                  onChanged: (val) {
                    if (val != null) {
                      setState(() {
                        _binding = val;
                      });
                    }
                  },
                ),
                const SizedBox(height: 14),

                // Special note
                TextField(
                  controller: _noteCtrl,
                  maxLength: 60,
                  style: const TextStyle(color: AppColors.text),
                  maxLines: 2,
                  decoration: InputDecoration(
                    labelText: 'Special Instructions (Max 60 chars)',
                    labelStyle: const TextStyle(color: Color(0xFF6B7280), fontSize: 14),
                    floatingLabelBehavior: FloatingLabelBehavior.always,
                    filled: true,
                    fillColor: Colors.white,
                    alignLabelWithHint: true,
                    counterText: '',
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: const BorderSide(color: Color(0xFF1A2A4A), width: 1.5),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: const BorderSide(color: Color(0xFF1A2A4A), width: 2.0),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Price estimate
          if (_pricing != null)
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.primary.withOpacity(0.15),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.primary.withOpacity(0.3)),
              ),
              child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                const Text('Estimated Amount', style: TextStyle(color: AppColors.textMuted)),
                Text('Rs. $_estimatedPrice', style: const TextStyle(color: AppColors.primary, fontSize: 20, fontWeight: FontWeight.bold)),
              ]),
            ),
          const SizedBox(height: 20),

          SizedBox(
            height: 54,
            child: ElevatedButton.icon(
              onPressed: _loading ? null : _addToCart,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
              ),
              icon: const Icon(Icons.add_shopping_cart, color: Colors.white),
              label: Text(
                _orderType == 'xerox' ? 'Add Xerox to Cart' : 'Upload & Add to Cart',
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
              ),
            ),
          ),
          const SizedBox(height: 30),
        ],
      ),
    );
  }

  Widget _circleBtn(IconData icon, VoidCallback onTap) => GestureDetector(
    onTap: onTap,
    child: Container(
      width: 34, height: 34,
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(8)),
      child: Icon(icon, color: AppColors.primary, size: 20),
    ),
  );

  Widget _optionChip(String label, bool selected, VoidCallback onTap) => GestureDetector(
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: selected ? AppColors.primary : AppColors.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: selected ? AppColors.primary : AppColors.textMuted.withOpacity(0.3)),
      ),
      child: Text(label, style: TextStyle(color: selected ? Colors.white : AppColors.textMuted, fontWeight: selected ? FontWeight.w600 : FontWeight.normal, fontSize: 13)),
    ),
  );
}

class CartTab extends StatefulWidget {
  final List<CartItem> cartList;
  final ValueNotifier<bool> refreshOrdersNotifier;
  final ValueChanged<int> onTabChange;
  final VoidCallback onStateChanged;

  const CartTab({
    super.key,
    required this.cartList,
    required this.refreshOrdersNotifier,
    required this.onTabChange,
    required this.onStateChanged,
  });

  @override
  State<CartTab> createState() => _CartTabState();
}

class _CartTabState extends State<CartTab> {
  bool _loading = false;
  Razorpay? _razorpay;
  String? _pendingOrderId;
  int? _payingSingleIndex;

  @override
  void initState() {
    super.initState();
    _razorpay = Razorpay();
    _razorpay!.on(Razorpay.EVENT_PAYMENT_SUCCESS, _onPaymentSuccess);
    _razorpay!.on(Razorpay.EVENT_PAYMENT_ERROR, _onPaymentError);
    _razorpay!.on(Razorpay.EVENT_EXTERNAL_WALLET, _onExternalWallet);
  }

  @override
  void dispose() {
    _razorpay?.clear();
    super.dispose();
  }

  Widget _pillSelector<T>({
    required T value,
    required List<T> options,
    required List<String> labels,
    required ValueChanged<T> onChanged,
  }) {
    return Row(
      children: List.generate(options.length, (idx) {
        final opt = options[idx];
        final isSelected = value == opt;
        return GestureDetector(
          onTap: () => onChanged(opt),
          child: Container(
            margin: const EdgeInsets.only(right: 6),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: isSelected ? AppColors.primary : Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: isSelected ? AppColors.primary : AppColors.border,
                width: 1,
              ),
            ),
            child: Text(
              labels[idx],
              style: TextStyle(
                color: isSelected ? Colors.white : AppColors.textMuted,
                fontSize: 11,
                fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
              ),
            ),
          ),
        );
      }),
    );
  }

  int _calcCartItemPrice(CartItem item) {
    final bwSingle = 2;
    final bwDouble = 3;
    final cSingle = 5;
    final cDouble = 7;

    final singleRate = item.colorMode == 'color' ? cSingle : bwSingle;
    final doubleRate = item.colorMode == 'color' ? cDouble : bwDouble;

    double pricePerCopy;
    if (item.sides == 'single') {
      pricePerCopy = (item.pages * singleRate).toDouble();
    } else {
      final sheets = (item.pages / 2).floor();
      if (item.pages % 2 == 0) {
        pricePerCopy = (sheets * doubleRate).toDouble();
      } else {
        pricePerCopy = (sheets * doubleRate + 1 * singleRate).toDouble();
      }
    }
    if (item.binding == 'calico' || item.binding == 'spiral') {
      pricePerCopy += 30;
    }
    return (pricePerCopy * item.copies).round();
  }

  Future<void> _paySingleItem(int index) async {
    final item = widget.cartList[index];
    setState(() {
      _loading = true;
      _payingSingleIndex = index;
    });

    try {
      final auth = context.read<AuthService>();
      final request = http.MultipartRequest('POST', Uri.parse(ApiConstants.upload));
      request.headers['Authorization'] = 'Bearer ${auth.token}';
      request.fields['copies'] = item.copies.toString();
      request.fields['colorMode'] = item.colorMode;
      request.fields['sides'] = item.sides;
      request.fields['pageSize'] = item.pageSize;
      request.fields['binding'] = item.binding;
      request.fields['pages'] = item.pages.toString();
      request.fields['specialNote'] = item.specialNote;
      request.fields['orderType'] = item.orderType;
      if (item.file != null && item.file!.path != null) {
        request.files.add(await http.MultipartFile.fromPath('file', item.file!.path!));
      }

      final streamedResponse = await request.send();
      final response = await http.Response.fromStream(streamedResponse);
      final data = jsonDecode(response.body);

      if (data['success'] == true) {
        _pendingOrderId = data['orderId'];
        final payRes = await http.post(
          Uri.parse(ApiConstants.createPayment),
          headers: auth.authHeaders,
          body: jsonEncode({'orderId': _pendingOrderId}),
        );
        final payData = jsonDecode(payRes.body);
        if (payData['success'] == true) {
          final options = {
            'key': payData['razorpayKeyId'] ?? 'rzp_test_SwR8ahOktg8jMQ',
            'amount': payData['amount'],
            'name': 'Printsta SECE',
            'description': item.fileName,
            'order_id': payData['razorpayOrderId'],
            'prefill': {'contact': '', 'email': ''},
            'theme': {'color': '#6C63FF'},
          };
          _razorpay!.open(options);
        }
      } else {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(data['message'] ?? 'Upload failed')));
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
    setState(() {
      _loading = false;
    });
  }

  Future<void> _payAllSelected() async {
    final selectedItems = widget.cartList.where((i) => i.selected).toList();
    if (selectedItems.isEmpty) return;

    // Check for mixed order types among selected items
    final selectedPrint = selectedItems.where((i) => i.orderType == 'print').toList();
    final selectedXerox = selectedItems.where((i) => i.orderType == 'xerox').toList();
    if (selectedPrint.isNotEmpty && selectedXerox.isNotEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: AppColors.error,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          margin: const EdgeInsets.all(16),
          content: const Row(
            children: [
              Icon(Icons.warning_amber_rounded, color: Colors.white),
              SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Selected items contain both Print and Xerox orders. Please checkout separately.',
                  style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14),
                ),
              ),
            ],
          ),
        ),
      );
      return;
    }

    setState(() {
      _loading = true;
      _payingSingleIndex = -1;
    });

    try {
      final auth = context.read<AuthService>();
      int totalAmount = 0;
      String? lastOrderId;

      for (var item in selectedItems) {
        final request = http.MultipartRequest('POST', Uri.parse(ApiConstants.upload));
        request.headers['Authorization'] = 'Bearer ${auth.token}';
        request.fields['copies'] = item.copies.toString();
        request.fields['colorMode'] = item.colorMode;
        request.fields['sides'] = item.sides;
        request.fields['pageSize'] = item.pageSize;
        request.fields['binding'] = item.binding;
        request.fields['pages'] = item.pages.toString();
        request.fields['specialNote'] = item.specialNote;
        request.fields['orderType'] = item.orderType;
        if (item.file != null && item.file!.path != null) {
          request.files.add(await http.MultipartFile.fromPath('file', item.file!.path!));
        }

        final streamedResponse = await request.send();
        final response = await http.Response.fromStream(streamedResponse);
        final data = jsonDecode(response.body);

        if (data['success'] == true) {
          lastOrderId = data['orderId'];
          totalAmount += (data['amount'] as num).toInt();
        } else {
          if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Upload failed for ${item.fileName}')));
          setState(() => _loading = false);
          return;
        }
      }

      if (lastOrderId != null) {
        _pendingOrderId = lastOrderId;
        final payRes = await http.post(
          Uri.parse(ApiConstants.createPayment),
          headers: auth.authHeaders,
          body: jsonEncode({'orderId': _pendingOrderId}),
        );
        final payData = jsonDecode(payRes.body);
        if (payData['success'] == true) {
          final options = {
            'key': payData['razorpayKeyId'] ?? 'rzp_test_SwR8ahOktg8jMQ',
            'amount': payData['amount'],
            'name': 'Printsta SECE',
            'description': 'Selected Cart Print Order',
            'order_id': payData['razorpayOrderId'],
            'prefill': {'contact': '', 'email': ''},
            'theme': {'color': '#6C63FF'},
          };
          _razorpay!.open(options);
        }
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
    setState(() {
      _loading = false;
    });
  }

  void _onPaymentSuccess(PaymentSuccessResponse response) async {
    try {
      final auth = context.read<AuthService>();
      final verifyRes = await http.post(
        Uri.parse(ApiConstants.verifyPayment),
        headers: auth.authHeaders,
        body: jsonEncode({
          'orderId': _pendingOrderId,
          'razorpayPaymentId': response.paymentId,
          'razorpayOrderId': response.orderId,
          'razorpaySignature': response.signature,
        }),
      );
      final data = jsonDecode(verifyRes.body);
      if (mounted) {
        showDialog(
          context: context,
          builder: (_) => AlertDialog(
            backgroundColor: AppColors.card,
            title: const Text('Payment Successful', style: TextStyle(color: AppColors.success, fontWeight: FontWeight.bold)),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.check_circle, color: AppColors.success, size: 60),
                const SizedBox(height: 16),
                const Text('Your token number:', style: TextStyle(color: AppColors.textMuted)),
                const SizedBox(height: 8),
                Text(data['tokenNumber'] ?? '', style: const TextStyle(color: AppColors.primary, fontSize: 28, fontWeight: FontWeight.bold, letterSpacing: 4)),
                if (_pendingOrderId != null) ...[
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Image.network(
                      '${ApiConstants.baseUrl}/orders/$_pendingOrderId/barcode',
                      height: 60,
                      width: 200,
                      fit: BoxFit.contain,
                      errorBuilder: (ctx, err, st) => const SizedBox.shrink(),
                    ),
                  ),
                ],
                const SizedBox(height: 8),
                const Text('Show this at the print counter.', style: TextStyle(color: AppColors.textMuted, fontSize: 12)),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () {
                  Navigator.pop(context);
                  setState(() {
                    if (_payingSingleIndex != null && _payingSingleIndex! >= 0) {
                      widget.cartList.removeAt(_payingSingleIndex!);
                    } else {
                      widget.cartList.removeWhere((i) => i.selected);
                    }
                    _payingSingleIndex = null;
                  });
                  widget.onStateChanged();
                  widget.refreshOrdersNotifier.value = !widget.refreshOrdersNotifier.value;
                  widget.onTabChange(2);
                },
                child: const Text('Done'),
              ),
            ],
          ),
        );
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Verification error: $e')));
    }
  }

  void _onPaymentError(PaymentFailureResponse response) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Payment failed: ${response.message}')));
  }

  void _openEditCartModal(CartItem item, int index) {
    int tempCopies = item.copies;
    String tempColor = item.colorMode;
    String tempSides = item.sides;
    String tempBinding = item.binding;
    final noteCtrl = TextEditingController(text: item.specialNote);
    bool minusPressed = false;
    bool plusPressed = false;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            return Padding(
              padding: EdgeInsets.only(
                top: 20,
                left: 20,
                right: 20,
                bottom: MediaQuery.of(context).viewInsets.bottom + 20,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Edit Print Options',
                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Color(0xFF1A2A4A)),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close),
                        onPressed: () => Navigator.pop(context),
                      ),
                    ],
                  ),
                  Text(
                    item.fileName,
                    style: const TextStyle(fontSize: 13, color: AppColors.textMuted),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const Divider(height: 24),

                  // Copies
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Copies', style: TextStyle(fontWeight: FontWeight.w600)),
                      Row(
                        children: [
                          GestureDetector(
                            onTapDown: (_) {
                              setModalState(() {
                                minusPressed = true;
                              });
                            },
                            onTapUp: (_) {
                              setModalState(() {
                                minusPressed = false;
                                tempCopies = (tempCopies - 1).clamp(1, 99);
                              });
                            },
                            onTapCancel: () {
                              setModalState(() {
                                minusPressed = false;
                              });
                            },
                            child: Container(
                              width: 32, height: 32,
                              decoration: BoxDecoration(
                                color: minusPressed ? const Color(0xFF1A2A4A) : Colors.white,
                                shape: BoxShape.circle,
                                border: Border.all(color: const Color(0xFF1A2A4A), width: 1.2),
                              ),
                              child: Icon(Icons.remove, size: 16, color: minusPressed ? Colors.white : const Color(0xFF1A2A4A)),
                            ),
                          ),
                          Container(
                            width: 40,
                            alignment: Alignment.center,
                            child: Text('$tempCopies', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                          ),
                          GestureDetector(
                            onTapDown: (_) {
                              setModalState(() {
                                plusPressed = true;
                              });
                            },
                            onTapUp: (_) {
                              setModalState(() {
                                plusPressed = false;
                                tempCopies = (tempCopies + 1).clamp(1, 99);
                              });
                            },
                            onTapCancel: () {
                              setModalState(() {
                                plusPressed = false;
                              });
                            },
                            child: Container(
                              width: 32, height: 32,
                              decoration: BoxDecoration(
                                color: plusPressed ? const Color(0xFF1A2A4A) : Colors.white,
                                shape: BoxShape.circle,
                                border: Border.all(color: const Color(0xFF1A2A4A), width: 1.2),
                              ),
                              child: Icon(Icons.add, size: 16, color: plusPressed ? Colors.white : const Color(0xFF1A2A4A)),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),

                  // Color Mode
                  const Text('Color Mode', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      _pillOption('Black & White', tempColor == 'bw', () => setModalState(() => tempColor = 'bw')),
                      const SizedBox(width: 10),
                      _pillOption('Color', tempColor == 'color', () => setModalState(() => tempColor = 'color')),
                    ],
                  ),
                  const SizedBox(height: 16),

                  // Sides
                  const Text('Sides', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      _pillOption('Single-sided', tempSides == 'single', () => setModalState(() => tempSides = 'single')),
                      const SizedBox(width: 10),
                      _pillOption('Double-sided', tempSides == 'double', () => setModalState(() => tempSides = 'double')),
                    ],
                  ),
                  const SizedBox(height: 16),

                  // Binding
                  const Text('Binding', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      _pillOption('None', tempBinding == 'none', () => setModalState(() => tempBinding = 'none')),
                      const SizedBox(width: 8),
                      _pillOption('Calico (+₹30)', tempBinding == 'calico', () => setModalState(() => tempBinding = 'calico')),
                      const SizedBox(width: 8),
                      _pillOption('Spiral (+₹30)', tempBinding == 'spiral', () => setModalState(() => tempBinding = 'spiral')),
                    ],
                  ),
                  const SizedBox(height: 16),

                  // Special Instructions
                  TextField(
                    controller: noteCtrl,
                    maxLength: 60,
                    style: const TextStyle(color: AppColors.text),
                    maxLines: 2,
                    decoration: InputDecoration(
                      labelText: 'Special Instructions (Max 60 chars)',
                      labelStyle: const TextStyle(color: Color(0xFF6B7280), fontSize: 13),
                      floatingLabelBehavior: FloatingLabelBehavior.always,
                      filled: true,
                      fillColor: Colors.white,
                      alignLabelWithHint: true,
                      counterText: '',
                      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide: const BorderSide(color: Color(0xFF1A2A4A), width: 1.5),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide: const BorderSide(color: Color(0xFF1A2A4A), width: 2.0),
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Save Button
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton(
                      onPressed: () {
                        setState(() {
                          item.copies = tempCopies;
                          item.colorMode = tempColor;
                          item.sides = tempSides;
                          item.binding = tempBinding;
                          item.specialNote = noteCtrl.text.trim();
                        });
                        widget.onStateChanged();
                        Navigator.pop(context);
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF1A2A4A),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      child: const Text('Save Changes', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15)),
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  Widget _pillOption(String label, bool selected, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? const Color(0xFF1A2A4A) : Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: selected ? const Color(0xFF1A2A4A) : const Color(0xFFD1D5DB)),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: selected ? Colors.white : AppColors.text,
            fontWeight: selected ? FontWeight.bold : FontWeight.normal,
            fontSize: 12,
          ),
        ),
      ),
    );
  }

  void _onExternalWallet(ExternalWalletResponse response) {}

  @override
  Widget build(BuildContext context) {
    final selectedItems = widget.cartList.where((i) => i.selected).toList();
    int grandTotal = 0;
    int totalCopies = 0;
    for (var item in selectedItems) {
      grandTotal += _calcCartItemPrice(item);
      totalCopies += item.copies;
    }

    return Scaffold(
      body: widget.cartList.isEmpty
          ? const Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.shopping_cart_outlined, size: 64, color: AppColors.textMuted),
                  SizedBox(height: 16),
                  Text('Your cart is empty', style: TextStyle(color: AppColors.textMuted, fontSize: 16)),
                  Text('Add documents from the Upload tab', style: TextStyle(color: AppColors.textMuted, fontSize: 13)),
                ],
              ),
            )
          : Column(
              children: [
                Expanded(
                  child: ListView.builder(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    itemCount: widget.cartList.length,
                    itemBuilder: (context, index) {
                      final item = widget.cartList[index];
                      final itemPrice = _calcCartItemPrice(item);
                      return Container(
                        margin: const EdgeInsets.only(bottom: 14),
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: AppColors.border, width: 1),
                          boxShadow: const [
                            BoxShadow(color: Color(0x0A1A2A4A), blurRadius: 10, offset: Offset(0, 3)),
                          ],
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            // Header: checkbox + filename + pages + view + delete
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.center,
                              children: [
                                Checkbox(
                                  value: item.selected,
                                  activeColor: const Color(0xFF1A2A4A),
                                  onChanged: (val) {
                                    setState(() { item.selected = val ?? true; });
                                    widget.onStateChanged();
                                  },
                                ),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        item.fileName,
                                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: AppColors.text),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                      const SizedBox(height: 2),
                                      Text(
                                        item.orderType == 'xerox'
                                            ? '${item.pages} sheet${item.pages > 1 ? "s" : ""}'
                                            : '${item.pages} page${item.pages > 1 ? "s" : ""}',
                                        style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
                                      ),
                                    ],
                                  ),
                                ),
                                if (item.orderType == 'xerox')
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                    decoration: BoxDecoration(
                                      color: const Color(0xFFD1FAE5),
                                      borderRadius: BorderRadius.circular(6),
                                    ),
                                    child: const Text(
                                      'Xerox',
                                      style: TextStyle(color: Color(0xFF065F46), fontSize: 11, fontWeight: FontWeight.bold),
                                    ),
                                  )
                                else if (item.file != null)
                                  TextButton(
                                    onPressed: () async {
                                      if (item.file!.path != null) {
                                        final uri = Uri.file(item.file!.path!);
                                        if (await canLaunchUrl(uri)) await launchUrl(uri);
                                      }
                                    },
                                    style: TextButton.styleFrom(
                                      backgroundColor: AppColors.primary.withOpacity(0.08),
                                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                                      minimumSize: Size.zero,
                                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                                    ),
                                    child: const Text('View', style: TextStyle(color: AppColors.primary, fontSize: 11, fontWeight: FontWeight.bold)),
                                  ),
                                IconButton(
                                  icon: const Icon(Icons.delete_outline, color: AppColors.error, size: 20),
                                  padding: const EdgeInsets.all(8),
                                  constraints: const BoxConstraints(),
                                  onPressed: () {
                                    setState(() { widget.cartList.removeAt(index); });
                                    widget.onStateChanged();
                                  },
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            // Summary Box with Pencil Edit Button
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                              decoration: BoxDecoration(
                                color: AppColors.primary.withOpacity(0.05),
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(color: AppColors.primary.withOpacity(0.12)),
                              ),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          '${item.copies} ${item.copies > 1 ? "Copies" : "Copy"} \u2022 ${item.colorMode == "color" ? "Color" : "B&W"} \u2022 ${item.sides == "double" ? "Double-sided" : "Single-sided"}${item.binding != "none" ? " \u2022 ${item.binding.toUpperCase()} Binding" : ""}',
                                          style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: AppColors.text),
                                        ),
                                        if (item.specialNote.isNotEmpty) ...[
                                          const SizedBox(height: 3),
                                          Text(
                                            'Note: ${item.specialNote}',
                                            style: const TextStyle(fontSize: 11.5, fontStyle: FontStyle.italic, color: AppColors.textMuted),
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                        ],
                                      ],
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  InkWell(
                                    onTap: () => _openEditCartModal(item, index),
                                    borderRadius: BorderRadius.circular(8),
                                    child: Container(
                                      padding: const EdgeInsets.all(6),
                                      decoration: BoxDecoration(
                                        color: AppColors.primary,
                                        borderRadius: BorderRadius.circular(8),
                                      ),
                                      child: const Icon(Icons.edit_outlined, size: 15, color: Colors.white),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 10),
                            // Bottom Row: Price + Pay Button
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text('₹$itemPrice', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.primary)),
                                ElevatedButton(
                                  onPressed: _loading ? null : () => _paySingleItem(index),
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: AppColors.primary,
                                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                                    minimumSize: Size.zero,
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                                  ),
                                  child: _loading && _payingSingleIndex == index
                                      ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                                      : const Text('Pay Now', style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
                                ),
                              ],
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ),

                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: AppColors.card,
                    border: const Border(top: BorderSide(color: AppColors.border, width: 1.5)),
                  ),
                  child: SafeArea(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text('Selected Items', style: TextStyle(color: AppColors.textMuted)),
                            Text('${selectedItems.length} of ${widget.cartList.length}', style: const TextStyle(fontWeight: FontWeight.bold)),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text('Total Copies', style: TextStyle(color: AppColors.textMuted)),
                            Text('$totalCopies', style: const TextStyle(fontWeight: FontWeight.bold)),
                          ],
                        ),
                        const SizedBox(height: 12),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text('Grand Total', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.primary)),
                            Text('₹$grandTotal', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.primary)),
                          ],
                        ),
                        const SizedBox(height: 16),
                        SizedBox(
                          height: 50,
                          child: ElevatedButton(
                            onPressed: (_loading || selectedItems.isEmpty) ? null : _payAllSelected,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.primary,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                            ),
                            child: _loading && _payingSingleIndex == -1
                                ? const Center(child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5)))
                                : const Text('Proceed to Pay', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}

// ─── ORDERS TAB ───────────────────────────────────────────────────────────────
class OrdersTab extends StatefulWidget {
  final ValueNotifier<bool> refreshOrdersNotifier;
  const OrdersTab({super.key, required this.refreshOrdersNotifier});
  @override
  State<OrdersTab> createState() => _OrdersTabState();
}

class _OrdersTabState extends State<OrdersTab> {
  List<dynamic> _orders = [];
  bool _loading = true;
  Timer? _refreshTimer;

  @override
  void initState() {
    super.initState();
    _loadOrders();
    widget.refreshOrdersNotifier.addListener(_loadOrders);
    _refreshTimer = Timer.periodic(const Duration(seconds: 5), (_) => _loadOrdersSilent());
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    widget.refreshOrdersNotifier.removeListener(_loadOrders);
    super.dispose();
  }

  Future<void> _loadOrdersSilent() async {
    try {
      final auth = context.read<AuthService>();
      final res = await http.get(Uri.parse(ApiConstants.myOrders), headers: auth.authHeaders);
      final data = jsonDecode(res.body);
      if (data['success'] == true && mounted) {
        setState(() => _orders = data['orders'] ?? []);
      }
    } catch (_) {}
  }

  Future<void> _loadOrders() async {
    setState(() => _loading = true);
    try {
      final auth = context.read<AuthService>();
      final res = await http.get(Uri.parse(ApiConstants.myOrders), headers: auth.authHeaders);
      final data = jsonDecode(res.body);
      if (data['success'] == true) setState(() => _orders = data['orders'] ?? []);
    } catch (_) {}
    setState(() => _loading = false);
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'waiting': return AppColors.warning;
      case 'printing': return AppColors.primary;
      case 'ready': return AppColors.success;
      case 'collected': return AppColors.textMuted;
      default: return AppColors.textMuted;
    }
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _loadOrders,
      color: AppColors.primary,
      child: _loading
        ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
        : _orders.isEmpty
          ? const Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              Icon(Icons.receipt_long_outlined, color: AppColors.textMuted, size: 64),
              SizedBox(height: 16),
              Text('No orders yet', style: TextStyle(color: AppColors.textMuted, fontSize: 16)),
              Text('Upload a file to get started', style: TextStyle(color: AppColors.textMuted, fontSize: 13)),
            ]))
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _orders.length,
              itemBuilder: (_, i) {
                final o = _orders[i];
                final status = o['status'] ?? 'waiting';
                return GestureDetector(
                  onTap: () => _showOrderDetails(o),
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: AppColors.card,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                        Expanded(child: Text(o['fileName'] ?? 'Unknown', style: const TextStyle(color: AppColors.text, fontWeight: FontWeight.w600), overflow: TextOverflow.ellipsis)),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: _statusColor(status).withOpacity(0.15),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: _statusColor(status).withOpacity(0.5)),
                          ),
                          child: Text(status.toUpperCase(), style: TextStyle(color: _statusColor(status), fontSize: 11, fontWeight: FontWeight.bold)),
                        ),
                      ]),
                      const SizedBox(height: 10),
                      Row(children: [
                        _chip(o['colorMode'] == 'color' ? 'Color' : 'B&W'),
                        const SizedBox(width: 8),
                        _chip('${o['copies'] ?? 1} copy'),
                        const SizedBox(width: 8),
                        _chip(o['sides'] == 'double' ? 'Double' : 'Single'),
                      ]),
                      const SizedBox(height: 10),
                      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                        if (o['tokenNumber'] != null)
                          Text('Token: ${o['tokenNumber']}', style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w600)),
                        Text('Rs. ${o['amount'] ?? 0}', style: const TextStyle(color: AppColors.success, fontWeight: FontWeight.bold)),
                      ]),
                    ]),
                  ),
                );
              },
            ),
    );
  }

  void _showOrderDetails(Map<String, dynamic> o) {
    final String? createdAtStr = o['createdAt'];
    bool canView = false;
    if (createdAtStr != null) {
      try {
        final createdAt = DateTime.parse(createdAtStr);
        final difference = DateTime.now().difference(createdAt);
        final hours = difference.inHours;
        if (hours.abs() <= 24) {
          canView = true;
        }
      } catch (_) {}
    }

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const SizedBox(height: 24),
            Text(
              o['fileName'] ?? 'Document Details',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppColors.text),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 8),
            Text(
              'Token Number: ${o['tokenNumber'] ?? "Processing"}',
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: AppColors.primary),
            ),
            if (o['tokenNumber'] != null) ...[
              const SizedBox(height: 12),
              Center(
                child: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Image.network(
                    '${ApiConstants.baseUrl}/orders/${o['_id'] ?? o['id']}/barcode',
                    height: 70,
                    width: 250,
                    fit: BoxFit.contain,
                    errorBuilder: (ctx, err, st) => const SizedBox.shrink(),
                  ),
                ),
              ),
            ],
            const SizedBox(height: 16),
            const Divider(color: AppColors.border),
            const SizedBox(height: 10),
            _detailRow('Status', (o['status'] ?? 'waiting').toString().toUpperCase()),
            _detailRow('Copies', (o['copies'] ?? 1).toString()),
            _detailRow('Color Mode', o['colorMode'] == 'color' ? 'Color' : 'Black & White'),
            _detailRow('Sides', o['sides'] == 'double' ? 'Double Sided' : 'Single Sided'),
            _detailRow('Page Size', o['pageSize'] ?? 'A4'),
            _detailRow('Amount Paid', 'Rs. ${o['amount'] ?? 0}'),
            if (o['specialNote'] != null && o['specialNote'].toString().isNotEmpty)
              _detailRow('Note', o['specialNote']),
            const SizedBox(height: 20),
            if (canView) ...[
               const Text(
                 'Document will be deleted after 24 hrs',
                 style: TextStyle(color: AppColors.textMuted, fontSize: 13, fontWeight: FontWeight.normal),
               ),
               const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton.icon(
                  onPressed: () async {
                    final pathStr = o['filePath'] ?? '';
                    final fileName = pathStr.split(RegExp(r'[\\/]')).last;
                    final docUrl = '${ApiConstants.baseUrl}/uploads/$fileName';
                    final uri = Uri.parse(docUrl);
                    if (await canLaunchUrl(uri)) {
                      await launchUrl(uri, mode: LaunchMode.externalApplication);
                    } else {
                      if (mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Could not open document URL.')),
                        );
                      }
                    }
                  },
                  icon: const Icon(Icons.open_in_new, color: Colors.white, size: 18),
                  label: const Text('View / Download Document', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                ),
              ),
            ] else ...[
              Row(
                children: [
                  const Icon(Icons.error_outline, color: AppColors.error, size: 16),
                  const SizedBox(width: 6),
                  const Expanded(
                    child: Text(
                      'Document viewing expired (Only available for first 24 hours)',
                      style: TextStyle(color: AppColors.error, fontSize: 13, fontWeight: FontWeight.bold),
                    ),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  Widget _detailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: AppColors.textMuted, fontSize: 13)),
          Text(value, style: const TextStyle(color: AppColors.text, fontWeight: FontWeight.w600, fontSize: 13)),
        ],
      ),
    );
  }

  Widget _chip(String label) => Container(

    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
    decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(8)),
    child: Text(label, style: const TextStyle(color: AppColors.textMuted, fontSize: 12)),
  );
}

// ─── PROFILE TAB ──────────────────────────────────────────────────────────────
class ProfileTab extends StatefulWidget {
  const ProfileTab({super.key});
  @override
  State<ProfileTab> createState() => _ProfileTabState();
}

class _ProfileTabState extends State<ProfileTab> {
  // Which section is expanded: null = none, 'profile' | 'orders' | 'notifications'
  String? _expanded;
  List<dynamic> _orders = [];
  bool _ordersLoading = false;
  String? _lastEmail;
  String? _profilePicPath;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AuthService>().fetchProfile();
    });
  }

  Future<void> _pickProfilePicture(String email) async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.image,
        allowMultiple: false,
      );
      if (result != null && result.files.single.path != null) {
        final pickedPath = result.files.single.path!;
        
        // Copy to app documents directory to persist permanently
        final appDir = await getApplicationDocumentsDirectory();
        final emailNamespace = email.replaceAll("@", "_").replaceAll(".", "_");
        final fileName = 'profile_${emailNamespace}_${DateTime.now().millisecondsSinceEpoch}.png';
        final savedFile = await File(pickedPath).copy('${appDir.path}/$fileName');
        
        // Save to SharedPreferences
        final prefs = await SharedPreferences.getInstance();
        final prefKey = 'profile_pic_$emailNamespace';
        await prefs.setString(prefKey, savedFile.path);
        
        setState(() {
          _profilePicPath = savedFile.path;
        });
        
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Profile picture updated successfully!')),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error picking image: $e')),
        );
      }
    }
  }

  Future<void> _removeProfilePicture(String email) async {
    try {
      final emailNamespace = email.replaceAll("@", "_").replaceAll(".", "_");
      final prefs = await SharedPreferences.getInstance();
      final prefKey = 'profile_pic_$emailNamespace';
      
      if (_profilePicPath != null) {
        final file = File(_profilePicPath!);
        if (await file.exists()) {
          await file.delete();
        }
      }
      
      await prefs.remove(prefKey);
      
      setState(() {
        _profilePicPath = null;
      });
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Profile picture removed successfully.')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error removing image: $e')),
        );
      }
    }
  }

  void _showProfilePicOptions(BuildContext context, String email) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (BuildContext bc) {
        final hasPic = _profilePicPath != null && File(_profilePicPath!).existsSync();
        return SafeArea(
          child: Wrap(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 16),
                child: Center(
                  child: Text(
                    'Profile Photo',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: AppColors.primary,
                    ),
                  ),
                ),
              ),
              const Divider(height: 1),
              ListTile(
                leading: const Icon(Icons.photo_library, color: AppColors.primary),
                title: const Text('Upload New Photo', style: TextStyle(fontWeight: FontWeight.w600)),
                onTap: () {
                  Navigator.pop(context);
                  _pickProfilePicture(email);
                },
              ),
              if (hasPic) ...[
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.delete, color: Colors.red),
                  title: const Text('Remove Current Photo', style: TextStyle(color: Colors.red, fontWeight: FontWeight.w600)),
                  onTap: () {
                    Navigator.pop(context);
                    _removeProfilePicture(email);
                  },
                ),
              ],
              const Divider(height: 1),
              ListTile(
                leading: const Icon(Icons.close, color: Colors.grey),
                title: const Text('Cancel', style: TextStyle(fontWeight: FontWeight.w500)),
                onTap: () {
                  Navigator.pop(context);
                },
              ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _loadOrders() async {
    if (_ordersLoading) return;
    setState(() => _ordersLoading = true);
    try {
      final auth = context.read<AuthService>();
      final res = await http.get(
        Uri.parse(ApiConstants.myOrders),
        headers: auth.authHeaders,
      );
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (data['success'] == true) {
          setState(() => _orders = data['orders'] ?? []);
        }
      }
    } catch (_) {}
    setState(() => _ordersLoading = false);
  }

  Color _statusColor(String status) {
    switch (status.toLowerCase()) {
      case 'ready': return AppColors.success;
      case 'printing': return AppColors.warning;
      case 'cancelled': return AppColors.error;
      default: return AppColors.textMuted;
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();
    final profile = auth.profile ?? {};
    final String name = profile['firstName'] != null
        ? '${profile['firstName']} ${profile['lastName'] ?? ''}'.trim()
        : (auth.name ?? 'Student');
    final String phone = profile['phone'] ?? '';
    final String dept   = profile['department'] ?? '';
    final String regNo  = profile['registerNumber'] ?? '';
    final String email  = profile['email'] ?? '';
    final String batch  = profile['batch'] ?? '';

    final activeEmail = email.isNotEmpty ? email : name;
    if (activeEmail.isNotEmpty && activeEmail != _lastEmail) {
      _lastEmail = activeEmail;
      SharedPreferences.getInstance().then((prefs) {
        final prefKey = 'profile_pic_${activeEmail.replaceAll("@", "_").replaceAll(".", "_")}';
        if (mounted) {
          setState(() {
            _profilePicPath = prefs.getString(prefKey);
          });
        }
      });
    }

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // ── Header banner ────────────────────────────────────────────
          Container(
            color: AppColors.primary,
            padding: const EdgeInsets.fromLTRB(20, 36, 20, 28),
            child: Row(
              children: [
                GestureDetector(
                  onTap: () => _showProfilePicOptions(context, activeEmail),
                  child: Stack(
                    children: [
                      Container(
                        width: 68, height: 68,
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.2),
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white.withOpacity(0.5), width: 2.5),
                          image: (_profilePicPath != null && File(_profilePicPath!).existsSync())
                              ? DecorationImage(
                                  image: FileImage(File(_profilePicPath!)),
                                  fit: BoxFit.cover,
                                )
                              : null,
                        ),
                        child: (_profilePicPath != null && File(_profilePicPath!).existsSync())
                            ? null
                            : const Icon(Icons.person, color: Colors.white, size: 38),
                      ),
                      Positioned(
                        right: 0,
                        bottom: 0,
                        child: Container(
                          padding: const EdgeInsets.all(4),
                          decoration: const BoxDecoration(
                            color: Colors.white,
                            shape: BoxShape.circle,
                            boxShadow: [BoxShadow(color: Colors.black12, blurRadius: 4)],
                          ),
                          child: const Icon(Icons.camera_alt, color: Color(0xFF1A2A4A), size: 12),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name,
                        style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
                      ),
                      if (phone.isNotEmpty)
                        Text(
                          '+91 $phone',
                          style: TextStyle(color: Colors.white.withOpacity(0.8), fontSize: 13),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 8),

          // ── Account Settings section ─────────────────────────────────
          _sectionHeader('Account settings'),

          _menuItem(
            icon: Icons.person_outline,
            label: 'My Profile',
            isExpanded: _expanded == 'profile',
            onTap: () => setState(() => _expanded = _expanded == 'profile' ? null : 'profile'),
            expandedChild: _profileDetails(dept, regNo, email, phone, batch),
          ),

          _menuItem(
            icon: Icons.receipt_long_outlined,
            label: 'My Orders',
            isExpanded: _expanded == 'orders',
            onTap: () {
              if (_expanded != 'orders') _loadOrders();
              setState(() => _expanded = _expanded == 'orders' ? null : 'orders');
            },
            expandedChild: _ordersPanel(),
          ),

          _menuItem(
            icon: Icons.notifications_none_outlined,
            label: 'Notifications',
            isExpanded: _expanded == 'notifications',
            onTap: () => setState(() => _expanded = _expanded == 'notifications' ? null : 'notifications'),
            expandedChild: _notificationsPanel(),
          ),

          const SizedBox(height: 8),

          // ── Prinsta section ──────────────────────────────────────────
          _sectionHeader('Prinsta'),

          _menuItem(
            icon: Icons.star_outline_rounded,
            label: 'Rate Our App',
            onTap: () async {
              final uri = Uri.parse('https://play.google.com/store/apps/details?id=com.sece.printsta_app');
              if (await canLaunchUrl(uri)) {
                await launchUrl(uri, mode: LaunchMode.externalApplication);
              } else {
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Could not open Play Store.'), backgroundColor: AppColors.error),
                  );
                }
              }
            },
          ),

          _menuItem(
            icon: Icons.mail_outline_rounded,
            label: 'Contact Us',
            onTap: () => _showContactDialog(),
          ),

          _menuItem(
            icon: Icons.info_outline_rounded,
            label: 'About Us',
            onTap: () => _showAboutDialog(),
          ),

          const SizedBox(height: 24),

          // ── Logout ───────────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: SizedBox(
              height: 50,
              child: OutlinedButton.icon(
                onPressed: () => auth.logout(),
                icon: const Icon(Icons.logout, color: AppColors.error),
                label: const Text('Logout', style: TextStyle(color: AppColors.error, fontSize: 16)),
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: AppColors.error),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
            ),
          ),

          const SizedBox(height: 32),
        ],
      ),
    );
  }

  // ── Section header ──────────────────────────────────────────────────────────
  Widget _sectionHeader(String title) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
    child: Text(
      title,
      style: const TextStyle(color: AppColors.textMuted, fontSize: 12, fontWeight: FontWeight.w600, letterSpacing: 0.5),
    ),
  );

  // ── Menu row ────────────────────────────────────────────────────────────────
  Widget _menuItem({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
    bool isExpanded = false,
    Widget? expandedChild,
  }) {
    return Column(
      children: [
        InkWell(
          onTap: onTap,
          child: Container(
            color: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            child: Row(
              children: [
                Icon(icon, color: AppColors.primary, size: 22),
                const SizedBox(width: 14),
                Expanded(
                  child: Text(label, style: const TextStyle(color: AppColors.text, fontSize: 15, fontWeight: FontWeight.w500)),
                ),
                if (expandedChild != null)
                  AnimatedRotation(
                    turns: isExpanded ? 0.25 : 0,
                    duration: const Duration(milliseconds: 200),
                    child: const Icon(Icons.chevron_right, color: AppColors.textMuted, size: 20),
                  ),
              ],
            ),
          ),
        ),
        if (isExpanded && expandedChild != null)
          AnimatedSize(
            duration: const Duration(milliseconds: 250),
            curve: Curves.easeInOut,
            child: expandedChild,
          ),
        const Divider(height: 1, color: AppColors.border, indent: 16),
      ],
    );
  }

  // ── My Profile expanded panel ────────────────────────────────────────────────
  Widget _profileDetails(String dept, String regNo, String email, String phone, String batch) {
    return Container(
      color: AppColors.background,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      child: Column(
        children: [
          _detailRow(Icons.badge_outlined, 'Register No', regNo),
          _detailRow(Icons.school_outlined, 'Department', dept),
          _detailRow(Icons.group_outlined, 'Batch', batch),
          _detailRow(Icons.email_outlined, 'Email', email),
          _detailRow(Icons.phone_outlined, 'Phone', phone.isEmpty ? '—' : '+91 $phone'),
        ],
      ),
    );
  }

  Widget _detailRow(IconData icon, String label, String value) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 6),
    child: Row(
      children: [
        Icon(icon, size: 16, color: AppColors.primary),
        const SizedBox(width: 10),
        Text('$label: ', style: const TextStyle(color: AppColors.textMuted, fontSize: 13)),
        Expanded(
          child: Text(
            value.isEmpty ? '—' : value,
            style: const TextStyle(color: AppColors.text, fontWeight: FontWeight.w600, fontSize: 13),
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    ),
  );

  // ── My Orders expanded panel ─────────────────────────────────────────────────
  Widget _ordersPanel() {
    if (_ordersLoading) {
      return const Padding(
        padding: EdgeInsets.all(24),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    if (_orders.isEmpty) {
      return Container(
        color: AppColors.background,
        padding: const EdgeInsets.all(24),
        child: const Center(
          child: Text('No past orders', style: TextStyle(color: AppColors.textMuted)),
        ),
      );
    }
    return Container(
      color: AppColors.background,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Column(
        children: _orders.take(10).map((o) {
          final status = (o['status'] ?? 'waiting').toString();
          return Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.border),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        o['fileName'] ?? 'Document',
                        style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'Token: ${o['tokenNumber'] ?? '—'} • ₹${o['amount'] ?? 0}',
                        style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: _statusColor(status).withOpacity(0.12),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    status.toUpperCase(),
                    style: TextStyle(color: _statusColor(status), fontSize: 10, fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }

  // ── Notifications expanded panel ─────────────────────────────────────────────
  Widget _notificationsPanel() {
    return Container(
      color: AppColors.background,
      padding: const EdgeInsets.all(20),
      child: const Center(
        child: Column(
          children: [
            Icon(Icons.notifications_off_outlined, size: 36, color: AppColors.textMuted),
            SizedBox(height: 8),
            Text('No notifications yet', style: TextStyle(color: AppColors.textMuted, fontSize: 13)),
            SizedBox(height: 4),
            Text(
              'You\'ll be notified when your print job is ready.',
              style: TextStyle(color: AppColors.textMuted, fontSize: 12),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  // ── Dialogs ──────────────────────────────────────────────────────────────────
  void _showContactDialog() {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Row(
          children: [
            Icon(Icons.mail_outline_rounded, color: AppColors.primary),
            SizedBox(width: 10),
            Text('Contact Us', style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.bold)),
          ],
        ),
        content: const Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('For support or queries, reach us at:', style: TextStyle(color: AppColors.textMuted, fontSize: 13)),
            SizedBox(height: 12),
            Row(children: [
              Icon(Icons.email_outlined, size: 16, color: AppColors.primary),
              SizedBox(width: 8),
              Text('prinsta.sece@gmail.com', style: TextStyle(fontWeight: FontWeight.w600)),
            ]),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Close')),
        ],
      ),
    );
  }

  void _showAboutDialog() {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Row(
          children: [
            Icon(Icons.info_outline_rounded, color: AppColors.primary),
            SizedBox(width: 10),
            Text('About Prinsta', style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.bold)),
          ],
        ),
        content: const Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Prinsta is a smart print ordering system built for students of Sri Eshwar College of Engineering.',
              style: TextStyle(fontSize: 13, color: AppColors.textMuted),
            ),
            SizedBox(height: 16),
            Text('Made with ❤️ by', style: TextStyle(fontSize: 13, color: AppColors.textMuted)),
            SizedBox(height: 6),
            Text('Kavin GS', style: TextStyle(fontWeight: FontWeight.bold)),
            Text('Kavin SSG', style: TextStyle(fontWeight: FontWeight.bold)),
            Text('Karthegaeyen K', style: TextStyle(fontWeight: FontWeight.bold)),
            Text('Abhishek C', style: TextStyle(fontWeight: FontWeight.bold)),
            SizedBox(height: 8),
            Text('Dept. of ECE, SECE', style: TextStyle(color: AppColors.textMuted, fontSize: 12)),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Close')),
        ],
      ),
    );
  }
}

