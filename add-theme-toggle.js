const fs = require('fs');
const base = 'c:/Users/KAVIN GS/OneDrive/Desktop/printnsta project/frontend/';

const files = [
  'admin.html', 'pricing.html', 'earnings.html', 'orders-list.html', 
  'students.html', 'audit-log.html', 'resources.html', 'staff.html', 
  'index.html', 'register.html', 'admin-login.html'
];

const themeScript = `
  <script>
    (function() {
      function initTheme() {
        const theme = localStorage.getItem('printsta_theme') || 'light';
        document.documentElement.setAttribute('data-theme', theme);
        updateThemeBtnText(theme);
      }
      window.toggleTheme = function() {
        const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', current);
        localStorage.setItem('printsta_theme', current);
        updateThemeBtnText(current);
      };
      function updateThemeBtnText(theme) {
        document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
          btn.innerHTML = theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode';
        });
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTheme);
      } else {
        initTheme();
      }
    })();
  </script>
`;

const sidebarBtn = `
      <button class="theme-toggle-btn" onclick="toggleTheme()" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#fff;padding:6px 12px;border-radius:8px;font-size:0.8rem;font-weight:600;cursor:pointer;margin-bottom:8px;width:100%;">
        🌙 Dark Mode
      </button>
`;

files.forEach(file => {
  const p = base + file;
  if (!fs.existsSync(p)) return;
  let content = fs.readFileSync(p, 'utf8');

  // Insert Theme script before </body> if not present
  if (!content.includes('printsta_theme')) {
    content = content.replace('</body>', themeScript + '\n</body>');
  }

  // Insert sidebar theme button if file has sidebar-footer and doesn't have theme-toggle-btn
  if (content.includes('class="sidebar-footer"') && !content.includes('theme-toggle-btn')) {
    content = content.replace('<div class="sidebar-footer">', '<div class="sidebar-footer">\n' + sidebarBtn);
  }

  fs.writeFileSync(p, content);
  console.log("Updated theme toggle in:", file);
});
