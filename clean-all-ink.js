const fs = require('fs');

// ── CLEAN STAFF.HTML ──
const staffPath = 'c:/Users/KAVIN GS/OneDrive/Desktop/printnsta project/frontend/staff.html';
if (fs.existsSync(staffPath)) {
  let content = fs.readFileSync(staffPath, 'utf8');

  // Remove the Ink card HTML block
  const inkCardHTML = `        <!-- Ink -->
        <div style="background:white;border:1.5px solid var(--border);border-radius:16px;padding:1.5rem;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:1rem;">
            <span style="font-size:1.75rem;"></span>
            <div>
              <div style="font-size:0.75rem;font-weight:700;color:var(--gray-400);text-transform:uppercase;letter-spacing:1px;">Ink Level</div>
              <div id="inkLevelCount" style="font-size:2rem;font-weight:900;color:var(--navy);">—</div>
            </div>
          </div>
          <div style="background:#f0f2f7;border-radius:50px;height:12px;overflow:hidden;margin-bottom:0.5rem;">
            <div id="inkProgressBar" style="height:100%;border-radius:50px;background:linear-gradient(90deg,#3b82f6,#1d4ed8);transition:width 0.5s ease;width:0%;"></div>
          </div>
          <div id="inkStatusLabel" style="font-size:0.78rem;font-weight:700;color:var(--gray-400);">Loading...</div>
        </div>`;
  content = content.replace(inkCardHTML, '');

  // Remove the JS block for updating Ink status
  const inkJSBlock = `        // Ink
        const inkLevel = parseFloat(data.ink.level) || 0;
        document.getElementById('inkLevelCount').textContent = \`\${inkLevel.toFixed(1)}%\`;
        const inkBar = document.getElementById('inkProgressBar');
        inkBar.style.width = inkLevel + '%';
        if (inkLevel <= 10) {
          inkBar.style.background = 'linear-gradient(90deg,#ef4444,#dc2626)';
          document.getElementById('inkStatusLabel').textContent = 'CRITICAL — Replace cartridge!';
          document.getElementById('inkStatusLabel').style.color = '#ef4444';
        } else if (inkLevel <= 25) {
          inkBar.style.background = 'linear-gradient(90deg,#f59e0b,#d97706)';
          document.getElementById('inkStatusLabel').textContent = 'WARNING — Low ink';
          document.getElementById('inkStatusLabel').style.color = '#d97706';
        } else {
          inkBar.style.background = 'linear-gradient(90deg,#3b82f6,#1d4ed8)';
          document.getElementById('inkStatusLabel').textContent = 'Good — Ink adequate';
          document.getElementById('inkStatusLabel').style.color = '#1d4ed8';
        }`;
  content = content.replace(inkJSBlock, '');

  // Change typeLabel for pending deliveries
  content = content.replace(
    'const typeLabel = d.type === \'paper\' ? `${d.sheets} sheets of paper` : `+${d.levelAdded}% ink`;',
    'const typeLabel = `${d.sheets} sheets of paper`;'
  );

  fs.writeFileSync(staffPath, content);
  console.log('Cleaned staff.html');
}

