const fs = require('fs');
const base = 'c:/Users/KAVIN GS/OneDrive/Desktop/printnsta project/frontend/';
const files = fs.readdirSync(base).filter(f => f.endsWith('.html'));

files.forEach(f => {
  const p = base + f;
  let content = fs.readFileSync(p, 'utf8');
  let changed = false;

  // Replace emoji logic in scripts
  if (content.includes('☀️') || content.includes('🌙')) {
    content = content.replace(/☀️\s*/g, '');
    content = content.replace(/🌙\s*/g, '');
    changed = true;
  }

  // Ensure button innerHTML / textContent is clean
  if (content.includes('\'☀️ Light Mode\'')) {
    content = content.replace(/'☀️ Light Mode'/g, "'Light Mode'");
    changed = true;
  }
  if (content.includes('\'🌙 Dark Mode\'')) {
    content = content.replace(/'🌙 Dark Mode'/g, "'Dark Mode'");
    changed = true;
  }
  if (content.includes('"☀️ Light Mode"')) {
    content = content.replace(/"☀️ Light Mode"/g, '"Light Mode"');
    changed = true;
  }
  if (content.includes('"🌙 Dark Mode"')) {
    content = content.replace(/"🌙 Dark Mode"/g, '"Dark Mode"');
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(p, content);
    console.log("Removed theme emojis from:", f);
  }
});
