const fs = require('fs');
const base = 'c:/Users/KAVIN GS/OneDrive/Desktop/printnsta project/frontend/';

// ─────────────────────────────────────────────────────────────
// 1. UPDATE style.css with full dark/light mode coverage
// ─────────────────────────────────────────────────────────────
let css = fs.readFileSync(base + 'style.css', 'utf8');

const themeCss = `
/* Global Dark / Light Theme System */
:root {
  --bg-color: #f8f9fc;
  --panel-bg: #ffffff;
  --text-main: #111827;
  --text-muted: #6b7280;
  --border-color: #e2e6ef;
  --card-bg: #ffffff;
  --input-bg: #f8f9fc;
}

[data-theme="dark"] {
  --bg-color: #0b1329;
  --panel-bg: #131c38;
  --text-main: #f3f4f6;
  --text-muted: #9ca3af;
  --border-color: #2a365c;
  --card-bg: #172242;
  --input-bg: #1a274c;
}

body {
  background-color: var(--bg-color) !important;
  color: var(--text-main) !important;
}

.panel, .students-panel, .profile-card, .status-card, .order-card, .total-box, .welcome-banner, .delivery-card {
  background-color: var(--panel-bg) !important;
  border-color: var(--border-color) !important;
  color: var(--text-main) !important;
}

.page-header h1, .section-title, .profile-card h2, .order-line1, .banner-title, .content-header h1 {
  color: var(--text-main) !important;
}

.profile-field p {
  background-color: var(--input-bg) !important;
  border-color: var(--border-color) !important;
  color: var(--text-main) !important;
}

.profile-field label {
  color: var(--text-muted) !important;
}
`;

if (css.includes('/* Global Dark / Light Theme System */')) {
  css = css.replace(/\/\* Global Dark \/ Light Theme System \*\/[\s\S]*/, themeCss);
} else {
  css += '\n' + themeCss;
}
fs.writeFileSync(base + 'style.css', css);
console.log("Updated style.css with complete dark mode rules");

// ─────────────────────────────────────────────────────────────
// 2. UPDATE student.html — Fix loadProfile() so Settings is NEVER BLIND
// ─────────────────────────────────────────────────────────────
let studentHtml = fs.readFileSync(base + 'student.html', 'utf8');

const newLoadProfile = `
    // Helper to parse JWT payload client-side for immediate display
    function parseJwt(tokenStr) {
      try {
        const base64Url = tokenStr.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        return JSON.parse(window.atob(base64));
      } catch (e) {
        return null;
      }
    }

    // ── LOAD PROFILE ──
    async function loadProfile() {
      const nameEl  = document.getElementById('profileName');
      const regEl   = document.getElementById('profileRegNum');
      const deptEl  = document.getElementById('profileDept');
      const yearEl  = document.getElementById('profileYear');
      const emailEl = document.getElementById('profileEmail');
      const phoneEl = document.getElementById('profilePhone');

      // 1. Immediately populate from localStorage & JWT payload so fields are NEVER blank
      const cachedName = localStorage.getItem('studentName') || 'Student';
      if (nameEl && nameEl.textContent === '—') nameEl.textContent = cachedName;

      const jwtPayload = parseJwt(token);
      if (jwtPayload) {
        if (jwtPayload.name && nameEl) nameEl.textContent = jwtPayload.name;
        if (jwtPayload.email && emailEl) emailEl.textContent = jwtPayload.email;
      }

      // 2. Fetch live profile data from backend
      try {
        const res = await fetch(\`\${API_BASE}/auth/student/me\`, {
          headers: { 'Authorization': \`Bearer \${token}\` }
        });
        const data = await res.json();
        if (res.ok && data.success && data.student) {
          const s = data.student;
          const fullName = [s.firstName, s.lastName].filter(Boolean).join(' ') || cachedName;
          if (nameEl)  nameEl.textContent  = fullName;
          if (regEl)   regEl.textContent   = s.registerNumber || 'Not registered';
          if (deptEl)  deptEl.textContent  = s.department || 'Not specified';
          if (yearEl)  yearEl.textContent  = s.batch || 'Not specified';
          if (emailEl) emailEl.textContent = s.email || (jwtPayload ? jwtPayload.email : 'Not specified');
          if (phoneEl) phoneEl.textContent = s.phone || 'Not specified';
        }
      } catch(e) {
        console.error("loadProfile error:", e);
      }
    }
`;

// Replace loadProfile in student.html
const loadProfileRegex = /\/\/ ── LOAD PROFILE ──[\s\S]*?async function loadProfile\(\)[\s\S]*?\}\n    \}/m;
if (loadProfileRegex.test(studentHtml)) {
  studentHtml = studentHtml.replace(loadProfileRegex, newLoadProfile);
  console.log("Replaced loadProfile in student.html");
}

fs.writeFileSync(base + 'student.html', studentHtml);
console.log("Updated student.html");
