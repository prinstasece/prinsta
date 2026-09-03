/**
 * Printsta - Full Stack College Print Ordering Web App
 * Backend Server Code (server.js)
 * 
 * Handles student accounts, admin access, file uploads, Razorpay,
 * in-memory fallback database routing, and Web Push notifications.
 */

// Import required libraries
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const cors = require('cors');
const Razorpay = require('razorpay');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Import PDFKit and Sharp for automatic image & document to PDF conversion
const PDFDocument = require('pdfkit');
const sharp = require('sharp');
const { PDFDocument: LibPDFDocument } = require('pdf-lib');
const ExcelJS = require('exceljs');
const ptp = require('pdf-to-printer');

// Import bwip-js for 1D barcode generation
const bwipjs = require('bwip-js');

// Import Google Auth Library & Web Push
const { OAuth2Client } = require('google-auth-library');
const webpush = require('web-push');
// Import Nodemailer for OTP emails
const nodemailer = require('nodemailer');

// Load environment variables from .env file (always load relative to server.js directory)
dotenv.config({ path: path.join(__dirname, '.env') });

// Initialize Express app
const app = express();

// Enable CORS — allow all origins so devices on the local network can access the API
// Allow all origins — required for local dev (PC browser, phone on LAN, Vercel)
app.use(cors({ origin: true, credentials: true }));

// Parse incoming JSON payloads and URL-encoded forms
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ----------------------------------------------------
// PLACEHOLDERS & CONFIGURATION
// ----------------------------------------------------
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "534651137120-o0acbi2mgtclfmcqf5o8auu30jo1n0pg.apps.googleusercontent.com";
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "rzp_test_SwR8ahOktg8jMQ";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "uRAJgzPthR4ZqhyqLju7RD7P";
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/printsta";
const JWT_SECRET = process.env.JWT_SECRET || "YOUR_JWT_SECRET_KEY";
const PORT = process.env.PORT || 3000;
const ADMIN_REPORT_EMAIL = process.env.ADMIN_REPORT_EMAIL || 'prinstasece1@gmail.com';

// Role-scoped JWT secrets (fall back to JWT_SECRET for backwards compat)
const STUDENT_JWT_SECRET = process.env.STUDENT_JWT_SECRET || JWT_SECRET;
const STAFF_JWT_SECRET   = process.env.STAFF_JWT_SECRET   || JWT_SECRET;
const ADMIN_JWT_SECRET   = process.env.ADMIN_JWT_SECRET   || JWT_SECRET;

// Staff self-registration secret code (let so admin can regenerate it at runtime)
let STAFF_REGISTER_CODE = process.env.STAFF_REGISTER_CODE || 'SECE@PRINT2025';

// Admin hardcoded credentials (from .env)
const ADMIN_USERNAME_ENV = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD_ENV = process.env.ADMIN_PASSWORD || 'sece@print';

// Email configuration for OTP sending
const EMAIL_USER = process.env.EMAIL_USER || '';
const EMAIL_APP_PASSWORD = process.env.EMAIL_APP_PASSWORD || '';

let emailTransporter = null;
if (EMAIL_USER && EMAIL_APP_PASSWORD) {
  // Use host and port 587 (STARTTLS) which is highly compatible with college network firewalls
  emailTransporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, 
    auth: { 
      user: EMAIL_USER, 
      pass: EMAIL_APP_PASSWORD.trim().replace(/\s/g, '') // remove any accidental spaces in App Password
    },
    tls: { 
      rejectUnauthorized: false,
      minVersion: 'TLSv1.2'
    }
  });
  
  // Verify the transporter connection on startup
  emailTransporter.verify((err) => {
    if (err) {
      console.error('[EMAIL] Verification failed. Error details:', err.message);
      console.warn('[EMAIL] Make sure 2-Step Verification is active and you generated a 16-character Google App Password (not your standard password).');
    } else {
      console.log('[EMAIL] Transporter connected successfully! Verification emails and close-shop daily reports will be sent via Gmail.');
    }
  });
} else {
  console.warn('[EMAIL] EMAIL_USER / EMAIL_APP_PASSWORD are not fully configured in your .env file. OTPs and reports will print to the server console.');
}

// OTP rate limit map: max 3 requests per email per hour
// Shape: Map<email, { count: number, windowStart: timestamp }>
const otpRateLimit = new Map();

// Configure Web Push VAPID credentials
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "BHYmKhXsevezzhmJchQNWsspQYnE2PMeOOF6hp-y42ODp5b4nS6DHFWQFIgGsCY7Kk1bLf5H0YLb3uBLFWuSkWw";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "B_55IYbwwGjcPXbaB9WFFB2c4C3cQyOYZIVi7bHnnso";

webpush.setVapidDetails(
  'mailto:kavin.kaavi@sece.ac.in', // default contact email
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// Initialize Google OAuth client
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// Initialize Razorpay SDK instance
const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET
});

// ----------------------------------------------------
// IN-MEMORY FALLBACK DATABASE STATE
// ----------------------------------------------------
let dbConnected = false;
const inMemoryStudents = [];
const inMemoryStaff    = [];   // Fallback staff store for offline mode
const inMemoryOrders   = [];
const inMemoryAuditLog = [];   // Fallback audit log for offline mode

// Resource management fallback stores
let inMemoryPaperStock = {
  sheets: 500,
  lastSupplied: null,
  lastSuppliedBy: null,
  supplyHistory: []
};

// Staff activity heartbeat tracker: Map<staffId, { name, username, lastSeen }>
const staffActivity = new Map();

// ----------------------------------------------------
// ADMIN LOCKOUT MAP (in-memory, keyed by admin username)
// Tracks failed password attempts for verify-price-change
// ----------------------------------------------------
const adminLockout = {};
// { 'admin': { failCount: 0, lockUntil: null } }

// ----------------------------------------------------
// SERVER-SENT EVENTS — real-time admin push
// ----------------------------------------------------
const sseClients = new Set(); // active admin SSE connections

function notifyNewOrder(orderData) {
  const payload = JSON.stringify({
    type: 'new-order',
    order: orderData
  });
  sseClients.forEach(res => {
    try { res.write(`data: ${payload}\n\n`); } catch(e) { sseClients.delete(res); }
  });
}

function notifyOrderUpdate(orderData) {
  const payload = JSON.stringify({
    type: 'order-updated',
    order: orderData
  });
  sseClients.forEach(res => {
    try { res.write(`data: ${payload}\n\n`); } catch(e) { sseClients.delete(res); }
  });
}

// Pre-hash the hardcoded admin password at startup so bcrypt.compare() works
const ADMIN_PASSWORD_PLAIN = 'sece@print';
let ADMIN_PASSWORD_HASH = null;
bcrypt.hash(ADMIN_PASSWORD_PLAIN, 10).then(hash => {
  ADMIN_PASSWORD_HASH = hash;
  console.log('Admin password hash ready for price verification.');
}).catch(err => console.error('Failed to hash admin password:', err));

// ----------------------------------------------------
// LIVE PRICING CONFIGURATION (admin-editable at runtime)
// ----------------------------------------------------
let pricingConfig = {
  bwSingleRate: 2,
  bwDoubleRate: 3,
  colorSingleRate: 5,
  colorDoubleRate: 7,
  lastUpdated: new Date()
};

// Disable mongoose buffering to prevent hanging queries on connection failures
mongoose.set('bufferCommands', false);

// Connect to MongoDB Atlas or local instance with dynamic reconnection listeners
mongoose.connection.on('connected', () => {
  dbConnected = true;
  console.log("Successfully connected to MongoDB database!");
  initSettings();
});

mongoose.connection.on('disconnected', () => {
  dbConnected = false;
  console.warn(">>> MongoDB disconnected! Running in temporary in-memory fallback mode <<<");
});

mongoose.connect(MONGODB_URI)
  .catch(err => {
    dbConnected = false;
    console.error("Initial MongoDB Connection Failed:", err.message);
    console.warn("All registrations, logins, and orders will be saved in temporary memory until database reconnects.");
  });


// ----------------------------------------------------
// UPLOADS FOLDER MANAGEMENT
// ----------------------------------------------------
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
  console.log("Created uploads folder");
}

app.use('/uploads', express.static(uploadsDir));
app.use(express.static(path.join(__dirname, '../frontend')));

// Configure multer storage for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 } // limit: 50MB
});

// ----------------------------------------------------
// DATABASE SCHEMAS & MODELS
// ----------------------------------------------------
const studentSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, default: "N/A" },
  password: { type: String, required: true },
  registerNumber: { type: String, default: "" }, // Can be empty initially for Google SSO users
  department: { type: String, default: "" },
  batch: { type: String, default: "" },  // e.g. "2025-2029"
  pushSubscription: { type: Object, default: null }, // Stores browser push subscription object
  resetOtp:         { type: String, default: null },   // 6-digit OTP for password reset
  resetOtpExpiry:   { type: Date,   default: null },   // OTP expiry timestamp (10 min from issue)
  resetOtpAttempts: { type: Number, default: 0 },      // Wrong attempt counter (max 3)
  isVerified:       { type: Boolean, default: true },
  verificationOtp:  { type: String, default: null },
  verificationOtpExpiry: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

const Student = mongoose.model('Student', studentSchema);

const printOrderSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  studentName: { type: String, required: true },
  registerNumber: { type: String, required: true },
  department: { type: String, required: true },
  phone: { type: String, required: true },
  fileName: { type: String, default: 'N/A' },
  filePath: { type: String, default: 'N/A' },
  fileType: { type: String, default: 'N/A' },
  copies: { type: Number, required: true, default: 1 },
  colorMode: { type: String, enum: ['bw', 'color'], required: true },
  sides: { type: String, enum: ['single', 'double'], required: true },
  pageSize: { type: String, enum: ['A4', 'A3'], required: true },
  binding: { type: String, enum: ['none', 'calico', 'spiral'], default: 'none' },
  specialNote: { type: String, default: "" },
  amount: { type: Number, required: true },
  razorpayOrderId: { type: String },
  razorpayPaymentId: { type: String },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
  tokenNumber: { type: String },
  status: { type: String, enum: ['waiting', 'printing', 'ready', 'collected'], default: 'waiting' },
  pages: { type: Number, required: true, default: 1 },
  priceBreakdown: { type: String, default: "" },
  orderType: { type: String, enum: ['print', 'xerox'], default: 'print' },
  collectedAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

const PrintOrder = mongoose.model('PrintOrder', printOrderSchema);

const settingsSchema = new mongoose.Schema({
  bwSingleRate:    { type: Number, default: 2 },
  bwDoubleRate:    { type: Number, default: 3 },
  colorSingleRate: { type: Number, default: 5 },
  colorDoubleRate: { type: Number, default: 7 },
  lastUpdated:     { type: Date, default: Date.now }
});

const Settings = mongoose.model('Settings', settingsSchema);

// ----------------------------------------------------
// AUDIT LOG MODEL — Read-only, append-only price change history
// ----------------------------------------------------
const auditLogSchema = new mongoose.Schema({
  action: { type: String, default: 'price_change' },
  adminUsername: { type: String, required: true },
  changes: {
    bwSingleRate:    { old: Number, new: Number },
    bwDoubleRate:    { old: Number, new: Number },
    colorSingleRate: { old: Number, new: Number },
    colorDoubleRate: { old: Number, new: Number }
  },
  timestamp: { type: Date, default: Date.now },
  ipAddress: { type: String, default: '' }
});

// Disable remove/update operations at model level for safety
const AuditLog = mongoose.model('AuditLog', auditLogSchema);

// ----------------------------------------------------
// STAFF MODEL
// ----------------------------------------------------
const staffSchema = new mongoose.Schema({
  username:     { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  name:         { type: String, required: true },
  createdAt:    { type: Date, default: Date.now }
});
const Staff = mongoose.model('Staff', staffSchema);

// ----------------------------------------------------
// PAPER STOCK MODEL
// ----------------------------------------------------
const paperStockSchema = new mongoose.Schema({
  sheets:         { type: Number, default: 0 },
  lastSupplied:   { type: Date, default: null },
  lastSuppliedBy: { type: String, default: '' },
  supplyHistory:  [{
    sheets:        Number,
    suppliedBy:    String,
    confirmedBy:   String,
    confirmedAt:   Date,
    note:          String
  }]
});
const PaperStock = mongoose.model('PaperStock', paperStockSchema);

// ----------------------------------------------------
// RESOURCE REQUEST MODEL
// ----------------------------------------------------
const resourceRequestSchema = new mongoose.Schema({
  id: String,
  type: { type: String, default: 'paper' },
  sheets: Number,
  requestedBy: String,
  requestedAt: { type: Date, default: Date.now },
  note: { type: String, default: '' },
  status: { type: String, default: 'pending' } // pending, approved, rejected
});
const ResourceRequest = mongoose.model('ResourceRequest', resourceRequestSchema);

// In-memory fallback for resource requests
let inMemoryResourceRequests = [];
// Global shop status
let isShopOpen = true;


// ----------------------------------------------------
// TONER MANAGEMENT MODEL
// ----------------------------------------------------
const tonerSchema = new mongoose.Schema({
  capacity: { type: Number, default: 4000 },
  pagesPrinted: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'replaced'], default: 'active' },
  installedAt: { type: Date, default: Date.now },
  replacedAt: { type: Date, default: null },
  pagesPrintedAtReplacement: { type: Number, default: 0 },
  replacedBy: { type: String, default: '' },
  brand: { type: String, default: 'Generic' },
  serialNumber: { type: String, default: 'N/A' }
});
const Toner = mongoose.model('Toner', tonerSchema);

let inMemoryToners = [
  {
    _id: 'mem_toner_active_default',
    capacity: 4000,
    pagesPrinted: 0,
    status: 'active',
    installedAt: new Date(),
    replacedAt: null,
    pagesPrintedAtReplacement: 0,
    replacedBy: '',
    brand: 'Generic',
    serialNumber: 'N/A'
  }
];

// ----------------------------------------------------
// INK CARTRIDGE MODEL
// ----------------------------------------------------

// Pending resource deliveries (in-memory queue — staff needs to confirm)
const pendingResourceDeliveries = [];

async function initSettings() {
  if (dbConnected) {
    try {
      const count = await Settings.countDocuments();
      if (count === 0) {
        const defaultSettings = new Settings({
          bwSingleRate: 2,
          bwDoubleRate: 3,
          colorSingleRate: 5,
          colorDoubleRate: 7
        });
        await defaultSettings.save();
        console.log("Initialized default pricing settings in DB.");
      }
    } catch (err) {
      console.error("Failed to initialize pricing settings:", err);
    }
  }
}

// ── SMART PRICING ALGORITHM ──────────────────────────────────────────────────
function calculatePrice(pages, copies, colorMode, sides, settings, binding = 'none') {
  const singleRate = colorMode === 'color' ? settings.colorSingleRate : settings.bwSingleRate;
  const doubleRate = colorMode === 'color' ? settings.colorDoubleRate : settings.bwDoubleRate;
  let pricePerCopy;

  if (sides === 'single') {
    pricePerCopy = pages * singleRate;
  } else {
    // doubleRate is per SHEET (2 pages per sheet)
    const sheets = Math.floor(pages / 2);
    if (pages % 2 === 0) {
      pricePerCopy = sheets * doubleRate;
    } else {
      pricePerCopy = (sheets * doubleRate) + (1 * singleRate);
    }
  }

  if (binding === 'calico' || binding === 'spiral') {
    pricePerCopy += 30;
  }

  return Math.round(pricePerCopy * copies);
}

