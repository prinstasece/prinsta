const fs = require('fs');
const base = 'c:/Users/KAVIN GS/OneDrive/Desktop/printnsta project/frontend/';
const files = fs.readdirSync(base).filter(f => f.endsWith('.html'));

files.forEach(f => {
  let c = fs.readFileSync(base + f, 'utf8');
  let modified = false;

  // Replace heading text color rules where var(--navy) is used for headers
  if (c.includes('color: var(--navy);')) {
    // Only replace inline styles or CSS rules for headers / headings
    c = c.replace(/color:\s*var\(--navy\);/g, (match, offset) => {
      const preceding = c.substring(Math.max(0, offset - 150), offset);
      if (preceding.includes('sidebar') || preceding.includes('wordmark') || preceding.includes('btn-primary') || preceding.includes('btn-logout')) {
        return match;
      }
      modified = true;
      return 'color: #111;';
    });
  }

  if (modified) {
    fs.writeFileSync(base + f, c);
    console.log("Cleaned text colors in:", f);
  }
});
