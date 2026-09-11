// ============================================================
// EXCEL İÇE AKTARIM FONKSİYONLARI
// ============================================================

const IMPORT_FIELD_DEFS = [
  { key: 'name', label: 'Ürün Adı', required: true, guesses: ['ürün adı','urun adi','stok adı','stok adi','açıklama','aciklama','ürün','urun','mal adı','mal adi','isim','ad','stok tanımı','stok tanimi','name'] },
  { key: 'barcode', label: 'Barkod / Stok Kodu', required: false, guesses: ['barkod','barcode','stok kodu','kod','ean','barkod no','barkod numarası','barkod numarasi','ürün kodu','urun kodu'] },
  { key: 'qty', label: 'Miktar / Stok Adedi', required: false, guesses: ['miktar','stok miktarı','stok miktari','mevcut stok','mevcut','adet','qty','stok adedi','kalan'] },
  { key: 'price', label: 'Satış Fiyatı', required: false, guesses: ['satış fiyatı','satis fiyati','satış fiyat','satis fiyat','perakende','birim fiyat','fiyat','price'] },
  { key: 'cost', label: 'Alış / Geliş Fiyatı', required: false, guesses: ['alış fiyatı','alis fiyati','geliş fiyatı','gelis fiyati','maliyet','alım fiyatı','alim fiyati','cost'] },
  { key: 'category', label: 'Kategori / Grup', required: false, guesses: ['kategori','grup','stok grubu','sınıf','sinif','category'] },
  { key: 'brand', label: 'Marka', required: false, guesses: ['marka','brand'] },
  { key: 'unit', label: 'Ölçü Birimi', required: false, guesses: ['birim','ölçü birimi','olcu birimi','ölçü','olcu','unit'] },
  { key: 'vat', label: 'KDV Oranı', required: false, guesses: ['kdv','kdv oranı','kdv orani','vat','tax'] },
  { key: 'profit', label: 'Hedef Kâr (%)', required: false, guesses: ['kar','kâr','hedef kar','hedef kâr','kar oranı','kar orani','profit'] }
];

function normalizeHeaderTr(h) {
  return String(h || '').toLocaleLowerCase('tr-TR').replace(/[^a-z0-9ğüşıöç\s]/gi, ' ').replace(/\s+/g, ' ').trim();
}

function guessColumnForField(headers, guesses) {
  const normHeaders = headers.map(h => ({ raw: h, norm: normalizeHeaderTr(h) }));
  for (const g of guesses) {
    const hit = normHeaders.find(h => h.norm === g || h.norm.includes(g));
    if (hit) return hit.raw;
  }
  return '';
}

function renderImportMapping(headers) {
  importHeaders = headers;
  const box = document.getElementById('import-mapping-section');
  if (!box) return;

  let html = `<p style="font-size:11px; color:var(--info); font-weight:600; margin:0 0 10px;">🔗 Sütunları Eşleştirin — dosyanızdaki hangi sütun bizim hangi alanımıza karşılık geliyor? Sistem otomatik tahmin etti, yanlışsa aşağıdan kendiniz değiştirebilirsiniz:</p>`;
  html += `<div class="form-row" style="grid-template-columns: 1fr 1fr;">`;
  IMPORT_FIELD_DEFS.forEach(f => {
    const guess = guessColumnForField(headers, f.guesses);
    html += `
      <div>
        <label>${f.label}${f.required ? ' *' : ''}</label>
        <select id="map-${f.key}" onchange="onImportMappingChange()">
          <option value="">— Kullanma —</option>
          ${headers.map(h => `<option value="${h}" ${h === guess ? 'selected' : ''}>${h}</option>`).join('')}
        </select>
      </div>
    `;
  });
  html += `</div>`;
  html += `<div id="import-barcode-warning" style="display:none; margin-top:10px; padding:8px; background:#FEF3C7; border:1px solid #F59E0B; border-radius:4px; font-size:11px; color:var(--charcoal);">⚠️ <b>Barkod sütunu seçilmedi!</b> Dosyanızdaki gerçek barkodlar kaydedilmeyecek, tüm ürünlere sistem tarafından rastgele kod atanacak. Barkodlarınız varsa yukarıdan "Barkod / Stok Kodu" alanı için doğru sütunu seçin.</div>`;
  box.innerHTML = html;
  box.style.display = 'block';
  onImportMappingChange();
}

function onImportMappingChange() {
  const barcodeSel = document.getElementById('map-barcode');
  const warnEl = document.getElementById('import-barcode-warning');
  if (warnEl) {
    warnEl.style.display = (barcodeSel && !barcodeSel.value) ? 'block' : 'none';
  }
  if (pendingImportRows) renderImportPreview(pendingImportRows);
}

function getMappedValue(row, fieldKey) {
  const sel = document.getElementById(`map-${fieldKey}`);
  if (!sel || !sel.value) return '';
  return row[sel.value];
}

function downloadImportTemplate() {
  const headers = ["Ürün Adı", "Miktar", "Birim Fiyat", "Ölçü Birimi", "Kategori", "Marka", "Geliş Fiyatı", "KDV Oranı", "Hedef Kar", "Barkod (boş bırakılabilir)"];
  const example1 = ["Akfix Silikon 280ml", 24, 65.5, "Adet", "Silikon & Mastik", "BMS", 40, 20, 25, ""];
  const example2 = ["8mm Çelik Vida (100'lü)", 50, 32, "Adet", "Vida & Civata", "Kale", 18, 20, 30, ""];
  const ws = XLSX.utils.aoa_to_sheet([headers, example1, example2]);
  ws['!cols'] = headers.map(() => ({ wch: 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sablon");
  XLSX.writeFile(wb, "Urun_Aktarim_Sablonu.xlsx");
}

let pendingImportRows = null;
let importHeaders = [];
let importRowPlans = null;

document.getElementById('bulk-import-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const statusEl = document.getElementById('bulk-import-status');
  const startBtn = document.getElementById('bulk-import-start-btn');
  statusEl.textContent = "Dosya okunuyor...";
  startBtn.style.display = 'none';
  pendingImportRows = null;
  importRowPlans = null;
  document.getElementById('import-mapping-section').style.display = 'none';
  document.getElementById('import-mapping-section').innerHTML = '';
  document.getElementById('import-conflict-section').style.display = 'none';
  document.getElementById('import-conflict-section').innerHTML = '';

  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const data = new Uint8Array(evt.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      if (rows.length === 0) {
        statusEl.innerHTML = `<span style="color:var(--rust);">Dosyada okunacak satır bulunamadı.</span>`;
        return;
      }
      pendingImportRows = rows;
      const headers = Object.keys(rows[0]);
      renderImportMapping(headers);
      statusEl.innerHTML = `<b>${rows.length}</b> satır okundu. Yukarıdaki sütun eşleştirmesini kontrol edip önizlemeye bakın, sonra butona basın.`;
      startBtn.style.display = 'inline-block';
      renderImportPreview(rows);
    } catch (err) {
      statusEl.innerHTML = `<span style="color:var(--rust);">Dosya okunamadı: ${err.message}</span>`;
    }
  };
  reader.readAsArrayBuffer(file);
});

function renderImportPreview(rows) {
  const box = document.getElementById('bulk-import-preview');
  const preview = rows.slice(0, 5);
  let html = `<div style="overflow-x:auto; margin-top:10px;"><table style="width:100%; font-size:11px; border-collapse:collapse; min-width:400px;">
    <tr style="background:var(--bg); text-align:left;"><th style="padding:5px;">Ürün Adı</th><th style="padding:5px;">Barkod</th><th style="padding:5px;">Miktar</th><th style="padding:5px;">Fiyat</th><th style="padding:5px;">Kategori</th></tr>`;
  preview.forEach(r => {
    const name = getMappedValue(r, 'name') || '<span style="color:var(--rust);">BOŞ</span>';
    const barcode = getMappedValue(r, 'barcode') || '-';
    const qty = getMappedValue(r, 'qty') || 0;
    const price = getMappedValue(r, 'price') || 0;
    const category = getMappedValue(r, 'category') || '-';
    html += `<tr style="border-top:1px solid var(--steel-line);"><td style="padding:5px;">${name}</td><td style="padding:5px; font-family:'IBM Plex Mono';">${barcode}</td><td style="padding:5px;">${qty}</td><td style="padding:5px;">${price}</td><td style="padding:5px;">${category}</td></tr>`;
  });
  html += `</table></div>`;
  if (rows.length > 5) html += `<p style="font-size:10px; color:var(--steel); margin-top:4px;">...ve ${rows.length - 5} satır daha</p>`;
  box.innerHTML = html;
}

function generateUniqueImportCode(usedCodes) {
  let code;
  do {
    code = "RYH-" + Math.floor(100000 + Math.random() * 900000);
  } while (productsData[code] || usedCodes.has(code));
  usedCodes.add(code);
  return code;
}

function analyzeImportConflicts() {
  if (currentRole !== 'admin' || !pendingImportRows) return;

  const nameSel = document.getElementById('map-name');
  if (!nameSel || !nameSel.value) {
    alert('Lütfen en azından "Ürün Adı" alanı için dosyanızdaki hangi sütunun kullanılacağını seçin.');
    return;
  }

  importRowPlans = [];
  const seenBarcodesInFile = new Set();

  pendingImportRows.forEach((row, idx) => {
    const name = String(getMappedValue(row, 'name') || '').trim();
    const barcode = String(getMappedValue(row, 'barcode') || '').trim().toUpperCase();

    if (!name) {
      importRowPlans.push({ idx, row, name, barcode, status: 'invalid', note: 'Ürün adı boş' });
      return;
    }

    if (barcode) {
      if (productsData[barcode]) {
        importRowPlans.push({ idx, row, name, barcode, status: 'barcode_conflict', matchCode: barcode, matchProduct: productsData[barcode], action: 'merge' });
        return;
      }
      if (seenBarcodesInFile.has(barcode)) {
        importRowPlans.push({ idx, row, name, barcode, status: 'invalid', note: `Dosya içinde "${barcode}" barkodu tekrar ediyor` });
        return;
      }
      seenBarcodesInFile.add(barcode);
    }

    const matches = findSimilarProducts(name, 1);
    if (matches.length > 0 && matches[0].score >= 0.80) {
      importRowPlans.push({ idx, row, name, barcode, status: 'name_conflict', matchCode: matches[0].product.code, matchProduct: matches[0].product, matchScore: matches[0].score, action: 'new' });
      return;
    }

    importRowPlans.push({ idx, row, name, barcode, status: 'new' });
  });

  renderImportConflictReview();
}

function applyGlobalBarcodeAction() {
  const val = document.getElementById('global-barcode-conflict-action').value;
  importRowPlans.filter(p => p.status === 'barcode_conflict').forEach(p => p.action = val);
}

function applyGlobalNameAction() {
  const val = document.getElementById('global-name-conflict-action').value;
  importRowPlans.filter(p => p.status === 'name_conflict').forEach(p => p.action = val);
  showToast(`Tüm isim benzerliği çakışmaları için "${val}" seçeneği uygulandı.`);
}

function renderImportConflictReview() {
  const box = document.getElementById('import-conflict-section');
  if (!box || !importRowPlans) return;

  const invalidRows = importRowPlans.filter(p => p.status === 'invalid');
  const newRows = importRowPlans.filter(p => p.status === 'new');
  const barcodeConflicts = importRowPlans.filter(p => p.status === 'barcode_conflict');
  const nameConflicts = importRowPlans.filter(p => p.status === 'name_conflict');

  let html = `<div style="background:#F1F5F9; border:1px solid var(--steel-line); border-radius:6px; padding:14px; margin-top:12px;">`;
  html += `<h4 style="margin:0 0 8px; font-family:'Oswald';">📋 Ön Kontrol Sonucu</h4>`;
  html += `<p style="font-size:12px; margin:2px 0;">✅ <b>${newRows.length}</b> satır tamamen yeni ürün olarak eklenecek.</p>`;
  if (invalidRows.length) html += `<p style="font-size:12px; margin:2px 0; color:var(--rust);">⛔ <b>${invalidRows.length}</b> satır atlanacak (isim boş veya dosya içinde tekrar eden barkod).</p>`;

  if (barcodeConflicts.length) {
    html += `<div style="margin-top:12px; padding-top:10px; border-top:1px dashed var(--steel-line);">
      <p style="font-size:12px; font-weight:600; color:var(--rust); margin-bottom:6px;">⚠️ ${barcodeConflicts.length} satırın barkodu, sistemde zaten kayıtlı bir ürünle birebir aynı. Bu satırlarda ne yapılsın?</p>
      <select id="global-barcode-conflict-action" onchange="applyGlobalBarcodeAction()">
        <option value="merge">Stok miktarlarını topla (mevcut stok + gelen miktar)</option>
        <option value="overwrite">Var olan ürünün bilgilerini güncelle, miktarı yeni değerle DEĞİŞTİR</option>
        <option value="skip">Bu satırları atla, dokunma</option>
      </select>
      <div style="max-height:150px; overflow-y:auto; margin-top:8px; font-size:11px;">
        ${barcodeConflicts.map(p => `<div style="padding:3px 0; border-top:1px dashed var(--steel-line);">${p.name} <span style="color:var(--steel); font-family:'IBM Plex Mono';">(${p.barcode})</span> → sistemde kayıtlı: <b>${p.matchProduct.name}</b> (mevcut stok: ${p.matchProduct.qty ?? 0})</div>`).join('')}
      </div>
    </div>`;
  }

  if (nameConflicts.length) {
    html += `<div style="margin-top:12px; padding-top:10px; border-top:1px dashed var(--steel-line);">
      <p style="font-size:12px; font-weight:600; color:var(--info); margin-bottom:6px;">
        ⚡ Tümüne Uygula (${nameConflicts.length} adet isim benzerliği çakışması için)
      </p>
      <select id="global-name-conflict-action" onchange="applyGlobalNameAction()" style="margin-right:10px;">
        <option value="new" selected>Hepsini Yeni Ürün Olarak Ekle</option>
        <option value="merge">Hepsini Mevcut Ürüne Ekle (Stoğu Topla)</option>
        <option value="skip">Hepsini Atlama</option>
      </select>
      <div style="max-height:240px; overflow-y:auto; margin-top:6px;">
        ${nameConflicts.map(p => `
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:6px 0; border-top:1px dashed var(--steel-line); font-size:11px; flex-wrap:wrap;">
            <span>"${p.name}" ≈ sistemde <b>${p.matchProduct.name}</b> <span style="color:var(--steel); font-family:'IBM Plex Mono';">(${p.matchProduct.code}, stok: ${p.matchProduct.qty ?? 0})</span></span>
            <select style="width:auto; flex-shrink:0;" onchange="importRowPlans[${p.idx}].action=this.value">
              <option value="new" ${p.action === 'new' ? 'selected' : ''}>Farklı ürün, yeni olarak ekle</option>
              <option value="merge" ${p.action === 'merge' ? 'selected' : ''}>Aynı ürün, stoğu bu ürüne ekle</option>
              <option value="skip" ${p.action === 'skip' ? 'selected' : ''}>Bu satırı atla</option>
            </select>
          </div>
        `).join('')}
      </div>
    </div>`;
  }

  html += `<button class="btn btn-success" style="margin-top:14px;" onclick="finalizeBulkImport()">✅ Onayla ve İçe Aktar</button>`;
  html += `</div>`;
  box.innerHTML = html;
  box.style.display = 'block';
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function finalizeBulkImport() {
  if (currentRole !== 'admin' || !importRowPlans) return;
  if (!confirm(`Seçtiğiniz ayarlara göre içe aktarım başlatılacak. Onaylıyor musunuz?`)) return;

  const statusEl = document.getElementById('bulk-import-status');
  const updates = {};
  const qtyIncrements = [];
  const usedCodes = new Set();
  const errorRows = [];
  let newCount = 0, mergedCount = 0, overwrittenCount = 0, skippedCount = 0;

  importRowPlans.forEach(p => {
    if (p.status === 'invalid') { errorRows.push(`Satır ${p.idx + 2}: ${p.note}, atlandı`); skippedCount++; return; }

    const row = p.row;
    const costRaw = getMappedValue(row, 'cost');
    const profitRaw = getMappedValue(row, 'profit');
    const importedQty = parseFloat(getMappedValue(row, 'qty')) || 0;
    const importedPrice = parseFloat(getMappedValue(row, 'price')) || 0;
    const importedUnit = String(getMappedValue(row, 'unit') || 'Adet').trim() || 'Adet';
    const importedCategory = String(getMappedValue(row, 'category') || 'Diğer').trim() || 'Diğer';
    const importedBrand = String(getMappedValue(row, 'brand') || '').trim() || null;
    const importedCost = (costRaw !== '' && costRaw != null) ? (Math.max(0, parseFloat(costRaw)) || 0) : null;
    const importedVat = parseFloat(getMappedValue(row, 'vat')) || 0;
    const importedProfit = (profitRaw !== '' && profitRaw != null) ? (parseFloat(profitRaw) || 0) : null;

    if (p.status === 'new') {
      let code = p.barcode;
      if (!code) {
        code = generateUniqueImportCode(usedCodes);
      } else if (productsData[code] || usedCodes.has(code)) {
        errorRows.push(`Satır ${p.idx + 2}: "${code}" kodu çakıştı, atlandı`);
        skippedCount++;
        return;
      } else {
        usedCodes.add(code);
      }
      updates[code] = {
        name: p.name, qty: importedQty, price: importedPrice, unit: importedUnit,
        category: importedCategory, brand: importedBrand, costPrice: importedCost,
        vat: importedVat, targetProfit: importedProfit, code,
        lastPriceUpdate: new Date().toISOString(), lastUpdatedBy: 'Yönetici (Toplu Aktarım)'
      };
      newCount++;
      return;
    }

    const action = p.action || 'merge';
    const matchCode = p.matchCode;

    if (action === 'skip') { skippedCount++; return; }

    if (action === 'overwrite') {
      updates[matchCode] = {
        name: p.name, qty: importedQty, price: importedPrice, unit: importedUnit,
        category: importedCategory, brand: importedBrand, costPrice: importedCost,
        vat: importedVat, targetProfit: importedProfit, code: matchCode,
        lastPriceUpdate: new Date().toISOString(), lastUpdatedBy: 'Yönetici (Toplu Aktarım - Güncellendi)'
      };
      overwrittenCount++;
      return;
    }

    qtyIncrements.push({ code: matchCode, qty: importedQty });
    mergedCount++;
  });

  statusEl.textContent = "Yükleniyor, lütfen bekleyin... (bu birkaç saniye sürebilir)";

  const finishUp = () => {
    let resultHtml = `<span style="color:var(--success); font-weight:bold;">✅ Tamamlandı: ${newCount} yeni ürün eklendi, ${mergedCount} ürünün stoğu toplandı, ${overwrittenCount} ürün güncellendi.</span>`;
    if (skippedCount > 0 || errorRows.length > 0) {
      resultHtml += `<div style="margin-top:6px; color:var(--rust); font-size:11px;">${skippedCount} satır atlandı.${errorRows.length ? '<br>' + errorRows.slice(0, 15).join('<br>') : ''}</div>`;
    }
    statusEl.innerHTML = resultHtml;
    pendingImportRows = null;
    importRowPlans = null;
    document.getElementById('bulk-import-preview').innerHTML = '';
    document.getElementById('bulk-import-file').value = '';
    document.getElementById('import-mapping-section').style.display = 'none';
    document.getElementById('import-mapping-section').innerHTML = '';
    document.getElementById('import-conflict-section').style.display = 'none';
    document.getElementById('import-conflict-section').innerHTML = '';
    document.getElementById('bulk-import-start-btn').style.display = 'none';
    showToast(`İçe aktarım tamamlandı: ${newCount} yeni, ${mergedCount} birleştirildi, ${overwrittenCount} güncellendi.`);
  };

  db.update(updates, (err) => {
    if (err) {
      statusEl.innerHTML = `<span style="color:var(--rust);">Yükleme hatası: ${err.message}</span>`;
      return;
    }
    if (qtyIncrements.length === 0) { finishUp(); return; }

    let remaining = qtyIncrements.length;
    let hadError = false;
    qtyIncrements.forEach(inc => {
      db.child(inc.code).child('qty').transaction((cur) => Number(cur || 0) + Number(inc.qty), (err2) => {
        if (err2) hadError = true;
        remaining--;
        if (remaining === 0) {
          if (hadError) statusEl.innerHTML = `<span style="color:var(--rust);">Bazı stok toplama işlemlerinde hata oluştu, lütfen kontrol edin.</span>`;
          finishUp();
        }
      });
    });
  });
}

// ============================================================
// BARCODE FIX FONKSİYONLARI
// ============================================================

let pendingBarcodeFixRows = null;
let barcodeFixPlans = null;

document.getElementById('barcode-fix-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const statusEl = document.getElementById('barcode-fix-status');
  const analyzeBtn = document.getElementById('barcode-fix-analyze-btn');
  statusEl.textContent = "Dosya okunuyor...";
  analyzeBtn.style.display = 'none';
  pendingBarcodeFixRows = null;
  barcodeFixPlans = null;
  document.getElementById('barcode-fix-review').style.display = 'none';
  document.getElementById('barcode-fix-review').innerHTML = '';

  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const data = new Uint8Array(evt.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      if (rows.length === 0) {
        statusEl.innerHTML = `<span style="color:var(--rust);">Dosyada okunacak satır bulunamadı.</span>`;
        return;
      }
      pendingBarcodeFixRows = rows;
      const headers = Object.keys(rows[0]);
      renderBarcodeFixMapping(headers);
      statusEl.innerHTML = `<b>${rows.length}</b> satır okundu. Sütun eşleştirmesini kontrol edip "Eşleşmeleri Bul" butonuna basın.`;
      analyzeBtn.style.display = 'inline-block';
    } catch (err) {
      statusEl.innerHTML = `<span style="color:var(--rust);">Dosya okunamadı: ${err.message}</span>`;
    }
  };
  reader.readAsArrayBuffer(file);
});

