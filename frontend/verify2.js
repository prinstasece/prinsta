const fs = require('fs');
const base = 'c:/Users/KAVIN GS/OneDrive/Desktop/printnsta project/frontend/';

// 1. Check student.html settings section has correct fields
const student = fs.readFileSync(base + 'student.html', 'utf8');
console.log('=== Student: Settings profile fields ===');
['profileName','profileRegNum','profileDept','profileYear','profileEmail','profilePhone'].forEach(id => {
  console.log(id + ':', student.includes(id) ? 'FOUND' : 'MISSING');
});
console.log('loadProfile uses firstName+lastName:', student.includes('firstName') && student.includes('lastName'));
console.log('loadProfile uses batch:', student.includes('s.batch'));
console.log('Sidebar color #0f1a30:', student.includes('#0f1a30'));

// 2. Check resources.html is clean
const res = fs.readFileSync(base + 'resources.html', 'utf8');
console.log('\n=== Resources: ===');
console.log('No paperWheelFill refs:', !res.includes('paperWheelFill'));
console.log('Has progress bar:', res.includes('paperProgressBar'));
console.log('Color #111 in panel-title:', res.includes('color: #111;'));

// 3. Check style.css body color
const css = fs.readFileSync(base + 'style.css', 'utf8');
console.log('\n=== style.css ===');
console.log('Body color #111:', css.includes('color: #111;'));