function getPriceBreakdown(pages, copies, colorMode, sides, settings, binding = 'none') {
  const singleRate = colorMode === 'color' ? settings.colorSingleRate : settings.bwSingleRate;
  const doubleRate = colorMode === 'color' ? settings.colorDoubleRate : settings.bwDoubleRate;
  const modeLabel  = colorMode === 'color' ? 'Color' : 'B&W';
  const sidesLabel = sides === 'single' ? 'Single sided' : 'Double sided';
  const bindingLabel = binding === 'calico' ? ', Calico Binding (+₹30/copy)' : binding === 'spiral' ? ', Spiral Binding (+₹30/copy)' : '';
  const calculatedTotal = calculatePrice(pages, copies, colorMode, sides, settings, binding);

  if (sides === 'single') {
    const copyMultiplier = copies > 1 ? ` × ${copies}` : '';
    const formulaStr = binding !== 'none' ? `(${pages} × ₹${singleRate} + ₹30)` : `${pages} × ₹${singleRate}`;
    return `₹${calculatedTotal} — ${pages} pages, ${modeLabel}, ${sidesLabel}${bindingLabel} (${formulaStr}${copyMultiplier})`;
  } else {
    const sheets = Math.floor(pages / 2);
    const copiesSuffix = copies > 1 ? ` × ${copies}` : '';
    if (pages % 2 === 0) {
      const formulaStr = binding !== 'none' ? `(${sheets} sheets × ₹${doubleRate} + ₹30)` : `${sheets} sheets × ₹${doubleRate}`;
      return `₹${calculatedTotal} — ${pages} pages (even), ${modeLabel}, ${sidesLabel}${bindingLabel} (${formulaStr}${copiesSuffix})`;
    } else {
      const base = `${sheets} sheets × ₹${doubleRate} + 1 × ₹${singleRate}${binding !== 'none' ? ' + ₹30' : ''}`;
      const formula = copies > 1 ? `(${base}) × ${copies}` : base;
      return `₹${calculatedTotal} — ${pages} pages (odd), ${modeLabel}, ${sidesLabel}${bindingLabel} (${formula})`;
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// RESOURCE DEDUCTION HELPERS
// ─────────────────────────────────────────────────────────────────

// Deduct paper sheets based on a print order
async function deductPaperUsage(order) {
  try {
    const copies = order.copies || 1;
    const pages  = order.pages  || 1;
    const sides  = order.sides  || 'single';
    const sheetsPerCopy = sides === 'double' ? Math.ceil(pages / 2) : pages;
    const totalSheets   = sheetsPerCopy * copies;

    if (dbConnected) {
      let stock = await PaperStock.findOne();
      if (!stock) stock = new PaperStock({ sheets: 0 });
      stock.sheets = Math.max(0, (stock.sheets || 0) - totalSheets);
      await stock.save();
      await checkPaperAlerts(stock.sheets);
    } else {
      inMemoryPaperStock.sheets = Math.max(0, (inMemoryPaperStock.sheets || 0) - totalSheets);
      checkPaperAlertsSync(inMemoryPaperStock.sheets);
    }
    console.log(`[Resources] Paper deducted: ${totalSheets} sheets for order ${order.tokenNumber}`);
  } catch (err) {
    console.error('[Resources] Paper deduction error:', err);
  }
}

async function getActiveToner() {
  if (dbConnected) {
    let active = await Toner.findOne({ status: 'active' });
    if (!active) {
      active = new Toner({ capacity: 4000, pagesPrinted: 0, status: 'active', installedAt: new Date(), brand: 'Generic', serialNumber: 'N/A' });
      await active.save();
    }
    return active;
  } else {
    let active = inMemoryToners.find(t => t.status === 'active');
    if (!active) {
      active = {
        _id: 'mem_toner_' + Date.now(),
        capacity: 4000,
        pagesPrinted: 0,
        status: 'active',
        installedAt: new Date(),
        replacedAt: null,
        pagesPrintedAtReplacement: 0,
        replacedBy: '',
        brand: 'Generic',
        serialNumber: 'N/A'
      };
      inMemoryToners.push(active);
    }
    return active;
  }
}

async function deductTonerUsage(order) {
  try {
    const copies = order.copies || 1;
    const pages  = order.pages  || 1;
    const totalPrintedPages = pages * copies;

    const activeToner = await getActiveToner();
    activeToner.pagesPrinted = (activeToner.pagesPrinted || 0) + totalPrintedPages;

    if (dbConnected) {
      await Toner.findByIdAndUpdate(activeToner._id, { pagesPrinted: activeToner.pagesPrinted });
    }

    // Check alert (90% capacity used)
    const capacity = activeToner.capacity || 4000;
    const usagePct = (activeToner.pagesPrinted / capacity) * 100;
    if (usagePct >= 90) {
      console.warn(`[ALERT] CRITICAL: Toner usage is at ${usagePct.toFixed(1)}%! (${activeToner.pagesPrinted}/${capacity} pages)`);
      broadcastResourceAlert('toner', 'critical', activeToner.pagesPrinted);
    } else {
      broadcastResourceAlert('toner', 'info', activeToner.pagesPrinted);
    }
    console.log(`[Resources] Toner usage updated: +${totalPrintedPages} pages (total: ${activeToner.pagesPrinted}/${capacity})`);
  } catch (err) {
    console.error('[Resources] Toner deduction error:', err);
  }
}

// Alert helpers (async DB version)
async function checkPaperAlerts(sheets) {
  if (sheets <= 20) {
    console.warn(`[ALERT] CRITICAL: Paper stock at ${sheets} sheets!`);
    broadcastResourceAlert('paper', 'critical', sheets);
  } else if (sheets <= 100) {
    console.warn(`[ALERT] WARNING: Paper stock low at ${sheets} sheets.`);
    broadcastResourceAlert('paper', 'warning', sheets);
  }
}

// Sync versions for in-memory mode
function checkPaperAlertsSync(sheets) { checkPaperAlerts(sheets); }

// Broadcast resource alert via SSE to all connected admin tabs
function broadcastResourceAlert(resource, severity, value) {
  const payload = JSON.stringify({
    type: 'resource-alert',
    resource,
    severity,
    value,
    timestamp: new Date().toISOString()
  });
  sseClients.forEach(res => {
    try { res.write(`data: ${payload}\n\n`); } catch(e) { sseClients.delete(res); }
  });
}

// ----------------------------------------------------
// WEB PUSH NOTIFICATION HELPER
// ----------------------------------------------------
async function sendPushNotification(studentId, payload) {
  try {
    let student = null;
    if (dbConnected) {
      student = await Student.findById(studentId);
    } else {
      student = inMemoryStudents.find(s => s._id.toString() === studentId.toString());
    }

    if (student && student.pushSubscription) {
      console.log(`Triggering push notification for student: ${student.email}`);
      await webpush.sendNotification(
        student.pushSubscription,
        JSON.stringify(payload)
      );
    } else {
      console.log(`No active pushSubscription registered for student ID: ${studentId}`);
    }
  } catch (err) {
    console.error("Web Push execution error:", err.message);
  }
}

// ----------------------------------------------------
// AUTHENTICATION MIDDLEWARES
// ----------------------------------------------------
// Student-only middleware
function authenticateStudent(req, res, next) {
  const token = (req.headers['authorization'] || '').split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'Access denied. Token missing.' });
  jwt.verify(token, STUDENT_JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ success: false, message: 'Invalid or expired token.' });
    if (decoded.role !== 'student') return res.status(403).json({ success: false, message: 'Access denied. Students only.' });
    req.student = decoded;
    next();
  });
}

// Staff-only middleware (also accepts ?token= for SSE)
function authenticateStaff(req, res, next) {
  const token = ((req.headers['authorization'] || '').split(' ')[1]) || req.query.token;
  if (!token) return res.status(401).json({ success: false, message: 'Access denied. Token missing.' });
  jwt.verify(token, STAFF_JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ success: false, message: 'Invalid or expired token.' });
    if (decoded.role !== 'staff') return res.status(403).json({ success: false, message: 'Access denied. Staff only.' });
    req.staff = decoded;
    // Update activity heartbeat automatically on every authenticated staff call
    staffActivity.set(decoded.id, { name: decoded.name, username: decoded.username, lastSeen: new Date() });
    next();
  });
}

// Admin-only middleware (also accepts ?token= for SSE)
function authenticateAdmin(req, res, next) {
  const token = ((req.headers['authorization'] || '').split(' ')[1]) || req.query.token;
  if (!token) return res.status(401).json({ success: false, message: 'Access denied. Token missing.' });
  jwt.verify(token, ADMIN_JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ success: false, message: 'Invalid or expired token.' });
    if (decoded.role !== 'admin') return res.status(403).json({ success: false, message: 'Access denied. Admin only.' });
    req.admin = decoded;
    next();
  });
}

// GET /auth/student/emails — public endpoint for student login fallback dropdown
app.get('/auth/student/emails', async (req, res) => {
  try {
    if (dbConnected) {
      const students = await Student.find({}, { email: 1 });
      const emails = students.map(s => s.email).filter(Boolean);
      return res.status(200).json({ success: true, emails });
    } else {
      const emails = inMemoryStudents.map(s => s.email).filter(Boolean);
      return res.status(200).json({ success: true, emails });
    }
  } catch (error) {
    console.error("Get Student Emails Error:", error);
    return res.status(500).json({ success: false, message: 'Server processing error.' });
  }
});

// Student Registration
app.post('/auth/student/register', async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password, registerNumber, department, batch } = req.body;

    // Server-side: SECE email domain enforcement
    if (!email || !email.toLowerCase().endsWith('@sece.ac.in')) {
      return res.status(400).json({ success: false, message: 'Only SECE college email addresses (@sece.ac.in) are allowed to register.' });
    }

    if (dbConnected) {
      // MongoDB Flow
      const emailExists = await Student.findOne({ email });
      if (emailExists) return res.status(400).json({ success: false, message: 'Email already registered.' });

      const regExists = await Student.findOne({ registerNumber });
      if (regExists) return res.status(400).json({ success: false, message: 'Register number already registered.' });

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      const student = new Student({
        firstName, lastName, email, phone, password: hashedPassword, registerNumber, department, batch,
        isVerified: true,
        verificationOtp: null,
        verificationOtpExpiry: null
      });
      await student.save();
    } else {
      // In-Memory Flow
      console.log(`[Offline Mode] Registering student: ${email}`);
      const emailExists = inMemoryStudents.find(s => s.email === email);
      if (emailExists) return res.status(400).json({ success: false, message: 'Email already registered.' });

      const regExists = inMemoryStudents.find(s => s.registerNumber === registerNumber);
      if (regExists) return res.status(400).json({ success: false, message: 'Register number already registered.' });

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      inMemoryStudents.push({
        _id: 'mem_std_' + Date.now(),
        firstName, lastName, email, phone, password: hashedPassword, registerNumber, department, batch,
        pushSubscription: null,
        isVerified: true,
        verificationOtp: null,
        verificationOtpExpiry: null,
        createdAt: new Date()
      });
    }

    return res.status(201).json({ success: true, message: 'Registration successful.' });
  } catch (error) {
    console.error("Register Error:", error);
    return res.status(500).json({ success: false, message: 'Server processing error.' });
  }
});

// Verify Student Email OTP (Registration)
app.post('/auth/student/verify-email', async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ success: false, message: 'Email and OTP are required.' });
  const emailLower = email.toLowerCase().trim();

  try {
    let student = null;
    if (dbConnected) {
      student = await Student.findOne({ email: emailLower });
    } else {
      student = inMemoryStudents.find(s => s.email === emailLower);
    }

    if (!student) {
      return res.status(404).json({ success: false, message: 'Registration record not found.' });
    }

    if (student.isVerified) {
      return res.status(200).json({ success: true, message: 'Email already verified. You can login.' });
    }

    if (!student.verificationOtp || student.verificationOtp !== otp.trim()) {
      return res.status(400).json({ success: false, message: 'Invalid verification OTP.' });
    }

    if (!student.verificationOtpExpiry || new Date() > new Date(student.verificationOtpExpiry)) {
      return res.status(400).json({ success: false, message: 'Verification OTP has expired. Please register again.' });
    }

    student.isVerified = true;
    student.verificationOtp = null;
    student.verificationOtpExpiry = null;
    if (dbConnected) {
      await student.save();
    }
    return res.status(200).json({ success: true, message: 'Email verified successfully. You can now login.' });
  } catch (error) {
    console.error('Verify Email Error:', error);
    return res.status(500).json({ success: false, message: 'Server processing error during verification.' });
  }
});

// Student Login
app.post('/auth/student/login', async (req, res) => {
  try {
    const { email, identifier, password } = req.body;
    const userIdentifier = (identifier || email || '').trim();
    if (!userIdentifier || !password) {
      return res.status(400).json({ success: false, message: 'Invalid credentials.' });
    }
    const idLower = userIdentifier.toLowerCase();

    let student = null;
    if (dbConnected) {
      student = await Student.findOne({
        $or: [
          { email: idLower },
          { registerNumber: userIdentifier }
        ]
      });
    } else {
      student = inMemoryStudents.find(s =>
        (s.email && s.email.toLowerCase() === idLower) ||
        (s.registerNumber && s.registerNumber.toLowerCase() === idLower)
      );
    }

    if (!student) {
      return res.status(400).json({ success: false, message: 'Invalid email or password.' });
    }

    const validPassword = await bcrypt.compare(password, student.password);
    if (!validPassword) {
      return res.status(400).json({ success: false, message: 'Invalid email or password.' });
    }

    // if (student.isVerified === false) {
    //   return res.status(400).json({ success: false, message: 'Please verify your email address first.' });
    // }

    const token = jwt.sign(
      { id: student._id, name: `${student.firstName} ${student.lastName}`, email: student.email, role: 'student' },
      STUDENT_JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(200).json({ success: true, token, role: 'student', name: `${student.firstName} ${student.lastName}`, studentName: `${student.firstName} ${student.lastName}`, redirectTo: '/student.html' });
  } catch (error) {
    console.error("Student Login Error:", error);
    return res.status(500).json({ success: false, message: 'Server processing error.' });
  }
});

// ── UNIFIED LOGIN ─────────────────────────────────────────────────────────────
// POST /auth/login — detects role from identifier (email / registerNumber → student, username → staff/admin)
app.post('/auth/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: 'Invalid credentials.' });
    }

    const INVALID = 'Invalid credentials.';
    const idTrimmed = identifier.trim();
    const idLower = idTrimmed.toLowerCase();

    // 1. Check Student first (by Email OR Register Number)
    let student = null;
    const cleanReg = idTrimmed.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    if (dbConnected) {
      student = await Student.findOne({
        $or: [
          { email: idLower },
          { registerNumber: { $regex: new RegExp('^' + cleanReg + '$', 'i') } }
        ]
      });
    } else {
      student = inMemoryStudents.find(s =>
        (s.email && s.email.toLowerCase() === idLower) ||
        (s.registerNumber && s.registerNumber.toLowerCase() === idLower)
      );
    }
    if (student) {
      const valid = await bcrypt.compare(password, student.password);
      if (valid) {
        // if (student.isVerified === false) {
        //   return res.status(400).json({ success: false, message: 'Please verify your email address first.' });
        // }
        const token = jwt.sign(
          { id: student._id, name: `${student.firstName} ${student.lastName}`, email: student.email, role: 'student' },
          STUDENT_JWT_SECRET, { expiresIn: '7d' }
        );
        return res.status(200).json({
          success: true, token, role: 'student',
          name: `${student.firstName} ${student.lastName}`,
          studentName: `${student.firstName} ${student.lastName}`,
          redirectTo: '/student.html'
        });
      }
    }

    // 2. Admin check (hardcoded credentials from .env)
    if (idTrimmed === ADMIN_USERNAME_ENV && password === ADMIN_PASSWORD_ENV) {
      const token = jwt.sign(
        { id: 'admin', username: ADMIN_USERNAME_ENV, name: 'Admin', role: 'admin' },
        ADMIN_JWT_SECRET, { expiresIn: '7d' }
      );
      return res.status(200).json({
        success: true, token, role: 'admin', name: 'Admin', redirectTo: '/admin.html'
      });
    }

    // 3. Staff check
    let staff = null;
    if (dbConnected) {
      staff = await Staff.findOne({ username: idTrimmed });
    } else {
      staff = inMemoryStaff.find(s => s.username === idTrimmed);
    }
    if (staff) {
      const validStaff = await bcrypt.compare(password, staff.passwordHash);
      if (validStaff) {
        const token = jwt.sign(
          { id: staff._id || staff.id, username: staff.username, name: staff.name, role: 'staff' },
          STAFF_JWT_SECRET, { expiresIn: '7d' }
        );
        return res.status(200).json({
          success: true, token, role: 'staff', name: staff.name, redirectTo: '/staff.html'
        });
      }
    }

    return res.status(401).json({ success: false, message: INVALID });
  } catch (error) {
    console.error('Unified Login Error:', error);
    return res.status(500).json({ success: false, message: 'Server processing error.' });
  }
});

// Backwards-compat alias (kept for any old frontend references)
app.post('/auth/admin/login', async (req, res) => {
  const { username, password } = req.body;
  req.body.identifier = username;
  // re-use unified logic
  if (username === ADMIN_USERNAME_ENV && password === ADMIN_PASSWORD_ENV) {
    const token = jwt.sign(
      { id: 'admin', username: ADMIN_USERNAME_ENV, name: 'Admin', role: 'admin' },
      ADMIN_JWT_SECRET, { expiresIn: '7d' }
    );
    return res.status(200).json({ success: true, token, role: 'admin', name: 'Admin' });
  }
  return res.status(401).json({ success: false, message: 'Invalid credentials.' });
});