function renderBarcodeFixMapping(headers) {
  const box = document.getElementById('barcode-fix-mapping');
  if (!box) return;
  const nameGuess = guessColumnForField(headers, IMPORT_FIELD_DEFS.find(f => f.key === 'name').guesses);
  const barcodeGuess = guessColumnForField(headers, IMPORT_FIELD_DEFS.find(f => f.key === 'barcode').guesses);
  box.innerHTML = `
    <p style="font-size:11px; color:var(--info); font-weight:600; margin:0 0 8px;">🔗 Sütunları Eşleştirin:</p>
    <div class="form-row" style="grid-template-columns: 1fr 1fr;">
      <div>
        <label>Ürün Adı Sütunu *</label>
        <select id="bf-map-name">
          <option value="">— Seçin —</option>
          ${headers.map(h => `<option value="${h}" ${h === nameGuess ? 'selected' : ''}>${h}</option>`).join('')}
        </select>
      </div>
      <div>
        <label>Barkod Sütunu *</label>
        <select id="bf-map-barcode">
          <option value="">— Seçin —</option>
          ${headers.map(h => `<option value="${h}" ${h === barcodeGuess ? 'selected' : ''}>${h}</option>`).join('')}
        </select>
      </div>
    </div>
  `;
  box.style.display = 'block';
}

function analyzeBarcodeFix() {
  if (currentRole !== 'admin' || !pendingBarcodeFixRows) return;
  const nameCol = document.getElementById('bf-map-name').value;
  const barcodeCol = document.getElementById('bf-map-barcode').value;
  if (!nameCol || !barcodeCol) { alert('Lütfen hem Ürün Adı hem de Barkod sütununu seçin.'); return; }

  barcodeFixPlans = [];
  const usedNewBarcodes = new Set();

  pendingBarcodeFixRows.forEach((row) => {
    const name = String(row[nameCol] || '').trim();
    const barcode = String(row[barcodeCol] || '').trim().toUpperCase();
    if (!name || !barcode) return;
    if (productsData[barcode]) return;
    if (usedNewBarcodes.has(barcode)) return;

    const normTarget = normalizeTr(name);
    let matchProduct = Object.values(productsData).find(p => p.code.startsWith('RYH-') && normalizeTr(p.name) === normTarget);

    if (!matchProduct) {
      const similar = findSimilarProducts(name, 1);
      if (similar.length > 0 && similar[0].score >= 0.8 && similar[0].product.code.startsWith('RYH-')) {
        matchProduct = similar[0].product;
      }
    }

    if (matchProduct) {
      usedNewBarcodes.add(barcode);
      barcodeFixPlans.push({ name, barcode, oldCode: matchProduct.code, matchProduct, include: true });
    }
  });

  renderBarcodeFixReview();
}

function renderBarcodeFixReview() {
  const box = document.getElementById('barcode-fix-review');
  if (!box || !barcodeFixPlans) return;

  if (barcodeFixPlans.length === 0) {
    box.innerHTML = `<p style="font-size:12px; color:var(--steel); margin-top:12px;">Eşleşme bulunamadı. Ürün adlarının dosyanızla sistemdekiyle örtüştüğünden ve barkodların sistemde henüz kayıtlı olmadığından emin olun.</p>`;
    box.style.display = 'block';
    return;
  }

  let html = `<div style="background:#F1F5F9; border:1px solid var(--steel-line); border-radius:6px; padding:14px; margin-top:12px;">`;
  html += `<p style="font-size:12px; font-weight:600; margin-bottom:8px;">🔗 ${barcodeFixPlans.length} ürün için eşleşme bulundu. Onaylamak istemediklerinizin işaretini kaldırın:</p>`;
  html += `<div style="max-height:280px; overflow-y:auto;">`;
  barcodeFixPlans.forEach((p, i) => {
    html += `
      <div style="display:flex; align-items:center; gap:8px; padding:5px 0; border-top:1px dashed var(--steel-line); font-size:11px;">
        <input type="checkbox" checked style="width:auto;" onchange="barcodeFixPlans[${i}].include=this.checked">
        <span style="flex:1;">${p.matchProduct.name} <span style="color:var(--steel); font-family:'IBM Plex Mono';">(${p.oldCode})</span> → <b>${p.barcode}</b></span>
      </div>
    `;
  });
  html += `</div>`;
  html += `<button class="btn btn-success" style="margin-top:12px;" onclick="applyBarcodeFix()">✅ Seçilenlere Barkod Ata</button>`;
  html += `</div>`;
  box.innerHTML = html;
  box.style.display = 'block';
}

async function applyBarcodeFix() {
  if (currentRole !== 'admin' || !barcodeFixPlans) return;
  const toApply = barcodeFixPlans.filter(p => p.include);
  if (toApply.length === 0) { alert('Hiçbir satır seçili değil.'); return; }
  if (!confirm(`${toApply.length} ürüne barkod atanacak (kodları değişecek). Onaylıyor musunuz?`)) return;

  const statusEl = document.getElementById('barcode-fix-status');
  statusEl.textContent = "Uygulanıyor, lütfen bekleyin... (bu birkaç saniye sürebilir)";

  let success = 0, failed = 0;
  for (const p of toApply) {
    try {
      if (productsData[p.barcode]) { failed++; continue; }

      const fullData = Object.assign({}, productsData[p.oldCode], { code: p.barcode });
      await db.child(p.barcode).set(fullData);
      await db.child(p.oldCode).remove();

      try {
        const imgSnap = await dbProductImages.child(p.oldCode).once('value');
        if (imgSnap.exists()) {
          await dbProductImages.child(p.barcode).set(imgSnap.val());
          await dbProductImages.child(p.oldCode).remove();
        }
      } catch (e) { /* fotoğraf yoksa sorun değil */ }

      dbBarcodeCache.child(p.barcode).set({ name: p.name, source: 'toplu-eslesme', savedAt: new Date().toISOString() });
      productsData[p.barcode] = fullData;
      delete productsData[p.oldCode];
      success++;
    } catch (err) {
      failed++;
    }
  }

  statusEl.innerHTML = `<span style="color:var(--success); font-weight:bold;">✅ ${success} ürüne barkod atandı.</span>${failed ? `<br><span style="color:var(--rust);">${failed} üründe hata oluştu.</span>` : ''}`;
  showToast(`${success} ürüne barkod atandı!`);

  pendingBarcodeFixRows = null;
  barcodeFixPlans = null;
  document.getElementById('barcode-fix-file').value = '';
  document.getElementById('barcode-fix-mapping').style.display = 'none';
  document.getElementById('barcode-fix-mapping').innerHTML = '';
  document.getElementById('barcode-fix-review').style.display = 'none';
  document.getElementById('barcode-fix-review').innerHTML = '';
  document.getElementById('barcode-fix-analyze-btn').style.display = 'none';
  renderGrid();
}

// ============================================================
// BARCODE SCANNER FONKSİYONLARI
// ============================================================

let barcodeLookupScanner = null;

function openBarcodeLookupScanner() {
  document.getElementById('barcode-lookup-modal').style.display = 'flex';
  if (barcodeLookupScanner) return;
  barcodeLookupScanner = new Html5Qrcode("barcode-lookup-reader");
  barcodeLookupScanner.start(
    { facingMode: "environment" },
    {
      fps: 10,
      qrbox: { width: 260, height: 150 },
      formatsToSupport: [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.CODE_128
      ]
    },
    (decodedText) => {
      document.getElementById('f-barcode-lookup').value = decodedText;
      closeBarcodeLookupScanner();
      lookupBarcode();
    },
    () => {}
  ).catch((err) => {
    document.getElementById('f-barcode-lookup-status').innerHTML =
      `<span style="color:var(--rust);">Kamera açılamadı: ${err}</span>`;
  });
}

function closeBarcodeLookupScanner() {
  document.getElementById('barcode-lookup-modal').style.display = 'none';
  if (barcodeLookupScanner) {
    barcodeLookupScanner.stop().then(() => barcodeLookupScanner.clear()).catch(() => {});
    barcodeLookupScanner = null;
  }
}

let fisBarcodeScanner = null;

