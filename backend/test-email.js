const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_APP_PASSWORD = process.env.EMAIL_APP_PASSWORD;

console.log("Using EMAIL_USER:", EMAIL_USER);

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_APP_PASSWORD
  }
});

async function run() {
  try {
    await transporter.sendMail({
      from: `"Printsta Test" <${EMAIL_USER}>`,
      to: "kavin.gs2025ece@sece.ac.in",
      subject: "Printsta Test Email",
      text: "This is a test email from Printsta."
    });
    console.log("Email sent successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Email send failed:", err);
    process.exit(1);
  }
}

run();