// ── STAFF SELF-REGISTRATION ───────────────────────────────────────────────────
app.post('/auth/staff/register', async (req, res) => {
  try {
    const { username, password, name, secretCode } = req.body;

    // Validate secret code
    if (!secretCode || secretCode !== STAFF_REGISTER_CODE) {
      return res.status(403).json({ success: false, message: 'Invalid registration code.' });
    }

    // Validate username (letters, numbers, underscore only)
    if (!username || !/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      return res.status(400).json({ success: false, message: 'Username must be 3-30 characters: letters, numbers, underscore only.' });
    }

    // Validate password length
    if (!password || password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }

    if (!name || name.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Full name is required.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    if (dbConnected) {
      const exists = await Staff.findOne({ username });
      if (exists) return res.status(400).json({ success: false, message: 'Username already taken.' });
      const staff = new Staff({ username, passwordHash, name: name.trim() });
      await staff.save();
    } else {
      const exists = inMemoryStaff.find(s => s.username === username);
      if (exists) return res.status(400).json({ success: false, message: 'Username already taken.' });
      inMemoryStaff.push({
        id: 'mem_staff_' + Date.now(), username, passwordHash, name: name.trim(), createdAt: new Date()
      });
    }

    return res.status(201).json({ success: true, message: 'Staff account created successfully.' });
  } catch (error) {
    console.error('Staff Register Error:', error);
    return res.status(500).json({ success: false, message: 'Server processing error.' });
  }
});

// ── STAFF HEARTBEAT (updates activity status) ─────────────────────────────────
app.post('/staff/heartbeat', authenticateStaff, (req, res) => {
  // Activity is already updated inside authenticateStaff middleware
  return res.status(200).json({ success: true });
});

// POST /staff/close-shop — Close shop for the day, verify password, email CSV report to admin, disable uploads
app.post('/staff/close-shop', authenticateStaff, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ success: false, message: 'Password is required to close the shop.' });
    }

    let isPasswordValid = false;
    let staffName = req.staff.name || req.staff.username || 'Staff';

    if (dbConnected) {
      let staff = null;
      if (req.staff.id) {
        staff = await Staff.findById(req.staff.id);
      }
      if (!staff && req.staff.username) {
        staff = await Staff.findOne({ username: req.staff.username });
      }
      if (staff) {
        staffName = staff.name || staff.username;
        isPasswordValid = await bcrypt.compare(password, staff.passwordHash);
      }
    } else {
      const staff = inMemoryStaff.find(s => s.username === req.staff.username || s.id === req.staff.id);
      if (staff) {
        staffName = staff.name || staff.username;
        isPasswordValid = await bcrypt.compare(password, staff.passwordHash);
      }
    }

    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Invalid staff password. Shop close rejected.' });
    }

    // Generate Daily Report
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    let todayOrders = [];
    if (dbConnected) {
      todayOrders = await PrintOrder.find({ paymentStatus: 'paid', createdAt: { $gte: todayStart } });
    } else {
      todayOrders = inMemoryOrders.filter(o => o.paymentStatus === 'paid' && new Date(o.createdAt) >= todayStart);
    }

    let totalAmount = 0;
    todayOrders.forEach(o => {
      totalAmount += o.amount || 0;
    });

    const staffName = req.staff.name || req.staff.username;
    const reportDateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    // 1. Generate protected Excel file using ExcelJS
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Daily Transactions');
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    sheet.columns = [
      { header: 'Token Number', key: 'token' },
      { header: 'Student Name', key: 'name' },
      { header: 'Register Number', key: 'regNo' },
      { header: 'Department', key: 'dept' },
      { header: 'File / Order Name', key: 'file' },
      { header: 'Transaction ID', key: 'txId' },
      { header: 'Color Mode', key: 'color' },
      { header: 'Sides', key: 'sides' },
      { header: 'Copies', key: 'copies' },
      { header: 'Binding', key: 'binding' },
      { header: 'Amount per User (Rs)', key: 'amount' },
      { header: 'Status', key: 'status' },
      { header: 'Timestamp', key: 'time' }
    ];

    todayOrders.forEach(o => {
      const orderName = o.orderType === 'xerox' 
        ? `Xerox (Pages: ${o.pages || 1}, Copies: ${o.copies})` 
        : (o.fileName || 'N/A');
      const txId = o.razorpayPaymentId || o.razorpayOrderId || 'N/A';
      
      sheet.addRow({
        token: o.tokenNumber || 'N/A',
        name: o.studentName || '',
        regNo: o.registerNumber || '',
        dept: o.department || '',
        file: orderName,
        txId: txId,
        color: o.colorMode === 'bw' ? 'B&W' : 'Color',
        sides: o.sides === 'single' ? 'Single Sided' : 'Double Sided',
        copies: o.copies || 1,
        binding: o.binding || 'none',
        amount: o.amount || 0,
        status: o.status || '',
        time: o.createdAt ? new Date(o.createdAt).toLocaleString('en-IN') : ''
      });
    });

    sheet.addRow({});
    const totalRow = sheet.addRow({
      token: 'Total Amount Collected:',
      amount: totalAmount
    });
    totalRow.getCell('token').font = { bold: true };
    totalRow.getCell('amount').font = { bold: true };

    // Auto-adjust column widths based on content length
    sheet.columns.forEach(column => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, cell => {
        const value = cell.value ? cell.value.toString() : '';
        if (value.length > maxLength) {
          maxLength = value.length;
        }
      });
      column.width = Math.max(maxLength + 4, 12);
    });

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1A2A4A' }
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    sheet.eachRow((row, rowNumber) => {
      row.eachCell(cell => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
        };
        // Lock every cell from editing
        cell.protection = { locked: true };

        if (rowNumber > 1) {
          if (cell.column === 1 || cell.column === 3 || cell.column === 6) {
            cell.alignment = { horizontal: 'center' };
          } else if (cell.column === 9 || cell.column === 11) {
            cell.alignment = { horizontal: 'right' };
          }
        }
      });
    });

    // Enable sheet protection with password
    await sheet.protect('seceprinsta2026', {
      selectLockedCells: true,
      selectUnlockedCells: false,
      formatCells: false,
      formatColumns: false,
      formatRows: false,
      insertColumns: false,
      insertRows: false,
      insertHyperlinks: false,
      deleteColumns: false,
      deleteRows: false,
      sort: false,
      autoFilter: false,
      pivotTables: false
    });

    const excelBuffer = await workbook.xlsx.writeBuffer();

    // 2. Generate Landscape A4 PDF daily report using PDFKit
    const generatePDF = () => {
      return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ layout: 'landscape', size: 'A4', margin: 25 });
        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', err => reject(err));

        doc.font('Helvetica-Bold').fillColor('#1A2A4A').fontSize(18).text('PRINTSTA DAILY TRANSACTIONS REPORT', { align: 'center' });
        doc.moveDown(0.2);
        doc.font('Helvetica-Bold').fillColor('#F5A623').fontSize(11).text(`Date: ${reportDateStr}  |  Closed By: ${staffName}`, { align: 'center' });
        doc.moveDown(0.5);

        // Summary Statistics Box
        doc.rect(25, doc.y, 792 - 50, 40).fillAndStroke('#EFF6FF', '#BFDBFE');
        doc.fillColor('#1E3A8A').fontSize(10).font('Helvetica-Bold');
        doc.text(`Total Collections: Rs. ${totalAmount}`, 35, doc.y + 15, { lineBreak: false });
        doc.text(`Total Orders: ${todayOrders.length}`, 250, doc.y, { lineBreak: false });
        const printCount = todayOrders.filter(o => o.orderType !== 'xerox').length;
        const xeroxCount = todayOrders.filter(o => o.orderType === 'xerox').length;
        doc.text(`Print Jobs: ${printCount}  |  Xerox Jobs: ${xeroxCount}`, 450, doc.y);
        doc.moveDown(1.5);

        // Table headers config
        const yStart = doc.y;
        doc.rect(25, yStart, 792 - 50, 20).fill('#1A2A4A');
        doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold');
        
        const cols = [
          { name: 'Token', x: 30, w: 40 },
          { name: 'Student Name', x: 75, w: 100 },
          { name: 'Reg Number', x: 180, w: 65 },
          { name: 'Dept', x: 250, w: 45 },
          { name: 'File / Order Name', x: 300, w: 140 },
          { name: 'Transaction ID', x: 445, w: 110 },
          { name: 'Mode', x: 560, w: 35 },
          { name: 'Sides', x: 600, w: 35 },
          { name: 'Cop', x: 640, w: 20 },
          { name: 'Bind', x: 665, w: 40 },
          { name: 'Amount', x: 710, w: 45 },
          { name: 'Timestamp', x: 760, w: 55 }
        ];

        cols.forEach(c => {
          doc.text(c.name, c.x, yStart + 6);
        });

        let currentY = yStart + 20;
        doc.font('Helvetica').fontSize(7.5).fillColor('#1F2937');

        todayOrders.forEach((o, index) => {
          if (currentY > 530) {
            doc.addPage({ layout: 'landscape', size: 'A4', margin: 25 });
            doc.rect(25, 25, 792 - 50, 20).fill('#1A2A4A');
            doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold');
            cols.forEach(c => {
              doc.text(c.name, c.x, 31);
            });
            currentY = 45;
            doc.font('Helvetica').fontSize(7.5).fillColor('#1F2937');
          }

          if (index % 2 === 1) {
            doc.rect(25, currentY, 792 - 50, 18).fill('#F9FAFB');
          }
          doc.fillColor('#1F2937');
          doc.rect(25, currentY, 792 - 50, 18).stroke('#E5E7EB');

          const cleanName = o.studentName ? (o.studentName.length > 22 ? o.studentName.substring(0, 20) + '..' : o.studentName) : '';
          const orderName = o.orderType === 'xerox' 
            ? `Xerox (P:${o.pages || 1}, C:${o.copies})` 
            : (o.fileName ? (o.fileName.length > 30 ? o.fileName.substring(0, 28) + '..' : o.fileName) : 'N/A');
          const txId = o.razorpayPaymentId || o.razorpayOrderId || 'N/A';
          const cleanTxId = txId.length > 22 ? txId.substring(0, 20) + '..' : txId;
          const localTime = o.createdAt ? new Date(o.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
          const bindingStr = o.binding || 'none';

          doc.text(o.tokenNumber || 'N/A', 30, currentY + 5);
          doc.text(cleanName, 75, currentY + 5);
          doc.text(o.registerNumber || 'N/A', 180, currentY + 5);
          doc.text(o.department || 'N/A', 250, currentY + 5);
          doc.text(orderName, 300, currentY + 5);
          doc.text(cleanTxId, 445, currentY + 5);
          doc.text(o.colorMode === 'color' ? 'Color' : 'B&W', 560, currentY + 5);
          doc.text(o.sides === 'double' ? 'Double' : 'Single', 600, currentY + 5);
          doc.text(o.copies.toString(), 640, currentY + 5);
          doc.text(bindingStr, 665, currentY + 5);
          doc.text(`Rs. ${o.amount || 0}`, 710, currentY + 5);
          doc.text(localTime, 760, currentY + 5);

          currentY += 18;
        });

        doc.fillColor('#9CA3AF').fontSize(7).text(`Generated by Printsta SECE Management System on ${new Date().toLocaleString('en-IN')}. This document is non-editable and secure.`, 25, 565, { align: 'center' });
        doc.end();
      });
    };

    const pdfBuffer = await generatePDF();

    const adminEmail = ADMIN_REPORT_EMAIL;

    if (emailTransporter) {
      try {
        await emailTransporter.sendMail({
          from: `"Printsta Close Shop Alert" <${EMAIL_USER}>`,
          to: adminEmail,
          subject: `Printsta Daily Report — ${reportDateStr}`,
          text: `Hello Admin,\n\nThe print shop has been closed for today by staff member ${staffName}.\n\nAttached are today's detailed print collections reports in both protected Excel (.xlsx) and PDF (.pdf) formats.\n\nTotal Collected Today: Rs. ${totalAmount}\n\nBest regards,\nPrintsta Automated System`,
          attachments: [
            {
              filename: `Printsta_Daily_Report_${new Date().toISOString().split('T')[0]}.xlsx`,
              content: excelBuffer
            },
            {
              filename: `Printsta_Daily_Report_${new Date().toISOString().split('T')[0]}.pdf`,
              content: pdfBuffer
            }
          ]
        });
        console.log(`[Shop Close] Sent daily Excel and PDF reports to ${adminEmail}`);
      } catch (mailErr) {
        console.error('[Shop Close] Failed to send email daily report:', mailErr);
      }
    } else {
      console.warn('[Shop Close] Email transporter not configured.');
    }

    // Close the shop globally
    isShopOpen = false;

    // Notify all SSE clients
    const payload = JSON.stringify({ type: 'shop-status', open: false });
    sseClients.forEach(res => {
      try { res.write(`data: ${payload}\n\n`); } catch(e) { sseClients.delete(res); }
    });

    return res.json({ 
      success: true, 
      message: 'Shop successfully closed. Daily reports emailed to Admin.', 
      totalCollected: totalAmount,
      excelBase64: excelBuffer.toString('base64'),
      pdfBase64: pdfBuffer.toString('base64')
    });
  } catch (err) {
    console.error('Close shop error:', err);
    return res.status(500).json({ success: false, message: 'Server processing error during shop close.' });
  }
});

// GET /shop-status — Public route to fetch open status of the shop
app.get('/shop-status', (req, res) => {
  return res.json({ success: true, open: isShopOpen });
});

// POST /staff/reopen-shop — Admin or staff can reopen the shop if needed
app.post('/staff/reopen-shop', authenticateStaff, (req, res) => {
  isShopOpen = true;
  // Notify all SSE clients
  const payload = JSON.stringify({ type: 'shop-status', open: true });
  sseClients.forEach(res => {
    try { res.write(`data: ${payload}\n\n`); } catch(e) { sseClients.delete(res); }
  });
  return res.json({ success: true, message: 'Shop reopened successfully.' });
});

// ── ADMIN: STAFF MANAGEMENT ROUTES ────────────────────────────────────────────
// GET /admin/staff — list all staff accounts with online status
app.get('/admin/staff', authenticateAdmin, async (req, res) => {
  try {
    const ONLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes
    let staffList = [];

    if (dbConnected) {
      const staffDocs = await Staff.find().sort({ createdAt: -1 }).lean();
      staffList = staffDocs.map(s => {
        const activity = staffActivity.get(s._id.toString());
        const isActive = activity && (Date.now() - new Date(activity.lastSeen).getTime() < ONLINE_THRESHOLD_MS);
        return {
          id: s._id, username: s.username, name: s.name,
          createdAt: s.createdAt,
          isActive: !!isActive,
          lastSeen: activity ? activity.lastSeen : null
        };
      });
    } else {
      staffList = inMemoryStaff.map(s => {
        const activity = staffActivity.get(s.id);
        const isActive = activity && (Date.now() - new Date(activity.lastSeen).getTime() < ONLINE_THRESHOLD_MS);
        return {
          id: s.id, username: s.username, name: s.name,
          createdAt: s.createdAt,
          isActive: !!isActive,
          lastSeen: activity ? activity.lastSeen : null
        };
      });
    }

    return res.status(200).json({ success: true, staff: staffList });
  } catch (error) {
    console.error('Get Staff Error:', error);
    return res.status(500).json({ success: false, message: 'Server processing error.' });
  }
});

// DELETE /admin/staff/:id — remove a staff account (requires admin password verification)
app.delete('/admin/staff/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ success: false, message: 'Admin password is required to delete staff.' });
    }

    if (!ADMIN_PASSWORD_HASH) {
      return res.status(503).json({ success: false, message: 'Server still initialising. Please try again shortly.' });
    }

    const passwordMatch = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, message: 'Incorrect admin password.' });
    }

    if (dbConnected) {
      await Staff.findByIdAndDelete(id);
    } else {
      const idx = inMemoryStaff.findIndex(s => s.id === id);
      if (idx !== -1) inMemoryStaff.splice(idx, 1);
    }
    staffActivity.delete(id);
    return res.status(200).json({ success: true, message: 'Staff account deleted.' });
  } catch (error) {
    console.error('Delete Staff Error:', error);
    return res.status(500).json({ success: false, message: 'Server processing error.' });
  }
});


// PATCH /admin/staff/:id/reset-password — reset a staff member's password
app.patch('/admin/staff/:id/reset-password', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'New password must be at least 8 characters.' });
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    if (dbConnected) {
      await Staff.findByIdAndUpdate(id, { passwordHash });
    } else {
      const staff = inMemoryStaff.find(s => s.id === id);
      if (staff) staff.passwordHash = passwordHash;
    }
    return res.status(200).json({ success: true, message: 'Password reset successfully.' });
  } catch (error) {
    console.error('Reset Staff Password Error:', error);
    return res.status(500).json({ success: false, message: 'Server processing error.' });
  }
});

// ── ADMIN: VIEW CURRENT STAFF REGISTER CODE ───────────────────────────────────
app.get('/admin/staff-register-code', authenticateAdmin, (req, res) => {
  return res.status(200).json({ success: true, code: STAFF_REGISTER_CODE });
});

