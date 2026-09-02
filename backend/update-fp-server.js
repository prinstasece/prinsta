const fs = require('fs');
const path = 'c:/Users/KAVIN GS/OneDrive/Desktop/printnsta project/backend/server.js';
let content = fs.readFileSync(path, 'utf8');

// Replace /auth/forgot-password, /auth/verify-reset-otp, /auth/reset-password to search by email OR registerNumber
const oldFpBlock = `// POST /auth/forgot-password — generate & send OTP
app.post('/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, error: 'Email is required.' });
  const emailLower = email.toLowerCase().trim();

  // Rate limit: max 3 OTP requests per email per hour
  const now = Date.now();
  const rateData = otpRateLimit.get(emailLower) || { count: 0, windowStart: now };
  if (now - rateData.windowStart > 3600000) { rateData.count = 0; rateData.windowStart = now; }
  if (rateData.count >= 3) {
    return res.status(429).json({ success: false, error: 'Too many OTP requests. Please wait an hour before trying again.' });
  }

  try {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    let studentFound = false;

    if (dbConnected) {
      const student = await Student.findOne({ email: emailLower });
      if (student) {
        studentFound = true;
        student.resetOtp = otp;
        student.resetOtpExpiry = expiry;
        student.resetOtpAttempts = 0;
        await student.save();
      }
    } else {
      const student = inMemoryStudents.find(s => s.email === emailLower);
      if (student) {
        studentFound = true;
        student.resetOtp = otp;
        student.resetOtpExpiry = expiry;
        student.resetOtpAttempts = 0;
      }
    }

    // Always increment rate limit regardless of whether email exists
    rateData.count += 1;
    otpRateLimit.set(emailLower, rateData);

    if (studentFound) {
      try { await sendOtpEmail(emailLower, otp); } catch (mailErr) {
        console.error('OTP email send failed:', mailErr.message);
      }
    }

    // Always return same message — never reveal whether email exists
    return res.json({ success: true, message: 'If this email is registered, an OTP has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ success: false, error: 'Server error. Please try again.' });
  }
});`;

const newFpBlock = `// POST /auth/forgot-password — generate & send OTP
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

if (content.includes(oldFpBlock)) {
  content = content.replace(oldFpBlock, newFpBlock);
  console.log("Updated /auth/forgot-password route");
}

fs.writeFileSync(path, content);
console.log("Forgot password route updated.");
