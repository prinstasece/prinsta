const fs = require('fs');
const base = 'c:/Users/KAVIN GS/OneDrive/Desktop/printnsta project/frontend/';

// ─────────────────────────────────────────────────────────────
// 1. UPDATE style.css — Theme System (Dark / Light mode) & Base Colors
// ─────────────────────────────────────────────────────────────
let css = fs.readFileSync(base + 'style.css', 'utf8');

// Ensure root theme variables
if (!css.includes('[data-theme="dark"]')) {
  css += `

/* Dark / Light Theme System */
:root {
  --bg-color: #f8f9fc;
  --panel-bg: #ffffff;
  --text-main: #111827;
  --text-muted: #6b7280;
  --border-color: #e5e7eb;
  --card-bg: #ffffff;
  --input-bg: #f0f0f0;
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

.panel, .students-panel, .profile-card, .status-card, .order-card {
  background-color: var(--panel-bg);
  border-color: var(--border-color);
  color: var(--text-main);
}
`;
  fs.writeFileSync(base + 'style.css', css);
  console.log("Updated style.css with theme variables");
}

// ─────────────────────────────────────────────────────────────
// 2. UPDATE orders-list.html — Title & Colors
// ─────────────────────────────────────────────────────────────
let ordersHtml = fs.readFileSync(base + 'orders-list.html', 'utf8');
ordersHtml = ordersHtml.replace('<h1>Spool Orders List Ledger</h1>', '<h1>Orders</h1>');
ordersHtml = ordersHtml.replace('Browse through paid orders spooled by student clients. Click on any row to expand full details.', 'View and manage all student print orders');
ordersHtml = ordersHtml.replace(/color:\s*var\(--navy\)/g, 'color: #111');
fs.writeFileSync(base + 'orders-list.html', ordersHtml);
console.log("Updated orders-list.html title and colors");

// ─────────────────────────────────────────────────────────────
// 3. UPDATE students.html — Search Bar & Table Header Colors
// ─────────────────────────────────────────────────────────────
let studentsHtml = fs.readFileSync(base + 'students.html', 'utf8');

// Replace table header color CSS
studentsHtml = studentsHtml.replace(
  'table.students-table th {\n      background-color: #f8fafc;\n      color: var(--navy);\n      font-weight: 700;\n    }',
  'table.students-table th {\n      background-color: #f8fafc;\n      color: #111;\n      font-weight: 700;\n    }'
);

// Search Bar HTML insertion before section.students-panel
const searchBarHtml = `
    <!-- Search Filter Bar -->
    <div style="margin-bottom: 1.25rem; display: flex; gap: 1rem; align-items: center;">
      <input type="text" id="studentSearchInput" placeholder="Search by email, register number, or name..." 
             style="flex: 1; max-width: 450px; padding: 10px 14px; border: 1.5px solid var(--border); border-radius: 8px; font-size: 0.9rem; outline: none; font-family: 'Plus Jakarta Sans', sans-serif;"
             oninput="filterStudents()">
      <span id="studentCountBadge" style="font-size: 0.85rem; font-weight: 700; color: var(--gray-600);"></span>
    </div>
`;

if (!studentsHtml.includes('studentSearchInput')) {
  studentsHtml = studentsHtml.replace('<section class="students-panel">', searchBarHtml + '\n    <section class="students-panel">');
}

// Replace JS render and search logic in students.html
const oldStudentsJs = `    async function loadStudents() {
      try {
        const response = await fetch(\`\${API_BASE}/admin/students\`, {
          headers: { 'Authorization': \`Bearer \${token}\` }
        });
        const data = await response.json();
        const tBody = document.getElementById('studentsTableBody');

        if (response.ok && data.success) {
          if (data.students.length === 0) {
            tBody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:2rem;color:var(--gray-text);">No students registered yet.</td></tr>';
            return;
          }

          tBody.innerHTML = data.students.map(s => {
            const fullName = \`\${s.firstName || ''} \${s.lastName || ''}\`.trim() || 'Google User';
            const deptBatch = (s.department && s.batch) ? \`\${s.department} (\${s.batch})\` : (s.department || s.batch || 'N/A');
            return \`
              <tr>
                <td style="font-weight:700;color:var(--navy);">\${fullName}</td>
                <td>\${s.email}</td>
                <td style="font-family:monospace;font-size:0.9rem;font-weight:700;">\${s.registerNumber || '—'}</td>
                <td style="color:#4b5563;">\${deptBatch}</td>
              </tr>
            \`;
          }).join('');
        } else {
          tBody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:2rem;color:var(--gray-text);">Failed to load student profiles.</td></tr>';
        }
      } catch (err) {
        console.error('Students fetch error:', err);
        document.getElementById('studentsTableBody').innerHTML = '<tr><td colspan="4" style="text-align:center;padding:2rem;color:var(--gray-text);">Connection error.</td></tr>';
      }
    }`;

