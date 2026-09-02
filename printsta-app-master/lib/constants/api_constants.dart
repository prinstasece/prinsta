class ApiConstants {
  static const String baseUrl = 'https://printsta-backend.onrender.com';

  // Auth
  static String get login => '$baseUrl/auth/login';
  static String get studentRegister => '$baseUrl/auth/student/register';
  static String get staffRegister => '$baseUrl/auth/staff/register';
  static String get studentMe => '$baseUrl/auth/student/me';
  static String get studentProfile => '$baseUrl/auth/student/profile';
  static String get forgotPassword => '$baseUrl/auth/forgot-password';
  static String get verifyOtp => '$baseUrl/auth/verify-reset-otp';
  static String get resetPassword => '$baseUrl/auth/reset-password';
  static String get studentEmails => '$baseUrl/auth/student/emails';

  // Orders
  static String get upload => '$baseUrl/upload';
  static String get createPayment => '$baseUrl/create-payment';
  static String get verifyPayment => '$baseUrl/verify-payment';
  static String get myOrders => '$baseUrl/orders/mine';
  static String get allOrders => '$baseUrl/orders';
  static String get orderHistory => '$baseUrl/orders/history';
  static String get adminOrders => '$baseUrl/orders/all';
  static String orderStatus(String id) => '$baseUrl/orders/$id/status';
  static String get collectByToken => '$baseUrl/orders/collect-by-token';

  // Pricing
  static String get pricing => '$baseUrl/settings/pricing';

  // Admin
  static String get dashboardStats => '$baseUrl/admin/dashboard-stats';
  static String get adminStaff => '$baseUrl/admin/staff';
  static String deleteStaff(String id) => '$baseUrl/admin/staff/$id';
  static String get adminStudents => '$baseUrl/admin/students';
  static String get earningsSummary => '$baseUrl/earnings/summary';
  static String get earningsHistory => '$baseUrl/earnings/history';
  static String get auditLog => '$baseUrl/admin/audit-log';
  static String get verifyPriceChange => '$baseUrl/admin/verify-price-change';

  // Resources
  static String get resourceStatus => '$baseUrl/resources/status';
  static String get resourceLevels => '$baseUrl/resources/levels';
}