let _barcodeScanTarget = 'fis';
function openFisBarcodeScanner(target) {
  _barcodeScanTarget = target || 'fis';
  document.getElementById('fis-barcode-modal').style.display = 'flex';
  if (fisBarcodeScanner) return;
  fisBarcodeScanner = new Html5Qrcode("fis-barcode-reader");
  fisBarcodeScanner.start(
    { facingMode: "environment" },
    {
      fps: 10,
      qrbox: { width: 260, height: 150 },
      formatsToSupport: [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.CODE_128
      ]
    },
    (decodedText) => {
      closeFisBarcodeScanner();
      if (_barcodeScanTarget === 're-add') {
        document.getElementById('re-add-barcode').value = decodedText;
        document.getElementById('re-add-barcode-pending').value = decodedText;
      } else {
        document.getElementById('fis-barcode-lookup').value = decodedText;
        lookupFisBarcode();
      }
    },
    () => {}
  ).catch((err) => {
    document.getElementById('fis-barcode-lookup-status').innerHTML =
      `<span style="color:var(--rust);">Kamera açılamadı: ${err}</span>`;
  });
}

function closeFisBarcodeScanner() {
  document.getElementById('fis-barcode-modal').style.display = 'none';
  if (fisBarcodeScanner) {
    fisBarcodeScanner.stop().then(() => fisBarcodeScanner.clear()).catch(() => {});
    fisBarcodeScanner = null;
  }
}

function setFisPendingBarcode(code) {
  const hidden = document.getElementById('fis-barcode-pending-code');
  const visible = document.getElementById('fis-new-barcode');
  if (hidden) hidden.value = code || '';
  if (visible) visible.value = code || '';
}

// UPCItemDB'nin trial endpoint'i sadece 8/12/13/14 haneli sayısal GTIN kabul ediyor;
// format uymazsa (boşluk, tire, harf, eksik/fazla hane vb.) dış servis HTTP 400 ile
// reddediyor. Bunu göndermeden önce yakalayıp kullanıcıyı boşuna bekletmemek için.
function sanitizeBarcodeForLookup(code) {
  return (code || '').replace(/[^0-9]/g, '');
}
function isLikelyGtin(code) {
  return /^\d{8}$|^\d{12,14}$/.test(code);
}

// Açık, ücretsiz ve dünya genelinde (Türkiye dahil) barkod kapsaması daha geniş olan
// Open Food Facts veritabanı — UPCItemDB'nin bulamadığı/400 döndürdüğü barkodlar için
// ikinci bir kaynak olarak deniyoruz.
async function fetchOpenFoodFacts(code) {
  try {
    const resp = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data && data.status === 1 && data.product) {
      const title = data.product.product_name || data.product.product_name_tr || data.product.generic_name || null;
      if (!title) return null;
      return { title, brand: data.product.brands || null };
    }
    return null;
  } catch (e) {
    return null;
  }
}

async function fetchUpcItemDb(code) {
  const directUrl = `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(code)}`;
  const attempts = [
    { url: directUrl },
    { url: `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(directUrl)}` },
    { url: `https://api.allorigins.win/get?url=${encodeURIComponent(directUrl)}`, wrapper: 'allorigins' },
    { url: `https://corsproxy.io/?url=${encodeURIComponent(directUrl)}` },
    { url: `https://thingproxy.freeboard.io/fetch/${directUrl}` }
  ];

  let lastErr = null;
  for (const attempt of attempts) {
    try {
      const resp = await fetch(attempt.url);
      if (attempt.wrapper === 'allorigins') {
        const wrapperData = await resp.json();
        const httpCode = wrapperData && wrapperData.status ? wrapperData.status.http_code : resp.status;
        const bodyText = wrapperData && wrapperData.contents != null ? wrapperData.contents : '';
        return {
          ok: httpCode >= 200 && httpCode < 300,
          status: httpCode,
          json: async () => JSON.parse(bodyText),
          text: async () => bodyText
        };
      }
      return resp;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Tüm bağlantı yolları başarısız oldu.');
}

async function lookupFisBarcode() {
  const code = document.getElementById('fis-barcode-lookup').value.trim();
  const statusEl = document.getElementById('fis-barcode-lookup-status');
  if (!code) { statusEl.innerHTML = '<span style="color:var(--rust);">Önce bir barkod numarası girin ya da okutun.</span>'; return; }

  statusEl.textContent = "Aranıyor...";
  setFisPendingBarcode('');

  if (productsData[code]) {
    const p = productsData[code];
    document.getElementById('fis-product').value = `${p.code} - ${p.name}`;
    checkFisProductMatch();
    statusEl.innerHTML = `<span style="color:var(--success); font-weight:600;">✅ Bu barkod sistemde kayıtlı: "${p.name}" (stok: ${p.qty ?? 0}).</span> Malzeme alanına otomatik seçildi, miktar/fiyat girip fişe ekleyin.`;
    return;
  }

  try {
    const cacheSnap = await dbBarcodeCache.child(code).once('value');
    const cached = cacheSnap.val();
    if (cached && cached.name) {
      document.getElementById('fis-product').value = cached.name;
      checkFisProductMatch();
      setFisPendingBarcode(code);
      statusEl.innerHTML = `<span style="color:var(--success); font-weight:600;">✅ Kendi hafızamızdan tanındı: "${cached.name}"</span> (dış sorgu hakkı harcanmadı). Sistemde henüz kayıtlı değil — YENİ ÜRÜN bilgilerini doldurup fişe ekleyin, barkod (${code}) ürün kodu olarak kullanılacak.`;
      return;
    }
  } catch (e) { /* sessizce dış API'ye geç */ }

  const numericCode = sanitizeBarcodeForLookup(code);

  // Open Food Facts, dünya genelinde (Türkiye dahil) daha geniş barkod kapsaması
  // sunuyor ve format konusunda UPCItemDB kadar katı değil — önce onu deniyoruz.
  if (numericCode) {
    const off = await fetchOpenFoodFacts(numericCode);
    if (off && off.title) {
      setFisPendingBarcode(code);
      document.getElementById('fis-product').value = off.title;
      checkFisProductMatch();
      dbBarcodeCache.child(code).set({ name: off.title, source: 'openfoodfacts', savedAt: new Date().toISOString() });
      statusEl.innerHTML = `<span style="color:var(--success); font-weight:600;">✅ Dış veritabanında bulundu: "${off.title}"${off.brand ? ' — ' + off.brand : ''}.</span> YENİ ÜRÜN bilgilerini kontrol edip fişe ekleyin. Barkod (${code}) ürün kodu olarak kullanılacak.`;
      return;
    }
  }

  // UPCItemDB'nin trial endpoint'i sadece standart 8/12/13/14 haneli GTIN kabul
  // ediyor; format uymuyorsa (harf, eksik/fazla hane, boşluk vb.) HTTP 400 döndürüyor.
  // Böyle bir barkodu göndermek zaten başarısız olacağından, boşuna denemiyoruz.
  if (!isLikelyGtin(numericCode)) {
    setFisPendingBarcode(code);
    checkFisProductMatch();
    statusEl.innerHTML = `<span style="color:var(--steel);">Bu barkod ("${code}") standart bir ürün barkodu (8/12/13/14 haneli) formatında görünmüyor, dış veritabanlarında aranamadı. Malzeme adını elle girip fişe ekleyin — barkod yine de ürün kodu olarak kaydedilecek, bir dahaki sefere otomatik tanınacak.</span>`;
    return;
  }

  try {
    const resp = await fetchUpcItemDb(numericCode);

    if (resp.status === 429) {
      setFisPendingBarcode(code);
      checkFisProductMatch();
      statusEl.innerHTML = `<span style="color:var(--rust); font-weight:600;">⏳ Bugünkü ücretsiz dış sorgu hakkı dolmuş.</span> Malzeme adını elle girin — barkod (${code}) yine de ürün kodu olarak kaydedilecek.`;
      return;
    }
    if (!resp.ok) {
      setFisPendingBarcode(code);
      checkFisProductMatch();
      const reason = resp.status === 400
        ? 'Dış veritabanı bu barkodu geçersiz/tanınmayan formatta buldu (muhtemelen yerel/özel bir barkod).'
        : `Dış servis hata döndürdü (HTTP ${resp.status}).`;
      statusEl.innerHTML = `<span style="color:var(--rust); font-weight:600;">⚠️ ${reason}</span> Malzeme adını elle girin, barkod (${code}) yine de kaydedilecek.`;
      return;
    }

    const data = await resp.json();
    if (data && data.items && data.items.length > 0) {
      const item = data.items[0];
      setFisPendingBarcode(code);
      if (item.title) {
        document.getElementById('fis-product').value = item.title;
        checkFisProductMatch();
        dbBarcodeCache.child(code).set({ name: item.title, source: 'upcitemdb', savedAt: new Date().toISOString() });
      } else {
        checkFisProductMatch();
      }
      statusEl.innerHTML = `<span style="color:var(--success); font-weight:600;">✅ Dış veritabanında bulundu: "${item.title || '-'}"${item.brand ? ' — ' + item.brand : ''}.</span> YENİ ÜRÜN bilgilerini kontrol edip fişe ekleyin. Barkod (${code}) ürün kodu olarak kullanılacak.`;
    } else {
      setFisPendingBarcode(code);
      checkFisProductMatch();
      statusEl.innerHTML = `<span style="color:var(--steel);">Bu barkod hiçbir yerde bulunamadı. Malzeme adını elle girip fişe ekleyin — barkod (${code}) yine de ürün kodu olarak kaydedilecek, bir dahaki sefere otomatik tanınacak.</span>`;
    }
  } catch (err) {
    setFisPendingBarcode(code);
    checkFisProductMatch();
    statusEl.innerHTML = `<span style="color:var(--rust);">Dış arama yapılamadı: <b>${err.message || err}</b> (internet bağlantınızı kontrol edin — 5 farklı bağlantı yolu da denendi). Malzeme adını elle girip devam edebilirsiniz, barkod (${code}) yine de kaydedilecek.</span>`;
  }
}

async function lookupBarcode() {
  const code = document.getElementById('f-barcode-lookup').value.trim();
  const statusEl = document.getElementById('f-barcode-lookup-status');
  if (!code) { statusEl.innerHTML = '<span style="color:var(--rust);">Önce bir barkod numarası girin ya da okutun.</span>'; return; }

  statusEl.textContent = "Aranıyor...";
  document.getElementById('f-code').value = code;

  try {
    const cacheSnap = await dbBarcodeCache.child(code).once('value');
    const cached = cacheSnap.val();
    if (cached && cached.name) {
      document.getElementById('f-name').value = cached.name;
      statusEl.innerHTML = `<span style="color:var(--success); font-weight:600;">✅ Kendi hafızamızdan bulundu: "${cached.name}"</span> (dış sorgu hakkı harcanmadı). Kontrol edip diğer alanları doldurun.`;
      return;
    }
  } catch (e) { /* hafıza okunamadıysa sessizce dış API'ye geç */ }

  const numericCode = sanitizeBarcodeForLookup(code);

  // Open Food Facts, dünya genelinde (Türkiye dahil) daha geniş barkod kapsaması
  // sunuyor ve format konusunda UPCItemDB kadar katı değil — önce onu deniyoruz.
  if (numericCode) {
    const off = await fetchOpenFoodFacts(numericCode);
    if (off && off.title) {
      document.getElementById('f-name').value = off.title;
      dbBarcodeCache.child(code).set({ name: off.title, source: 'openfoodfacts', savedAt: new Date().toISOString() });
      statusEl.innerHTML = `<span style="color:var(--success); font-weight:600;">✅ Dış veritabanında bulundu: "${off.title}"${off.brand ? ' — ' + off.brand : ''}.</span> Kontrol edip fiyat/miktar/kategori girin. (Bu barkod artık kendi hafızamıza da kaydedildi.)`;
      return;
    }
  }

  // UPCItemDB'nin trial endpoint'i sadece standart 8/12/13/14 haneli GTIN kabul
  // ediyor; format uymuyorsa (harf, eksik/fazla hane, boşluk vb.) HTTP 400 döndürüyor.
  // Böyle bir barkodu göndermek zaten başarısız olacağından, boşuna denemiyoruz.
  if (!isLikelyGtin(numericCode)) {
    statusEl.innerHTML = `<span style="color:var(--steel);">Bu barkod ("${code}") standart bir ürün barkodu (8/12/13/14 haneli) formatında görünmüyor, dış veritabanlarında aranamadı. Barkod numarası dolduruldu — <b>ürün adını elle girip kaydedin, bir dahaki sefere bu barkod otomatik tanınacak.</b></span>`;
    return;
  }

  try {
    const resp = await fetchUpcItemDb(numericCode);

    if (resp.status === 429) {
      statusEl.innerHTML = `<span style="color:var(--rust); font-weight:600;">⏳ Bugünkü ücretsiz dış sorgu hakkın (100) dolmuş.</span> Barkod numarası dolduruldu — ürün adını elle girip kaydet, <b>kendi hafızamıza kaydedilecek ve bir dahaki sefere hiç sorgu harcamadan tanınacak.</b> Dış sorgu hakkı ertesi gün yeniden açılıyor.`;
      return;
    }

    if (!resp.ok) {
      const rawText = await resp.text().catch(() => '(okunamadı)');
      const reason = resp.status === 400
        ? 'Dış veritabanı bu barkodu geçersiz/tanınmayan formatta buldu (muhtemelen yerel/özel bir barkod).'
        : `Dış servis hata döndürdü (HTTP ${resp.status}).`;
      statusEl.innerHTML = `<span style="color:var(--rust); font-weight:600;">⚠️ ${reason}</span> Barkod numarası dolduruldu, ürün adını elle girin.
        <details style="margin-top:6px; font-size:10px; color:var(--steel);"><summary style="cursor:pointer;">Teknik detay (ekran görüntüsü alıp gönderebilirsin)</summary>${String(rawText).slice(0,300)}</details>`;
      return;
    }

    const data = await resp.json();
    if (data && data.items && data.items.length > 0) {
      const item = data.items[0];
      if (item.title) {
        document.getElementById('f-name').value = item.title;
        dbBarcodeCache.child(code).set({ name: item.title, source: 'upcitemdb', savedAt: new Date().toISOString() });
      }
      statusEl.innerHTML = `<span style="color:var(--success); font-weight:600;">✅ Dış veritabanında bulundu: "${item.title || '-'}"${item.brand ? ' — ' + item.brand : ''}.</span> Kontrol edip fiyat/miktar/kategori girin. (Bu barkod artık kendi hafızamıza da kaydedildi.)`;
    } else {
      statusEl.innerHTML = `<span style="color:var(--steel);">Ne kendi hafızamızda ne dış veritabanında bulunamadı (kod: ${data && data.code ? data.code : 'bilinmiyor'}). Barkod numarası dolduruldu — <b>ürün adını elle girip kaydedin, bir dahaki sefere bu barkod otomatik tanınacak.</b></span>`;
    }
  } catch (err) {
    statusEl.innerHTML = `<span style="color:var(--rust);">Dış arama yapılamadı: <b>${err.message || err}</b> (internet bağlantınızı kontrol edin — 5 farklı bağlantı yolu da denendi). Barkod numarası dolduruldu, ürün adını elle girip kaydedin — bir dahaki sefere otomatik tanınacak.</span>`;
  }
}

// OTOMATİK BARKOD ARAMA
function setupAutoBarcodeLookup(inputId, lookupFn) {
  const el = document.getElementById(inputId);
  if (!el) return;
  let debounceTimer = null;
  let lastAutoLookupValue = '';

  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(debounceTimer);
      const val = el.value.trim();
      if (val && val !== lastAutoLookupValue) {
        lastAutoLookupValue = val;
        lookupFn();
      }
    }
  });

  el.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const val = el.value.trim();
    if (val.length >= 8) {
      debounceTimer = setTimeout(() => {
        const current = el.value.trim();
        if (current && current === val && current !== lastAutoLookupValue) {
          lastAutoLookupValue = current;
          lookupFn();
        }
      }, 500);
    }
  });
}