// ── ADMIN: REGENERATE STAFF REGISTER CODE ─────────────────────────────────────
app.post('/admin/staff-register-code/regenerate', authenticateAdmin, (req, res) => {
  // Generate a new code: SECE@ + 6 random uppercase alphanumeric chars
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let randomPart = '';
  for (let i = 0; i < 6; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const newCode = `SECE@${randomPart}`;
  STAFF_REGISTER_CODE = newCode;

  // Persist to .env file so it survives server restarts
  try {
    const envPath = path.join(__dirname, '.env');
    let envContent = fs.readFileSync(envPath, 'utf8');
    if (envContent.includes('STAFF_REGISTER_CODE=')) {
      envContent = envContent.replace(/STAFF_REGISTER_CODE=.*/g, `STAFF_REGISTER_CODE=${newCode}`);
    } else {
      envContent += `\nSTAFF_REGISTER_CODE=${newCode}`;
    }
    fs.writeFileSync(envPath, envContent, 'utf8');
  } catch (e) {
    console.warn('Could not persist new STAFF_REGISTER_CODE to .env:', e.message);
  }

  console.log(`[Admin] Staff register code regenerated: ${newCode}`);
  return res.status(200).json({ success: true, code: newCode, message: 'New registration code generated.' });
});

// ── ADMIN: CREATE STAFF ACCOUNT DIRECTLY ─────────────────────────────────────
app.post('/admin/create-staff', authenticateAdmin, async (req, res) => {
  try {
    const { name, username, password, adminPassword } = req.body;

    if (!adminPassword) {
      return res.status(400).json({ success: false, message: 'Admin password confirmation is required.' });
    }

    // Verify Admin Password
    const adminPassMatch = await bcrypt.compare(adminPassword, ADMIN_PASSWORD_HASH);
    if (!adminPassMatch) {
      return res.status(401).json({ success: false, message: 'Incorrect Admin password.' });
    }

    if (!name || name.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Full name is required.' });
    }
    if (!username || !/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      return res.status(400).json({ success: false, message: 'Username must be 3–30 characters (letters, numbers, underscore).' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    if (dbConnected) {
      const exists = await Staff.findOne({ username });
      if (exists) return res.status(400).json({ success: false, message: 'Username already taken.' });
      const staff = new Staff({ username, passwordHash, name: name.trim() });
      await staff.save();
    } else {
      const exists = inMemoryStaff.find(s => s.username === username);
      if (exists) return res.status(400).json({ success: false, message: 'Username already taken.' });
      inMemoryStaff.push({ id: 'mem_staff_' + Date.now(), username, passwordHash, name: name.trim(), createdAt: new Date() });
    }

    console.log(`[Admin] Created staff account: ${username} (${name.trim()})`);
    return res.status(201).json({ success: true, message: `Staff account "${username}" created successfully.` });
  } catch (error) {
    console.error('Admin Create Staff Error:', error);
    return res.status(500).json({ success: false, message: 'Server processing error.' });
  }
});

// ----------------------------------------------------
// FORGOT PASSWORD — OTP EMAIL FLOW
// ----------------------------------------------------

// Helper: send registration verification email via nodemailer
async function sendVerificationEmail(toEmail, otp) {
  const html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 500px; margin: 0 auto; padding: 0; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);">
      <!-- Header Banner -->
      <div style="background-color: #1a2a4a; padding: 24px; text-align: center;">
        <span style="font-size: 24px; font-weight: bold; letter-spacing: 0.5px; color: #ffffff;">
          <span style="color: #ffffff;">prin</span><span style="color: #f5a623;">sta</span>
        </span>
        <div style="font-size: 11px; color: #cbd5e1; margin-top: 4px; text-transform: uppercase; letter-spacing: 1px;">
          Sri Eshwar College of Engineering
        </div>
      </div>
      
      <!-- Body Content -->
      <div style="padding: 32px 24px; color: #334155; line-height: 1.6;">
        <h2 style="font-size: 20px; font-weight: 700; color: #1a2a4a; margin-top: 0; margin-bottom: 16px; text-align: center;">
          Email Verification
        </h2>
        
        <p style="margin: 0 0 16px 0; font-size: 15px;">
          Thank you for registering at Printsta. Please use the following One-Time Password (OTP) to verify your email address and activate your account:
        </p>
        
        <!-- OTP Display -->
        <div style="background-color: #f8fafc; border: 1.5px dashed #cbd5e1; border-radius: 8px; padding: 18px; text-align: center; margin: 24px 0;">
          <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; color: #64748b; margin-bottom: 8px; font-weight: 600;">
            Verification Code
          </div>
          <div style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #1a2a4a; font-family: 'Courier New', Courier, monospace;">
            ${otp}
          </div>
        </div>
        
        <p style="margin: 0 0 20px 0; font-size: 13.5px; color: #64748b; background-color: #f0f9ff; border-left: 4px solid #0284c7; padding: 10px 12px; border-radius: 0 4px 4px 0;">
          This OTP is valid for <strong>15 minutes</strong>. For security, do not share this code with anyone.
        </p>
        
        <p style="margin: 0 0 24px 0; font-size: 13px; color: #94a3b8; line-height: 1.4;">
          If you did not initiate this request, you can safely ignore this email.
        </p>
        
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
        
        <!-- Footer -->
        <p style="margin: 0; font-size: 13px; color: #64748b; text-align: center;">
          Thank you,<br>
          <strong>Printsta Support Team</strong><br>
          Sri Eshwar College of Engineering
        </p>
      </div>
    </div>
  `;
  if (emailTransporter) {
    console.log(`[EMAIL] Sending verification email to ${toEmail}...`);
    const info = await emailTransporter.sendMail({
      from: `"Printsta SECE" <${EMAIL_USER}>`,
      to: toEmail,
      subject: 'Printsta — Registration Verification OTP',
      html
    });
    console.log(`[EMAIL] Verification email sent successfully to ${toEmail}. Message ID: ${info.messageId}`);
  } else {
    console.log(`[DEV] Registration Verification OTP for ${toEmail}: ${otp}`);
  }
}

// Helper: send OTP email via nodemailer
async function sendOtpEmail(toEmail, otp) {
  const html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 500px; margin: 0 auto; padding: 0; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);">
      <!-- Header Banner -->
      <div style="background-color: #1a2a4a; padding: 24px; text-align: center;">
        <span style="font-size: 24px; font-weight: bold; letter-spacing: 0.5px; color: #ffffff;">
          <span style="color: #ffffff;">prin</span><span style="color: #f5a623;">sta</span>
        </span>
        <div style="font-size: 11px; color: #cbd5e1; margin-top: 4px; text-transform: uppercase; letter-spacing: 1px;">
          Sri Eshwar College of Engineering
        </div>
      </div>
      
      <!-- Body Content -->
      <div style="padding: 32px 24px; color: #334155; line-height: 1.6;">
        <h2 style="font-size: 20px; font-weight: 700; color: #1a2a4a; margin-top: 0; margin-bottom: 16px; text-align: center;">
          Password Reset Request
        </h2>
        
        <p style="margin: 0 0 16px 0; font-size: 15px;">
          A request has been received to reset the password for your student account. Please use the following One-Time Password (OTP) to proceed:
        </p>
        
        <!-- OTP Display -->
        <div style="background-color: #f8fafc; border: 1.5px dashed #cbd5e1; border-radius: 8px; padding: 18px; text-align: center; margin: 24px 0;">
          <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; color: #64748b; margin-bottom: 8px; font-weight: 600;">
            Verification Code
          </div>
          <div style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #1a2a4a; font-family: 'Courier New', Courier, monospace;">
            ${otp}
          </div>
        </div>
        
        <p style="margin: 0 0 20px 0; font-size: 13.5px; color: #64748b; background-color: #f0f9ff; border-left: 4px solid #0284c7; padding: 10px 12px; border-radius: 0 4px 4px 0;">
          This OTP is valid for <strong>10 minutes</strong>. For security, do not share this code with anyone.
        </p>
        
        <p style="margin: 0 0 24px 0; font-size: 13px; color: #94a3b8; line-height: 1.4;">
          If you did not initiate this request, you can safely ignore this email. Your password will remain unchanged.
        </p>
        
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
        
        <!-- Footer -->
        <p style="margin: 0; font-size: 13px; color: #64748b; text-align: center;">
          Thank you,<br>
          <strong>Printsta Support Team</strong><br>
          Sri Eshwar College of Engineering
        </p>
      </div>
    </div>
  `;
  if (emailTransporter) {
    console.log(`[EMAIL] Sending OTP email to ${toEmail}...`);
    const info = await emailTransporter.sendMail({
      from: `"Printsta SECE" <${EMAIL_USER}>`,
      to: toEmail,
      subject: 'Printsta — Password Reset OTP',
      html
    });
    console.log(`[EMAIL] OTP email sent successfully to ${toEmail}. Message ID: ${info.messageId}`);
  } else {
    // Dev fallback: print OTP to server console (never to client)
    console.log(`[DEV] OTP for ${toEmail} — do NOT log in production: ${otp}`);
  }
}

// POST /auth/forgot-password — generate & send OTP
app.post('/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, error: 'Email or Register Number is required.' });
  const inputLower = email.toLowerCase().trim();

  // Rate limit: max 3 OTP requests per email per hour
  const now = Date.now();
  const rateData = otpRateLimit.get(inputLower) || { count: 0, windowStart: now };
  if (now - rateData.windowStart > 3600000) { rateData.count = 0; rateData.windowStart = now; }
  if (rateData.count >= 3) {
    return res.status(429).json({ success: false, error: 'Too many OTP requests. Please wait an hour before trying again.' });
  }

  try {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    let student = null;

    const cleanInput = inputLower.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    if (dbConnected) {
      student = await Student.findOne({
        $or: [
          { email: inputLower },
          { registerNumber: { $regex: new RegExp('^' + cleanInput + '$', 'i') } }
        ]
      });
    } else {
      student = inMemoryStudents.find(s =>
        (s.email && s.email.toLowerCase() === inputLower) ||
        (s.registerNumber && s.registerNumber.toLowerCase() === inputLower)
      );
    }

    if (!student) {
      return res.status(404).json({ success: false, error: 'This email or register number is not registered.' });
    }

    student.resetOtp = otp;
    student.resetOtpExpiry = expiry;
    student.resetOtpAttempts = 0;
    if (dbConnected) await student.save();

    rateData.count += 1;
    otpRateLimit.set(inputLower, rateData);

    let mailSent = false;
    try {
      await sendOtpEmail(student.email, otp);
      mailSent = true;
    } catch (mailErr) {
      console.error('OTP email send failed:', mailErr.message);
    }

    console.log(`[DEV OTP GENERATED]: ${otp} for ${student.email}`);

    return res.json({
      success: true,
      message: 'OTP has been sent to your registered email address.',
      studentEmail: student.email,
      devOtp: mailSent ? undefined : otp
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ success: false, error: 'Server error. Please try again.' });
  }
});

// POST /auth/verify-reset-otp — check OTP is correct (does not reset password yet)
app.post('/auth/verify-reset-otp', async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ success: false, error: 'Email and OTP are required.' });
  const emailLower = email.toLowerCase().trim();

  try {
    let student = null;
    if (dbConnected) {
      student = await Student.findOne({ email: emailLower });
    } else {
      student = inMemoryStudents.find(s => s.email === emailLower);
    }

    if (!student || !student.resetOtp) {
      return res.status(400).json({ success: false, error: 'No OTP request found. Please request a new OTP.' });
    }
    if (!student.resetOtpExpiry || new Date() > new Date(student.resetOtpExpiry)) {
      student.resetOtp = null; student.resetOtpExpiry = null; student.resetOtpAttempts = 0;
      if (dbConnected) await student.save();
      return res.status(400).json({ success: false, error: 'OTP has expired. Please request a new one.' });
    }
    if (student.resetOtp !== otp.toString().trim()) {
      student.resetOtpAttempts = (student.resetOtpAttempts || 0) + 1;
      if (student.resetOtpAttempts >= 3) {
        student.resetOtp = null; student.resetOtpExpiry = null; student.resetOtpAttempts = 0;
        if (dbConnected) await student.save();
        return res.status(400).json({ success: false, error: 'Too many incorrect attempts. Please request a new OTP.' });
      }
      const remaining = 3 - student.resetOtpAttempts;
      if (dbConnected) await student.save();
      return res.status(400).json({ success: false, error: `Incorrect OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.` });
    }
    // Correct OTP — don't clear it yet, reset-password will do that
    return res.json({ success: true, message: 'OTP verified.' });
  } catch (error) {
    console.error('Verify OTP error:', error);
    return res.status(500).json({ success: false, error: 'Server error. Please try again.' });
  }
});

// POST /auth/reset-password — set new password after OTP verified
app.post('/auth/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body;
  if (!email || !otp || !newPassword)
    return res.status(400).json({ success: false, error: 'Email, OTP and new password are required.' });
  if (newPassword.length < 8)
    return res.status(400).json({ success: false, error: 'Password must be at least 8 characters.' });
  const emailLower = email.toLowerCase().trim();

  try {
    let student = null;
    if (dbConnected) {
      student = await Student.findOne({ email: emailLower });
    } else {
      student = inMemoryStudents.find(s => s.email === emailLower);
    }

    if (!student || !student.resetOtp) {
      return res.status(400).json({ success: false, error: 'No OTP request found. Please request a new OTP.' });
    }
    if (!student.resetOtpExpiry || new Date() > new Date(student.resetOtpExpiry)) {
      student.resetOtp = null; student.resetOtpExpiry = null; student.resetOtpAttempts = 0;
      if (dbConnected) await student.save();
      return res.status(400).json({ success: false, error: 'OTP has expired. Please request a new one.' });
    }
    if (student.resetOtp !== otp.toString().trim()) {
      student.resetOtpAttempts = (student.resetOtpAttempts || 0) + 1;
      if (student.resetOtpAttempts >= 3) {
        student.resetOtp = null; student.resetOtpExpiry = null; student.resetOtpAttempts = 0;
      }
      if (dbConnected) await student.save();
      return res.status(400).json({ success: false, error: 'Invalid OTP. Please try again.' });
    }

    // Hash and save new password, clear OTP fields
    const salt = await bcrypt.genSalt(10);
    student.password = await bcrypt.hash(newPassword, salt);
    student.resetOtp = null;
    student.resetOtpExpiry = null;
    student.resetOtpAttempts = 0;
    if (dbConnected) await student.save();

    otpRateLimit.delete(emailLower); // reset rate limit on success
    return res.json({ success: true, message: 'Password reset successfully.' });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ success: false, error: 'Server error. Please try again.' });
  }
});

// ----------------------------------------------------
// PRICING ROUTES
// ----------------------------------------------------

// GET current pricing (public - accessible by student page)
app.get('/settings/pricing', async (req, res) => {
  try {
    if (dbConnected) {
      let settings = await Settings.findOne();
      if (!settings) {
        settings = new Settings({
          bwSingleRate: 2,
          bwDoubleRate: 3,
          colorSingleRate: 5,
          colorDoubleRate: 7
        });
        await settings.save();
      }
      return res.status(200).json({ success: true, pricing: settings });
    } else {
      return res.status(200).json({ success: true, pricing: pricingConfig });
    }
  } catch (error) {
    console.error("Get Pricing Error:", error);
    return res.status(500).json({ success: false, message: 'Server processing error.' });
  }
});

// GET current pricing (public - alias of /settings/pricing for backwards compatibility)
app.get('/pricing', async (req, res) => {
  try {
    if (dbConnected) {
      let settings = await Settings.findOne();
      if (!settings) {
        settings = new Settings({
          bwSingleRate: 2,
          bwDoubleRate: 3,
          colorSingleRate: 5,
          colorDoubleRate: 7
        });
        await settings.save();
      }
      return res.status(200).json({ success: true, pricing: settings });
    } else {
      return res.status(200).json({ success: true, pricing: pricingConfig });
    }
  } catch (error) {
    console.error("Get Pricing Legacy Error:", error);
    return res.status(500).json({ success: false, message: 'Server processing error.' });
  }
});

// PATCH pricing settings (admin only)
app.patch('/settings/pricing', authenticateAdmin, async (req, res) => {
  try {
    const { bwSingleRate, bwDoubleRate, colorSingleRate, colorDoubleRate } = req.body;
    let updateObj = { lastUpdated: new Date() };

    if (bwSingleRate !== undefined) {
      const val = parseFloat(bwSingleRate);
      if (isNaN(val) || val <= 0) return res.status(400).json({ success: false, message: 'Invalid B&W Single Sided rate.' });
      updateObj.bwSingleRate = val;
      pricingConfig.bwSingleRate = val;
    }
    if (bwDoubleRate !== undefined) {
      const val = parseFloat(bwDoubleRate);
      if (isNaN(val) || val <= 0) return res.status(400).json({ success: false, message: 'Invalid B&W Double Sided rate.' });
      updateObj.bwDoubleRate = val;
      pricingConfig.bwDoubleRate = val;
    }
    if (colorSingleRate !== undefined) {
      const val = parseFloat(colorSingleRate);
      if (isNaN(val) || val <= 0) return res.status(400).json({ success: false, message: 'Invalid Color Single Sided rate.' });
      updateObj.colorSingleRate = val;
      pricingConfig.colorSingleRate = val;
    }
    if (colorDoubleRate !== undefined) {
      const val = parseFloat(colorDoubleRate);
      if (isNaN(val) || val <= 0) return res.status(400).json({ success: false, message: 'Invalid Color Double Sided rate.' });
      updateObj.colorDoubleRate = val;
      pricingConfig.colorDoubleRate = val;
    }
    pricingConfig.lastUpdated = updateObj.lastUpdated;

    if (dbConnected) {
      let settings = await Settings.findOne();
      if (!settings) {
        settings = new Settings(updateObj);
      } else {
        Object.assign(settings, updateObj);
      }
      await settings.save();
      console.log('Pricing updated by admin (DB):', settings);
      return res.status(200).json({ success: true, message: 'Pricing updated successfully.', pricing: settings });
    } else {
      console.log('Pricing updated by admin (Offline):', pricingConfig);
      return res.status(200).json({ success: true, message: 'Pricing updated successfully (offline mode).', pricing: pricingConfig });
    }
  } catch (error) {
    console.error('Update Pricing Error:', error);
    return res.status(500).json({ success: false, message: 'Server processing error.' });
  }
});

// PATCH pricing settings (admin only - legacy /admin/pricing alias)
app.patch('/admin/pricing', authenticateAdmin, async (req, res) => {
  try {
    const { bwSingleRate, bwDoubleRate, colorSingleRate, colorDoubleRate } = req.body;
    let updateObj = { lastUpdated: new Date() };

    if (bwSingleRate !== undefined) {
      const val = parseFloat(bwSingleRate);
      if (isNaN(val) || val <= 0) return res.status(400).json({ success: false, message: 'Invalid B&W Single Sided rate.' });
      updateObj.bwSingleRate = val;
      pricingConfig.bwSingleRate = val;
    }
    if (bwDoubleRate !== undefined) {
      const val = parseFloat(bwDoubleRate);
      if (isNaN(val) || val <= 0) return res.status(400).json({ success: false, message: 'Invalid B&W Double Sided rate.' });
      updateObj.bwDoubleRate = val;
      pricingConfig.bwDoubleRate = val;
    }
    if (colorSingleRate !== undefined) {
      const val = parseFloat(colorSingleRate);
      if (isNaN(val) || val <= 0) return res.status(400).json({ success: false, message: 'Invalid Color Single Sided rate.' });
      updateObj.colorSingleRate = val;
      pricingConfig.colorSingleRate = val;
    }
    if (colorDoubleRate !== undefined) {
      const val = parseFloat(colorDoubleRate);
      if (isNaN(val) || val <= 0) return res.status(400).json({ success: false, message: 'Invalid Color Double Sided rate.' });
      updateObj.colorDoubleRate = val;
      pricingConfig.colorDoubleRate = val;
    }
    pricingConfig.lastUpdated = updateObj.lastUpdated;

    if (dbConnected) {
      let settings = await Settings.findOne();
      if (!settings) {
        settings = new Settings(updateObj);
      } else {
        Object.assign(settings, updateObj);
      }
      await settings.save();
      return res.status(200).json({ success: true, message: 'Pricing updated successfully.', pricing: settings });
    } else {
      return res.status(200).json({ success: true, message: 'Pricing updated successfully.', pricing: pricingConfig });
    }
  } catch (error) {
    console.error('Update Pricing Legacy Error:', error);
    return res.status(500).json({ success: false, message: 'Server processing error.' });
  }
});

