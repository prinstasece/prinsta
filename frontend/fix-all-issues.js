/**
 * fix-all-issues.js
 * Fixes:
 * 1. Student settings – correct API field names (firstName+lastName, batch)
 * 2. Student sidebar – darken to #0f1a30
 * 3. All pages – change navy-blue body text to near-black #111 / gray #555
 * 4. resources.html – remove giant donut chart, replace with compact stat card + fix orphan SVG
 */

const fs = require('fs');
const base = 'c:/Users/KAVIN GS/OneDrive/Desktop/printnsta project/frontend/';

// ─── HELPER: safe read/write ───────────────────────────────────────────────
function read(f)     { return fs.readFileSync(base + f, 'utf8'); }
function write(f, c) { fs.writeFileSync(base + f, c); console.log('Updated:', f); }

// ══════════════════════════════════════════════════════════════════════════════
// 1.  STYLE.CSS — change body default text color to near-black
//     Keep --navy for buttons/sidebar/brand; add --text-dark and --text-muted
// ══════════════════════════════════════════════════════════════════════════════
{
  let c = read('style.css');

  // Change body color from var(--navy) to #111
  c = c.replace(
    'body {\n  background-color: var(--white);\n  color: var(--navy);',
    'body {\n  background-color: var(--white);\n  color: #111;'
  );

  // form-group label: navy → #333
  c = c.replace(
    '.form-group label {\n  font-weight: 600;\n  font-size: 0.9rem;\n  color: var(--navy);\n}',
    '.form-group label {\n  font-weight: 600;\n  font-size: 0.9rem;\n  color: #333;\n}'
  );

  // input-wrapper input color: navy → #111
  c = c.replace(
    "color: var(--navy);\n}\n\n.input-wrapper input::placeholder",
    "color: #111;\n}\n\n.input-wrapper input::placeholder"
  );

  // page-heading: navy → #111
  c = c.replace(
    'color: var(--navy);\n  text-align: center;\n  margin-top: 1.5rem;',
    'color: #111;\n  text-align: center;\n  margin-top: 1.5rem;'
  );

  write('style.css', c);
}