setupAutoBarcodeLookup('f-barcode-lookup', lookupBarcode);
setupAutoBarcodeLookup('fis-barcode-lookup', lookupFisBarcode);

// ============================================================
// ÜRÜN İŞLEMLERİ (CRUD)
// ============================================================

function addProduct() {
  if(currentRole !== 'admin') return;
  const name = document.getElementById('f-name').value.trim();
  const qty = parseFloat(document.getElementById('f-qty').value) || 0;
  const price = parseFloat(document.getElementById('f-price').value) || 0;
  const unit = document.getElementById('f-unit').value;
  let code = document.getElementById('f-code').value.trim().toUpperCase();
  const category = document.getElementById('f-category').value;
  const brand = document.getElementById('f-brand').value;
  const costPriceRaw = document.getElementById('f-cost-price').value;
  const costPrice = costPriceRaw === '' ? null : Math.max(0, parseFloat(costPriceRaw) || 0);
  const vat = parseFloat(document.getElementById('f-vat').value) || 0;
  const targetProfit = document.getElementById('f-profit').value === '' ? null : parseFloat(document.getElementById('f-profit').value) || 0;
  
  if(!name) { alert("Lütfen ürün adını giriniz."); return; }
  if(!code) code = "RYH-" + Math.floor(100000 + Math.random() * 900000);

  db.child(code).once('value', snapshot => {
    if(snapshot.exists()) {
      alert(`HATA: '${code}' barkod numarası zaten başka bir üründe kullanılıyor!`);
    } else {
      db.child(code).set({ name, qty, price, unit, category, brand: brand || null, costPrice, vat, targetProfit, code, lastPriceUpdate: new Date().toISOString(), lastUpdatedBy: 'Yönetici' }, (error) => {
        if(!error) {
          if(qty > 0) logMovement(code, name, qty, 'YENİ ÜRÜN GİRİŞİ');
          if (!code.startsWith('RYH-')) {
            dbBarcodeCache.child(code).set({ name, source: 'manuel', savedAt: new Date().toISOString() });
          }
          dbNotifications.push({
            text: `Yeni Ürün Eklendi: ${name} (${qty} ${unit}) - Kategori: ${category}`,
            time: new Date().toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit'})
          });
          showToast("Ürün eklendi ve bildirim gönderildi!");
          document.getElementById('f-name').value = ''; 
          document.getElementById('f-qty').value = ''; 
          document.getElementById('f-price').value = ''; 
          document.getElementById('f-code').value = '';
          document.getElementById('f-vat').value = '';
          document.getElementById('f-profit').value = '';
          document.getElementById('f-suggested-price').value = '';
          document.getElementById('f-barcode-lookup').value = '';
          document.getElementById('f-barcode-lookup-status').innerHTML = '';
          document.getElementById('f-cost-price').value = '';
          document.getElementById('f-cost-calc').innerHTML = '';
          document.getElementById('f-cost-calc').classList.remove('active');
          document.getElementById('f-name-duplicate-warning').innerHTML = '';
          document.getElementById('f-name-duplicate-warning').style.display = 'none';
        } else {
          alert("Kaydedilemedi: " + error.message);
        }
      });
    }
  });
}

function updateQty(code, change) {
  if (currentRole !== 'admin' && currentRole !== 'staff') return;
  const now = Date.now();
  if (actionCooldowns[code] && now - actionCooldowns[code] < 500) return;
  actionCooldowns[code] = now;

  db.child(code).child('qty').transaction((currentQty) => {
    const cur = Number(currentQty || 0);
    const next = cur + change;
    return next < 0 ? 0 : next;
  }, (error, committed, snapshot) => {
    if (error) { alert("Hata: " + error.message); return; }
    if (committed) {
      const p = productsData[code];
      if (p) logMovement(code, p.name, change, change > 0 ? 'STOK EKLENDİ' : 'STOK DÜŞÜLDÜ');
    }
  });
}

function updatePrice(code) {
  if (currentRole !== 'admin') return;
  const p = productsData[code];
  if (!p) return;
  const newPrice = prompt(`${p.name} için yeni fiyatı giriniz (₺):`, p.price);
  if (newPrice === null) return;
  const parsed = parseFloat(newPrice);
  if (!isNaN(parsed) && parsed >= 0) {
    db.child(code).update({ price: parsed, lastPriceUpdate: new Date().toISOString(), lastUpdatedBy: 'Yönetici' }, (err) => {
      if (!err) showToast("Fiyat güncellendi!");
    });
  }
}

function openEditModal(code) {
  if (currentRole !== 'admin' && currentRole !== 'staff') return;
  const p = productsData[code];
  if (!p) return;
  
  document.getElementById('edit-code').value = p.code;
  document.getElementById('edit-code-visible').value = p.code;
  document.getElementById('edit-code-status').innerHTML = '';
  document.getElementById('edit-code-section').style.display = currentRole === 'admin' ? 'block' : 'none';
  document.getElementById('edit-name').value = p.name || '';
  document.getElementById('edit-qty').value = p.qty || 0;
  document.getElementById('edit-price').value = p.price || 0;
  document.getElementById('edit-unit').value = p.unit || 'Adet';
  document.getElementById('edit-category').value = p.category || 'Diğer';
  
  document.getElementById('edit-vat').value = p.vat || 0;
  document.getElementById('edit-profit').value = p.targetProfit != null ? p.targetProfit : '';
  
  const priceInput = document.getElementById('edit-price');
  const priceLockNote = document.getElementById('price-lock-note');
  if (currentRole === 'staff') {
    priceInput.readOnly = true;
    priceInput.style.backgroundColor = '#e9ecef';
    priceLockNote.style.display = 'inline';
    document.getElementById('edit-cost-section').style.display = 'none';
  } else {
    priceInput.readOnly = false;
    priceInput.style.backgroundColor = '#FCFBF9';
    priceLockNote.style.display = 'none';
    document.getElementById('edit-cost-section').style.display = 'block';
  }

  populateBrandSelect('edit-brand', p.brand);
  document.getElementById('edit-cost-price').value = p.costPrice != null ? p.costPrice : '';
  updateCostCalc('edit');
  updateEditProfit();

  const standSel = document.getElementById('edit-stand');
  const stands = layoutData.stands || {};
  standSel.innerHTML = '<option value="">Atanmamış</option>' + Object.keys(stands).sort().map(l => `<option value="${l}">${l} (${stands[l].label || ''})</option>`).join('');
  
  if (p.location) {
    const parts = p.location.split('-');
    standSel.value = parts[0] || '';
    document.getElementById('edit-slot').value = parts[1] || '';
  } else {
    standSel.value = '';
    document.getElementById('edit-slot').value = '';
  }
  updateSlotMax();
  updateEditProfit();

  document.getElementById('edit-photo-status').textContent = '';
  if (imageCache[p.code]) {
    setEditPhotoPreview(imageCache[p.code]);
  } else {
    setEditPhotoPreview(null);
    dbProductImages.child(p.code).once('value', snap => {
      const val = snap.val();
      imageCache[p.code] = val || null;
      setEditPhotoPreview(imageCache[p.code]);
    });
  }

  if (p.lastPriceUpdate) {
    const d = new Date(p.lastPriceUpdate);
    document.getElementById('edit-last-update-note').textContent = `Son Güncelleme: ${d.toLocaleString('tr-TR')} (${p.lastUpdatedBy || 'Bilinmiyor'})`;
    document.getElementById('edit-last-update-note').style.display = 'block';
  } else {
    document.getElementById('edit-last-update-note').style.display = 'none';
  }

  document.getElementById('edit-modal').style.display = 'flex';
}

function closeEditModal() {
  document.getElementById('edit-modal').style.display = 'none';
  pendingImageDataUrl = null;
}

function updateSlotMax() {
  const standLetter = document.getElementById('edit-stand').value;
  const slotInput = document.getElementById('edit-slot');
  if (!standLetter) { slotInput.value = ''; slotInput.disabled = true; return; }
  slotInput.disabled = false;
  const s = layoutData.stands[standLetter];
  if (s && s.slotCount) {
    slotInput.max = s.slotCount;
    slotInput.placeholder = `1 - ${s.slotCount}`;
  }
}

async function saveEditProduct() {
  const oldCode = document.getElementById('edit-code').value;
  if (!oldCode) return;
  const p = productsData[oldCode];
  if (!p) return;

  const statusEl = document.getElementById('edit-code-status');
  if (statusEl) statusEl.innerHTML = '';

  let newCode = oldCode;
  if (currentRole === 'admin') {
    const visibleCodeInput = document.getElementById('edit-code-visible');
    const enteredCode = visibleCodeInput.value.trim().toUpperCase();
    if (!enteredCode) {
      if (statusEl) statusEl.innerHTML = 'Barkod/kod boş olamaz.';
      return;
    }
    newCode = enteredCode;
  }
  const codeChanged = currentRole === 'admin' && newCode !== oldCode;

  if (codeChanged && productsData[newCode]) {
    if (statusEl) statusEl.innerHTML = `HATA: '${newCode}' kodu zaten başka bir üründe kullanılıyor!`;
    return;
  }

  const updates = {
    name: document.getElementById('edit-name').value.trim(),
    qty: parseFloat(document.getElementById('edit-qty').value) || 0,
    unit: document.getElementById('edit-unit').value,
    category: document.getElementById('edit-category').value,
    lastPriceUpdate: new Date().toISOString(),
    lastUpdatedBy: currentRole === 'admin' ? 'Yönetici' : 'Çalışan'
  };

  if (currentRole === 'admin') {
    updates.brand = document.getElementById('edit-brand').value || null;
    updates.price = parseFloat(document.getElementById('edit-price').value) || 0;
    updates.vat = parseFloat(document.getElementById('edit-vat').value) || 0;
    const profitRaw = document.getElementById('edit-profit').value;
    updates.targetProfit = profitRaw === '' ? null : parseFloat(profitRaw) || 0;
    const costRaw = document.getElementById('edit-cost-price').value;
    updates.costPrice = costRaw === '' ? null : Math.max(0, parseFloat(costRaw) || 0);
  }

  const stand = document.getElementById('edit-stand').value;
  const slot = document.getElementById('edit-slot').value;
  if (stand && slot) updates.location = `${stand}-${slot}`;
  else updates.location = null;

  if (codeChanged) {
    const fullData = Object.assign({}, p, updates, { code: newCode });
    try {
      await db.child(newCode).set(fullData);
      await db.child(oldCode).remove();

      try {
        const imgSnap = await dbProductImages.child(oldCode).once('value');
        if (imgSnap.exists()) {
          await dbProductImages.child(newCode).set(imgSnap.val());
          await dbProductImages.child(oldCode).remove();
        }
      } catch (e) { /* fotoğraf yoksa sorun değil */ }

      if (!newCode.startsWith('RYH-')) {
        dbBarcodeCache.child(newCode).set({ name: updates.name, source: 'manuel', savedAt: new Date().toISOString() });
      }

      showToast("Ürün güncellendi ve kod/barkod değiştirildi!");
      closeEditModal();
      if (pendingImageDataUrl) { refreshCardPhoto(newCode); pendingImageDataUrl = null; }
    } catch (err) {
      if (statusEl) statusEl.innerHTML = "Kod değiştirilemedi: " + (err.message || err);
    }
    return;
  }

  db.child(oldCode).update(updates, (err) => {
    if (!err) {
      showToast("Ürün güncellendi!");
      closeEditModal();
      if (pendingImageDataUrl) { refreshCardPhoto(oldCode); pendingImageDataUrl = null; }
    }
  });
}

function deleteProduct(code) {
  if (currentRole !== 'admin') return;
  if (confirm("Bu ürünü silmek istediğinize emin misiniz?")) {
    db.child(code).remove();
    dbProductImages.child(code).remove();
  }
}

// ============================================================
// YAZDIRMA FONKSİYONLARI
// ============================================================

function printQR(code) {
  const p = productsData[code];
  if (!p) return;
  const printArea = document.getElementById('print-area');
  const currentBaseUrl = window.location.href.split('?')[0];
  
  printArea.innerHTML = `
    <div class="sticker-label">
      <div class="sticker-title">${p.name}</div>
      <div class="sticker-qr" id="print-qr-${p.code}"></div>
      <div class="sticker-footer">
        <span>${p.code}</span>
        <span>₺${formatMoney(p.price)}</span>
      </div>
    </div>
  `;
  
  new QRCode(document.getElementById(`print-qr-${p.code}`), { text: `${currentBaseUrl}?item=${p.code}`, width: 128, height: 128 });
  
  document.body.className = 'printing-label';
  setTimeout(() => {
    window.print();
    document.body.className = '';
  }, 300);
}

function printBarcodeLabel(code) {
  const p = productsData[code];
  if (!p) return;

  const qtyStr = prompt("Kaç adet etiket basılsın? (Yazıcınız her seferinde 5'li yatay şerit halinde bastığı için toplam 5'in katına yuvarlanır)", "5");
  if (qtyStr === null) return;
  const requestedQty = Math.max(1, Math.min(100, parseInt(qtyStr) || 5));
  const rows = Math.ceil(requestedQty / 5);
  const totalToPrint = rows * 5;

  const printArea = document.getElementById('print-area');
  printArea.innerHTML = '';
  const currentBaseUrl = window.location.href.split('?')[0];
  const shortName = p.name.length > 20 ? p.name.slice(0, 18) + '…' : p.name;

  const qrTargets = [];
  for (let r = 0; r < rows; r++) {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'barcode-strip-page';
    for (let c = 0; c < 5; c++) {
      const cellId = `bl-qr-${code}-${r}-${c}`;
      const cell = document.createElement('div');
      cell.className = 'bl-cell';
      cell.innerHTML = `
        <div class="bl-qr" id="${cellId}"></div>
        <div class="bl-name">${shortName}</div>
        <div class="bl-code">${p.code}</div>
      `;
      rowDiv.appendChild(cell);
      qrTargets.push(cellId);
    }
    printArea.appendChild(rowDiv);
  }

  qrTargets.forEach(id => {
    const el = document.getElementById(id);
    if (el) new QRCode(el, { text: `${currentBaseUrl}?item=${p.code}`, width: 150, height: 150, correctLevel: QRCode.CorrectLevel.M });
  });

  if (totalToPrint !== requestedQty) {
    showToast(`Yazıcınız 5'li şerit bastığı için toplam ${totalToPrint} adet (${rows} şerit) basılacak.`);
  }

  let pageStyle = document.getElementById('dynamic-barcode-page-size');
  if (!pageStyle) {
    pageStyle = document.createElement('style');
    pageStyle.id = 'dynamic-barcode-page-size';
    document.head.appendChild(pageStyle);
  }
  pageStyle.textContent = '@page { size: 100mm 40mm; margin: 0; }';

  document.body.className = 'printing-barcode-label';
  setTimeout(() => {
    window.print();
    document.body.className = '';
    // ÖNEMLİ: Bu özel sayfa boyutunu (100mm x 40mm) hemen temizle. Temizlenmezse
    // <head>'de kalıcı kalır ve ondan SONRAKİ TÜM yazdırmalar (satış fişi dahil)
    // bu sabit/yanlış boyuta sıkışır — yazıcı "boyu çok uzun" davranır ya da
    // hata verip hiç basmaz. (Aşağıdaki 'afterprint' dinleyicisi de ek güvence.)
    pageStyle.textContent = '';
  }, 400);
}