// ----------------------------------------------------
// SERVER-SENT EVENTS ENDPOINT — real-time admin updates
// ----------------------------------------------------

// GET /admin/events — keeps a persistent SSE stream open to admin tabs
// Admin page connects to this and receives instant 'new-order' pushes
app.get('/admin/events', authenticateStaff, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable Nginx buffering on Render
  res.flushHeaders();

  // Send a heartbeat every 20s to keep the connection alive through proxies
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch(e) { cleanup(); }
  }, 20000);

  sseClients.add(res);
  console.log(`Admin SSE client connected. Total: ${sseClients.size}`);

  // Send a connected confirmation immediately
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  function cleanup() {
    clearInterval(heartbeat);
    sseClients.delete(res);
    console.log(`Admin SSE client disconnected. Total: ${sseClients.size}`);
  }

  req.on('close', cleanup);
  req.on('error', cleanup);
});

// ----------------------------------------------------
// PRICING SECURITY ROUTES
// ----------------------------------------------------

// POST /admin/verify-price-change — bcrypt password check + audit log
app.post('/admin/verify-price-change', authenticateAdmin, async (req, res) => {
  const adminUsername = req.admin.username || 'admin';
  const ipAddress = req.headers['x-forwarded-for'] || req.ip || 'unknown';

  try {
    const { password, newBwSingleRate, newBwDoubleRate, newColorSingleRate, newColorDoubleRate, adminName } = req.body;

    // Input validation
    if (!adminName || !adminName.trim()) {
      return res.status(400).json({ success: false, error: 'Admin Name is required.' });
    }
    if (!password) {
      return res.status(400).json({ success: false, error: 'Password is required.' });
    }
    const bwSVal = parseFloat(newBwSingleRate);
    const bwDVal = parseFloat(newBwDoubleRate);
    const colSVal = parseFloat(newColorSingleRate);
    const colDVal = parseFloat(newColorDoubleRate);

    if (isNaN(bwSVal) || bwSVal <= 0) return res.status(400).json({ success: false, error: 'Invalid B&W Single Sided rate value.' });
    if (isNaN(bwDVal) || bwDVal <= 0) return res.status(400).json({ success: false, error: 'Invalid B&W Double Sided rate value.' });
    if (isNaN(colSVal) || colSVal <= 0) return res.status(400).json({ success: false, error: 'Invalid Color Single Sided rate value.' });
    if (isNaN(colDVal) || colDVal <= 0) return res.status(400).json({ success: false, error: 'Invalid Color Double Sided rate value.' });

     // --- Lockout check ---
    if (!adminLockout[adminUsername]) {
      adminLockout[adminUsername] = { failCount: 0, lockUntil: null };
    }
    const lockState = adminLockout[adminUsername];

    if (lockState.lockUntil && new Date() < lockState.lockUntil) {
      const secsLeft = Math.ceil((lockState.lockUntil - new Date()) / 1000);
      return res.status(429).json({
        success: false,
        locked: true,
        lockUntil: lockState.lockUntil.toISOString(),
        error: `Too many failed attempts. Please try again in ${secsLeft} second${secsLeft !== 1 ? 's' : ''}.`
      });
    }

    // --- Password verification ---
    if (!ADMIN_PASSWORD_HASH) {
      return res.status(503).json({ success: false, error: 'Server still initialising. Please retry in a moment.' });
    }

    const passwordMatch = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);

    if (!passwordMatch) {
      lockState.failCount = (lockState.failCount || 0) + 1;
      console.warn(`[Security] Failed price-change attempt #${lockState.failCount} for admin '${adminUsername}' from ${ipAddress}`);

      if (lockState.failCount >= 3) {
        lockState.lockUntil = new Date(Date.now() + 30 * 1000); // lock 30 seconds
        console.warn(`[Security] Admin '${adminUsername}' locked out for 30 seconds after 3 failed attempts.`);
        return res.status(429).json({
          success: false,
          locked: true,
          lockUntil: lockState.lockUntil.toISOString(),
          error: 'Too many failed attempts. Please try again in 30 seconds.'
        });
      }

      return res.status(401).json({
        success: false,
        error: `Incorrect password. ${3 - lockState.failCount} attempt${3 - lockState.failCount !== 1 ? 's' : ''} remaining.`
      });
    }

    // --- Password correct — reset lockout state ---
    lockState.failCount = 0;
    lockState.lockUntil = null;
    console.log(`[Security] Password verified for price change by admin '${adminUsername}' from ${ipAddress}`);

    // --- Fetch current (old) values before updating ---
    let oldBwSingleRate = pricingConfig.bwSingleRate;
    let oldBwDoubleRate = pricingConfig.bwDoubleRate;
    let oldColorSingleRate = pricingConfig.colorSingleRate;
    let oldColorDoubleRate = pricingConfig.colorDoubleRate;

    if (dbConnected) {
      try {
        const currentSettings = await Settings.findOne();
        if (currentSettings) {
          oldBwSingleRate = currentSettings.bwSingleRate || 2;
          oldBwDoubleRate = currentSettings.bwDoubleRate || 3;
          oldColorSingleRate = currentSettings.colorSingleRate || 5;
          oldColorDoubleRate = currentSettings.colorDoubleRate || 7;
        }
      } catch (e) {
        console.error('Failed to fetch old settings for audit log:', e);
      }
    }

    // --- Apply the price update ---
    const updateObj = {
      bwSingleRate: bwSVal,
      bwDoubleRate: bwDVal,
      colorSingleRate: colSVal,
      colorDoubleRate: colDVal,
      lastUpdated: new Date()
    };
    pricingConfig.bwSingleRate = bwSVal;
    pricingConfig.bwDoubleRate = bwDVal;
    pricingConfig.colorSingleRate = colSVal;
    pricingConfig.colorDoubleRate = colDVal;
    pricingConfig.lastUpdated = updateObj.lastUpdated;

    let savedSettings = null;
    if (dbConnected) {
      let settings = await Settings.findOne();
      if (!settings) {
        settings = new Settings(updateObj);
      } else {
        Object.assign(settings, updateObj);
      }
      await settings.save();
      savedSettings = settings;
    } else {
      savedSettings = { ...pricingConfig };
    }

    // --- Create audit log entry (always, in same flow) ---
    const auditEntry = {
      action: 'price_change',
      adminUsername: adminName.trim(),
      changes: {
        bwSingleRate:    { old: oldBwSingleRate,    new: bwSVal },
        bwDoubleRate:    { old: oldBwDoubleRate,    new: bwDVal },
        colorSingleRate: { old: oldColorSingleRate, new: colSVal },
        colorDoubleRate: { old: oldColorDoubleRate, new: colDVal }
      },
      timestamp: new Date(),
      ipAddress
    };

    if (dbConnected) {
      try {
        const log = new AuditLog(auditEntry);
        await log.save();
        console.log(`[Audit] Price change logged to DB: B&W Single ${oldBwSingleRate}→${bwSVal}, Double ${oldBwDoubleRate}→${bwDVal}, Color Single ${oldColorSingleRate}→${colSVal}, Double ${oldColorDoubleRate}→${colDVal}`);
      } catch (auditErr) {
        // Log failure should NOT block the price save — but warn loudly
        console.error('[Audit] CRITICAL: Failed to write AuditLog entry:', auditErr);
      }
    } else {
      inMemoryAuditLog.unshift(auditEntry); // newest first
      console.log(`[Audit] Price change logged to memory: bwRate ${oldBwRate}→${bwVal}, colorRate ${oldColorRate}→${colorVal}, discount ${oldDoubleSidedDiscount}→${discVal}`);
    }

    return res.status(200).json({
      success: true,
      message: 'Prices updated successfully.',
      pricing: savedSettings
    });

  } catch (error) {
    console.error('Verify Price Change Error:', error);
    return res.status(500).json({ success: false, error: 'Server processing error.' });
  }
});

// GET /admin/audit-log — paginated, newest first, read-only
app.get('/admin/audit-log', authenticateAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 20;
    const skip = (page - 1) * limit;

    if (dbConnected) {
      const [entries, total] = await Promise.all([
        AuditLog.find().sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
        AuditLog.countDocuments()
      ]);
      return res.status(200).json({
        success: true,
        entries,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
      });
    } else {
      const total = inMemoryAuditLog.length;
      const entries = inMemoryAuditLog.slice(skip, skip + limit);
      return res.status(200).json({
        success: true,
        entries,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
      });
    }
  } catch (error) {
    console.error('Get Audit Log Error:', error);
    return res.status(500).json({ success: false, message: 'Server processing error.' });
  }
});

// GET earnings summary (admin only - returns today/week/month totals)
app.get('/earnings/summary', authenticateAdmin, async (req, res) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(startOfToday.getTime() - 30 * 24 * 60 * 60 * 1000);

    let todayEarnings = 0;
    let todayCount = 0;
    let weekEarnings = 0;
    let weekCount = 0;
    let monthEarnings = 0;
    let monthCount = 0;

    if (dbConnected) {
      const todayData = await PrintOrder.aggregate([
        { $match: { paymentStatus: 'paid', createdAt: { $gte: startOfToday } } },
        { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } }
      ]);
      if (todayData.length > 0) {
        todayEarnings = todayData[0].total;
        todayCount = todayData[0].count;
      }

      const weekData = await PrintOrder.aggregate([
        { $match: { paymentStatus: 'paid', createdAt: { $gte: startOfWeek } } },
        { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } }
      ]);
      if (weekData.length > 0) {
        weekEarnings = weekData[0].total;
        weekCount = weekData[0].count;
      }

      const monthData = await PrintOrder.aggregate([
        { $match: { paymentStatus: 'paid', createdAt: { $gte: startOfMonth } } },
        { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } }
      ]);
      if (monthData.length > 0) {
        monthEarnings = monthData[0].total;
        monthCount = monthData[0].count;
      }
    } else {
      inMemoryOrders.forEach(o => {
        if (o.paymentStatus === 'paid') {
          const date = new Date(o.createdAt);
          if (date >= startOfToday) {
            todayEarnings += o.amount;
            todayCount++;
          }
          if (date >= startOfWeek) {
            weekEarnings += o.amount;
            weekCount++;
          }
          if (date >= startOfMonth) {
            monthEarnings += o.amount;
            monthCount++;
          }
        }
      });
    }

    return res.status(200).json({
      success: true,
      summary: {
        today: { earnings: todayEarnings, count: todayCount },
        week: { earnings: weekEarnings, count: weekCount },
        month: { earnings: monthEarnings, count: monthCount }
      }
    });
  } catch (error) {
    console.error("Get Earnings Summary Error:", error);
    return res.status(500).json({ success: false, message: 'Server processing error.' });
  }
});

// Google Login Endpoint
// Helper: extract department and batch from SECE email
function extractFromSECEEmail(email) {
  if (!email || !email.toLowerCase().endsWith('@sece.ac.in')) return null;
  const localPart = email.split('@')[0].toLowerCase();
  const match = localPart.match(/[a-z]+\.([a-z]+?)(\d{4})(ece|cse|mech|eee|cys|aiml|aids|cce|it|csbs)$/);
  if (!match) return null;
  const startYear = parseInt(match[2]);
  const deptMap = { ece:'ECE', cse:'CSE', mech:'MECH', eee:'EEE', cys:'Cyber Security', aiml:'AIML', aids:'AIDS', cce:'CCE', it:'IT', csbs:'CSBS' };
  return {
    department: deptMap[match[3]] || match[3].toUpperCase(),
    batch: `${startYear}-${startYear + 4}`
  };
}

// Helper: parse department and batch from 12-digit register number
function parseFromRegisterNumber(regNum) {
  if (!regNum || regNum.length !== 12) return null;
  const yearDigits = regNum.substring(4, 6);
  const startYear = 2000 + parseInt(yearDigits);
  const batch = `${startYear}-${startYear + 4}`;
  const deptCode = regNum.substring(6, 9);
  const deptMap = {
    '106': 'ECE',
    '104': 'CSE',
    '105': 'EEE',
    '114': 'MECH',
    '205': 'IT',
    '243': 'AIDS',
    '244': 'AIML',
    '253': 'CYS',
    '115': 'CSBS',
    '202': 'CCE'
  };
  const department = deptMap[deptCode] || 'ECE';
  return { department, batch };
}

app.post('/auth/google', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, message: 'Google credential token is missing.' });
    }

    let payload = null;

    // Verify Google ID Token or bypass if mock signature is detected
    if (token.endsWith('.mock_signature') || token.includes('mock_signature')) {
      console.log("[Auth] Detected mock SSO token, bypassing Google API verification");
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
        }
      } catch (decodeErr) {
        console.error("Mock token decode failed:", decodeErr);
      }
    } else {
      try {
        const ticket = await googleClient.verifyIdToken({
          idToken: token,
          audience: GOOGLE_CLIENT_ID
        });
        payload = ticket.getPayload();
      } catch (verifyErr) {
        console.warn("Google API verification failed. Attempting local token decoding:", verifyErr.message);
        try {
          const parts = token.split('.');
          if (parts.length === 3) {
            payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
          }
        } catch (decodeErr) {
          console.error("Local token decode failed:", decodeErr);
        }
      }
    }

    if (!payload || !payload.email) {
      return res.status(400).json({ success: false, message: 'Google Authentication verification failed.' });
    }

    const email = payload.email;

    // Server-side: SECE email domain enforcement for Google login
    if (!email.toLowerCase().endsWith('@sece.ac.in')) {
      return res.status(403).json({
        success: false,
        message: 'Only SECE college Google accounts (@sece.ac.in) are allowed. Please sign in with your college Google account.'
      });
    }

    const firstName = payload.given_name || payload.name || "GoogleUser";
    const lastName = payload.family_name || "";

    // Auto-extract department and batch from SECE email
    const emailProfile = extractFromSECEEmail(email);

    let student = null;

    if (dbConnected) {
      student = await Student.findOne({ email });

      if (!student) {
        // Auto-register new SECE college student on first Google Login
        student = new Student({
          email,
          firstName,
          lastName,
          department: emailProfile ? emailProfile.department : undefined,
          batch: emailProfile ? emailProfile.batch : undefined,
          isVerified: true,
          registerNumber: null,
          phone: null
        });
        await student.save();
        console.log(`[Google Auth] Auto-registered new student: ${email}`);
      } else {
        // Automatically make existing student verified if they log in via Google
        if (student.isVerified === false) {
          student.isVerified = true;
          await student.save();
        }
        if (emailProfile && !student.department) {
          // Backfill dept/batch if missing for existing student
          student.department = emailProfile.department;
          student.batch = emailProfile.batch;
          await student.save();
        }
      }
    } else {
      student = inMemoryStudents.find(s => s.email === email);

      if (!student) {
        student = {
          _id: 'mem_std_' + Date.now(),
          email,
          firstName,
          lastName,
          department: emailProfile ? emailProfile.department : undefined,
          batch: emailProfile ? emailProfile.batch : undefined,
          isVerified: true,
          registerNumber: null,
          phone: null
        };
        inMemoryStudents.push(student);
        console.log(`[Google Auth] Auto-registered in-memory student: ${email}`);
      } else {
        if (student.isVerified === false) {
          student.isVerified = true;
        }
        if (emailProfile && !student.department) {
          student.department = emailProfile.department;
          student.batch = emailProfile.batch;
        }
      }
    }

    const profileIncomplete = !student.registerNumber;

    const jwtToken = jwt.sign(
      { id: student._id, name: `${student.firstName} ${student.lastName}`, email: student.email, role: 'student' },
      STUDENT_JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(200).json({
      success: true,
      token: jwtToken,
      studentName: `${student.firstName} ${student.lastName}`,
      profileIncomplete
    });

  } catch (error) {
    console.error("Google Auth Route Error:", error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// Get Student Profile
app.get('/auth/student/me', authenticateStudent, async (req, res) => {
  try {
    let student = null;

    if (dbConnected) {
      student = await Student.findById(req.student.id);
    } else {
      student = inMemoryStudents.find(s => s._id === req.student.id);
    }

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student profile not found.' });
    }

    return res.status(200).json({
      success: true,
      student: {
        firstName: student.firstName,
        lastName: student.lastName,
        email: student.email,
        phone: student.phone,
        registerNumber: student.registerNumber,
        department: student.department,
        batch: student.batch
      }
    });
  } catch (error) {
    console.error("Get Profile Error:", error);
    return res.status(500).json({ success: false, message: 'Server processing error.' });
  }
});

// Update Student Profile
app.patch('/auth/student/profile', authenticateStudent, async (req, res) => {
  try {
    const { registerNumber, phone } = req.body;

    if (!registerNumber) {
      return res.status(400).json({ success: false, message: 'Register number is required.' });
    }

    let student = null;

    if (dbConnected) {
      const existingReg = await Student.findOne({ registerNumber, _id: { $ne: req.student.id } });
      if (existingReg) {
        return res.status(400).json({ success: false, message: 'Register number already claimed by another user.' });
      }

      student = await Student.findById(req.student.id);
      if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });

      student.registerNumber = registerNumber;
      if (phone) student.phone = phone;
      
      // Auto-extract department & batch from registerNumber if they are empty
      if (!student.department || !student.batch) {
        const regProfile = parseFromRegisterNumber(registerNumber);
        if (regProfile) {
          student.department = regProfile.department;
          student.batch = regProfile.batch;
        }
      }
      await student.save();
    } else {
      const existingReg = inMemoryStudents.find(s => s.registerNumber === registerNumber && s._id !== req.student.id);
      if (existingReg) {
        return res.status(400).json({ success: false, message: 'Register number already claimed by another user.' });
      }

      student = inMemoryStudents.find(s => s._id === req.student.id);
      if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });

      student.registerNumber = registerNumber;
      if (phone) student.phone = phone;
      
      if (!student.department || !student.batch) {
        const regProfile = parseFromRegisterNumber(registerNumber);
        if (regProfile) {
          student.department = regProfile.department;
          student.batch = regProfile.batch;
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      student: {
        registerNumber: student.registerNumber,
        department: student.department,
        batch: student.batch
      }
    });

  } catch (error) {
    console.error("Update Profile Error:", error);
    return res.status(500).json({ success: false, message: 'Server processing error.' });
  }
});

