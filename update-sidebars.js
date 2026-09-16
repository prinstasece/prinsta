const fs = require('fs');
const files = ['admin.html', 'pricing.html', 'earnings.html', 'audit-log.html'];
files.forEach(f => {
  const p = 'c:/Users/KAVIN GS/OneDrive/Desktop/printnsta project/frontend/' + f;
  let c = fs.readFileSync(p, 'utf8');
  if (c.includes('resources.html')) {
    console.log('Already updated', f);
    return;
  }
  c = c.replace(/<a href="audit-log\.html" class="sidebar-link(.*?)">Activity Log<\/a>/g, '<a href="audit-log.html" class="sidebar-link$1">Activity Log</a>\n      <a href="resources.html" class="sidebar-link">&#128230; Resources</a>');
  fs.writeFileSync(p, c);
  console.log('Updated', f);
});
