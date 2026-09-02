const fs = require('fs');
const path = 'c:/Users/KAVIN GS/OneDrive/Desktop/printnsta project/backend/server.js';
let content = fs.readFileSync(path, 'utf8');

// Helper to escape regex
const escapeRegexStr = `function escapeRegExp(string) {
  return string.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
}`;

if (!content.includes('function escapeRegExp')) {
  // Insert at top or under imports
  content = content.replace("const app = express();", "const app = express();\n\n" + escapeRegexStr);
}

// Update /auth/student/login to use robust case-insensitive registerNumber match
const oldStudentLogin = `    let student = null;
    if (dbConnected) {
      student = await Student.findOne({
        $or: [
          { email: idLower },
          { registerNumber: { $regex: new RegExp(\`^\${userIdentifier}$\`, 'i') } }
        ]
      });
    } else {
      student = inMemoryStudents.find(s =>
        (s.email && s.email.toLowerCase() === idLower) ||
        (s.registerNumber && s.registerNumber.toLowerCase() === idLower)
      );
    }`;

const newStudentLogin = `    let student = null;
    const escapedIdentifier = userIdentifier.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
    if (dbConnected) {
      student = await Student.findOne({
        $or: [
          { email: idLower },
          { registerNumber: { $regex: new RegExp('^' + escapedIdentifier + '$', 'i') } }
        ]
      });
    } else {
      student = inMemoryStudents.find(s =>
        (s.email && s.email.toLowerCase() === idLower) ||
        (s.registerNumber && s.registerNumber.toLowerCase() === idLower)
      );
    }`;

content = content.replace(oldStudentLogin, newStudentLogin);

// Update /auth/login to use robust case-insensitive registerNumber match
const oldUnifiedLogin = `    // 1. Check Student first (by Email OR Register Number)
    let student = null;
    if (dbConnected) {
      student = await Student.findOne({
        $or: [
          { email: idLower },
          { registerNumber: idTrimmed }
        ]
      });
    } else {
      student = inMemoryStudents.find(s =>
        (s.email && s.email.toLowerCase() === idLower) ||
        (s.registerNumber && s.registerNumber.toLowerCase() === idLower)
      );
    }`;

const newUnifiedLogin = `    // 1. Check Student first (by Email OR Register Number)
    let student = null;
    const escapedId = idTrimmed.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
    if (dbConnected) {
      student = await Student.findOne({
        $or: [
          { email: idLower },
          { registerNumber: { $regex: new RegExp('^' + escapedId + '$', 'i') } }
        ]
      });
    } else {
      student = inMemoryStudents.find(s =>
        (s.email && s.email.toLowerCase() === idLower) ||
        (s.registerNumber && s.registerNumber.toLowerCase() === idLower)
      );
    }`;

content = content.replace(oldUnifiedLogin, newUnifiedLogin);

// Update /auth/forgot-password route to:
// 1. Return 404 if student not found (only registered emails can request)
// 2. Pass Dev OTP back to helper if email transporter fails
const oldForgotPasswordRoute = `// POST /auth/forgot-password — generate & send OTP
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

    if (dbConnected) {
      student = await Student.findOne({
        $or: [
          { email: inputLower },
          { registerNumber: inputLower }
        ]
      });
    } else {
      student = inMemoryStudents.find(s =>
        (s.email && s.email.toLowerCase() === inputLower) ||
        (s.registerNumber && s.registerNumber.toLowerCase() === inputLower)
      );
    }

    if (student) {
      student.resetOtp = otp;
      student.resetOtpExpiry = expiry;
      student.resetOtpAttempts = 0;
      if (dbConnected) await student.save();

      rateData.count += 1;
      otpRateLimit.set(inputLower, rateData);

      try { await sendOtpEmail(student.email, otp); } catch (mailErr) {
        console.error('OTP email send failed:', mailErr.message);
      }
    }

    return res.json({ success: true, message: 'If this account is registered, an OTP has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ success: false, error: 'Server error. Please try again.' });
  }
});`;

const newForgotPasswordRoute = `// POST /auth/forgot-password — generate & send OTP
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

    const escapedInput = inputLower.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
    if (dbConnected) {
      student = await Student.findOne({
        $or: [
          { email: inputLower },
          { registerNumber: { $regex: new RegExp('^' + escapedInput + '$', 'i') } }
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

    console.log(\`[DEV OTP GENERATED]: \${otp} for \${student.email}\`);

    // Include devOtp in response only if email sending failed, to allow smooth testing on firewall-blocked machines
    return res.json({
      success: true,
      message: 'OTP has been generated.',
      devOtp: mailSent ? undefined : otp
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ success: false, error: 'Server error. Please try again.' });
  }
});`;

content = content.replace(oldForgotPasswordRoute, newForgotPasswordRoute);

fs.writeFileSync(path, content);
console.log("Updated server.js login and forgot-password endpoints.");