// GÜVENLİK AĞI: Bazı mobil/tablet tarayıcılarda yazdırma penceresi asenkron açılır
// (window.print() hemen geri döner, kullanıcı önizlemede beklerken kod çalışmaya devam eder).
// Bu durumda yukarıdaki setTimeout içindeki temizlik erken tetiklenebilir. 'afterprint'
// olayı, yazdırma penceresi GERÇEKTEN kapandığında ateşlenir; burada da aynı temizliği
// tekrar yaparak barkod etiketi sayfa boyutunun (@page 100mm x 40mm) kalıcı kalıp
// sonraki satış fişi / diğer yazdırmaları bozmasını kesin olarak engelliyoruz.
window.addEventListener('afterprint', () => {
  document.body.className = '';
  const leftoverPageStyle = document.getElementById('dynamic-barcode-page-size');
  if (leftoverPageStyle) leftoverPageStyle.textContent = '';
});

function printAllLabels() {
  if(currentRole !== 'admin' && currentRole !== 'staff') return;
  const printArea = document.getElementById('print-area');
  printArea.innerHTML = '';
  const currentBaseUrl = window.location.href.split('?')[0];

  const search = document.getElementById('search').value.toLowerCase();
  const toPrint = Object.values(productsData).filter(p => {
    const pName = p.name ? p.name.toLowerCase() : '';
    const pCat = p.category ? p.category.toLowerCase() : '';
    const pCode = p.code ? p.code.toLowerCase() : '';
    return (pName.includes(search) || pCat.includes(search) || pCode.includes(search));
  });

  if(toPrint.length === 0) { alert("Yazdırılacak ürün bulunamadı!"); return; }
  if(toPrint.length > 50) { if(!confirm(`${toPrint.length} adet etiket yazdırılacak, onaylıyor musunuz?`)) return; }

  toPrint.forEach(p => {
    const div = document.createElement('div');
    div.className = 'sticker-label';
    div.innerHTML = `
      <div class="sticker-title">${p.name}</div>
      <div class="sticker-qr" id="print-all-qr-${p.code}"></div>
      <div class="sticker-footer">
        <span>${p.code}</span>
        <span>₺${formatMoney(p.price)}</span>
      </div>
    `;
    printArea.appendChild(div);
    new QRCode(div.querySelector('.sticker-qr'), { text: `${currentBaseUrl}?item=${p.code}`, width: 128, height: 128 });
  });

  document.body.className = 'printing-label';
  setTimeout(() => {
    window.print();
    document.body.className = '';
  }, 500);
}

async function exportBackup() {
  if(currentRole !== 'admin') return;
  const dataRow = [["Ürün Kodu", "Ürün Adı", "Kategori", "Marka", "Miktar", "Birim", "Satış Fiyatı", "Geliş Fiyatı", "Konum", "Envanter (Maliyet)"]];
  Object.values(productsData).forEach(p => {
    const cost = p.costPrice != null ? p.costPrice : (p.price || 0);
    dataRow.push([
      p.code, p.name, p.category || '', p.brand || '', p.qty, p.unit || 'Adet',
      p.price, p.costPrice || '', p.location || '', parseFloat(p.qty) * cost
    ]);
  });
  const ws = XLSX.utils.aoa_to_sheet(dataRow);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Stok");
  const dateStr = new Date().toISOString().slice(0,10);
  await saveExcelFile(wb, `Reyhani_Stok_Yedek_${dateStr}.xlsx`);
}

// ============================================================
// QR SCANNER
// ============================================================

function startScanner() {
  if(html5QrcodeScanner) return;
  html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: {width: 250, height: 250} }, false);
  html5QrcodeScanner.render((text) => {
    let code = text;
    if(text.includes('?item=')) {
      code = text.split('?item=')[1];
    }
    document.getElementById('scan-result').innerHTML = `<p style="color:var(--success);font-weight:bold;">Okundu: ${code}</p>`;
    
    if (productsData[code]) {
      switchTab('stok');
      document.getElementById('search').value = code;
      renderGrid();
    } else {
      document.getElementById('scan-result').innerHTML += `<p style="color:var(--rust);">Ürün sistemde bulunamadı.</p>`;
    }
  }, (err) => {});
}

function stopScanner() {
  if(html5QrcodeScanner) {
    html5QrcodeScanner.clear().catch(e => console.error(e));
    html5QrcodeScanner = null;
  }
}

// ============================================================
// TOPTANCI İŞLEMLERİ
// ============================================================

function addWholesaler() {
  if(currentRole !== 'admin') return;
  const name = document.getElementById('w-name').value.trim();
  const contact = document.getElementById('w-contact').value.trim();
  const phone = document.getElementById('w-phone').value.trim();
  const whatsapp = document.getElementById('w-whatsapp').value.trim();
  const category = document.getElementById('w-category').value;
  const day = document.getElementById('w-day').value;
  const paymentTerm = document.getElementById('w-payment-term').value;
  const tax = document.getElementById('w-tax').value.trim();
  const iban = document.getElementById('w-iban').value.trim();
  const address = document.getElementById('w-address').value.trim();
  const notes = document.getElementById('w-notes').value.trim();

  if(!name) { alert("Firma adı giriniz."); return; }

  dbWholesalers.push({
    name, contact, phone, whatsapp, category, day, paymentTerm, tax, iban, address, notes,
    status: 'aktif', balance: 0
  }, (err) => {
    if(!err) {
      showToast("Toptancı eklendi!");
      ['w-name','w-contact','w-phone','w-whatsapp','w-tax','w-iban','w-address','w-notes'].forEach(id => {
        document.getElementById(id).value = '';
      });
    }
  });
}

function renderWholesalers() {
  const grid = document.getElementById('wholesalers-grid');
  if(!grid) return;

  const statusFilterEl = document.getElementById('w-filter-status');
  const categoryFilterEl = document.getElementById('w-filter-category');
  const statusFilter = statusFilterEl ? statusFilterEl.value : 'aktif';
  const categoryFilter = categoryFilterEl ? categoryFilterEl.value : '';
  const __wholesalerParts = [];

  Object.keys(wholesalersData).forEach(key => {
    const w = wholesalersData[key];
    const status = w.status || 'aktif';
    if (statusFilter === 'aktif' && status !== 'aktif') return;
    if (statusFilter === 'pasif' && status !== 'pasif') return;
    if (categoryFilter && (w.category || 'Genel') !== categoryFilter) return;

    const isNegative = w.balance < 0;
    const isPassive = status === 'pasif';
    __wholesalerParts.push(`
      <div class="tag" style="${isPassive ? 'opacity:0.6;' : ''}">
        <div class="tag-header">
          <div>
            <div class="tag-title">${w.name} ${isPassive ? '<span style="font-size:11px; color:var(--rust); font-weight:600;">(PASİF)</span>' : ''}</div>
            <div class="tag-code">
              ${w.contact ? `👤 ${w.contact}<br>` : ''}
              📞 ${w.phone || '-'}${w.whatsapp ? ` | 💬 ${w.whatsapp}` : ''} | 📅 Ziyaret: ${w.day}<br>
              🏷️ ${w.category || 'Genel'} | 💳 Vade: ${w.paymentTerm || 'Peşin'}
              ${w.address ? `<br>📍 ${w.address}` : ''}
              ${w.tax ? `<br>🧾 ${w.tax}` : ''}
              ${w.iban ? `<br>🏦 ${w.iban}` : ''}
              ${w.notes ? `<br>📝 ${w.notes}` : ''}
            </div>
          </div>
          ${currentRole === 'admin' ? `
            <div style="display:flex; gap:4px; flex-shrink:0;">
              <button class="sm-btn" style="color:var(--info);" onclick="openWholesalerEdit('${key}')">✏️ Düzenle</button>
              <button class="sm-btn" style="color:var(--rust);" onclick="deleteWholesaler('${key}')">Sil</button>
            </div>
          ` : ''}
        </div>
        <div class="balance-box ${isNegative ? 'balance-negative' : 'balance-positive'}">
          Bakiye: ₺${formatMoney(w.balance || 0)}
        </div>
        <div class="action-grid">
          <button class="btn btn-success btn-sm" onclick="updateBalance('${key}', 1)">+ Ödeme Yap</button>
          <button class="btn btn-danger btn-sm" onclick="updateBalance('${key}', -1)">- Borç Ekle</button>
        </div>
        <button class="btn btn-dark btn-sm" style="width:100%; margin-top:6px;" onclick="openHistory('${key}', '${w.name.replace(/'/g, "\\'")}')">📄 Ekstre / Hesap Geçmişi</button>
      </div>
    `);
  });

  grid.innerHTML = __wholesalerParts.length ? __wholesalerParts.join('') : '<p style="color:var(--steel); font-size:13px;">Bu filtreye uyan toptancı yok.</p>';
}

function deleteWholesaler(key) {
  if (currentRole !== 'admin') return;
  const w = wholesalersData[key];
  if (!confirm(`"${w ? w.name : ''}" toptancısını kalıcı olarak silmek istediğinize emin misiniz?\n\nİpucu: Artık çalışmadığınız ama geçmiş cari hesabını (ekstresini) saklamak istediğiniz bir toptancı varsa, silmek yerine "Düzenle" ekranından durumunu "Pasif" yapmanız önerilir.`)) return;
  dbWholesalers.child(key).remove(() => showToast("Toptancı silindi."));
}

function updateBalance(key, mult) {
  if(currentRole !== 'admin') return;
  const w = wholesalersData[key];
  const desc = prompt(`Açıklama giriniz (örn: "Mal Alımı", "Nakit Ödeme"):`, mult > 0 ? "Ödeme" : "Borç");
  if (desc === null) return;
  const amount = prompt(`${w.name} için ${mult > 0 ? 'yapılan ödeme' : 'eklenen borç'} tutarını giriniz (₺):`);
  if(amount === null) return;
  const parsed = parseFloat(amount);
  
  if(!isNaN(parsed) && parsed > 0) {
    dbWholesalers.child(key).child('balance').transaction(cur => (cur || 0) + (parsed * mult), (err) => {
      if(!err) {
        dbWholesalers.child(key).child('transactions').push({
          desc: desc || (mult > 0 ? 'Ödeme' : 'Borç'),
          amount: parsed,
          type: mult > 0 ? 'odeme' : 'borc',
          date: new Date().toLocaleString('tr-TR')
        });
        showToast("Bakiye güncellendi.");
      }
    });
  }
}

let activeWholesalerKey = null;

function openHistory(key, name) {
  activeWholesalerKey = key;
  document.getElementById('history-title').textContent = name + " - Hesap Hareketleri";
  document.getElementById('history-modal').style.display = 'flex';
  loadHistory(key);
}

function closeHistory() {
  document.getElementById('history-modal').style.display = 'none';
  if (activeWholesalerKey) dbWholesalers.child(activeWholesalerKey).child('transactions').off('value');
  activeWholesalerKey = null;
}

function loadHistory(key) {
  const list = document.getElementById('history-list');
  list.innerHTML = '<p style="font-size:12px; color:var(--steel);">Yükleniyor...</p>';
  dbWholesalers.child(key).child('transactions').on('value', snap => {
    const data = snap.val() || {};
    const w = wholesalersData[key] || {};
    const isAdmin = currentRole === 'admin';

    let html = isAdmin ? `
      <div style="margin-bottom:15px; background:var(--bg); padding:10px; border-radius:6px;">
         <label>İşlem Açıklaması</label>
         <input type="text" id="h-desc" placeholder="Örn: Mal Alımı / Yapılan Ödeme" style="margin-bottom:8px;">
         <div class="form-row" style="margin-bottom:8px;">
           <div><label>Tutar (₺)</label><input type="number" id="h-amount" step="0.01" placeholder="0.00"></div>
           <div><label>İşlem Türü</label>
             <select id="h-type">
               <option value="borc">Borçlandır (+)</option>
               <option value="odeme">Ödeme Yapıldı (-)</option>
             </select>
           </div>
         </div>
         <button class="btn btn-primary btn-sm" onclick="addTransaction()">İşlemi Kaydet</button>
      </div>
    ` : '';

    const balance = w.balance || 0;

    const manualBalanceBlock = isAdmin ? `
      <div style="margin-bottom:15px; background:#FFF7ED; border:1px dashed var(--warning, #F59E0B); padding:10px; border-radius:6px;">
        <label style="font-size:12px; font-weight:600;">⚙️ Bakiyeyi Manuel Düzelt (yanlış girilen tutarı elle düzeltmek için)</label>
        <div class="form-row" style="margin-top:6px; align-items:flex-end;">
          <div style="flex:1;"><input type="number" id="h-manual-balance" step="0.01" value="${balance}" placeholder="0.00"></div>
          <button class="btn btn-sm" style="width:auto; background:var(--warning, #F59E0B); color:#fff; white-space:nowrap; padding:8px 12px;" onclick="setWholesalerBalanceManually()">Bakiyeyi Ayarla</button>
        </div>
        <div style="font-size:11px; color:var(--steel); margin-top:4px;">Bu, artış/azalış eklemez; bakiyeyi doğrudan yazdığınız tutara eşitler. Negatif değer = borç, pozitif değer = alacak.</div>
      </div>
    ` : '';
    const rows = Object.keys(data).sort().reverse().map(tId => {
      const t = data[tId];
      return `
        <div class="recent-update-row">
          <div>
            <div>${t.desc}</div>
            <div class="ru-time">${t.date}</div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <div style="font-family:'IBM Plex Mono'; font-weight:bold; color:${t.type === 'borc' ? 'var(--rust)' : 'var(--success)'}">
              ${t.type === 'borc' ? '+' : '-'}₺${formatMoney(t.amount)}
            </div>
            ${isAdmin ? `<button class="btn btn-danger btn-sm" style="width:auto; padding:3px 8px; font-size:11px;" title="Bu hareketi sil ve bakiyeyi düzelt (örn. mükerrer fiş kaydından oluşan borç)" onclick="deleteWholesalerTransaction('${tId}')">🗑</button>` : ''}
          </div>
        </div>
      `;
    }).join('') || '<p style="font-size:12px; color:var(--steel); text-align:center; padding:10px 0;">Henüz hareket kaydı yok.</p>';

    list.innerHTML = html + manualBalanceBlock + `<div class="balance-box ${balance < 0 ? 'balance-negative' : 'balance-positive'}">Güncel Bakiye: ₺${formatMoney(balance)}</div>` + rows;
  });
}

