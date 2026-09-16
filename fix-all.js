const fs = require('fs');
const base = 'c:/Users/KAVIN GS/OneDrive/Desktop/printnsta project/frontend/';

// ─────────────────────────────────────────────────────────
// 1. CLEAN resources.html — remove all remaining ink blocks
// ─────────────────────────────────────────────────────────
{
  let lines = fs.readFileSync(base + 'resources.html', 'utf8').split('\n');
  const out = [];
  let skip = false;
  let skipUntil = null;

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];

    // Remove orphaned ink wheel HTML (lines 187-199)
    if (!skip && l.includes('id="inkWheelFill"')) { skip = true; skipUntil = 'inkChip'; }
    if (skip) {
      if (l.includes(skipUntil)) {
        skip = false;
        continue; // skip this line too
      }
      continue;
    }
    // Remove the orphaned opening <div class="wheel-container"> before inkWheelFill
    if (l.trim() === '<div class="wheel-container">' && lines[i+1] && lines[i+1].includes('wheel-svg')) {
      // look ahead: is this paper or ink?
      const ahead = lines.slice(i, i+6).join(' ');
      if (ahead.includes('inkWheelFill')) { continue; }
    }

    // Remove ink supply form block
    if (l.includes('inkLevelInput') || l.includes('inkNoteInput') || l.includes('cartridgeIdInput')) continue;
    if (l.includes('supplyInk(')) continue;

    // Remove ink history table
    if (l.includes('inkHistoryBody')) continue;
    if (l.includes('Ink Supply History')) continue;
    if (l.includes('Level Added') && l.includes('Cartridge ID')) continue;

    // Remove override ink block
    if (l.includes('overrideInkInput') || l.includes('overrideInk()')) continue;
    if (l.includes('Set Ink Level')) continue;
    if (l.includes('Set Ink</button>')) continue;

    // Remove ink JS references
    if (l.includes('inkLevel') && !l.includes('inkLevelInput')) continue;
    if (l.includes('inkWheelValue') || l.includes('inkChip') || l.includes('alertBarInk') || l.includes('inkCard')) continue;
    if (l.includes('supply-ink') || l.includes('ink/override')) continue;
    if (l.includes('ib.innerHTML = data.inkHistory')) continue;
    if (l.includes("levelAdded+'%'") || l.includes("levelAdded}%")) continue;
    if (l.includes('iLastDate')) continue;
    if (l.includes('ink.lastSupplied') || l.includes('inkMeta')) continue;

    // Remove stray supply-form divs that are now empty (ink form was removed)
    // Keep track of supply-form divs: if one only had ink content, it should be empty
    // We'll fix this by removing lines that are just stray </div> if they don't close anything meaningful

    out.push(l);
  }

  // Clean up empty supply-grid items (after removing ink form)
  let result = out.join('\n');

  // Remove the orphaned ink supply form wrapper (supply-form div with only ink fields removed)
  result = result.replace(/<div class="supply-form">\s*<\/div>/g, '');
  // Remove empty panel divs left by ink form removal
  result = result.replace(/<div class="panel" style="margin-bottom:0;">\s*<\/div>/g, '');

  // Fix override grid to be 1 column since ink override is removed
  result = result.replace('grid-template-columns:1fr 1fr;', 'grid-template-columns:1fr;');

  // Remove status-card.ink CSS
  result = result.replace(/\.status-card\.ink::before \{[^}]+\}/g, '');

  // Remove inkGrad SVG gradient
  result = result.replace(/<linearGradient id="inkGrad"[^<]*>[\s\S]*?<\/linearGradient>/g, '');

  // Fix empty </div> orphans from removed ink stat card
  result = result.replace(/\n\s*<div class="wheel-container">\s*\n\s*<svg class="wheel-svg" viewBox="0 0 120 120">\s*\n\s*<circle class="wheel-track" cx="60" cy="60" r="54"\/>\s*\n\s*<circle class="wheel-fill" id="inkWheelFill"[^>]+\/>\s*\n\s*<\/svg>\s*\n\s*<div class="wheel-center">\s*\n\s*<div class="wheel-value" id="inkWheelValue">.*?<\/div>\s*\n\s*<div class="wheel-unit">%<\/div>\s*\n\s*<\/div>\s*\n\s*<\/div>\s*\n\s*<div class="status-resource-title">Ink Cartridge<\/div>\s*\n\s*<span class="status-badge-chip chip-good" id="inkChip">Loading\.\.\.<\/span>/g, '');

  // Remove ink status JS block (inkLevel references after paper block)
  result = result.replace(/document\.getElementById\('inkWheelValue'\)\.textContent[\s\S]*?ia\.style\.display = 'none';\s*\n\s*\}/g, '');

  // Fix 'var paper = data.paper, ink = data.ink, pending' → just paper
  result = result.replace("var paper = data.paper, ink = data.ink, pending = data.pending||[];", "var paper = data.paper, pending = data.pending||[];");

  // Remove history JS for ink
  result = result.replace(/ib\.innerHTML = data\.inkHistory[\s\S]*?'No records yet'[\s\S]*?\);/g, '');

  // Remove dangling orphan stray lines from ink supply form removal
  result = result.replace(/<div class="supply-form">\s*\n(\s*<label>Ink Level Added[^]*?)<\/div>\s*\n\s*<\/div>/g, '');

  // Remove the panel title text "Supply Ink Cartridge" leftover  
  result = result.replace(/<div class="panel-title">Supply Ink Cartridge<\/div>/g, '');

  fs.writeFileSync(base + 'resources.html', result);
  console.log('resources.html cleaned');
}

// ─────────────────────────────────────────────────────────
// 2. CLEAN staff.html — remove remaining ink references
// ─────────────────────────────────────────────────────────
{
  let content = fs.readFileSync(base + 'staff.html', 'utf8');

  // Update header text
  content = content.replace('Ink &amp; Paper Management', 'Paper Management');
  content = content.replace('Ink & Paper Management', 'Paper Management');

  // Remove ink card HTML block (lines 799-812 area)
  content = content.replace(/\s*<!-- Ink -->\s*<div style="background:white;border:1\.5px solid var\(--border\);border-radius:16px;padding:1\.5rem;">\s*<div style="display:flex;align-items:center;gap:10px;margin-bottom:1rem;">\s*<span style="font-size:1\.75rem;"><\/span>\s*<div>\s*<div style="font-size:0\.75rem;font-weight:700;color:var\(--gray-400\);text-transform:uppercase;letter-spacing:1px;">Ink Level<\/div>\s*<div id="inkLevelCount"[^>]*>—<\/div>\s*<\/div>\s*<\/div>\s*<div style="background:#f0f2f7;border-radius:50px;height:12px;overflow:hidden;margin-bottom:0\.5rem;">\s*<div id="inkProgressBar"[^>]*><\/div>\s*<\/div>\s*<div id="inkStatusLabel"[^>]*>Loading\.\.\.<\/div>\s*<\/div>/g, '');

  // Remove ink JS blocks
  content = content.replace(/\/\/ Ink\s*\n\s*const inkLevel[\s\S]*?inkStatusLabel[\s\S]*?'1d4ed8';\s*\n\s*\}/g, '');

  // Remove typeLabel ink reference
  content = content.replace(
    "const typeLabel = d.type === 'paper' ? `${d.sheets} sheets of paper` : `+${d.levelAdded}% ink`;",
    "const typeLabel = `${d.sheets} sheets of paper`;"
  );

  fs.writeFileSync(base + 'staff.html', content);
  console.log('staff.html cleaned');
}

console.log('All done!');
