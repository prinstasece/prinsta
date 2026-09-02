const fs = require('fs');
const base = 'c:/Users/KAVIN GS/OneDrive/Desktop/printnsta project/frontend/';
const files = fs.readdirSync(base).filter(f => f.endsWith('.html') || f.endsWith('.css'));

files.forEach(f => {
  const p = base + f;
  let content = fs.readFileSync(p, 'utf8');
  let original = content;

  // Remove theme buttons
  content = content.replace(/<button[^>]*class="theme-toggle-btn"[^>]*>[\s\S]*?<\/button>/gi, '');
  content = content.replace(/<div[^>]*id="themeLabel"[^>]*>[\s\S]*?<\/button>\s*<\/div>/gi, '');
  content = content.replace(/<div style="margin-bottom:0.5rem;font-size:0.75rem;font-weight:700;color:var\(--gray-600\);text-transform:uppercase;letter-spacing:0.5px;">Appearance<\/div>[\s\S]*?<\/button>\s*<\/div>\s*<\/div>/gi, '');

  // Remove theme script tags and functions
  content = content.replace(/<script>\s*\(function\(\)\s*\{\s*function initTheme\(\)[\s\S]*?\}\)\(\);\s*<\/script>/gi, '');
  content = content.replace(/function applyTheme[\s\S]*?applyTheme\(localStorage\.getItem\('printsta_theme'\) \|\| 'light'\);/gi, '');
  content = content.replace(/function toggleTheme\(\)[\s\S]*?\}\n/gi, '');
  content = content.replace(/function initTheme\(\)[\s\S]*?\}\n/gi, '');
  content = content.replace(/function updateThemeBtnText[\s\S]*?\}\n/gi, '');

  // Remove data-theme CSS rules
  content = content.replace(/\[data-theme="dark"\][\s\S]*?\n\}/gi, '');
  content = content.replace(/\/\* Global Dark \/ Light Theme System \*\/[\s\S]*?color: var\(--text-muted\) !important;\s*\}/gi, '');
  content = content.replace(/\/\* Dark mode inputs and option cards \*\/[\s\S]*/gi, '');

  // Ensure html/body data-theme attribute is removed or defaults clean
  content = content.replace(/data-theme="[^"]*"/gi, '');

  if (content !== original) {
    fs.writeFileSync(p, content);
    console.log("Removed dark mode from:", f);
  }
});
