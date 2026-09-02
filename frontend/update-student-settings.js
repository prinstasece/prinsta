const fs = require('fs');
const studentPath = 'c:/Users/KAVIN GS/OneDrive/Desktop/printnsta project/frontend/student.html';
let html = fs.readFileSync(studentPath, 'utf8');

// Replace #panelSettings content to include both Profile Card and Past Orders Card
const oldSettingsPanel = `    <!-- SETTINGS PANEL -->
    <div id="panelSettings" class="settings-panel">
      <div class="page-header">
        <h1>Settings</h1>
        <p>Your account and profile information</p>
      </div>

      <div class="profile-card">
        <h2>Profile</h2>

        <div class="profile-field">
          <label>Full Name</label>
          <p id="profileName">—</p>
        </div>

        <div class="profile-field">
          <label>Register Number</label>
          <p id="profileRegNum">—</p>
        </div>

        <div class="profile-field">
          <label>Department</label>
          <p id="profileDept">—</p>
        </div>

        <div class="profile-field">
          <label>Year of Study</label>
          <p id="profileYear">—</p>
        </div>

        <div class="profile-field">
          <label>Email</label>
          <p id="profileEmail">—</p>
        </div>

        <div class="profile-field">
          <label>Phone</label>
          <p id="profilePhone">—</p>
        </div>
      </div>
    </div>`;

const newSettingsPanel = `    <!-- SETTINGS PANEL -->
    <div id="panelSettings" class="settings-panel">
      <div class="page-header">
        <h1>Settings & Account</h1>
        <p>Your student profile and order history</p>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1.2fr; gap: 2rem; align-items: start;">
        <!-- Left: Student Profile Card -->
        <div class="profile-card">
          <h2 style="font-size: 1.1rem; font-weight: 700; color: #111; margin-bottom: 1.25rem;">Student Profile</h2>

          <div class="profile-field">
            <label>Full Name</label>
            <p id="profileName">—</p>
          </div>

          <div class="profile-field">
            <label>Register Number</label>
            <p id="profileRegNum">—</p>
          </div>

          <div class="profile-field">
            <label>Department</label>
            <p id="profileDept">—</p>
          </div>

          <div class="profile-field">
            <label>Batch / Year of Study</label>
            <p id="profileYear">—</p>
          </div>

          <div class="profile-field">
            <label>Email Address</label>
            <p id="profileEmail">—</p>
          </div>

          <div class="profile-field">
            <label>Phone Number</label>
            <p id="profilePhone">—</p>
          </div>

          <div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--border);">
            <button type="button" class="theme-toggle-btn btn-secondary" onclick="toggleTheme()" style="width: 100%; font-size: 0.85rem; padding: 10px;">
              🌙 Dark Mode
            </button>
          </div>
        </div>

        <!-- Right: Past Orders History Section -->
        <div class="profile-card" style="max-width: 100%;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <h2 style="font-size: 1.1rem; font-weight: 700; color: #111; margin: 0;">Order History</h2>
            <button onclick="loadSettingsPastOrders()" style="background: none; border: none; font-size: 0.8rem; font-weight: 700; color: var(--gold); cursor: pointer;">🔄 Refresh</button>
          </div>
          <p style="font-size: 0.8rem; color: var(--gray-400); margin-bottom: 1rem;">All print orders spooled in the last 3 months</p>
          <div id="settingsPastOrdersList" style="display: flex; flex-direction: column; gap: 0.75rem; max-height: 480px; overflow-y: auto; padding-right: 4px;">
            <div class="empty-state">Loading order history...</div>
          </div>
        </div>
      </div>
    </div>`;

if (html.includes(oldSettingsPanel)) {
  html = html.replace(oldSettingsPanel, newSettingsPanel);
  console.log("Replaced settings panel HTML in student.html");
}

// Replace showPanel logic to load both profile and settings past orders
html = html.replace(
  "if (name === 'settings') loadProfile();",
  "if (name === 'settings') { loadProfile(); loadSettingsPastOrders(); }"
);

// Add loadSettingsPastOrders function & Theme toggle helper
const pastOrdersFunction = `
    // ── THEME TOGGLE ──
    function initTheme() {
      const theme = localStorage.getItem('printsta_theme') || 'light';
      document.documentElement.setAttribute('data-theme', theme);
      updateThemeBtnText(theme);
    }
    function toggleTheme() {
      const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', current);
      localStorage.setItem('printsta_theme', current);
      updateThemeBtnText(current);
    }
    function updateThemeBtnText(theme) {
      document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
        btn.innerHTML = theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode';
      });
    }
    initTheme();

    // ── LOAD PAST ORDERS IN SETTINGS ──
    async function loadSettingsPastOrders() {
      const list = document.getElementById('settingsPastOrdersList');
      if (!list) return;
      list.innerHTML = '<div class="empty-state">Loading order history...</div>';
      try {
        const res = await fetch(\`\${API_BASE}/orders/mine\`, {
          headers: { 'Authorization': \`Bearer \${token}\` }
        });
        const data = await res.json();
        if (res.ok && data.success) {
          const past = data.orders || [];
          if (past.length === 0) {
            list.innerHTML = '<div class="empty-state">No past orders found.</div>';
            return;
          }
          list.innerHTML = '';
          past.forEach(order => {
            const dateStr = new Date(order.createdAt).toLocaleDateString('en-IN', {
              day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
            });
            const tokenPart = order.tokenNumber ? \`Token <strong style="color:var(--gold);">\${order.tokenNumber}</strong> &bull; \` : '';
            const amt = order.amount % 1 === 0 ? order.amount : order.amount.toFixed(2);
            const row = document.createElement('div');
            row.style.cssText = 'padding:12px;border:1px solid var(--border);border-radius:8px;background:var(--off-white);';
            row.innerHTML = \`
              <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:4px;">
                <div style="font-size:0.88rem;font-weight:700;color:#111;">\${tokenPart}\${order.fileName}</div>
                <span class="status-badge status-\${order.status}">\${order.status}</span>
              </div>
              <div style="font-size:0.78rem;color:var(--gray-400);">\${dateStr} &bull; \${order.copies} cop\${order.copies > 1 ? 'ies' : 'y'} &bull; ₹\${amt} &bull; \${order.colorMode === 'bw' ? 'B&W' : 'Color'} &bull; \${order.sides === 'single' ? 'Single' : 'Double'}-sided</div>
            \`;
            list.appendChild(row);
          });
        } else {
          list.innerHTML = '<div class="empty-state">Could not load past orders.</div>';
        }
      } catch(e) {
        console.error(e);
        list.innerHTML = '<div class="empty-state">Error loading past orders.</div>';
      }
    }
`;

if (!html.includes('loadSettingsPastOrders()')) {
  html = html.replace('// ── LOAD PROFILE ──', pastOrdersFunction + '\n    // ── LOAD PROFILE ──');
}

fs.writeFileSync(studentPath, html);
console.log("Updated student.html settings panel & past orders history.");