// Mükerrer/hatalı bir hareketi (örn. aynı fiş 4 kere kaydedilince oluşan 3 fazladan
// "borç" girişi) silmek ve bakiyeyi otomatik olarak düzeltmek için.
async function deleteWholesalerTransaction(tId) {
  if (currentRole !== 'admin' || !activeWholesalerKey) return;
  const key = activeWholesalerKey;
  const snap = await dbWholesalers.child(key).child('transactions').child(tId).once('value');
  const t = snap.val();
  if (!t) { showToast("İşlem bulunamadı (zaten silinmiş olabilir)."); return; }

  const ok = confirm(`Bu hareketi silmek istediğinize emin misiniz?\n\n${t.desc}\n${t.type === 'borc' ? '+' : '-'}₺${formatMoney(t.amount)}  (${t.date})\n\nSilindiğinde bu tutar bakiyeden geri alınacak/eklenecek.`);
  if (!ok) return;

  // 'borc' eklenirken bakiye düşürülmüştü (cur - amount); silince tersine bakiyeye geri ekliyoruz.
  // 'odeme' eklenirken bakiye artırılmıştı (cur + amount); silince tersine bakiyeden düşüyoruz.
  const reverseMult = t.type === 'borc' ? 1 : -1;
  dbWholesalers.child(key).child('balance').transaction(cur => (cur || 0) + (Number(t.amount) || 0) * reverseMult, (err) => {
    if (err) { showToast("Bakiye güncellenemedi: " + err.message); return; }
    dbWholesalers.child(key).child('transactions').child(tId).remove(() => {
      showToast("Hareket silindi ve bakiye düzeltildi.");
    });
  });
}

function setWholesalerBalanceManually() {
  if (currentRole !== 'admin' || !activeWholesalerKey) return;
  const input = document.getElementById('h-manual-balance');
  const newBalance = parseFloat(input.value);
  if (isNaN(newBalance)) { alert("Lütfen geçerli bir tutar girin."); return; }

  const w = wholesalersData[activeWholesalerKey] || {};
  const oldBalance = w.balance || 0;
  if (newBalance === oldBalance) { showToast("Bakiye zaten bu tutarda."); return; }

  const ok = confirm(`Mevcut bakiye: ₺${formatMoney(oldBalance)}\nYeni bakiye: ₺${formatMoney(newBalance)}\n\nBakiyeyi doğrudan bu tutara eşitlemek istediğinize emin misiniz?`);
  if (!ok) return;

  const date = new Date().toLocaleString('tr-TR');
  dbWholesalers.child(activeWholesalerKey).child('balance').set(newBalance, (err) => {
    if (err) { showToast("Bakiye güncellenemedi: " + err.message); return; }
    // Şeffaflık için hareket geçmişine de bir düzeltme kaydı düşelim
    dbWholesalers.child(activeWholesalerKey).child('transactions').push({
      desc: `Manuel Düzeltme (₺${formatMoney(oldBalance)} → ₺${formatMoney(newBalance)})`,
      amount: Math.abs(newBalance - oldBalance),
      type: newBalance < oldBalance ? 'borc' : 'odeme',
      date
    }, () => {
      showToast("Bakiye manuel olarak güncellendi.");
    });
  });
}

function addTransaction() {
  if (currentRole !== 'admin' || !activeWholesalerKey) return;
  const desc = document.getElementById('h-desc').value.trim();
  const amount = parseFloat(document.getElementById('h-amount').value);
  const type = document.getElementById('h-type').value;
  if(!desc || isNaN(amount) || amount <= 0) { alert("Lütfen geçerli açıklama ve tutar girin."); return; }
  const date = new Date().toLocaleString('tr-TR');
  const mult = type === 'borc' ? -1 : 1;

  dbWholesalers.child(activeWholesalerKey).child('balance').transaction(cur => (cur || 0) + (amount * mult), (err) => {
    if (err) return;
    dbWholesalers.child(activeWholesalerKey).child('transactions').push({ desc, amount, type, date }, err2 => {
      if(!err2) {
        showToast("İşlem eklendi.");
        document.getElementById('h-desc').value = '';
        document.getElementById('h-amount').value = '';
      }
    });
  });
}

// ============================================================
// Z RAPORU
// ============================================================

// Depo sayım tutanağı — sabit, önceden hazırlanmış boş form (base64 gömülü PDF).
// İşçilere dağıtmak için her sayımda buradan indirilir.
const SAYIM_TUTANAGI_PDF_BASE64 = "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";

function downloadSayimTutanagi() {
  const link = document.createElement('a');
  link.href = "data:application/pdf;base64," + SAYIM_TUTANAGI_PDF_BASE64;
  link.download = "Depo_Sayim_Tutanagi_Reyhani.pdf";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("Sayım tutanağı indirildi.");
}

function generateDailyZReport() {
  if(currentRole !== 'admin') { alert("Sadece yönetici Z raporu oluşturabilir."); return; }
  const dateStr = new Date().toISOString().slice(0, 10);
  const timeStr = new Date().toLocaleTimeString('tr-TR');
  
  let totalSales = 0;
  if (globalPastOrders) {
    Object.values(globalPastOrders).forEach(o => {
      if (o.date === dateStr) {
        totalSales += o.orderData.total;
      }
    });
  }
  
  const reportData = {
    date: dateStr,
    time: timeStr,
    malGirisi: 0,
    malCikisi: 0,
    paraGirisi: totalSales,
    paraCikisi: 0,
    movements: movementsData[dateStr] || {}
  };

  dbZReports.child(dateStr).set(reportData, (err) => {
    if(!err) {
      showToast("Bugünün Z Raporu oluşturuldu ve arşivlendi!");
    } else {
      alert("Z Raporu oluşturulurken hata oluştu.");
    }
  });
}

async function downloadZReportByDate(dateStr) {
  const report = globalZReports[dateStr];
  if(!report) { alert("Rapor bulunamadı."); return; }
  
  const dataRow = [["Saat", "Ürün Kodu", "Ürün Adı", "Değişim", "İşlem Tipi"]];
  if(report.movements) {
    Object.values(report.movements).forEach(m => {
      dataRow.push([m.time, m.code, m.name, m.change, m.type]);
    });
  } else {
    dataRow.push(["", "", "Bu tarihte hareket yok", "", ""]);
  }
  
  dataRow.push(["", "", "", "", ""]);
  dataRow.push(["ÖZET BİLGİLER", "", "", "", ""]);
  dataRow.push(["Para Girişi (Satışlar)", "₺" + report.paraGirisi, "", "", ""]);
  
  const ws = XLSX.utils.aoa_to_sheet(dataRow);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Z Raporu " + dateStr);
  
  await saveExcelFile(wb, `Reyhani_Z_Raporu_${dateStr}.xlsx`);
}
// Initialize
checkDeviceAuthorizationLink();
updateAuthUI();

// YAPAY ZEKA MOTORU (GÜNCEL & HATASIZ)
function getGeminiApiKey() { 
  return localStorage.getItem('gemini_api_key') || ''; 
}

// API hatasını (özellikle kota/rate-limit hatalarını) kullanıcıya anlaşılır Türkçe mesaja çevirir
function friendlyAIErrorMessage(err) {
  const msg = (err && err.message) || String(err);
  if (/quota|rate.?limit|resource_exhausted|429/i.test(msg)) {
    return '⏳ Google\'ın ücretsiz kullanım sınırına ulaşıldı (dakikada belirli sayıda mesaj hakkı var). Birkaç saniye bekleyip tekrar deneyin. Sık sık bu hatayı alıyorsanız, Google AI Studio\'da (aistudio.google.com) projenizde faturalandırmayı etkinleştirerek bu sınırı büyük ölçüde yükseltebilirsiniz — ücretsiz kotayı aşmadıkça ücret yansımaz.';
  }
  if (/api key not valid|api_key_invalid/i.test(msg)) {
    return '🔑 API Anahtarı geçersiz görünüyor. Sağ üstteki "🔑 API Key" butonuyla anahtarınızı kontrol edin.';
  }
  return '❌ Hata: ' + msg;
}

function promptGeminiApiKey() {
  const currentKey = getGeminiApiKey();
  const newKey = prompt("Google'dan aldığınız API Anahtarını yapıştırın:", currentKey);
  if (newKey !== null && newKey !== "") {
    localStorage.setItem('gemini_api_key', newKey.trim());
    alert("API Anahtarı kaydedildi!");
  }
}

// ============================================================
// ÜRÜN ADI EŞLEŞTİRME MOTORU
// Fiş fotoğrafından okunan ürün adlarını, mevcut 3600+ ürünlük
// envanterle karşılaştırıp "zaten kayıtlı mı, yoksa gerçekten yeni mi"
// olduğunu tespit eder. Amaç: aynı ürünün farklı adla tekrar tekrar
// yeni ürün olarak oluşturulmasını (stok kirliliği) engellemek.
// ============================================================
const FIS_MATCH_THRESHOLD = 0.55;

function normalizeProductName(s) {
  return (s || '')
    .toString()
    .toLocaleLowerCase('tr-TR')
    .replace(/İ/g, 'i').replace(/I/g, 'ı')
    .replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshteinDistance(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

// İçinde rakam geçen kelimeleri döndürür ("25lik", "280ml" gibi ölçü/boyut ifadeleri)
function extractSizeTokens(tokens) {
  return tokens.filter(t => /\d/.test(t));
}

function productNameSimilarity(nameA, nameB) {
  const na = normalizeProductName(nameA);
  const nb = normalizeProductName(nameB);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const ta = na.split(' ').filter(Boolean);
  const tb = nb.split(' ').filter(Boolean);
  const setA = new Set(ta), setB = new Set(tb);
  let inter = 0;
  setA.forEach(t => { if (setB.has(t)) inter++; });
  const union = new Set([...setA, ...setB]).size || 1;
  const jaccard = inter / union;

  const dist = levenshteinDistance(na, nb);
  const maxLen = Math.max(na.length, nb.length) || 1;
  const charRatio = 1 - dist / maxLen;

  // Kısaltılmış isimler için (AI bazen ürünü kısa okur) hafif bonus
  const containmentBonus = (na.includes(nb) || nb.includes(na)) ? 0.15 : 0;

  let score = Math.min(1, jaccard * 0.55 + charRatio * 0.3 + containmentBonus);

  // ÖLÇÜ/BOYUT GÜVENLİĞİ: "25lik" ile "20lik" gibi farklı ölçüleri ASLA birbirine karıştırma.
  // İkisinde de rakamlı bir ifade varsa ve bunlar örtüşmüyorsa, eşleşmeyi neredeyse imkansız kıl.
  const sizeA = extractSizeTokens(ta);
  const sizeB = extractSizeTokens(tb);
  if (sizeA.length > 0 && sizeB.length > 0) {
    const sameSize = sizeA.some(s => sizeB.includes(s));
    if (!sameSize) score *= 0.1;
  } else if (sizeA.length > 0 || sizeB.length > 0) {
    // Sadece birinde ölçü belirtilmiş -> hangi ölçü/varyant olduğu belirsiz, temkinli ol
    score *= 0.75;
  }

  return score;
}

// Envanterdeki (3600+ ürün olabilir) tüm ürünlerle karşılaştırıp en iyi eşleşmeyi bulur
function findBestProductMatch(aiName) {
  const all = Object.values(productsData || {});
  let best = null, bestScore = 0;
  for (const p of all) {
    const score = productNameSimilarity(aiName, p.name);
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return { product: best, score: bestScore };
}

async function processReceiptWithAI(event) {
  const file = event.target.files[0];
  if (!file) return;

  let apiKey = getGeminiApiKey();
  if (!apiKey) {
    apiKey = prompt("Fiş okuyabilmek için Google API Anahtarınızı girmelisiniz:");
    if (!apiKey) { 
      event.target.value = ''; 
      return; 
    }
    localStorage.setItem('gemini_api_key', apiKey.trim());
  }

  const statusMsg = document.getElementById('ai-status-msg');
  if (statusMsg) {
    statusMsg.style.display = 'block';
    statusMsg.style.color = '#F59E0B';
    statusMsg.innerHTML = '⏳ Fotoğraf inceleniyor, bekleyin...';
  }

  try {
    const base64Data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = e => reject(e);
    });
    const pureBase64 = base64Data.split(',')[1];

    const apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=" + encodeURIComponent(apiKey.trim());

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: "Sen bir fiş okuma sistemisin. Fişteki ürün adlarını (name), miktarlarını (qty) ve birim geliş fiyatlarını (cost) tespit et. SADECE geçerli JSON dizisi ver. Örnek: [{\"name\": \"Silikon\", \"qty\": 10, \"cost\": 45.50}]" },
            { inlineData: { mimeType: file.type || "image/jpeg", data: pureBase64 } }
          ]
        }]
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    if (!data.candidates || !data.candidates[0]?.content?.parts[0]?.text) {
      throw new Error("Yapay zeka gorselden veri okuyamadi.");
    }

    let textResult = data.candidates[0].content.parts[0].text
      .replace(/```(?:json)?/gi, '')
      .replace(/```/g, '')
      .trim();

    const parsedItems = JSON.parse(textResult);

    if (!Array.isArray(parsedItems) || parsedItems.length === 0) throw new Error("Ürün bulunamadı");

    let addedCount = 0;
    let matchedCount = 0;
    let newCount = 0;
    parsedItems.forEach(item => {
      const aiName = item.name || 'Bilinmeyen Ürün';
      const qty = parseFloat(item.qty) || 1;
      const cost = parseFloat(item.cost) || 0;
      const { product: matchedProduct, score } = findBestProductMatch(aiName);
      const isMatch = !!(matchedProduct && score >= FIS_MATCH_THRESHOLD);

      const receiptItem = {
        name: isMatch ? matchedProduct.name : aiName,
        unit: isMatch ? (matchedProduct.unit || 'Adet') : 'Adet',
        qty,
        cost,
        total: qty * cost,
        aiOriginalName: aiName
      };

      if (isMatch) {
        receiptItem.code = matchedProduct.code;
        receiptItem.isNew = false;
        receiptItem.matched = true;
        receiptItem.matchScore = score;
        matchedCount++;
      } else {
        receiptItem.isNew = true;
        receiptItem.matched = false;
        receiptItem.category = 'Diğer';
        receiptItem.price = 0;
        newCount++;
      }

      if (typeof goodsReceiptCart !== 'undefined') {
        goodsReceiptCart.push(receiptItem);
        addedCount++;
      }
    });

    if (typeof renderGoodsReceiptCart === 'function') renderGoodsReceiptCart();
    
    if (statusMsg) {
      statusMsg.style.color = '#10B981';
      statusMsg.innerHTML = `✅ ${addedCount} ürün tabloya eklendi — 🔴 ${matchedCount} tanesi stokta bulundu, 🔵 ${newCount} tanesi yeni ürün gibi görünüyor. Tamamlamadan önce listeyi kontrol edin!`;
    }
  } catch (err) {
    if (statusMsg) {
      statusMsg.style.color = '#EF4444';
      statusMsg.innerHTML = '❌ Fiş okunamadı.';
    }
    alert("Hata: " + err.message);
  } finally {
    event.target.value = '';
  }
}