// ── CLEAN RESOURCES.HTML ──
const resPath = 'c:/Users/KAVIN%20GS/OneDrive/Desktop/printnsta%20project/frontend/resources.html'.replace(/%20/g, ' ');
if (fs.existsSync(resPath)) {
  let content = fs.readFileSync(resPath, 'utf8');

  // Remove description meta text mentioning ink
  content = content.replace('Manage ink and paper resources', 'Manage paper resources');

  // Remove status card styling for ink
  content = content.replace('.status-card.ink::before { background: linear-gradient(90deg,#3b82f6,#1d4ed8); }', '');

  // Remove inkGrad SVG linearGradient
  content = content.replace(/<linearGradient id="inkGrad"[^]*?<\/linearGradient>/, '');

  // Remove the inkCard HTML
  const inkCardHTML = `      <div class="status-card ink" id="inkCard">
        <div class="wheel-container">
          <svg class="wheel-svg" viewBox="0 0 120 120">
            <circle class="wheel-track" cx="60" cy="60" r="54"/>
            <circle class="wheel-fill" id="inkWheelFill" cx="60" cy="60" r="54" stroke="#3b82f6"/>
          </svg>
          <div class="wheel-center">
            <div class="wheel-value" id="inkWheelValue">&#8212;</div>
            <div class="wheel-unit">%</div>
          </div>
        </div>
        <div class="status-resource-title">Ink Cartridge</div>
        <span class="status-badge-chip chip-good" id="inkChip">Loading...</span>
        <div class="status-meta" id="inkMeta">&#8212;</div>
      </div>`;
  content = content.replace(inkCardHTML, '');

  // Remove Supply Ink form HTML
  const supplyInkHTML = `        <div class="panel" style="margin-bottom:0;">
          <div class="panel-title">Supply Ink Cartridge</div>
          <div class="supply-form">
            <label>Ink Level Added (%)</label>
            <input type="number" id="inkLevelInput" placeholder="e.g. 100" min="1" max="100">
            <label>Cartridge ID / Serial (optional)</label>
            <input type="text" id="cartridgeIdInput" placeholder="e.g. HP-CF217A">
            <label>Note (optional)</label>
            <input type="text" id="inkNoteInput" placeholder="e.g. New black toner">
            <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
              <button class="btn-primary" onclick="supplyInk(false)" style="flex: 1; background: linear-gradient(135deg,#2563eb,#1d4ed8); border-color: #1d4ed8;">Send to Staff</button>
              <button class="btn-primary" onclick="supplyInk(true)" style="flex: 1; background: var(--gray-600); border-color: var(--gray-600);">Add Directly to Printer</button>
            </div>
          </div>
        </div>`;
  content = content.replace(supplyInkHTML, '');

  // Remove History Ink table HTML
  const historyInkHTML = `      <div class="panel">
        <div class="panel-title">Ink Supply History</div>
        <div style="overflow-x:auto;">
          <table class="history-table">
            <thead><tr><th>Level Added</th><th>Cartridge ID</th><th>Supplied By</th><th>Confirmed By</th><th>Confirmed At</th><th>Note</th></tr></thead>
            <tbody id="inkHistoryBody"><tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--gray-400);">Loading...</td></tr></tbody>
          </table>
        </div>
      </div>`;
  content = content.replace(historyInkHTML, '');

  // Remove Override Ink HTML
  const overrideInkHTML = `      <div class="panel" style="margin-bottom:0;">
        <div class="panel-title">Override Ink</div>
        <div class="supply-form" style="max-width:400px;">
          <label style="font-size:0.82rem;font-weight:700;color:var(--gray-600);text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:8px;">Set Ink Level (%)</label>
          <input type="number" id="overrideInkInput" placeholder="e.g. 75" min="0" max="100">
          <button class="btn-primary" onclick="overrideInk()" style="background:#2563eb;border-color:#1d4ed8;">Set Ink</button>
        </div>
      </div>`;
  content = content.replace(overrideInkHTML, '');

  // Remove status JS for ink
  content = content.replace('var paper = data.paper, ink = data.ink, pending = data.pending||[];', 'var paper = data.paper, pending = data.pending||[];');

  const inkStatusJS = `        var inkLevel = parseFloat(ink.level)||0;
        document.getElementById('inkWheelValue').textContent = inkLevel.toFixed(1);
        setWheel('inkWheelFill', inkLevel);
        var ic = document.getElementById('inkChip'), ia = document.getElementById('alertBarInk');
        var iCard = document.getElementById('inkCard');
        if (inkLevel <= 10) {
          document.getElementById('inkWheelFill').style.stroke = '#ef4444';
          ic.className = 'status-badge-chip chip-critical'; ic.textContent = 'CRITICAL - Replace Now';
          iCard.className = 'status-card ink critical'; ia.className = 'resource-alert-bar critical';
          ia.innerHTML = '<strong>CRITICAL:</strong>&nbsp;Ink at '+inkLevel.toFixed(1)+'%! Replace immediately.';
        } else if (inkLevel <= 25) {
          document.getElementById('inkWheelFill').style.stroke = '#f59e0b';
          ic.className = 'status-badge-chip chip-warning'; ic.textContent = 'LOW - Order Ink';
          iCard.className = 'status-card ink warn'; ia.className = 'resource-alert-bar warning';
          ia.innerHTML = '<strong>WARNING:</strong>&nbsp;Ink level low at '+inkLevel.toFixed(1)+'%.';
        } else {
          document.getElementById('inkWheelFill').style.stroke = '#3b82f6';
          ic.className = 'status-badge-chip chip-good'; ic.textContent = 'Good';
          iCard.className = 'status-card ink'; ia.className = 'resource-alert-bar'; ia.style.display = 'none';
        }
        var iLastDate = ink.lastSupplied ? new Date(ink.lastSupplied).toLocaleDateString('en-IN') : 'Never';
        document.getElementById('inkMeta').textContent = 'Last supplied: '+iLastDate+(ink.lastSuppliedBy?' by '+ink.lastSuppliedBy:'');`;
  content = content.replace(inkStatusJS, '');

  // Remove history table JS render for ink
  const inkHistoryJS = `        var ib = document.getElementById('inkHistoryBody');
        ib.innerHTML = data.inkHistory&&data.inkHistory.length ? data.inkHistory.map(function(h){
          return '<tr><td><strong>+'+h.levelAdded+'%</strong></td><td>'+(h.cartridgeId||'&mdash;')+'</td><td>'+(h.suppliedBy||'&mdash;')+'</td><td>'+(h.confirmedBy||'&mdash;')+'</td><td>'+(h.confirmedAt?new Date(h.confirmedAt).toLocaleString('en-IN'):'&mdash;')+'</td><td style="color:var(--gray-400);">'+(h.note||'&mdash;')+'</td></tr>';
        }).join('') : '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--gray-400);">No records yet</td></tr>';`;
  content = content.replace(inkHistoryJS, '');

  // Remove supplyInk & overrideInk JS functions
  const supplyInkFn = `    async function supplyInk(direct = false) {
      var level = document.getElementById('inkLevelInput').value;
      var cartId = document.getElementById('cartridgeIdInput').value;
      var note = document.getElementById('inkNoteInput').value;
      if (!level||parseFloat(level)<=0) { showAlert('Enter valid ink level.','error'); return; }
      try {
        var r = await fetch(API_BASE+'/resources/supply-ink',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({levelAdded:parseFloat(level),cartridgeId:cartId,note:note,direct:direct})});
        var d = await r.json();
        if (d.success) { showAlert(d.message); document.getElementById('inkLevelInput').value=''; document.getElementById('cartridgeIdInput').value=''; document.getElementById('inkNoteInput').value=''; loadStatus(); }
        else showAlert(d.message||'Failed.','error');
      } catch(e) { showAlert('Network error','error'); }
    }`;
  content = content.replace(supplyInkFn, '');

  const overrideInkFn = `    async function overrideInk() {
      var v = document.getElementById('overrideInkInput').value;
      if (v===''||parseFloat(v)<0||parseFloat(v)>100) { showAlert('Invalid value (0-100).','error'); return; }
      if (!confirm('Override ink level to '+v+'%?')) return;
      try {
        var r = await fetch(API_BASE+'/resources/ink/override',{method:'PUT',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({level:parseFloat(v)})});
        var d = await r.json();
        if (d.success) { showAlert(d.message); loadStatus(); } else showAlert(d.message||'Error','error');
      } catch(e) { showAlert('Network error','error'); }
    }`;
  content = content.replace(overrideInkFn, '');

  // Remove alertBarInk container HTML element
  content = content.replace('<div id="alertBarInk" class="resource-alert-bar"></div>', '');

  // Update layout to 1 column properly
  content = content.replace('<div class="status-grid">', '<div class="status-grid" style="grid-template-columns: 1fr;">');

  fs.writeFileSync(resPath, content);
  console.log('Cleaned resources.html');
}
