const fs = require('fs');
const c = fs.readFileSync('c:/Users/KAVIN GS/OneDrive/Desktop/printnsta project/frontend/resources.html', 'utf8');
console.log('wheel-container present:', c.includes('wheel-container'));
console.log('Orphan SVG present:', c.includes('wheel-svg'));
console.log('Paper progress bar:', c.includes('paperProgressBar'));
console.log('New compact stat:', c.includes('sheets remaining'));
const idx = c.indexOf('Paper Stock');
console.log('\nPaper section:\n' + c.substring(idx-30, idx+400));