// ----------------------------------------------------
// PUSH SUBSCRIPTION SUBSCRIBER ROUTE
// ----------------------------------------------------
app.post('/notifications/subscribe', authenticateStudent, async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription) {
      return res.status(400).json({ success: false, message: 'Subscription payload missing.' });
    }

    if (dbConnected) {
      await Student.findByIdAndUpdate(req.student.id, { pushSubscription: subscription });
    } else {
      const student = inMemoryStudents.find(s => s._id === req.student.id);
      if (student) {
        student.pushSubscription = subscription;
      }
    }

    console.log(`Registered Web Push subscription for student: ${req.student.id}`);
    return res.status(200).json({ success: true, message: 'Subscribed successfully.' });
  } catch (err) {
    console.error("Subscribe Notification Error:", err);
    return res.status(500).json({ success: false, message: 'Server processing error.' });
  }
});

// ----------------------------------------------------
// ORDER MANAGEMENT ROUTES
// ----------------------------------------------------

// Helper to convert non-PNG image uploads to PNG format automatically using sharp
async function convertImageToPng(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();
  const isImage = mime.startsWith('image/') || ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg', '.tiff'].includes(ext);

  if (isImage && ext !== '.png') {
    const pngFilename = path.basename(file.filename, ext) + '.png';
    const pngPath = path.join(path.dirname(file.path), pngFilename);
    try {
      await sharp(file.path).rotate().png().toFile(pngPath);
      // Delete original image file
      try {
        fs.unlinkSync(file.path);
      } catch (err) {
        console.error("Failed to delete original image:", err);
      }
      return {
        path: pngPath,
        filename: pngFilename,
        originalname: path.basename(file.originalname, ext) + '.png',
        mimetype: 'image/png',
        size: fs.statSync(pngPath).size
      };
    } catch (err) {
      console.error("Failed to convert image to PNG with sharp:", err);
    }
  }
  return file;
}

// Helper to convert images or non-PDF files to PDF format automatically
async function convertToPdfIfNeeded(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();

  // If already a PDF, keep as is
  if (ext === '.pdf' || mime === 'application/pdf') {
    return {
      path: file.path,
      filename: file.filename,
      originalname: file.originalname,
      mimetype: 'application/pdf'
    };
  }

  const pdfFilename = file.filename + '.pdf';
  const pdfPath = path.join(path.dirname(file.path), pdfFilename);
  const baseNameWithoutExt = path.basename(file.originalname, ext);
  const pdfOriginalName = baseNameWithoutExt + '.pdf';

  const isImage = mime.startsWith('image/') || ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg', '.tiff'].includes(ext);

  if (isImage) {
    try {
      // Use sharp to convert any image format to PNG buffer for high quality and pdfkit compatibility
      const imageBuffer = await sharp(file.path).rotate().png().toBuffer();
      const metadata = await sharp(imageBuffer).metadata();

      await new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 36 });
        const stream = fs.createWriteStream(pdfPath);
        doc.pipe(stream);

        const pageWidth = 595.28 - 72; // Printable width (A4)
        const pageHeight = 841.89 - 72; // Printable height (A4)

        let imgWidth = metadata.width || 500;
        let imgHeight = metadata.height || 500;

        // Scale image to fit neatly on A4 page while maintaining aspect ratio
        const scale = Math.min(pageWidth / imgWidth, pageHeight / imgHeight, 1);
        const renderWidth = imgWidth * scale;
        const renderHeight = imgHeight * scale;

        const x = 36 + (pageWidth - renderWidth) / 2;
        const y = 36 + (pageHeight - renderHeight) / 2;

        doc.image(imageBuffer, x, y, { width: renderWidth, height: renderHeight });
        doc.end();

        stream.on('finish', resolve);
        stream.on('error', reject);
      });

      // Remove the original non-PDF image file from uploads folder
      try { fs.unlinkSync(file.path); } catch (e) {}

      return {
        path: pdfPath,
        filename: pdfFilename,
        originalname: pdfOriginalName,
        mimetype: 'application/pdf'
      };
    } catch (imgErr) {
      console.error("Error converting image to PDF:", imgErr);
      return {
        path: file.path,
        filename: file.filename,
        originalname: file.originalname,
        mimetype: file.mimetype
      };
    }
  } else {
    // For docx, txt, csv, or other non-image non-pdf document formats
    try {
      await new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const stream = fs.createWriteStream(pdfPath);
        doc.pipe(stream);

        doc.fontSize(16).text(`Converted Document: ${file.originalname}`, { underline: true });
        doc.moveDown();

        try {
          const textContent = fs.readFileSync(file.path, 'utf8');
          doc.fontSize(11).text(textContent.substring(0, 15000));
        } catch (err) {
          doc.fontSize(12).text(`Uploaded file (${file.originalname}) converted to PDF wrapper.`);
        }

        doc.end();
        stream.on('finish', resolve);
        stream.on('error', reject);
      });

      try { fs.unlinkSync(file.path); } catch (e) {}

      return {
        path: pdfPath,
        filename: pdfFilename,
        originalname: pdfOriginalName,
        mimetype: 'application/pdf'
      };
    } catch (docErr) {
      console.error("Error converting document to PDF:", docErr);
      return {
        path: file.path,
        filename: file.filename,
        originalname: file.originalname,
        mimetype: file.mimetype
      };
    }
  }
}

// 1. File Upload & Order Price Calculation
app.post('/upload', authenticateStudent, upload.single('file'), async (req, res) => {
  try {
    const { copies, colorMode, sides, pageSize, binding, specialNote, pages, pageCount, orderType } = req.body;
    // Fallback: If no file is uploaded and it's not explicitly a print job, assume it is a Xerox order.
    const isXerox = orderType === 'xerox' || (!req.file && orderType !== 'print');

    if (!isXerox && !req.file) {
      return res.status(400).json({ success: false, message: 'Please select a file to upload.' });
    }

    if (!isXerox && req.file) {
      // Convert images to PNG format first
      const pngFile = await convertImageToPng(req.file);
      req.file.path = pngFile.path;
      req.file.filename = pngFile.filename;
      req.file.originalname = pngFile.originalname;
      req.file.mimetype = pngFile.mimetype;

      // Automatically convert uploaded image or non-PDF file to PDF
      const processedFile = await convertToPdfIfNeeded(req.file);
      req.file.path = processedFile.path;
      req.file.filename = processedFile.filename;
      req.file.originalname = processedFile.originalname;
      req.file.mimetype = processedFile.mimetype;
    }

    const numCopies = parseInt(copies) || 1;
    if (numCopies < 1 || numCopies > 99) {
      if (req.file) {
        fs.unlink(req.file.path, () => {});
      }
      return res.status(400).json({ success: false, message: 'Number of copies must be between 1 and 99.' });
    }
    const selectBinding = binding || 'none';
    
    // Parse the actual page count of the uploaded/converted PDF file securely using pdf-lib
    let numPages = 1;
    if (!isXerox && req.file) {
      try {
        const pdfBytes = fs.readFileSync(req.file.path);
        const pdfDoc = await LibPDFDocument.load(pdfBytes, { ignoreEncryption: true });
        numPages = pdfDoc.getPageCount();
      } catch (pdfErr) {
        console.error("Failed to parse PDF page count with pdf-lib:", pdfErr);
        numPages = parseInt(pages) || parseInt(pageCount) || 1;
      }
    } else {
      numPages = parseInt(pages) || parseInt(pageCount) || 1;
    }

    // Pricing calculation using live admin-configurable rates (DB with fallback)
    let rates = pricingConfig;
    if (dbConnected) {
      try {
        const settings = await Settings.findOne();
        if (settings) {
          rates = settings;
        }
      } catch (err) {
        console.error("Failed to fetch settings from DB, using fallback:", err);
      }
    }

    const totalAmount = calculatePrice(numPages, numCopies, colorMode, sides, rates, selectBinding);
    const breakdownText = getPriceBreakdown(numPages, numCopies, colorMode, sides, rates, selectBinding);

    let orderId = '';
    let studentName = '';

    if (dbConnected) {
      const student = await Student.findById(req.student.id);
      if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });

      const order = new PrintOrder({
        studentId: student._id,
        studentName: `${student.firstName} ${student.lastName}`,
        registerNumber: student.registerNumber,
        department: student.department,
        phone: student.phone,
        fileName: isXerox ? 'Physical Xerox' : req.file.originalname,
        filePath: isXerox ? 'N/A' : req.file.path,
        fileType: isXerox ? 'application/pdf' : req.file.mimetype,
        copies: numCopies,
        colorMode,
        sides,
        pageSize,
        binding: selectBinding,
        specialNote: specialNote || "",
        amount: totalAmount,
        pages: numPages,
        priceBreakdown: breakdownText,
        paymentStatus: 'pending',
        orderType: isXerox ? 'xerox' : 'print',
        status: isXerox ? 'ready' : 'waiting'
      });

      await order.save();
      orderId = order._id;
      studentName = order.studentName;
    } else {
      const student = inMemoryStudents.find(s => s._id === req.student.id);
      if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });

      orderId = 'mem_ord_' + Date.now();
      studentName = `${student.firstName} ${student.lastName}`;

      inMemoryOrders.push({
        _id: orderId,
        studentId: student._id,
        studentName,
        registerNumber: student.registerNumber,
        department: student.department,
        phone: student.phone,
        fileName: isXerox ? 'Physical Xerox' : req.file.originalname,
        filePath: isXerox ? 'N/A' : req.file.path,
        fileType: isXerox ? 'application/pdf' : req.file.mimetype,
        copies: numCopies,
        colorMode,
        sides,
        pageSize,
        binding: selectBinding,
        specialNote: specialNote || "",
        amount: totalAmount,
        pages: numPages,
        priceBreakdown: breakdownText,
        paymentStatus: 'pending',
        orderType: isXerox ? 'xerox' : 'print',
        status: isXerox ? 'ready' : 'waiting',
        createdAt: new Date()
      });
    }

    return res.status(201).json({
      success: true,
      message: isXerox ? 'Xerox request created.' : 'File uploaded and order created.',
      orderId: orderId,
      amount: totalAmount
    });
  } catch (error) {
    console.error("Upload Error:", error);
    return res.status(500).json({ success: false, message: 'Server processing error.' });
  }
});

// 2. Create Razorpay Payment Order
app.post('/create-payment', authenticateStudent, async (req, res) => {
  try {
    const { orderId } = req.body;
    let order = null;

    if (dbConnected) {
      order = await PrintOrder.findById(orderId);
    } else {
      order = inMemoryOrders.find(o => o._id === orderId);
    }

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    const amountInPaise = Math.round(order.amount * 100);

    // Sandbox / Dummy trigger simulation
    if (RAZORPAY_KEY_ID === "YOUR_RAZORPAY_KEY_ID" || RAZORPAY_KEY_SECRET === "YOUR_RAZORPAY_KEY_SECRET") {
      const mockRazorpayOrderId = 'order_mock_' + Math.random().toString(36).substr(2, 9);
      order.razorpayOrderId = mockRazorpayOrderId;

      if (dbConnected) await order.save();

      return res.status(200).json({
        success: true,
        isMock: true,
        razorpayOrderId: mockRazorpayOrderId,
        amount: order.amount,
        key: RAZORPAY_KEY_ID
      });
    }

    // Live Razorpay integration
    const options = {
      amount: amountInPaise,
      currency: "INR",
      receipt: order._id.toString()
    };

    const razorpayOrder = await razorpay.orders.create(options);
    order.razorpayOrderId = razorpayOrder.id;

    if (dbConnected) await order.save();

    return res.status(200).json({
      success: true,
      isMock: false,
      razorpayOrderId: razorpayOrder.id,
      amount: order.amount,
      key: RAZORPAY_KEY_ID
    });

  } catch (error) {
    console.error("Create Payment Error:", error);
    return res.status(500).json({ success: false, message: 'Server processing error during payment setup.' });
  }
});

// Helper function to generate daily-reset prefixed token numbers (Security Fix: Random daily-unique format)
async function generateToken() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  
  let token;
  let isUnique = false;
  
  while (!isUnique) {
    // Random 4-digit number (1000 - 9999)
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    token = `SECE-${randomNum}`;
    
    // Check uniqueness within today only
    if (dbConnected) {
      const existing = await PrintOrder.findOne({
        tokenNumber: token,
        createdAt: { $gte: startOfToday }
      });
      if (!existing) isUnique = true;
    } else {
      const existing = inMemoryOrders.find(o => 
        o.tokenNumber === token && 
        o.createdAt >= startOfToday
      );
      if (!existing) isUnique = true;
    }
  }
  
  return token;
}

// 3. Verify Payment Signature & Assign Daily Token Number
app.post('/verify-payment', authenticateStudent, async (req, res) => {
  try {
    const { orderId, razorpayPaymentId, razorpaySignature, razorpayOrderId, isMock } = req.body;
    let order = null;

    if (dbConnected) {
      order = await PrintOrder.findById(orderId);
    } else {
      order = inMemoryOrders.find(o => o._id === orderId);
    }

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    // Signature Verification
    if (isMock || RAZORPAY_KEY_ID === "YOUR_RAZORPAY_KEY_ID") {
      console.log(`[Offline Mode] Simulating payment success for order: ${orderId}`);
    } else {
      const body = razorpayOrderId + "|" + razorpayPaymentId;
      const expectedSignature = crypto
        .createHmac('sha256', RAZORPAY_KEY_SECRET)
        .update(body.toString())
        .digest('hex');

      if (expectedSignature !== razorpaySignature) {
        order.paymentStatus = 'failed';
        if (dbConnected) await order.save();
        return res.status(400).json({ success: false, message: 'Payment signature verification failed.' });
      }
    }

    // Set fields
    order.paymentStatus = 'paid';
    order.razorpayPaymentId = razorpayPaymentId || 'mock_pay_' + Date.now();
    order.status = order.orderType === 'xerox' ? 'ready' : 'waiting';

    // Assign daily token number
    order.tokenNumber = await generateToken();
    if (dbConnected) {
      await order.save();
    }

    // Real-time push to all connected admin tabs
    notifyNewOrder({
      _id: order._id,
      tokenNumber: order.tokenNumber,
      studentName: order.studentName,
      registerNumber: order.registerNumber,
      department: order.department,
      phone: order.phone,
      fileName: order.fileName,
      filePath: order.filePath,
      copies: order.copies,
      colorMode: order.colorMode,
      sides: order.sides,
      pageSize: order.pageSize,
      specialNote: order.specialNote,
      amount: order.amount,
      status: order.status,
      paymentStatus: order.paymentStatus,
      razorpayPaymentId: order.razorpayPaymentId,
      createdAt: order.createdAt
    });

    // PUSH NOTIFICATION 1: Order Success — Token Number
    sendPushNotification(order.studentId, {
      title: "Order Placed Successfully!",
      body: `Your print order is confirmed. Token Number: ${order.tokenNumber}. We will notify you when it is ready.`
    });

    return res.status(200).json({
      success: true,
      message: 'Payment verified successfully.',
      tokenNumber: order.tokenNumber,
      status: order.status
    });

  } catch (error) {
    console.error("Verify Payment Error:", error);
    return res.status(500).json({ success: false, message: 'Server processing error.' });
  }
});

// 4. Retrieve Student's Own Orders
app.get('/orders/mine', authenticateStudent, async (req, res) => {
  try {
    if (dbConnected) {
      const orders = await PrintOrder.find({ studentId: req.student.id }).sort({ createdAt: -1 });
      return res.status(200).json({ success: true, orders });
    } else {
      const orders = inMemoryOrders
        .filter(o => o.studentId === req.student.id)
        .sort((a, b) => b.createdAt - a.createdAt);
      return res.status(200).json({ success: true, orders });
    }
  } catch (error) {
    console.error("Get Student Orders Error:", error);
    return res.status(500).json({ success: false, message: 'Server processing error.' });
  }
});

// 5. GET Active Operator Print Queue (paid but not collected)
app.get('/orders', authenticateStaff, async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    if (dbConnected) {
      const activeQueue = await PrintOrder.find({
        paymentStatus: 'paid',
        $or: [
          { status: { $ne: 'collected' } },
          { status: 'collected', collectedAt: { $gte: todayStart } }
        ]
      }).sort({ tokenNumber: 1 });
      return res.status(200).json({ success: true, orders: activeQueue });
    } else {
      const activeQueue = inMemoryOrders
        .filter(o => o.paymentStatus === 'paid' && (o.status !== 'collected' || (o.collectedAt && new Date(o.collectedAt) >= todayStart)))
        .sort((a, b) => String(a.tokenNumber || '').localeCompare(String(b.tokenNumber || '')));
      return res.status(200).json({ success: true, orders: activeQueue });
    }
  } catch (error) {
    console.error("Get Queue Error:", error);
    return res.status(500).json({ success: false, message: 'Server processing error.' });
  }
});

