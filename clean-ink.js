const fs = require('fs');
const p = 'c:/Users/KAVIN GS/OneDrive/Desktop/printnsta project/frontend/resources.html';
let lines = fs.readFileSync(p, 'utf8').split('\n');
let out = [];
let skip = false;
for (let i = 0; i < lines.length; i++) {
  let l = lines[i];
  if (l.includes('id="alertBarInk"')) continue;
  if (l.includes('class="status-card ink"')) { skip = true; continue; }
  if (skip && l.includes('</div>') && lines[i-1] && lines[i-1].includes('inkMeta')) { skip = false; continue; }
  
  if (l.includes('Supply Ink Cartridge')) { skip = true; out.pop(); continue; } 
  if (skip && l.includes('</div>') && lines[i-2] && lines[i-2].includes('supplyInk(true)')) { skip = false; continue; }
  
  if (l.includes('Ink Supply History')) { skip = true; out.pop(); continue; } 
  if (skip && l.includes('</div>') && lines[i-2] && lines[i-2].includes('inkHistoryBody')) { skip = false; continue; }

  if (l.includes('Override Ink')) { skip = true; out.pop(); continue; } 
  if (skip && l.includes('</div>') && lines[i-2] && lines[i-2].includes('overrideInk()')) { skip = false; continue; }

  if (l.includes('var inkLevel = parseFloat(ink.level)')) { skip = true; continue; }
  if (skip && l.includes('var iLastDate = ink.lastSupplied')) { skip = false; continue; }
  if (l.includes('inkMeta')) continue;
  
  if (l.includes('async function supplyInk')) { skip = true; continue; }
  if (skip && l.includes('}') && lines[i-1] && lines[i-1].includes('catch')) { skip = false; continue; }

  if (l.includes('async function overrideInk()')) { skip = true; continue; }
  if (skip && l.includes('}') && lines[i-1] && lines[i-1].includes('catch')) { skip = false; continue; }

  if (l.includes('var ib = document.getElementById(\'inkHistoryBody\');')) { skip = true; continue; }
  if (skip && l.includes('}).join(\'\') : ')) { skip = false; continue; }

  if (l.includes('grid-template-columns: repeat(2, 1fr);')) {
     l = l.replace('repeat(2, 1fr)', '1fr');
  }
  
  if (l.includes('+d.levelAdded+\'% ink\'')) {
     l = l.replace(/var label = d\.type==='paper' \? d\.sheets\+' sheets of paper' : '\+'\+d\.levelAdded\+'% ink';/, "var label = d.sheets + ' sheets of paper';");
  }

  out.push(l);
}
fs.writeFileSync(p, out.join('\n'));
console.log('done');