// ============================================================
// ÜRÜN EKLE — AI İLE SİSTEMDE OLMAYAN ÜRÜNLERİ TOPLU YÜKLEME
// (processReceiptWithAI ile aynı okuma mantığı + aynı eşleştirme motoru,
// ama burada amaç FİŞ değil; fiziksel stokta olup sisteme hiç girilmemiş
// ürünleri tespit edip toplu olarak stoğa kaydetmek.)
// ============================================================
let bulkAddCart = [];

async function processBulkStockPhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (currentRole !== 'admin') {
    alert("Bu işlem için yetkiniz yok.");
    event.target.value = '';
    return;
  }

  let apiKey = getGeminiApiKey();
  if (!apiKey) {
    apiKey = prompt("Ürün listesini okuyabilmek için Google API Anahtarınızı girmelisiniz:");
    if (!apiKey) { event.target.value = ''; return; }
    localStorage.setItem('gemini_api_key', apiKey.trim());
  }

  const statusMsg = document.getElementById('bulk-ai-stock-status');
  if (statusMsg) {
    statusMsg.style.display = 'block';
    statusMsg.style.color = '#F59E0B';
    statusMsg.innerHTML = '⏳ Fotoğraf inceleniyor, bekleyin...';
  }

  try {
    const base64Data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = e => reject(e);
    });
    const pureBase64 = base64Data.split(',')[1];

    const apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=" + encodeURIComponent(apiKey.trim());

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: "Görselde bir hırdavat/nalburiye dükkanının rafında duran ürünler ya da elle/bilgisayarla yazılmış bir ürün listesi var. Görebildiğin her ürünü/satırı tespit et: ürün adı (name), varsa görünen miktarı (qty, yoksa 1 yaz) ve varsa görünen satış fiyatını (price, yoksa 0 yaz). SADECE geçerli bir JSON dizisi döndür, başka hiçbir açıklama ekleme. Örnek: [{\"name\": \"Akfix Silikon 280ml\", \"qty\": 5, \"price\": 65}]" },
            { inlineData: { mimeType: file.type || "image/jpeg", data: pureBase64 } }
          ]
        }]
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    if (!data.candidates || !data.candidates[0]?.content?.parts[0]?.text) {
      throw new Error("Yapay zeka görselden veri okuyamadı.");
    }

    let textResult = data.candidates[0].content.parts[0].text
      .replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    const parsedItems = JSON.parse(textResult);
    if (!Array.isArray(parsedItems) || parsedItems.length === 0) throw new Error("Ürün bulunamadı.");

    let newCount = 0, skippedCount = 0;
    parsedItems.forEach(item => {
      const aiName = (item.name || '').trim();
      if (!aiName) return;

      // Aynı eşleştirme motorunu kullanıyoruz (fiş okumada da kullanılan) —
      // sistemde zaten kayıtlı bir ürünle eşleşirse, stok kirliliği olmasın
      // diye bu listeye HİÇ eklemiyoruz.
      const { product: matchedProduct, score } = findBestProductMatch(aiName);
      const isMatch = !!(matchedProduct && score >= FIS_MATCH_THRESHOLD);
      if (isMatch) { skippedCount++; return; }

      // Bu oturumda az önce eklenmiş aynı isimli bir kalemle de eşleşmeyi kontrol et
      // (aynı fotoğrafta / farklı fotoğraflarda aynı ürün tekrar okunmuş olabilir)
      const alreadyInCart = bulkAddCart.some(b => productNameSimilarity(b.name, aiName) >= FIS_MATCH_THRESHOLD);
      if (alreadyInCart) { skippedCount++; return; }

      bulkAddCart.push({
        name: aiName,
        qty: parseFloat(item.qty) || 0,
        unit: 'Adet',
        category: 'Diğer',
        brand: null,
        price: parseFloat(item.price) || 0,
        vat: 0,
        targetProfit: null
      });
      newCount++;
    });

    renderBulkAddCart();

    if (statusMsg) {
      statusMsg.style.color = '#10B981';
      statusMsg.innerHTML = `✅ ${newCount} yeni ürün listeye eklendi.` + (skippedCount > 0 ? ` ℹ️ ${skippedCount} ürün zaten kayıtlı/tekrar olduğu için atlandı.` : '') + ` Eklemeden önce miktar/sınıf/marka/fiyat bilgilerini kontrol edin!`;
    }
  } catch (err) {
    if (statusMsg) {
      statusMsg.style.color = '#EF4444';
      statusMsg.innerHTML = '❌ Liste okunamadı: ' + err.message;
    }
  } finally {
    event.target.value = '';
  }
}

function renderBulkAddCart() {
  const container = document.getElementById('bulk-ai-stock-container');
  const tbody = document.getElementById('bulk-ai-stock-items');
  if (!container || !tbody) return;

  if (bulkAddCart.length === 0) { container.style.display = 'none'; return; }
  container.style.display = 'block';

  const categoryOptionsList = ['Banyo','Bahçe','Mutfak','Boya','Toz Grubu','Kapı Kolu Grubu','Cam & Aksesuar','Silikon & Mastik','Vida & Civata','El Aletleri','Diğer'];
  const brandList = currentBrandList();

  const parts = [];
  bulkAddCart.forEach((item, index) => {
    const categoryOptions = categoryOptionsList.map(c => `<option value="${c}" ${item.category === c ? 'selected' : ''}>${c}</option>`).join('');
    const brandOptions = '<option value="">-</option>' + brandList.map(b => `<option value="${b}" ${item.brand === b ? 'selected' : ''}>${b}</option>`).join('');
    parts.push(`
      <tr style="border-bottom:1px dashed var(--steel-line);">
        <td style="padding:8px 4px;"><input type="text" value="${(item.name || '').replace(/"/g, '&quot;')}" style="min-width:150px;" oninput="bulkAddCart[${index}].name=this.value"></td>
        <td style="padding:8px 4px;"><input type="number" value="${item.qty}" style="width:70px;" oninput="bulkAddCart[${index}].qty=parseFloat(this.value)||0"></td>
        <td style="padding:8px 4px;">
          <select onchange="bulkAddCart[${index}].unit=this.value" style="width:95px;">
            <option value="Adet" ${item.unit === 'Adet' ? 'selected' : ''}>Adet</option>
            <option value="Kilogram" ${item.unit === 'Kilogram' ? 'selected' : ''}>Kilogram</option>
            <option value="Metre" ${item.unit === 'Metre' ? 'selected' : ''}>Metre</option>
          </select>
        </td>
        <td style="padding:8px 4px;"><select onchange="bulkAddCart[${index}].category=this.value" style="min-width:130px;">${categoryOptions}</select></td>
        <td style="padding:8px 4px;"><select onchange="bulkAddCart[${index}].brand=this.value||null" style="min-width:110px;">${brandOptions}</select></td>
        <td style="padding:8px 4px;"><input type="number" value="${item.price}" style="width:85px;" oninput="bulkAddCart[${index}].price=parseFloat(this.value)||0"></td>
        <td style="padding:8px 4px;"><button class="btn btn-dark btn-sm" style="width:auto;" onclick="removeBulkAddItem(${index})">Çıkar</button></td>
      </tr>
    `);
  });
  tbody.innerHTML = parts.join('');
}

function removeBulkAddItem(index) {
  bulkAddCart.splice(index, 1);
  renderBulkAddCart();
}

async function completeBulkStockUpload() {
  if (currentRole !== 'admin') return;
  if (bulkAddCart.length === 0) return;
  if (!confirm(`${bulkAddCart.length} yeni ürünü, girdiğiniz miktarlarla birlikte stoğa eklemek istediğinize emin misiniz?`)) return;

  const usedCodes = new Set();
  let successCount = 0;
  const failed = [];

  for (const item of bulkAddCart) {
    try {
      // Ürün kaydını, fiş akışıyla AYNI merkezi fonksiyonla oluşturuyoruz (tutarlılık için).
      // Bu fonksiyon her zaman qty:0 ile oluşturur (fişte "gelecek mal" mantığı için tasarlandı),
      // o yüzden burada gerçek fiziksel miktarı hemen ardından ayrıca yazıyoruz.
      const code = await createNewProductRecord(item, 'AI Toplu Ürün Yükleme', usedCodes);
      if (item.qty && item.qty > 0) {
        await db.child(code).child('qty').set(item.qty);
        if (productsData[code]) productsData[code].qty = item.qty;
      }
      successCount++;
    } catch (err) {
      failed.push(item.name + ': ' + (err.message || err));
    }
  }

  bulkAddCart = [];
  renderBulkAddCart();

  let msg = `✅ ${successCount} ürün başarıyla sisteme eklendi.`;
  if (failed.length > 0) msg += `\n\n❌ Eklenemeyenler:\n` + failed.join('\n');
  alert(msg);
}

// ============================================================
// AI SOHBET ASİSTANI (Komut verebileceğiniz Gemini destekli sohbet)
// ============================================================
let aiPendingImage = null; // { dataUrl, mimeType } // {role:'user'|'model', text:'...'}
let aiChatBusy = false;

function toggleAIChat() {
  const panel = document.getElementById('ai-chat-panel');
  panel.classList.toggle('open');
  if (panel.classList.contains('open') && aiChatHistory.length === 0) {
    addAIChatBubble('bot', 'Merhaba! Ben Reyhani deposu asistanınızım. Ürün stoğu, fiyatı hakkında soru sorabilir; "25lik dirsekten 10 adet stok ekle" veya "silikon fiyatını 65 yap" gibi komutlar verebilirsiniz. Yazdıklarınızı önce size onaylatırım, onayınız olmadan hiçbir şeyi değiştirmem.');
    setTimeout(() => document.getElementById('ai-chat-input').focus(), 200);
  }
}
function handleAIChatFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    aiPendingImage = { dataUrl: e.target.result, mimeType: file.type };
    // Fotoğraf yüklendi, hemen gönder
    sendAIChatMessage();
    event.target.value = '';
  };
  reader.readAsDataURL(file);
}
function addAIChatBubble(role, text, extraClass) {
  const wrap = document.getElementById('ai-chat-messages');
  const div = document.createElement('div');
  div.className = 'ai-msg ' + (role === 'user' ? 'user' : 'bot') + (extraClass ? ' ' + extraClass : '');
  div.textContent = text;
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
  return div;
}

// Envanterden AI'nin kullanabileceği kısa, hafif bir özet çıkarır.
// Envanter çok büyükse (400+ ürün), rastgele ilk 400'ü göndermek yerine
// kullanıcının mesajındaki kelimelerle EŞLEŞEN ürünleri önceliklendirir;
// böylece liste ne kadar büyük olursa olsun, sorulan ürün gözden kaçmaz.
function buildInventoryContextForAI(queryText) {
  const all = Object.values(productsData || {});
  const LIMIT = 400;

  const normalize = (s) => (s || '').toString().toLowerCase()
    .replace(/İ/g, 'i').replace(/I/g, 'ı')
    .replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');

  let list = all;
  let note = '';

  if (all.length > LIMIT) {
    const words = normalize(queryText).split(/[^a-zçğıöşü0-9]+/i).filter(w => w.length >= 3);
    let matches = [];
    if (words.length > 0) {
      matches = all.filter(p => {
        const hay = normalize((p.name || '') + ' ' + (p.code || ''));
        return words.some(w => hay.includes(w));
      });
    }
    if (matches.length > 0) {
      // Eşleşenleri öne al, kalan kotayı genel listeden doldur (bağlam için)
      const matchedCodes = new Set(matches.map(p => p.code));
      const rest = all.filter(p => !matchedCodes.has(p.code));
      list = matches.concat(rest).slice(0, LIMIT);
      note = `\n(Not: Envanterde toplam ${all.length} ürün var. Mesajınızla eşleşen ${matches.length} ürün listenin başına eklendi, kalan yer genel listeden dolduruldu.)`;
    } else {
      list = all.slice(0, LIMIT);
      note = `\n(Not: Envanterde toplam ${all.length} ürün var, ilk ${LIMIT} tanesi listelendi. Aradığınız ürün burada yoksa, tam adını/kodunu tekrar yazıp sorabilirsiniz.)`;
    }
  }

  const trimmed = list.map(p => ({
    kod: p.code, ad: p.name, stok: p.qty, birim: p.unit, fiyat: p.price
  }));
  return JSON.stringify(trimmed) + note;
}