// ══════════════════════════════════════════════════════════════════════════════
// 2.  STUDENT.HTML — fix settings profile fields + darken sidebar + text colors
// ══════════════════════════════════════════════════════════════════════════════
{
  let c = read('student.html');

  // A) Darken sidebar background from #1a2a4a to #0f1a30
  c = c.replace(
    '--navy: #1a2a4a;',
    '--navy: #0f1a30;'
  );
  // Also fix any direct sidebar background references
  c = c.replace(/background: var\(--navy\);(\s*)\/\* sidebar \*\//g, 'background: #0f1a30; /* sidebar */');

  // B) Fix loadProfile() — was using fullName, yearOfStudy; API returns firstName, lastName, batch
  c = c.replace(
    `async function loadProfile() {
      try {
        const res = await fetch(\`\${API_BASE}/auth/student/me\`, {
          headers: { 'Authorization': \`Bearer \${token}\` }
        });
        const data = await res.json();
        if (res.ok && data.success) {
          const s = data.student;
          document.getElementById('profileName').textContent = s.fullName || '—';
          document.getElementById('profileRegNum').textContent = s.registerNumber || '—';
          document.getElementById('profileDept').textContent = s.department || '—';
          document.getElementById('profileYear').textContent = s.yearOfStudy || '—';
          document.getElementById('profileEmail').textContent = s.email || '—';
        }
      } catch(e) { console.error(e); }
    }`,
    `async function loadProfile() {
      try {
        const res = await fetch(\`\${API_BASE}/auth/student/me\`, {
          headers: { 'Authorization': \`Bearer \${token}\` }
        });
        const data = await res.json();
        if (res.ok && data.success) {
          const s = data.student;
          const fullName = [s.firstName, s.lastName].filter(Boolean).join(' ') || '—';
          document.getElementById('profileName').textContent = fullName;
          document.getElementById('profileRegNum').textContent = s.registerNumber || '—';
          document.getElementById('profileDept').textContent = s.department || '—';
          document.getElementById('profileYear').textContent = s.batch || '—';
          document.getElementById('profileEmail').textContent = s.email || '—';
          if (s.phone) {
            const ph = document.getElementById('profilePhone');
            if (ph) ph.textContent = s.phone;
          }
        }
      } catch(e) { console.error(e); }
    }`
  );

  // Also fix checkProfileCompleteness fullName reference
  c = c.replace(
    'const n = student.fullName || studentName;',
    'const n = [student.firstName, student.lastName].filter(Boolean).join(\' \') || studentName;'
  );

  // C) Add phone field to settings profile HTML
  c = c.replace(
    `        <div class="profile-field">
          <label>Email</label>
          <p id="profileEmail">—</p>
        </div>`,
    `        <div class="profile-field">
          <label>Email</label>
          <p id="profileEmail">—</p>
        </div>

        <div class="profile-field">
          <label>Phone</label>
          <p id="profilePhone">—</p>
        </div>`
  );

  // D) Change content text colors from navy-blue to dark
  //    Headings: #111, subtext: #555, muted: #888
  c = c.replace(/color: var\(--navy\);/g, (match, offset) => {
    // Get surrounding context (100 chars before)
    const ctx = c.substring(Math.max(0, offset - 200), offset + 50);
    // Don't change sidebar/logo/wordmark/button related
    if (ctx.includes('sidebar') || ctx.includes('wordmark') || ctx.includes('btn-primary') ||
        ctx.includes('btn-secondary') || ctx.includes('sidebar-logout') || ctx.includes('.prin') ||
        ctx.includes('input-icon-btn') || ctx.includes('tab-btn') || ctx.includes('.link')) {
      return match;
    }
    return 'color: #111;';
  });

  // Section title, page header h1 → #111
  c = c.replace('.section-title {\n      font-size: 1.05rem;\n      color: var(--navy);',
                '.section-title {\n      font-size: 1.05rem;\n      color: #111;');
  c = c.replace('.page-header h1 {\n      font-size: 1.3rem;\n      font-weight: 700;\n      color: var(--navy);',
                '.page-header h1 {\n      font-size: 1.3rem;\n      font-weight: 700;\n      color: #111;');
  c = c.replace('.profile-card h2 {\n      font-size: 1rem;\n      font-weight: 700;\n      color: var(--navy);',
                '.profile-card h2 {\n      font-size: 1rem;\n      font-weight: 700;\n      color: #111;');

  // Order card line1 navy → #111
  c = c.replace('.order-line1 { font-weight: 700; font-size: 0.88rem; color: var(--navy);',
                '.order-line1 { font-weight: 700; font-size: 0.88rem; color: #111;');

  // total-amount, option-card-title, counter-value → #111
  c = c.replace('.total-amount { font-size: 1.8rem; font-weight: 800; color: var(--navy); }',
                '.total-amount { font-size: 1.8rem; font-weight: 800; color: #111; }');
  c = c.replace('.option-card-title { font-weight: 700; font-size: 0.9rem; color: var(--navy);',
                '.option-card-title { font-weight: 700; font-size: 0.9rem; color: #111;');
  c = c.replace('.counter-value {\n      width: 48px; height: 40px;\n      border: 2px solid var(--border);\n      border-radius: 8px;\n      display: flex; align-items: center; justify-content: center;\n      font-size: 1rem; font-weight: 700;\n    }',
                '.counter-value {\n      width: 48px; height: 40px;\n      border: 2px solid var(--border);\n      border-radius: 8px;\n      display: flex; align-items: center; justify-content: center;\n      font-size: 1rem; font-weight: 700; color: #111;\n    }');

  write('student.html', c);
}

// ══════════════════════════════════════════════════════════════════════════════
// 3.  RESOURCES.HTML — remove big donut wheel, add compact stat row + fix orphan SVG
// ══════════════════════════════════════════════════════════════════════════════
{
  let c = read('resources.html');

  // A) Replace the huge status-card with paper wheel with a compact stat bar
  const oldPaperCard = `    <!-- Status Wheels -->
    <div class="status-grid" style="grid-template-columns: 1fr;">
      <div class="status-card paper" id="paperCard">
        <svg width="0" height="0" style="position:absolute;">
          <defs>
            <linearGradient id="paperGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#22c55e"/><stop offset="100%" stop-color="#16a34a"/>
            </linearGradient>
            
          </defs>
        </svg>
        <div class="wheel-container">
          <svg class="wheel-svg" viewBox="0 0 120 120">
            <circle class="wheel-track" cx="60" cy="60" r="54"/>
            <circle class="wheel-fill" id="paperWheelFill" cx="60" cy="60" r="54" stroke="#22c55e"/>
          </svg>
          <div class="wheel-center">
            <div class="wheel-value" id="paperWheelValue">&#8212;</div>
            <div class="wheel-unit">sheets</div>
          </div>
        </div>
        <div class="status-resource-title">Paper Stock</div>
        <span class="status-badge-chip chip-good" id="paperChip">Loading...</span>
        <div class="status-meta" id="paperMeta">&#8212;</div>
      </div>

          <svg class="wheel-svg" viewBox="0 0 120 120">
            <circle class="wheel-track" cx="60" cy="60" r="54"/>
    </div>`;

  const newPaperCard = `    <!-- Paper Stock Stat -->
    <div id="paperCard" style="background:white;border:1px solid var(--border);border-radius:14px;padding:1.25rem 1.5rem;margin-bottom:1.5rem;display:flex;align-items:center;gap:1.5rem;flex-wrap:wrap;">
      <div style="flex:1;min-width:180px;">
        <div style="font-size:0.72rem;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Paper Stock</div>
        <div style="font-size:2rem;font-weight:800;color:#111;line-height:1;" id="paperWheelValue">—</div>
        <div style="font-size:0.78rem;color:#888;margin-top:2px;">sheets remaining</div>
      </div>
      <div style="flex:2;min-width:200px;">
        <div style="height:10px;background:#f0f2f7;border-radius:99px;overflow:hidden;margin-bottom:8px;">
          <div id="paperProgressBar" style="height:100%;width:0%;background:#22c55e;border-radius:99px;transition:width 0.6s ease;"></div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span class="status-badge-chip chip-good" id="paperChip">Loading...</span>
          <span style="font-size:0.76rem;color:#888;" id="paperMeta">—</span>
        </div>
      </div>
    </div>`;

  c = c.replace(oldPaperCard, newPaperCard);

  // If the above exact match fails (whitespace differences), try a more robust cleanup
  // Remove any remaining orphan SVG from ink removal
  c = c.replace(/\s*<svg class="wheel-svg" viewBox="0 0 120 120">\s*<circle class="wheel-track" cx="60" cy="60" r="54"\/>\s*<\/svg>\s*/g, '');

  // B) Update loadStatus() JS to use the new bar instead of wheel
  c = c.replace(
    `var sheets = paper.sheets||0;
        document.getElementById('paperWheelValue').textContent = sheets;
        var pp = Math.min(100, Math.round((sheets/500)*100));
        setWheel('paperWheelFill', pp);`,
    `var sheets = paper.sheets||0;
        document.getElementById('paperWheelValue').textContent = sheets;
        var pp = Math.min(100, Math.round((sheets/500)*100));
        var pBar = document.getElementById('paperProgressBar');
        if (pBar) { pBar.style.width = pp + '%'; }`
  );

  // Remove setWheel calls since we removed the SVG
  c = c.replace(/\s*setWheel\('paperWheelFill',\s*pp\);\s*/g, '\n        ');

  // C) Fix content text colors: navy → #111 for headings
  c = c.replace('.content-header h1 { font-size: 1.75rem; font-weight: 800; color: var(--navy); margin: 0; }',
                '.content-header h1 { font-size: 1.75rem; font-weight: 800; color: #111; margin: 0; }');
  c = c.replace('.panel-title { font-size: 1rem; font-weight: 800; color: var(--navy);',
                '.panel-title { font-size: 1rem; font-weight: 800; color: #111;');
  c = c.replace('.delivery-title { font-weight: 700; color: var(--navy);',
                '.delivery-title { font-weight: 700; color: #111;');
  c = c.replace('.history-table th { background: #f8fafc; color: var(--navy);',
                '.history-table th { background: #f8fafc; color: #333;');
  c = c.replace('.wheel-value { font-size: 1.5rem; font-weight: 900; color: var(--navy);',
                '.wheel-value { font-size: 1.5rem; font-weight: 900; color: #111;');
  c = c.replace('.status-resource-title { font-size: 1rem; font-weight: 800; color: var(--navy);',
                '.status-resource-title { font-size: 1rem; font-weight: 800; color: #111;');

  // Remove unused .status-grid, .status-card, .wheel-container CSS since we replaced them
  // (keep them in case they're still referenced elsewhere)

  write('resources.html', c);
}

// ══════════════════════════════════════════════════════════════════════════════
// 4.  ADMIN PAGES — change content text color from navy-blue to #111
//     Files: admin.html, pricing.html, earnings.html, audit-log.html,
//            orders-list.html, students.html, staff.html
// ══════════════════════════════════════════════════════════════════════════════
const adminFiles = ['admin.html','pricing.html','earnings.html','audit-log.html','orders-list.html','students.html','staff.html'];

adminFiles.forEach(fname => {
  if (!fs.existsSync(base + fname)) return;
  let c = read(fname);

  // Replace content-header h1 color
  c = c.replace(/\.content-header h1 \{([^}]*?)color: var\(--navy\)/g,
    (m, inner) => m.replace('color: var(--navy)', 'color: #111'));

  // Replace panel-title colors
  c = c.replace(/\.panel-title \{([^}]*?)color: var\(--navy\)/g,
    (m, inner) => m.replace('color: var(--navy)', 'color: #111'));

  // Replace card-stat-value / stat number colors
  c = c.replace(/\.stat-value\b([^{]*)\{([^}]*?)color:\s*var\(--navy\)/g,
    (m) => m.replace('color: var(--navy)', 'color: #111'));

  // Replace table th colors
  c = c.replace(/\.history-table th[^{]*\{([^}]*?)color:\s*var\(--navy\)/g,
    (m) => m.replace('color: var(--navy)', 'color: #333'));

  // Replace section titles
  c = c.replace(/\.section-title\b([^{]*)\{([^}]*?)color:\s*var\(--navy\)/g,
    (m) => m.replace('color: var(--navy)', 'color: #111'));

  // Replace header-date color in staff
  // Replace inline style colors in html elements that are clearly content headings
  // Only target inline style="...color: var(--navy)..." that are obviously headings
  c = c.replace(/style="([^"]*?)color:var\(--navy\)([^"]*?)font-weight:800([^"]*?)"/g,
    (m) => m.replace('color:var(--navy)', 'color:#111'));
  c = c.replace(/style="([^"]*?)font-weight:800([^"]*?)color:var\(--navy\)([^"]*?)"/g,
    (m) => m.replace('color:var(--navy)', 'color:#111'));
  c = c.replace(/style="([^"]*?)font-weight:900([^"]*?)color:var\(--navy\)([^"]*?)"/g,
    (m) => m.replace('color:var(--navy)', 'color:#111'));
  c = c.replace(/style="([^"]*?)color:var\(--navy\)([^"]*?)font-weight:900([^"]*?)"/g,
    (m) => m.replace('color:var(--navy)', 'color:#111'));

  write(fname, c);
});

console.log('\nAll fixes applied successfully!');