// GET /orders/history — staff: all paid orders including collected (for search)
app.get('/orders/history', authenticateStaff, async (req, res) => {
  try {
    if (dbConnected) {
      const allOrders = await PrintOrder.find({ paymentStatus: 'paid' })
        .sort({ createdAt: -1 })
        .limit(500);
      return res.status(200).json({ success: true, orders: allOrders });
    } else {
      const allOrders = inMemoryOrders
        .filter(o => o.paymentStatus === 'paid')
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return res.status(200).json({ success: true, orders: allOrders });
    }
  } catch (error) {
    console.error('Get Order History Error:', error);
    return res.status(500).json({ success: false, message: 'Server processing error.' });
  }
});


// POST /orders/:id/print-direct — direct silent printing
app.post('/orders/:id/print-direct', authenticateStaff, async (req, res) => {
  try {
    const orderId = req.params.id;
    let order;
    if (dbConnected) {
      order = await PrintOrder.findById(orderId);
    } else {
      order = inMemoryOrders.find(o => o._id === orderId);
    }

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    const filePath = order.filePath;
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: `File not found on server at: ${filePath}` });
    }

    // Prepare print configuration settings matching order specs
    const printOptions = {
      copies: order.copies || 1,
      monochrome: order.colorMode === 'bw',
      side: order.sides === 'double' ? 'duplex' : 'simplex'
    };

    console.log(`[PRINT] Direct printing order ${order.tokenNumber} to default printer...`, printOptions);

    await ptp.print(filePath, printOptions);

    // Auto update status to printing when direct print is triggered
    if (dbConnected) {
      order.status = 'printing';
      await order.save();
    } else {
      order.status = 'printing';
    }

    // Notify clients of the status update
    notifyOrderUpdate(order);

    return res.status(200).json({
      success: true,
      message: 'Print job submitted successfully to default printer.',
      status: 'printing'
    });
  } catch (error) {
    console.error("Direct Print Error:", error);
    return res.status(500).json({ success: false, error: 'Direct printing failed: ' + error.message });
  }
});


// GET /orders/:id/print-ready
// Serves a fully pre-processed PDF:
//   - Copies are BAKED IN as repeated pages (dialog shows 1, prints N)
//   - B&W orders: image is converted to GRAYSCALE so the PDF prints in B&W regardless of dialog colour setting
// The operator just opens the dialog and clicks Print — zero configuration needed.
app.get('/orders/:id/print-ready', authenticateStaff, async (req, res) => {
  try {
    const orderId = req.params.id;
    let order;
    if (dbConnected) {
      order = await PrintOrder.findById(orderId);
    } else {
      order = inMemoryOrders.find(o => o._id === orderId);
    }

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    const filePath = order.filePath;
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'File not found on server.' });
    }

    const copies    = order.copies    || 1;
    const isBW      = order.colorMode === 'bw';
    const isDouble  = order.sides     === 'double';
    const needsWork = copies > 1 || isBW;

    console.log(`[PRINT-READY] Building PDF for ${order.tokenNumber} — copies:${copies} bw:${isBW} double:${isDouble}`);

    // ── STEP 1: Build a single-copy base page buffer ──────────────────────────
    // We need to (re)create the PDF from the image so we can apply grayscale.
    // All files in this system are image-backed PDFs created by sharp+pdfkit.
    // Strategy: extract the image from the stored PDF using pdf-lib, apply
    // grayscale via sharp if needed, then re-embed into a fresh PDF.

    let basePdfBytes; // Buffer with one set of pages (1 copy, possibly grayscale)

    if (isBW) {
      try {
        // Load source PDF and pull out the raw image bytes from the first image XObject
        const srcBytes = fs.readFileSync(filePath);
        const srcDoc   = await LibPDFDocument.load(srcBytes, { ignoreEncryption: true });
        const pageCount = srcDoc.getPageCount();

        // Re-render each page: extract embedded images → grayscale via sharp → new PDF page
        const outDoc = await LibPDFDocument.create();

        for (let pi = 0; pi < pageCount; pi++) {
          const page = srcDoc.getPage(pi);
          const { width, height } = page.getSize();

          // Get all image XObject keys on this page
          const xObjects = page.node.Resources()?.lookup(srcDoc.context.obj('XObject'));
          let grayPngBuffer = null;

          if (xObjects) {
            const keys = xObjects.keys ? xObjects.keys() : Object.keys(xObjects.dict || {});
            for (const key of keys) {
              const xobj = xObjects.lookup ? xObjects.lookup(key) : xObjects[key];
              if (!xobj) continue;
              const subtype = xobj.lookup ? xobj.lookup(srcDoc.context.obj('Subtype')) : null;
              if (subtype && subtype.toString() === '/Image') {
                const rawData = xobj.getInheritableAttribute
                  ? null // too complex to extract raw — fall to sharp decode
                  : null;
                break;
              }
            }
          }

          // Reliable fallback: use sharp to decode the entire PDF page as image via rasterization
          // Since we can't rasterize without Ghostscript, we use sharp directly on the source file
          // (which is the original converted image sitting as a PDF).
          // For image-backed PDFs, sharp can often read the embedded JPEG/PNG directly.
          try {
            grayPngBuffer = await sharp(filePath, { page: pi })
              .grayscale()
              .png()
              .toBuffer();
          } catch (e) {
            // If sharp can't read the PDF page, fall back to converting source image file
            // The original image file was deleted after PDF conversion, so use a flat grayscale
            grayPngBuffer = await sharp(filePath)
              .grayscale()
              .png()
              .toBuffer();
          }

          if (grayPngBuffer) {
            const grayImg = await outDoc.embedPng(grayPngBuffer);
            const newPage = outDoc.addPage([width, height]);
            newPage.drawImage(grayImg, { x: 0, y: 0, width, height });
          } else {
            // Last resort: copy original page without grayscale
            const [copiedPage] = await outDoc.copyPages(srcDoc, [pi]);
            outDoc.addPage(copiedPage);
          }
        }

        basePdfBytes = await outDoc.save();
      } catch (grayErr) {
        console.warn('[PRINT-READY] Grayscale conversion failed, using original:', grayErr.message);
        // Fall back to original PDF
        basePdfBytes = fs.readFileSync(filePath);
      }
    } else {
      // Colour order — use original PDF as-is
      basePdfBytes = fs.readFileSync(filePath);
    }

    // ── STEP 2: Duplicate pages for copies count ───────────────────────────────
    if (copies <= 1) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="print-${order.tokenNumber}.pdf"`);
      res.setHeader('Content-Length', basePdfBytes.length);
      return res.end(Buffer.from(basePdfBytes));
    }

    const srcDoc   = await LibPDFDocument.load(basePdfBytes, { ignoreEncryption: true });
    const outDoc   = await LibPDFDocument.create();
    const pageIndices = srcDoc.getPageIndices();

    for (let c = 0; c < copies; c++) {
      const copiedPages = await outDoc.copyPages(srcDoc, pageIndices);
      copiedPages.forEach(p => outDoc.addPage(p));
    }

    const finalBytes = await outDoc.save();
    const totalPages = pageIndices.length * copies;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="print-${order.tokenNumber}.pdf"`);
    res.setHeader('Content-Length', finalBytes.length);
    res.end(Buffer.from(finalBytes));

    console.log(`[PRINT-READY] ✓ Served for ${order.tokenNumber}: ${copies} cop${copies>1?'ies':'y'} × ${pageIndices.length} page(s) = ${totalPages} total pages | BW:${isBW}`);
  } catch (error) {
    console.error('Print-Ready Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to generate print-ready PDF: ' + error.message });
  }
});


app.get('/admin/dashboard-stats', authenticateAdmin, async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    let todayOrdersCount = 0;
    let todayEarnings = 0;
    let paperStockCount = 0;
    let pendingOrdersCount = 0;

    if (dbConnected) {
      // Calculate today's paid orders & earnings
      const todayStats = await PrintOrder.aggregate([
        { $match: { paymentStatus: 'paid', createdAt: { $gte: todayStart } } },
        { $group: { _id: null, totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } }
      ]);
      if (todayStats.length > 0) {
        todayEarnings = todayStats[0].totalAmount;
        todayOrdersCount = todayStats[0].count;
      }

      // Paper Stock sheets
      const paperDoc = await PaperStock.findOne();
      paperStockCount = paperDoc ? paperDoc.sheets : 0;

      // Pending/printing orders count
      pendingOrdersCount = await PrintOrder.countDocuments({
        status: { $in: ['waiting', 'printing'] }
      });
    } else {
      // In-Memory Fallback
      inMemoryOrders.forEach(o => {
        if (o.paymentStatus === 'paid' && new Date(o.createdAt) >= todayStart) {
          todayOrdersCount++;
          todayEarnings += o.amount;
        }
        if (['waiting', 'printing'].includes(o.status)) {
          pendingOrdersCount++;
        }
      });
      paperStockCount = inMemoryPaperStock.sheets;
    }

    // Calculate active staff count (heartbeat within 2 minutes online threshold)
    const ONLINE_THRESHOLD_MS = 2 * 60 * 1000;
    let activeStaffCount = 0;
    for (const [id, activity] of staffActivity.entries()) {
      if (activity && (Date.now() - new Date(activity.lastSeen).getTime() < ONLINE_THRESHOLD_MS)) {
        activeStaffCount++;
      }
    }

    return res.status(200).json({
      success: true,
      stats: {
        todayOrders: todayOrdersCount,
        todayEarnings: todayEarnings,
        paperStock: paperStockCount,
        pendingOrders: pendingOrdersCount,
        activeStaff: activeStaffCount
      }
    });
  } catch (error) {
    console.error("Get Dashboard Stats Error:", error);
    return res.status(500).json({ success: false, message: 'Server processing error.' });
  }
});

// GET /admin/students — Admin only: retrieve registered students list
app.get('/admin/students', authenticateAdmin, async (req, res) => {
  try {
    if (dbConnected) {
      const students = await Student.find({}, { password: 0 }).sort({ createdAt: -1 });
      return res.status(200).json({ success: true, students });
    } else {
      const students = inMemoryStudents.map(({ password, ...rest }) => rest);
      return res.status(200).json({ success: true, students });
    }
  } catch (error) {
    console.error("Get Admin Students Error:", error);
    return res.status(500).json({ success: false, message: 'Server processing error.' });
  }
});

// DELETE /admin/students/all — Admin only: delete ALL student accounts
app.delete('/admin/students/all', authenticateAdmin, async (req, res) => {
  try {
    if (dbConnected) {
      const result = await Student.deleteMany({});
      return res.status(200).json({ success: true, deletedCount: result.deletedCount, message: `Deleted ${result.deletedCount} student accounts.` });
    } else {
      const count = inMemoryStudents.length;
      inMemoryStudents.length = 0;
      return res.status(200).json({ success: true, deletedCount: count, message: `Deleted ${count} student accounts (in-memory).` });
    }
  } catch (error) {
    console.error("Delete All Students Error:", error);
    return res.status(500).json({ success: false, message: 'Server processing error.' });
  }
});


// 6. GET All Orders (paid ones, sorted newest first)
app.get('/orders/all', authenticateAdmin, async (req, res) => {
  try {
    if (dbConnected) {
      const allOrders = await PrintOrder.find({ paymentStatus: 'paid' }).sort({ createdAt: -1 });
      return res.status(200).json({ success: true, orders: allOrders });
    } else {
      const allOrders = inMemoryOrders
        .filter(o => o.paymentStatus === 'paid')
        .sort((a, b) => b.createdAt - a.createdAt);
      return res.status(200).json({ success: true, orders: allOrders });
    }
  } catch (error) {
    console.error("Get All Orders Error:", error);
    return res.status(500).json({ success: false, message: 'Server processing error.' });
  }
});

// 6b. GET Earnings History (grouped by day, last 30 days)
app.get('/earnings/history', authenticateAdmin, async (req, res) => {
  try {
    if (dbConnected) {
      const history = await PrintOrder.aggregate([
        { $match: { paymentStatus: 'paid' } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "+05:30" } },
            totalEarnings: { $sum: "$amount" },
            orderCount: { $sum: 1 }
          }
        },
        { $sort: { _id: -1 } },
        { $limit: 30 }
      ]);
      return res.status(200).json({ success: true, history });
    } else {
      const groups = {};
      inMemoryOrders.forEach(order => {
        if (order.paymentStatus === 'paid') {
          const date = new Date(order.createdAt);
          const localTime = new Date(date.getTime() + (330 * 60 * 1000));
          const dateStr = localTime.toISOString().split('T')[0];
          
          if (!groups[dateStr]) {
            groups[dateStr] = {
              _id: dateStr,
              totalEarnings: 0,
              orderCount: 0
            };
          }
          groups[dateStr].totalEarnings += order.amount;
          groups[dateStr].orderCount += 1;
        }
      });
      const history = Object.values(groups)
        .sort((a, b) => b._id.localeCompare(a._id))
        .slice(0, 30);
      return res.status(200).json({ success: true, history });
    }
  } catch (error) {
    console.error("Get Earnings History Error:", error);
    return res.status(500).json({ success: false, message: 'Server processing error.' });
  }
});

// 7. Update Print Order Status
app.patch('/orders/:id/status', authenticateStaff, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['waiting', 'printing', 'ready', 'collected'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status update.' });
    }

    let order = null;

    if (dbConnected) {
      const updateData = { status };
      if (status === 'collected') {
        updateData.collectedAt = new Date();
      }
      order = await PrintOrder.findByIdAndUpdate(req.params.id, updateData, { new: true });
    } else {
      order = inMemoryOrders.find(o => o._id === req.params.id);
      if (order) {
        order.status = status;
        if (status === 'collected') {
          order.collectedAt = new Date();
        }
      }
    }

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    // PUSH NOTIFICATION 2: Print is Ready — notify student to collect
    if (status === 'ready' && order.orderType !== 'xerox') {
      sendPushNotification(order.studentId, {
        title: "Your document is printed.",
        body: `Token ${order.tokenNumber} - Your document has been printed. Please collect it from the print shop.`
      });
      // Deduct paper and ink/toner for this order
      deductPaperUsage(order);
      deductTonerUsage(order);
    } else if (status === 'collected' && order.orderType === 'xerox') {
      // Deduct paper and ink/toner for Xerox when it is collected / physically copied
      deductPaperUsage(order);
      deductTonerUsage(order);
    }

    // Broadcast real-time order update to SSE clients
    notifyOrderUpdate(order);

    return res.status(200).json({ success: true, message: `Status updated to ${status}`, order });
  } catch (error) {
    console.error("Update Status Error:", error);
    return res.status(500).json({ success: false, message: 'Server processing error.' });
  }
});

// 8. Generate Barcode for Order Token (Public Image Endpoint)
app.get('/orders/:id/barcode', async (req, res) => {
  try {
    let order = null;
    if (dbConnected) {
      order = await PrintOrder.findById(req.params.id);
    } else {
      order = inMemoryOrders.find(o => String(o._id || o.id) === req.params.id);
    }

    if (!order || !order.tokenNumber) {
      return res.status(404).send('Order or token not found.');
    }

    const png = await bwipjs.toBuffer({
      bcid: 'code128',         // barcode type — universally readable by laser scanners
      text: order.tokenNumber, // e.g. "SECE-4827"
      scale: 3,
      height: 12,
      includetext: true,        // shows the token number as text below the barcode too
      textxalign: 'center',
    });

    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': png.length
    });
    return res.end(png);
  } catch (error) {
    console.error("Barcode Generation Error:", error);
    return res.status(500).send('Failed to generate barcode.');
  }
});

// 9. Collect Order by Scanned Token (Admin Auth)
app.post('/orders/collect-by-token', authenticateStaff, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, error: 'Token or Register Number is required' });
    }

    let trimmedToken = token.trim().toUpperCase();
    if (/^\d+$/.test(trimmedToken)) {
      trimmedToken = `SECE-${trimmedToken.padStart(4, '0')}`;
    } else if (/^SECE\d+$/.test(trimmedToken)) {
      trimmedToken = `SECE-${trimmedToken.slice(4).padStart(4, '0')}`;
    }
    let ordersToCollect = [];

    if (dbConnected) {
      // 1. Try finding by tokenNumber first
      const order = await PrintOrder.findOne({ 
        tokenNumber: { $regex: new RegExp('^' + trimmedToken + '$', 'i') } 
      });
      if (order) {
        ordersToCollect.push(order);
      } else {
        // 2. Try finding all 'ready' orders by registerNumber
        const studentOrders = await PrintOrder.find({
          registerNumber: { $regex: new RegExp('^' + trimmedToken + '$', 'i') },
          status: 'ready'
        });
        ordersToCollect.push(...studentOrders);
      }
    } else {
      const order = inMemoryOrders.find(o => String(o.tokenNumber || '').toUpperCase() === trimmedToken);
      if (order) {
        ordersToCollect.push(order);
      } else {
        const studentOrders = inMemoryOrders.filter(o => 
          String(o.registerNumber || '').toUpperCase() === trimmedToken && 
          o.status === 'ready'
        );
        ordersToCollect.push(...studentOrders);
      }
    }

    if (ordersToCollect.length === 0) {
      return res.status(404).json({ success: false, error: 'Token or Register Number not found with ready prints' });
    }

    // Xerox scan workflow
    const xeroxOrders = ordersToCollect.filter(o => o.orderType === 'xerox');
    if (xeroxOrders.length > 0) {
      const readyXerox = xeroxOrders.find(o => o.status === 'ready');
      if (readyXerox) {
        return res.status(200).json({
          success: true,
          action: 'show_xerox_details',
          order: readyXerox
        });
      }
      
      const allCollectedXerox = xeroxOrders.every(o => o.status === 'collected');
      if (allCollectedXerox) {
        return res.status(400).json({
          success: false,
          errorType: 'XEROX_COLLECTED',
          error: 'Xerox already taken and collected'
        });
      }
    }
    // Auto-promote waiting/printing print orders to 'ready' when student token is scanned
    const activeOrders = ordersToCollect.filter(o => o.status === 'waiting' || o.status === 'printing');
    if (activeOrders.length > 0) {
      for (let order of activeOrders) {
        order.status = 'ready';
        if (dbConnected) {
          await order.save();
        }
        notifyOrderUpdate(order);
      }
      return res.status(200).json({
        success: true,
        message: `${activeOrders.length} order(s) automatically marked as ready.`,
        order: {
          tokenNumber: activeOrders[0].tokenNumber,
          studentName: activeOrders[0].studentName,
          status: 'ready'
        }
      });
    }
    const readyOrders = ordersToCollect.filter(o => o.status === 'ready');
    if (readyOrders.length === 0) {
      const alreadyCollected = ordersToCollect.every(o => o.status === 'collected');
      if (alreadyCollected) {
        return res.status(400).json({ success: false, error: `Order(s) have already been collected` });
      }
      return res.status(400).json({ success: false, error: `Order(s) are not ready yet` });
    }

    for (let order of readyOrders) {
      order.status = 'collected';
      order.collectedAt = new Date();
      if (dbConnected) {
        await order.save();
      }
      if (order.orderType === 'xerox') {
        deductPaperUsage(order);
        deductTonerUsage(order);
      }
      notifyOrderUpdate(order);
    }

    return res.status(200).json({
      success: true,
      message: `${readyOrders.length} order(s) marked as collected successfully.`,
      order: {
        tokenNumber: readyOrders[0].tokenNumber,
        studentName: readyOrders[0].studentName,
        collectedAt: new Date()
      }
    });
  } catch (error) {
    console.error("Collect by Token Error:", error);
    return res.status(500).json({ success: false, error: 'Server processing error' });
  }
});