async function sendAIChatMessage() {
  if (aiChatBusy) return;
  const input = document.getElementById('ai-chat-input');
  const text = input.value.trim();
  if (!text && !aiPendingImage) return;

  let apiKey = getGeminiApiKey();
  if (!apiKey) {
    apiKey = prompt("Sohbet asistanını kullanmak için Google API Anahtarınızı girin:");
    if (!apiKey) return;
    localStorage.setItem('gemini_api_key', apiKey.trim());
  }

  // Kullanıcı mesajını göster
  let userMessage = text || (aiPendingImage ? '📷 Fotoğraf yükledim' : '');
  if (userMessage) {
    addAIChatBubble('user', userMessage);
    aiChatHistory.push({ role: 'user', text: userMessage });
  }
  input.value = '';
  const thinkingBubble = addAIChatBubble('bot', 'Yazıyor...', 'thinking');
  aiChatBusy = true;

  // Rol bilgisi
  let roleInfo = '';
  if (currentRole === 'admin') roleInfo = 'Yönetici yetkisine sahipsin. Tüm modülleri kullanabilirsin: Borç, Toptancılar, Satış Sepeti, Malzeme Fişi, Yeni Ürün Ekle / AI ile Toplu Ürün Yükle, Raporlar, Yerleşim, Görevler, Stok.';
  else if (currentRole === 'staff') roleInfo = 'Çalışan yetkisine sahipsin. Modüller: Satış Sepeti, Malzeme Fişi, Yerleşim, Raporlar, Görevler, Stok. (Yeni Ürün Ekle ve Toptancılar sadece yöneticiye açıktır.)';
  else roleInfo = 'Ziyaretçi yetkisine sahipsin. Sadece stok sorgulama yapabilirsin, işlem yapamazsın.';

  const inventoryContext = buildInventoryContextForAI(userMessage);
  const systemPrompt = `Sen Reyhani Cam Hırdavat deposunun akıllı asistanısın. Kullanıcıya yardım et.
Kullanıcının rolü: ${roleInfo}
${aiPendingImage ? 'Kullanıcı bir fotoğraf yükledi. Lütfen fotoğrafı analiz et ve hangi modülle ilgili olduğunu tahmin et. Ardından kullanıcıya hangi modülde işlem yapmak istediğini sor. Modül seçenekleri: borç, toptancılar, satış sepeti, malzeme fişi, stok, raporlar, yerleşim, görevler, yeni ürün ekle (rafta/depoda olup sisteme hiç girilmemiş ürünleri toplu AI ile eklemek için). Fotoğraf bir mal giriş fişi ise "malzeme fişi", fotoğraf raf/ürün listesi gibi görünüyor ama fiş değilse "yeni ürün ekle" modülünü öner. Yetkisi yoksa bu modülleri önerme.' : ''}
Sana güncel ürün listesi (JSON) verilecek. Sadece bu listeye ve kullanıcının söylediklerine dayanarak cevap ver, uydurma bilgi verme.

Cevabını HER ZAMAN şu JSON formatında, başka hiçbir metin eklemeden ver:
{"action": "none", "reply": "kullanıcıya gösterilecek doğal, kısa ve Türkçe cevap"}
veya kullanıcı bir ürünün stoğunu artırmak/azaltmak istiyorsa:
{"action": "update_stock", "code": "ÜRÜN_KODU", "change": sayı (pozitif=ekleme, negatif=azaltma), "reply": "onay mesajı"}
veya kullanıcı bir ürünün fiyatını değiştirmek istiyorsa:
{"action": "update_price", "code": "ÜRÜN_KODU", "price": sayı, "reply": "onay mesajı"}
veya kullanıcıyı bir modüle yönlendirmek istiyorsan (önce kullanıcıdan onay al, sonra yönlendir):
{"action": "navigate", "module": "borc|toptanci|siparis|fis|stok|raporlar|yerlesim|gorevler|ekle", "reply": "yönlendirme açıklaması"}

Kurallar:
- Kullanıcı yetkisi yoksa (ziyaretçi), asla update_stock, update_price veya navigate yapma, sadece stok sorgulama yap.
- update_stock/update_price önerirken, "code" gerçek bir ürün kodu olmalı.
- Ürünü net bulamazsan, action:"none" ile sor.
- Modül navigasyonu için önce kullanıcıya sor, onay al, sonra navigate action'ı ile yönlendir.
- Asla JSON dışında metin yazma, kod bloğu kullanma.

Güncel ürün listesi (JSON):
${inventoryContext}`;

  // Contents oluştur
  const contents = [
    { role: 'user', parts: [{ text: systemPrompt }] },
    { role: 'model', parts: [{ text: '{"action":"none","reply":"Anladım, yardımcı olmaya hazırım."}' }] }
  ];
  // Hız için: tüm geçmişi değil, sadece son 10 mesajı gönder (istek boyutu küçülsün, model daha hızlı cevap versin)
  const recentHistory = aiChatHistory.slice(-10);
  recentHistory.forEach(h => {
    contents.push({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.text }] });
  });

  // Eğer fotoğraf varsa, son kullanıcı mesajına inlineData ekle
  if (aiPendingImage) {
    const lastUserIndex = contents.length - 1;
    if (contents[lastUserIndex] && contents[lastUserIndex].role === 'user') {
      contents[lastUserIndex].parts.push({
        inlineData: { mimeType: aiPendingImage.mimeType, data: aiPendingImage.dataUrl.split(',')[1] }
      });
    } else {
      contents.push({ role: 'user', parts: [
        { text: userMessage },
        { inlineData: { mimeType: aiPendingImage.mimeType, data: aiPendingImage.dataUrl.split(',')[1] } }
      ]});
    }
    aiPendingImage = null; // temizle
  }

  try {
    const apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=" + encodeURIComponent(apiKey.trim());
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    if (!data.candidates || !data.candidates[0]?.content?.parts[0]?.text) {
      throw new Error("Yapay zekadan cevap alınamadı.");
    }

    let raw = data.candidates[0].content.parts[0].text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      parsed = { action: 'none', reply: raw };
    }

    aiChatHistory.push({ role: 'model', text: raw });
    thinkingBubble.remove();

    if (parsed.action === 'update_stock' && parsed.code) {
      addAIChatBubble('bot', parsed.reply || 'Stok değişikliği yapmak istiyorum, onaylıyor musunuz?');
      handleAIChatConfirmAction(parsed);
    } else if (parsed.action === 'update_price' && parsed.code) {
      addAIChatBubble('bot', parsed.reply || 'Fiyat değişikliği yapmak istiyorum, onaylıyor musunuz?');
      handleAIChatConfirmAction(parsed);
    } else if (parsed.action === 'navigate' && parsed.module) {
      addAIChatBubble('bot', parsed.reply || 'Yönlendiriliyor...');
      const tabMap = {
        'borc': 'borc',
        'acikhesap': 'acikhesap',
        'toptanci': 'toptanci',
        'siparis': 'siparis',
        'fis': 'fis',
        'stok': 'stok',
        'raporlar': 'raporlar',
        'yerlesim': 'yerlesim',
        'gorevler': 'gorevler',
        'ekle': 'ekle'
      };
      const tabName = tabMap[parsed.module];
      if (tabName) {
        // switchTab() zaten kendi içinde yetki kontrolü yapıp alert() ile uyarıyor,
        // ama sohbette daha yumuşak bir bildirim vermek için burada da kontrol ediyoruz.
        const adminOnlyTabs = ['ekle', 'toptanci', 'borc', 'acikhesap'];
        const staffTabs = ['siparis', 'raporlar', 'gorevler', 'yerlesim', 'fis'];
        let blocked = false;
        if (adminOnlyTabs.includes(tabName) && currentRole !== 'admin') blocked = true;
        if (staffTabs.includes(tabName) && currentRole !== 'admin' && currentRole !== 'staff') blocked = true;

        if (blocked) {
          addAIChatBubble('bot', 'Bu modüle erişim yetkiniz yok. Lütfen giriş yapın.', 'error');
        } else {
          switchTab(tabName);
          showToast('Yönlendirildi: ' + tabName);
          if (tabName === 'ekle') {
            setTimeout(() => {
              const el = document.getElementById('bulk-ai-stock-card');
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 200);
          }
        }
      } else {
        addAIChatBubble('bot', 'Geçersiz modül.', 'error');
      }
    } else {
      addAIChatBubble('bot', parsed.reply || raw);
    }
  } catch (err) {
    thinkingBubble.remove();
    addAIChatBubble('bot', friendlyAIErrorMessage(err), 'error');
  } finally {
    aiChatBusy = false;
  }
}

// Yazma işlemleri (stok/fiyat değişimi) için kullanıcıdan native confirm() ile onay ister,
// ardından mevcut updateQty/updatePrice fonksiyonlarını kullanarak Firebase'e yazar.
function handleAIChatConfirmAction(parsed) {
  if (currentRole !== 'admin' && currentRole !== 'staff') {
    addAIChatBubble('bot', 'Bu işlemi yapabilmeniz için yönetici veya çalışan girişi yapmanız gerekiyor.', 'error');
    return;
  }
  const p = productsData[parsed.code];
  if (!p) {
    addAIChatBubble('bot', 'Bu ürün kodunu envanterde bulamadım: ' + parsed.code, 'error');
    return;
  }

  if (parsed.action === 'update_stock') {
    const ok = confirm(`${p.name} (${parsed.code})\nMevcut stok: ${p.qty} ${p.unit}\nDeğişim: ${parsed.change > 0 ? '+' : ''}${parsed.change}\n\nOnaylıyor musunuz?`);
    if (ok) {
      updateQty(parsed.code, parsed.change);
      addAIChatBubble('bot', '✅ Stok güncellendi: ' + p.name);
    } else {
      addAIChatBubble('bot', 'İşlem iptal edildi.');
    }
  } else if (parsed.action === 'update_price') {
    const ok = confirm(`${p.name} (${parsed.code})\nMevcut fiyat: ₺${p.price}\nYeni fiyat: ₺${parsed.price}\n\nOnaylıyor musunuz?`);
    if (ok) {
      db.child(parsed.code).update({ price: parseFloat(parsed.price), lastPriceUpdate: new Date().toISOString(), lastUpdatedBy: 'AI Asistan' }, (err) => {
        if (!err) addAIChatBubble('bot', '✅ Fiyat güncellendi: ' + p.name);
        else addAIChatBubble('bot', '❌ Fiyat güncellenemedi: ' + err.message, 'error');
      });
    } else {
      addAIChatBubble('bot', 'İşlem iptal edildi.');
    }
  }
}

// ============================================================
// SEKME İÇİNE GÖMÜLÜ AI ASİSTANLAR (her panel kendi işine hakim)
// ============================================================
// Yeni bir sekmeye asistan eklemek için:
//  1) O sekmenin HTML'ine ".panel-ai-box" kutusunu kopyalayın (siparis'teki gibi),
//     id'lerdeki "siparis" kelimesini yeni panel anahtarıyla değiştirin (örn. "borc").
//  2) Aşağıdaki PANEL_AI_CONFIG'e o anahtarla yeni bir girdi ekleyin:
//     getSystemPrompt(userMessage) -> o panelin işine özel talimat + ilgili veriler
//     handleAction(parsed) -> AI'nin önerdiği işlemi onaylatıp uygulayan kod
const panelAIHistory = {};
const panelAIBusy = {};

const PANEL_AI_CONFIG = {
  siparis: {
    getSystemPrompt: (userMessage) => `Sen "Reyhani Cam Hırdavat" mağazasının SATIŞ / SEPET ekranında çalışan bir yapay zeka asistanısın. Kullanıcı (mağaza çalışanı) sana ürün stok/fiyat sorabilir, sepete ürün eklemeni isteyebilir ya da o an sepette ne olduğunu sorabilir. Sadece bu ekranın işine yardımcı ol; borç, toptancı, malzeme fişi gibi başka konularda kısaca "bunun için ilgili sekmedeki asistana sorabilirsiniz" de.

Sana JSON formatında güncel ürün listesi ve o an sepette olanlar verilecek. SADECE bu verilere dayanarak cevap ver, uydurma bilgi verme.

Cevabını HER ZAMAN şu JSON formatlarından biriyle, başka hiçbir metin eklemeden ver:
{"action":"none","reply":"kullanıcıya gösterilecek doğal, kısa, Türkçe cevap"}
{"action":"add_to_cart","code":"ÜRÜN_KODU","qty":sayı,"reply":"onay için kısa açıklama, örn: 25lik dirsekten 3 adet sepete eklensin mi?"}

Kurallar:
- "code" alanı MUTLAKA sana verilen ürün listesindeki gerçek bir kod olmalı; ürünü isimden bulup doğru kodu kullan.
- Ürünü net bulamıyorsan veya birden fazla eşleşme varsa action:"none" dön ve hangi ürünü kastettiğini sorun.
- Genel sohbet/selamlaşmada action:"none" kullan.
- Asla JSON dışında metin yazma, kod bloğu (\`\`\`) kullanma.

Güncel ürün listesi (JSON):
${buildInventoryContextForAI(userMessage)}

Şu an sepette olanlar (JSON):
${JSON.stringify(cart.map(i => ({ kod: i.code, ad: i.name, miktar: i.qty })))}`,
    handleAction: (parsed) => {
      if (parsed.action !== 'add_to_cart' || !parsed.code) return false;
      if (currentRole !== 'admin' && currentRole !== 'staff') {
        addPanelAIBubble('siparis', 'bot', 'Bu işlemi yapabilmeniz için yönetici veya çalışan girişi yapmanız gerekiyor.', 'error');
        return true;
      }
      const p = productsData[parsed.code];
      if (!p) {
        addPanelAIBubble('siparis', 'bot', 'Bu ürün kodunu envanterde bulamadım: ' + parsed.code, 'error');
        return true;
      }
      const qty = Number(parsed.qty) > 0 ? Number(parsed.qty) : 1;
      const ok = confirm(`${p.name} (${parsed.code})\n${qty} ${p.unit || 'Adet'} sepete eklensin mi?`);
      if (ok) {
        const existingIndex = cart.findIndex(item => item.code === parsed.code);
        if (existingIndex !== -1) {
          cart[existingIndex].qty += qty;
          cart[existingIndex].total = cart[existingIndex].qty * cart[existingIndex].price;
        } else {
          const price = Number(p.price || 0);
          cart.push({ code: p.code, name: p.name, price, qty, unit: p.unit || 'Adet', total: price * qty });
        }
        renderCart();
        addPanelAIBubble('siparis', 'bot', '✅ Sepete eklendi: ' + p.name);
      } else {
        addPanelAIBubble('siparis', 'bot', 'İşlem iptal edildi.');
      }
      return true;
    }
  }
};

function addPanelAIBubble(panelKey, role, text, extraClass) {
  const wrap = document.getElementById(panelKey + '-ai-messages');
  if (!wrap) return null;
  const div = document.createElement('div');
  div.className = 'ai-msg ' + (role === 'user' ? 'user' : 'bot') + (extraClass ? ' ' + extraClass : '');
  div.textContent = text;
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
  return div;
}

async function sendPanelAIMessage(panelKey) {
  const cfg = PANEL_AI_CONFIG[panelKey];
  if (!cfg) return;
  if (panelAIBusy[panelKey]) return;

  const input = document.getElementById(panelKey + '-ai-input');
  if (!input) return;
  const userMessage = input.value.trim();
  if (!userMessage) return;

  let key = getGeminiApiKey();
  if (!key) {
    key = prompt("Bu asistanı kullanmak için Google API Anahtarınızı girin:");
    if (!key) return;
    localStorage.setItem('gemini_api_key', key.trim());
  }

  if (!panelAIHistory[panelKey]) panelAIHistory[panelKey] = [];

  input.value = '';
  addPanelAIBubble(panelKey, 'user', userMessage);
  panelAIHistory[panelKey].push({ role: 'user', text: userMessage });
  const thinkingBubble = addPanelAIBubble(panelKey, 'bot', 'Yazıyor...', 'thinking');
  panelAIBusy[panelKey] = true;

  try {
    const systemPrompt = cfg.getSystemPrompt(userMessage);
    const apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=" + encodeURIComponent(key.trim());

    const contents = [
      { role: 'user', parts: [{ text: systemPrompt }] },
      { role: 'model', parts: [{ text: '{"action":"none","reply":"Anladım, yardımcı olmaya hazırım."}' }] }
    ];
    // Hız için sadece son 10 mesajı gönderiyoruz
    panelAIHistory[panelKey].slice(-10).forEach(h => {
      contents.push({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.text }] });
    });

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    if (!data.candidates || !data.candidates[0]?.content?.parts[0]?.text) {
      throw new Error("Yapay zekadan cevap alınamadı.");
    }

    let raw = data.candidates[0].content.parts[0].text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    let parsed;
    try { parsed = JSON.parse(raw); } catch (e) { parsed = { action: 'none', reply: raw }; }

    panelAIHistory[panelKey].push({ role: 'model', text: raw });
    thinkingBubble.remove();

    const handled = cfg.handleAction ? cfg.handleAction(parsed) : false;
    if (!handled) {
      addPanelAIBubble(panelKey, 'bot', parsed.reply || raw);
    }
  } catch (err) {
    thinkingBubble.remove();
    addPanelAIBubble(panelKey, 'bot', friendlyAIErrorMessage(err), 'error');
  } finally {
    panelAIBusy[panelKey] = false;
  }
}