const newStudentsJs = `    let allStudentsList = [];

    async function loadStudents() {
      try {
        const response = await fetch(\`\${API_BASE}/admin/students\`, {
          headers: { 'Authorization': \`Bearer \${token}\` }
        });
        const data = await response.json();
        if (response.ok && data.success) {
          allStudentsList = data.students || [];
          renderStudentsTable(allStudentsList);
        } else {
          document.getElementById('studentsTableBody').innerHTML = '<tr><td colspan="4" style="text-align:center;padding:2rem;color:var(--gray-text);">Failed to load student profiles.</td></tr>';
        }
      } catch (err) {
        console.error('Students fetch error:', err);
        document.getElementById('studentsTableBody').innerHTML = '<tr><td colspan="4" style="text-align:center;padding:2rem;color:var(--gray-text);">Connection error.</td></tr>';
      }
    }

    function renderStudentsTable(list) {
      const tBody = document.getElementById('studentsTableBody');
      const badge = document.getElementById('studentCountBadge');
      if (badge) badge.textContent = \`Total Students: \${list.length}\`;

      if (!list || list.length === 0) {
        tBody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:2rem;color:var(--gray-text);">No matching student registrations found.</td></tr>';
        return;
      }

      tBody.innerHTML = list.map(s => {
        const fullName = \`\${s.firstName || ''} \${s.lastName || ''}\`.trim() || 'Google User';
        const deptBatch = (s.department && s.batch) ? \`\${s.department} (\${s.batch})\` : (s.department || s.batch || 'N/A');
        return \`
          <tr>
            <td style="font-weight:700;color:#111;">\${fullName}</td>
            <td style="color:#111;">\${s.email}</td>
            <td style="font-family:monospace;font-size:0.9rem;font-weight:700;color:#111;">\${s.registerNumber || '—'}</td>
            <td style="color:#4b5563;">\${deptBatch}</td>
          </tr>
        \`;
      }).join('');
    }

    function filterStudents() {
      const query = (document.getElementById('studentSearchInput')?.value || '').trim().toLowerCase();
      if (!query) {
        renderStudentsTable(allStudentsList);
        return;
      }
      const filtered = allStudentsList.filter(s => {
        const fullName = \`\${s.firstName || ''} \${s.lastName || ''}\`.toLowerCase();
        const email = (s.email || '').toLowerCase();
        const reg = (s.registerNumber || '').toLowerCase();
        return fullName.includes(query) || email.includes(query) || reg.includes(query);
      });
      renderStudentsTable(filtered);
    }`;

studentsHtml = studentsHtml.replace(oldStudentsJs, newStudentsJs);
fs.writeFileSync(base + 'students.html', studentsHtml);
console.log("Updated students.html with search bar & dark text");

// ─────────────────────────────────────────────────────────────
// 4. UPDATE staff.html — Immediate UI update for "Mark Printing"
// ─────────────────────────────────────────────────────────────
let staffHtml = fs.readFileSync(base + 'staff.html', 'utf8');

// Replace updateStatus function in staff.html
const oldUpdateStatus = `async function updateStatus(orderId, newStatus) {
      // Find the card in the DOM for immediate, optimistic UI update
      const card = document.querySelector(\`[data-order-id="\${orderId}"]\`);
      
      if (card) {
        if (newStatus === 'collected') {
          // Remove the card immediately with an animation
          card.style.opacity = '0';
          card.style.transform = 'scale(0.95)';
          card.style.transition = 'all 0.3s ease';
          setTimeout(() => { card.remove(); }, 300);
        } else {
          // Update the status badge in real-time
          const badge = card.querySelector('.status-badge');
          if (badge) {
            badge.className = \`status-badge \${newStatus}\`;
            badge.textContent = newStatus;
          }
          
          // Update action button row
          const btnRow = card.querySelector('.action-btn-row');
          if (btnRow) {
            if (newStatus === 'printing') {
              btnRow.innerHTML = \`<button onclick="updateStatus('\${orderId}', 'ready')" class="btn-primary" style="flex:1;background:#16a34a;border-color:#16a34a;">Mark Ready</button>\`;
            } else if (newStatus === 'ready') {
              btnRow.innerHTML = \`<button onclick="updateStatus('\${orderId}', 'collected')" class="btn-primary" style="flex:1;background:var(--navy);border-color:var(--navy);">Mark Collected</button>\`;
            }
          }
        }
      }`;

const newUpdateStatus = `async function updateStatus(orderId, newStatus) {
      // 1. Immediately update in-memory order object so state is synchronous
      const memoryOrder = queueOrders.find(o => o._id === orderId);
      if (memoryOrder) {
        memoryOrder.status = newStatus;
      }

      // 2. Synchronously update card DOM immediately
      const card = document.querySelector(\`[data-order-id="\${orderId}"]\`);
      if (card) {
        if (newStatus === 'collected') {
          card.style.opacity = '0';
          card.style.transform = 'scale(0.95)';
          card.style.transition = 'all 0.3s ease';
          setTimeout(() => { card.remove(); }, 300);
        } else {
          const badge = card.querySelector('.status-badge');
          if (badge) {
            badge.className = \`status-badge \${newStatus}\`;
            badge.textContent = newStatus;
          }
          const btnRow = card.querySelector('.action-btn-row');
          if (btnRow) {
            if (newStatus === 'printing') {
              btnRow.innerHTML = \`<button onclick="updateStatus('\${orderId}', 'ready')" class="btn-primary" style="flex:1;background:#16a34a;border-color:#16a34a;">Mark Ready</button>\`;
            } else if (newStatus === 'ready') {
              btnRow.innerHTML = \`<button onclick="updateStatus('\${orderId}', 'collected')" class="btn-primary" style="flex:1;background:var(--navy);border-color:var(--navy);">Mark Collected</button>\`;
            }
          }
        }
      }

      // 3. Immediately re-render queue to keep view in sync
      renderQueue(queueOrders);`;

if (staffHtml.includes(oldUpdateStatus)) {
  staffHtml = staffHtml.replace(oldUpdateStatus, newUpdateStatus);
  fs.writeFileSync(base + 'staff.html', staffHtml);
  console.log("Updated staff.html with instant UI transition for Mark Printing");
}

console.log("All frontend updates applied successfully.");
