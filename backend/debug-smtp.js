const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_APP_PASSWORD = process.env.EMAIL_APP_PASSWORD;

console.log("Testing Nodemailer transport configs for:", EMAIL_USER);

const configs = [
  { name: "Gmail Service", config: { service: 'gmail', auth: { user: EMAIL_USER, pass: EMAIL_APP_PASSWORD } } },
  { name: "SMTP 465 SSL", config: { host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: EMAIL_USER, pass: EMAIL_APP_PASSWORD }, tls: { rejectUnauthorized: false } } },
  { name: "SMTP 587 STARTTLS", config: { host: 'smtp.gmail.com', port: 587, secure: false, auth: { user: EMAIL_USER, pass: EMAIL_APP_PASSWORD }, tls: { rejectUnauthorized: false } } },
  { name: "SMTP 25", config: { host: 'smtp.gmail.com', port: 25, secure: false, auth: { user: EMAIL_USER, pass: EMAIL_APP_PASSWORD }, tls: { rejectUnauthorized: false } } }
];

async function testOne(c) {
  console.log(`\n--- Testing ${c.name} ---`);
  const transporter = nodemailer.createTransport(c.config);
  try {
    await transporter.verify();
    console.log(`[SUCCESS] ${c.name} verified successfully!`);
    await transporter.sendMail({
      from: `"Printsta Test" <${EMAIL_USER}>`,
      to: EMAIL_USER,
      subject: "Printsta OTP Test Email",
      text: "Testing OTP mail delivery from Printsta."
    });
    console.log(`[MAIL SENT SUCCESS] Mail delivered via ${c.name}!`);
    return true;
  } catch (err) {
    console.error(`[FAILED] ${c.name}:`, err.message);
    return false;
  }
}

async function runAll() {
  for (const c of configs) {
    const ok = await testOne(c);
    if (ok) {
      console.log(`\nWorking configuration found: ${c.name}`);
      process.exit(0);
    }
  }
  console.log("\nAll configs failed.");
  process.exit(1);
}

runAll();