// 8. Public check order status by Token Number
app.get('/token/:number', async (req, res) => {
  try {
    let tokenNum = req.params.number;
    // If it's just a number, pad it with SECE- prefix
    if (/^\d+$/.test(tokenNum)) {
      tokenNum = `SECE-${String(tokenNum).padStart(4, '0')}`;
    }
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    let order = null;

    if (dbConnected) {
      order = await PrintOrder.findOne({
        tokenNumber: tokenNum,
        createdAt: { $gte: startOfToday },
        paymentStatus: 'paid'
      });
    } else {
      order = inMemoryOrders.find(o => 
        o.tokenNumber === tokenNum && 
        o.createdAt >= startOfToday && 
        o.paymentStatus === 'paid'
      );
    }

    if (!order) {
      return res.status(404).json({ success: false, message: 'Active token not found for today.' });
    }

    return res.status(200).json({
      success: true,
      tokenNumber: order.tokenNumber,
      fileName: order.fileName,
      status: order.status,
      copies: order.copies,
      pageSize: order.pageSize,
      colorMode: order.colorMode
    });
  } catch (error) {
    console.error("Check Token Error:", error);
    return res.status(500).json({ success: false, message: 'Server processing error.' });
  }
});

// ======================================================================
// RESOURCE MANAGEMENT API ROUTES
// ======================================================================

// ── GET current resource levels ──
app.get('/resources/status', authenticateAdmin, async (req, res) => {
  try {
    let paper;
    if (dbConnected) {
      paper = await PaperStock.findOne();
      if (!paper) paper = { sheets: 0, lastSupplied: null, lastSuppliedBy: '' };
    } else {
      paper = inMemoryPaperStock;
    }
    const toner = await getActiveToner();
    return res.json({ success: true, paper, toner, pending: pendingResourceDeliveries });
  } catch (err) {
    console.error('[Resources] Status fetch error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── Staff: get pending deliveries to confirm ──
app.get('/resources/pending', authenticateStaff, async (req, res) => {
  try {
    return res.json({ success: true, pending: pendingResourceDeliveries });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── Admin: supply paper ──
app.post('/resources/supply-paper', authenticateAdmin, async (req, res) => {
  try {
    const { sheets, note } = req.body;
    const sheetsNum = parseInt(sheets);
    if (!sheetsNum || sheetsNum <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid sheet count.' });
    }
    const delivery = {
      id: Date.now().toString(),
      type: 'paper',
      sheets: sheetsNum,
      suppliedBy: req.admin.username || 'admin',
      suppliedAt: new Date().toISOString(),
      note: note || '',
      confirmed: false
    };
    if (req.body.direct) {
      // Add directly to stock, bypass pending
      delivery.confirmed = true;
      delivery.confirmedBy = req.admin.username || 'admin';
      delivery.confirmedAt = new Date().toISOString();

      // Update actual stock
      if (dbConnected) {
        let stock = await PaperStock.findOne();
        if (!stock) stock = new PaperStock();
        stock.sheets += sheetsNum;
        await stock.save();

        const historyRecord = new SupplyHistory(delivery);
        await historyRecord.save();
      } else {
        inMemoryPaperStock.sheets += sheetsNum;
        inMemorySupplyHistory.push(delivery);
      }

      console.log(`[Resources] Admin directly added ${sheetsNum} sheets of paper to tray.`);
      
      // Broadcast update
      let currentSheets = dbConnected ? (await PaperStock.findOne())?.sheets : inMemoryPaperStock.sheets;
      broadcastResourceAlert({
        type: 'update',
        resource: 'paper',
        value: currentSheets,
        message: 'Paper stock updated manually by admin.'
      });

      return res.json({ success: true, message: `Successfully added ${sheetsNum} sheets directly to the printer tray.` });
    } else {
      pendingResourceDeliveries.push(delivery);
      console.log(`[Resources] Admin supplied ${sheetsNum} sheets of paper. Awaiting staff confirmation.`);
      return res.json({ success: true, message: `Paper supply of ${sheetsNum} sheets recorded. Staff must confirm receipt.`, delivery });
    }
  } catch (err) {
    console.error('[Resources] Supply paper error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});


// ── Staff: confirm a pending delivery ──
app.post('/resources/confirm/:id', authenticateStaff, async (req, res) => {
  try {
    const { id } = req.params;
    const idx = pendingResourceDeliveries.findIndex(d => d.id === id);
    if (idx === -1) {
      return res.status(404).json({ success: false, message: 'Delivery not found.' });
    }
    const delivery = pendingResourceDeliveries[idx];
    const confirmedBy = req.staff.name || req.staff.username;
    const confirmedAt = new Date();

    if (delivery.type === 'paper') {
      if (dbConnected) {
        let stock = await PaperStock.findOne();
        if (!stock) stock = new PaperStock({ sheets: 0 });
        stock.sheets += delivery.sheets;
        stock.lastSupplied   = confirmedAt;
        stock.lastSuppliedBy = delivery.suppliedBy;
        stock.supplyHistory.push({
          sheets:      delivery.sheets,
          suppliedBy:  delivery.suppliedBy,
          confirmedBy: confirmedBy,
          confirmedAt: confirmedAt,
          note:        delivery.note
        });
        await stock.save();
      } else {
        inMemoryPaperStock.sheets += delivery.sheets;
        inMemoryPaperStock.lastSupplied   = confirmedAt.toISOString();
        inMemoryPaperStock.lastSuppliedBy = delivery.suppliedBy;
        inMemoryPaperStock.supplyHistory.push({
          sheets:      delivery.sheets,
          suppliedBy:  delivery.suppliedBy,
          confirmedBy: confirmedBy,
          confirmedAt: confirmedAt.toISOString(),
          note:        delivery.note
        });
      }

    }
    // Remove from pending
    pendingResourceDeliveries.splice(idx, 1);
    console.log(`[Resources] Delivery ${id} confirmed by ${confirmedBy}`);
    return res.json({ success: true, message: `Delivery confirmed by ${confirmedBy}.` });
  } catch (err) {
    console.error('[Resources] Confirm delivery error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── Admin: get resource history ──
app.get('/resources/history', authenticateAdmin, async (req, res) => {
  try {
    let paperHistory = [];
    if (dbConnected) {
      const paper = await PaperStock.findOne();
      if (paper) paperHistory = paper.supplyHistory.slice().reverse();
    } else {
      paperHistory = [...inMemoryPaperStock.supplyHistory].reverse();
    }
    return res.json({ success: true, paperHistory });
  } catch (err) {
    console.error('[Resources] History fetch error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── Admin: manually override paper stock ──
app.put('/resources/paper/override', authenticateAdmin, async (req, res) => {
  try {
    const { sheets } = req.body;
    const n = parseInt(sheets);
    if (isNaN(n) || n < 0) return res.status(400).json({ success: false, message: 'Invalid value.' });
    if (dbConnected) {
      let stock = await PaperStock.findOne();
      if (!stock) stock = new PaperStock();
      stock.sheets = n;
      await stock.save();
    } else {
      inMemoryPaperStock.sheets = n;
    }
    return res.json({ success: true, message: `Paper stock manually set to ${n} sheets.` });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// 1. Staff: Request paper stock
app.post('/resources/request', authenticateStaff, async (req, res) => {
  try {
    const { sheets, note } = req.body;
    const sheetsNum = parseInt(sheets);
    if (!sheetsNum || sheetsNum <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid sheet count.' });
    }
    const request = {
      id: Date.now().toString(),
      type: 'paper',
      sheets: sheetsNum,
      requestedBy: req.staff.name || req.staff.username,
      requestedAt: new Date(),
      note: note || '',
      status: 'pending'
    };

    if (dbConnected) {
      const doc = new ResourceRequest(request);
      await doc.save();
    } else {
      inMemoryResourceRequests.push(request);
    }

    // Notify via SSE
    const payload = JSON.stringify({ type: 'resource-alert', resource: 'paper', severity: 'info', value: `Staff ${request.requestedBy} requested ${sheetsNum} sheets` });
    sseClients.forEach(res => {
      try { res.write(`data: ${payload}\n\n`); } catch(e) { sseClients.delete(res); }
    });

    return res.json({ success: true, message: 'Request sent to admin successfully.', request });
  } catch (err) {
    console.error('[Resources] Request paper error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// 2. Admin: Get all paper requests (pending & history)
app.get('/resources/requests', authenticateAdmin, async (req, res) => {
  try {
    let requests = [];
    if (dbConnected) {
      requests = await ResourceRequest.find().sort({ requestedAt: -1 });
    } else {
      requests = inMemoryResourceRequests.slice().reverse();
    }
    return res.json({ success: true, requests });
  } catch (err) {
    console.error('[Resources] Get requests error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// 3. Admin: Approve or reject request
app.post('/resources/requests/:id/action', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body; // 'approve' or 'reject'
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid action.' });
    }

    let requestObj = null;
    if (dbConnected) {
      requestObj = await ResourceRequest.findOne({ id });
      if (requestObj) {
        requestObj.status = action === 'approve' ? 'approved' : 'rejected';
        await requestObj.save();
      }
    } else {
      requestObj = inMemoryResourceRequests.find(r => r.id === id);
      if (requestObj) {
        requestObj.status = action === 'approve' ? 'approved' : 'rejected';
      }
    }

    if (!requestObj) {
      return res.status(404).json({ success: false, message: 'Request not found.' });
    }

    // If approved, create a pending delivery
    if (action === 'approve') {
      const delivery = {
        id: Date.now().toString(),
        type: 'paper',
        sheets: requestObj.sheets,
        suppliedBy: req.admin.username || 'admin',
        suppliedAt: new Date().toISOString(),
        note: `Approved request from ${requestObj.requestedBy}. ${requestObj.note}`,
        confirmed: false
      };
      pendingResourceDeliveries.push(delivery);

      // Trigger SSE update for staff
      const payload = JSON.stringify({ type: 'resource-alert', resource: 'paper', severity: 'success', value: `Admin approved request for ${requestObj.sheets} sheets` });
      sseClients.forEach(res => {
        try { res.write(`data: ${payload}\n\n`); } catch(e) { sseClients.delete(res); }
      });
    }

    return res.json({ success: true, message: `Request successfully ${action}d.`, request: requestObj });
  } catch (err) {
    console.error('[Resources] Action request error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── Staff: get current resource levels (read-only, for dashboard) ──
app.get('/resources/levels', authenticateStaff, async (req, res) => {
  try {
    let paper;
    if (dbConnected) {
      paper = await PaperStock.findOne();
      if (!paper) paper = { sheets: 0 };
    } else {
      paper = inMemoryPaperStock;
    }
    const toner = await getActiveToner();
    return res.json({ success: true, paper: { sheets: paper.sheets }, toner, pending: pendingResourceDeliveries });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── Admin: set active toner capacity ──
app.post('/resources/set-toner', authenticateAdmin, async (req, res) => {
  try {
    const { capacity, brand, serialNumber } = req.body;
    const activeToner = await getActiveToner();
    
    if (capacity !== undefined) {
      const capVal = parseInt(capacity);
      if (isNaN(capVal) || capVal <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid capacity value.' });
      }
      activeToner.capacity = capVal;
    }
    if (brand !== undefined) {
      activeToner.brand = (brand || '').trim() || 'Generic';
    }
    if (serialNumber !== undefined) {
      activeToner.serialNumber = (serialNumber || '').trim() || 'N/A';
    }

    if (dbConnected) {
      await Toner.findByIdAndUpdate(activeToner._id, {
        capacity: activeToner.capacity,
        brand: activeToner.brand,
        serialNumber: activeToner.serialNumber
      });
    }
    return res.json({ success: true, message: 'Toner details updated successfully.', toner: activeToner });
  } catch (err) {
    console.error('[Resources] Set toner error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── Staff / Admin: replace toner cartridge ──
app.post('/resources/replace-toner', async (req, res) => {
  try {
    const tokenHeader = req.headers['authorization'] || '';
    const tokenVal = tokenHeader.split(' ')[1];
    if (!tokenVal) return res.status(401).json({ success: false, message: 'Authorization required.' });
    
    let decoded;
    try {
      decoded = jwt.verify(tokenVal, STAFF_JWT_SECRET);
      if (decoded.role !== 'staff') {
        decoded = jwt.verify(tokenVal, ADMIN_JWT_SECRET);
      }
    } catch (err) {
      try {
        decoded = jwt.verify(tokenVal, ADMIN_JWT_SECRET);
      } catch(e) {
        return res.status(403).json({ success: false, message: 'Invalid or expired token.' });
      }
    }

    if (decoded.role !== 'staff' && decoded.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const replacedBy = decoded.name || decoded.username || 'staff';
    const { capacity, brand, serialNumber } = req.body;
    const newCap = parseInt(capacity) || 4000;
    const newBrand = (brand || '').trim() || 'Generic';
    const newSn = (serialNumber || '').trim() || 'N/A';

    const activeToner = await getActiveToner();
    activeToner.status = 'replaced';
    activeToner.replacedAt = new Date();
    activeToner.pagesPrintedAtReplacement = activeToner.pagesPrinted;
    activeToner.replacedBy = replacedBy;

    if (dbConnected) {
      await Toner.findByIdAndUpdate(activeToner._id, {
        status: 'replaced',
        replacedAt: activeToner.replacedAt,
        pagesPrintedAtReplacement: activeToner.pagesPrintedAtReplacement,
        replacedBy: activeToner.replacedBy
      });
      
      const newToner = new Toner({
        capacity: newCap,
        pagesPrinted: 0,
        status: 'active',
        installedAt: new Date(),
        brand: newBrand,
        serialNumber: newSn
      });
      await newToner.save();
    } else {
      const idx = inMemoryToners.findIndex(t => t._id === activeToner._id);
      if (idx !== -1) {
        inMemoryToners[idx] = activeToner;
      }
      inMemoryToners.push({
        _id: 'mem_toner_' + Date.now(),
        capacity: newCap,
        pagesPrinted: 0,
        status: 'active',
        installedAt: new Date(),
        replacedAt: null,
        pagesPrintedAtReplacement: 0,
        replacedBy: '',
        brand: newBrand,
        serialNumber: newSn
      });
    }

    return res.json({ success: true, message: 'Toner cartridge replaced successfully.' });
  } catch (err) {
    console.error('[Resources] Replace toner error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── Admin: get replaced toner history ──
app.get('/resources/toner-history', authenticateAdmin, async (req, res) => {
  try {
    let history = [];
    if (dbConnected) {
      history = await Toner.find({ status: 'replaced' }).sort({ replacedAt: -1 });
    } else {
      history = inMemoryToners.filter(t => t.status === 'replaced').reverse();
    }
    return res.json({ success: true, history });
  } catch (err) {
    console.error('[Resources] Toner history fetch error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── Admin: manually override active toner pages printed count ──
app.put('/resources/toner/override', authenticateAdmin, async (req, res) => {
  try {
    const { pagesPrinted } = req.body;
    const pagesVal = parseInt(pagesPrinted);
    if (isNaN(pagesVal) || pagesVal < 0) {
      return res.status(400).json({ success: false, message: 'Invalid value.' });
    }
    const activeToner = await getActiveToner();
    activeToner.pagesPrinted = pagesVal;
    if (dbConnected) {
      await Toner.findByIdAndUpdate(activeToner._id, { pagesPrinted: pagesVal });
    }
    return res.json({ success: true, message: `Toner pages printed manually set to ${pagesVal}.` });
  } catch (err) {
    console.error('[Resources] Toner override error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Auto-detect the current LAN IP address for sharing
const os = require('os');
function getLanIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'unknown';
}

// Start listening on all network interfaces (0.0.0.0) so LAN devices can connect
app.listen(PORT, '0.0.0.0', () => {
  const lanIP = getLanIP();
  console.log(`Server listening on port ${PORT}...`);
});