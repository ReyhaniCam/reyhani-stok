// ============================================================
// DİĞER FONKSİYONLAR
// ============================================================

function toggleStandForm() {
  if (currentRole !== 'admin') return;
  const card = document.getElementById('stand-form-card');
  card.style.display = (card.style.display === 'none' || !card.style.display) ? 'block' : 'none';
}

function maybeSeedDefaultPlans() {
  if (Object.keys(layoutPlans).length > 0) return;
  dbLayout.child('plans').update({
    magaza: { name: 'Mağaza', visibility: 'public' },
    depo:   { name: 'Depo', visibility: 'admin' }
  });
}

function accessiblePlans() {
  return Object.keys(layoutPlans)
    .filter(id => currentRole === 'admin' || layoutPlans[id].visibility === 'public')
    .sort((a, b) => layoutPlans[a].name.localeCompare(layoutPlans[b].name, 'tr'));
}

function renderPlanSelector() {
  const sel = document.getElementById('plan-select');
  if (!sel) return;
  const ids = accessiblePlans();

  if (!ids.includes(currentPlanId)) {
    currentPlanId = ids[0] || null;
  }

  if (ids.length === 0) {
    sel.innerHTML = '<option value="">Kroki yok</option>';
  } else {
    sel.innerHTML = ids.map(id => {
      const p = layoutPlans[id];
      const lockIcon = p.visibility === 'admin' ? '🔒 ' : '';
      return `<option value="${id}" ${id === currentPlanId ? 'selected' : ''}>${lockIcon}${p.name}</option>`;
    }).join('');
  }

  document.getElementById('delete-plan-btn').style.display = (currentRole === 'admin' && ids.length > 1) ? 'inline-block' : 'none';
}

function switchPlan() {
  const sel = document.getElementById('plan-select');
  currentPlanId = sel.value;
  renderLayoutGrid();
}

function addPlan() {
  if (currentRole !== 'admin') return;
  const name = document.getElementById('np-name').value.trim();
  const visibility = document.getElementById('np-visibility').value;
  if (!name) { alert("Kroki adı girin (örn: Depo, 2. Kat Ambar)."); return; }

  let id = name.toLowerCase()
    .replace(/ç/g,'c').replace(/ğ/g,'g').replace(/ı/g,'i').replace(/ö/g,'o').replace(/ş/g,'s').replace(/ü/g,'u')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  if (!id) id = 'kroki-' + Date.now();
  if (layoutPlans[id]) id = id + '-' + Math.floor(Math.random() * 900 + 100);

  dbLayout.child('plans').child(id).set({ name, visibility }, (err) => {
    if (err) { alert("Eklenemedi: " + err.message); return; }
    document.getElementById('np-name').value = '';
    document.getElementById('new-plan-form').style.display = 'none';
    currentPlanId = id;
    showToast("Kroki eklendi: " + name);
  });
}

function toggleNewPlanForm() {
  if (currentRole !== 'admin') return;
  const f = document.getElementById('new-plan-form');
  f.style.display = (f.style.display === 'none' || !f.style.display) ? 'block' : 'none';
}

function deleteCurrentPlan() {
  if (currentRole !== 'admin' || !currentPlanId) return;
  const plan = layoutPlans[currentPlanId];
  if (!plan) return;
  if (accessiblePlans().length <= 1) { alert("Son kroki silinemez."); return; }
  if (!confirm(`"${plan.name}" krokisini ve içindeki TÜM standları kalıcı olarak silmek istiyor musunuz? Bu işlem geri alınamaz.`)) return;

  const updates = { ['plans/' + currentPlanId]: null };
  Object.keys(layoutData.stands || {}).forEach(letter => {
    const s = layoutData.stands[letter];
    if ((s.planId || 'magaza') === currentPlanId) updates['stands/' + letter] = null;
  });
  dbLayout.update(updates, () => showToast("Kroki silindi."));
}

const STAND_SIZE_PRESETS = {
  small:  { w: 11, h: 14 },
  medium: { w: 15, h: 18 },
  large:  { w: 24, h: 24 },
  wide:   { w: 32, h: 12 }
};

function addStand() {
  if (currentRole !== 'admin') return;
  const letter = document.getElementById('ns-letter').value.trim().toUpperCase();
  const slots = parseInt(document.getElementById('ns-slots').value, 10) || 1;
  const sizeKey = document.getElementById('ns-size').value;
  const size = STAND_SIZE_PRESETS[sizeKey] || STAND_SIZE_PRESETS.medium;
  const label = document.getElementById('ns-label').value.trim();

  if (!letter || !/^[A-ZÇĞİÖŞÜ0-9]{1,2}$/.test(letter)) {
    alert("Stand harfi 1-2 karakter olmalı (örn: A, B, K2).");
    return;
  }
  if (layoutData.stands && layoutData.stands[letter]) {
    alert("Bu harfte bir stand zaten var: " + letter);
    return;
  }

  const existingCount = Object.values(layoutData.stands || {}).filter(s => (s.planId || 'magaza') === currentPlanId).length;
  const x = Math.min(80, (existingCount * 9) % 82);
  const y = Math.min(78, Math.floor((existingCount * 9) / 82) * 22);

  dbLayout.child('stands').child(letter).set({ x, y, w: size.w, h: size.h, slotCount: slots, label, planId: currentPlanId }, (err) => {
    if (err) { alert("Kaydedilemedi: " + err.message); return; }
    showToast("Stand eklendi: " + letter + " — krokide sürükleyerek yerine taşıyabilirsiniz.");
    document.getElementById('ns-letter').value = '';
    document.getElementById('ns-label').value = '';
    document.getElementById('stand-form-card').style.display = 'none';
  });
}

function deleteStand(evt, letter) {
  if (currentRole !== 'admin') return;
  evt.stopPropagation();
  if (!confirm(`"${letter}" standını krokiden silmek istiyor musunuz? (Bu standa atanmış ürünlerin konum bilgisi otomatik temizlenmez, gerekirse elle güncelleyin.)`)) return;
  dbLayout.child('stands').child(letter).remove(() => showToast("Stand silindi."));
}

function productsInStand(letter) {
  return Object.values(productsData).filter(p => p.location && p.location.split('-')[0] === letter);
}

function migrateStandIfNeeded(letter, s) {
  if (s.x != null && s.y != null && s.planId) return s;
  const migrated = {
    ...s,
    x: s.x != null ? s.x : Math.min(85, (s.col || 0) * 16),
    y: s.y != null ? s.y : Math.min(80, (s.row || 0) * 20),
    w: s.w || STAND_SIZE_PRESETS.medium.w,
    h: s.h || STAND_SIZE_PRESETS.medium.h,
    planId: s.planId || 'magaza'
  };
  dbLayout.child('stands').child(letter).update({ x: migrated.x, y: migrated.y, w: migrated.w, h: migrated.h, planId: migrated.planId });
  return migrated;
}

function renderLayoutGrid() {
  const canvas = document.getElementById('layout-grid');
  if (!canvas) return;

  if (!currentPlanId) {
    canvas.innerHTML = `<p style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; text-align:center; color:var(--steel); font-size:13px; padding:20px;">${currentRole === 'admin' ? 'Önce "+ Yeni Kroki" ile bir kroki oluşturun.' : 'Görüntülenebilir bir kroki yok.'}</p>`;
    return;
  }

  const allStands = (layoutData && layoutData.stands) ? layoutData.stands : {};
  const letters = Object.keys(allStands)
    .filter(l => (allStands[l].planId || 'magaza') === currentPlanId)
    .sort();

  if (letters.length === 0) {
    canvas.innerHTML = `<p style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; text-align:center; color:var(--steel); font-size:13px; padding:20px;">Bu krokide henüz stand yok. ${currentRole === 'admin' ? '"+ Stand Ekle" ile başlayın.' : 'Yönetici standları tanımladığında burada görünecek.'}</p>`;
    return;
  }

  canvas.innerHTML = '';
  canvas.classList.toggle('view-only', currentRole !== 'admin' || !layoutEditMode);
  letters.forEach(letter => {
    let s = allStands[letter];
    s = migrateStandIfNeeded(letter, s);
    const count = productsInStand(letter).length;
    const box = document.createElement('div');
    box.className = 'stand-box' + (count > 0 ? ' has-items' : ' empty-stand');
    box.id = 'stand-' + letter;
    box.style.left = (s.x || 0) + '%';
    box.style.top = (s.y || 0) + '%';
    box.style.width = (s.w || STAND_SIZE_PRESETS.medium.w) + '%';
    box.style.height = (s.h || STAND_SIZE_PRESETS.medium.h) + '%';
    box.innerHTML = `
      ${currentRole === 'admin' ? `
        <button class="stand-del" onclick="deleteStand(event, '${letter}')">✕</button>
        <button class="stand-rotate" onclick="rotateStand(event, '${letter}')" title="90° Döndür">⟲</button>
      ` : ''}
      <span class="stand-status-dot">${count > 0 ? '🟢' : '⚪'}</span>
      <div class="stand-letter">${letter}</div>
      <div class="stand-label">${s.label || ''}</div>
      <div class="stand-count">${count} ürün · ${s.slotCount || 0} bölme</div>
      ${(currentRole === 'admin' && layoutEditMode) ? `<div class="stand-resize-handle" title="Sürükleyerek boyutlandır"></div>` : ''}
    `;
    box.addEventListener('mousedown', (e) => startStandDrag(e, letter));
    box.addEventListener('touchstart', (e) => startStandDrag(e, letter), { passive: false });
    box.addEventListener('click', () => { if (currentRole !== 'admin' || !layoutEditMode) openStandDetail(letter); });
    canvas.appendChild(box);

    if (currentRole === 'admin' && layoutEditMode) {
      const handle = box.querySelector('.stand-resize-handle');
      if (handle) {
        handle.addEventListener('mousedown', (e) => startStandResize(e, letter));
        handle.addEventListener('touchstart', (e) => startStandResize(e, letter), { passive: false });
      }
    }
  });
}

function rotateStand(evt, letter) {
  if (currentRole !== 'admin') return;
  evt.stopPropagation();
  const s = layoutData.stands[letter];
  if (!s) return;
  const w = s.w || STAND_SIZE_PRESETS.medium.w;
  const h = s.h || STAND_SIZE_PRESETS.medium.h;
  const maxX = Math.max(0, 100 - h);
  const maxY = Math.max(0, 100 - w);
  dbLayout.child('stands').child(letter).update({
    w: h, h: w,
    x: Math.min(maxX, s.x || 0),
    y: Math.min(maxY, s.y || 0)
  });
}

let standDrag = null;
let standResize = null;
let layoutEditMode = false;

function toggleLayoutEditMode() {
  if (currentRole !== 'admin') return;
  layoutEditMode = !layoutEditMode;
  const btn = document.getElementById('edit-mode-toggle-btn');
  const hint = document.getElementById('layout-hint-text');
  if (layoutEditMode) {
    btn.textContent = '🔓 Düzenle Modu: Açık';
    btn.classList.add('btn-primary');
    btn.classList.remove('btn-dark');
    hint.innerHTML = '<b>Düzenleme modu açık:</b> Standları sürükleyerek taşıyabilir, sağ-alt köşesindeki sarı koldan tutup <b>boyutlandırabilir</b>, ⟲ ile döndürebilirsiniz. Bitirince tekrar kapatmayı unutmayın.';
  } else {
    btn.textContent = '✏️ Düzenle Modu: Kapalı';
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-dark');
    hint.innerHTML = 'Bir standa <b>tıklayınca</b> içindekileri görürsünüz. Standları taşımak için önce "✏️ Düzenle Modu"nu açın. 🟢 dolu, ⚪ boş standı gösterir.';
  }
  renderLayoutGrid();
}

function startStandDrag(evt, letter) {
  if (currentRole !== 'admin' || !layoutEditMode) return;
  evt.preventDefault();
  const canvas = document.getElementById('layout-grid');
  const rect = canvas.getBoundingClientRect();
  const point = evt.touches ? evt.touches[0] : evt;
  const s = layoutData.stands[letter] || {};
  standDrag = {
    letter,
    rect,
    startX: point.clientX,
    startY: point.clientY,
    origX: s.x || 0,
    origY: s.y || 0,
    w: s.w || STAND_SIZE_PRESETS.medium.w,
    h: s.h || STAND_SIZE_PRESETS.medium.h,
    moved: false,
    newX: null,
    newY: null
  };
  document.getElementById('stand-' + letter).classList.add('dragging');
  window.addEventListener('mousemove', onStandDragMove);
  window.addEventListener('touchmove', onStandDragMove, { passive: false });
  window.addEventListener('mouseup', endStandDrag);
  window.addEventListener('touchend', endStandDrag);
}

function onStandDragMove(evt) {
  if (!standDrag) return;
  evt.preventDefault();
  const point = evt.touches ? evt.touches[0] : evt;
  const dx = ((point.clientX - standDrag.startX) / standDrag.rect.width) * 100;
  const dy = ((point.clientY - standDrag.startY) / standDrag.rect.height) * 100;
  if (Math.abs(dx) > 0.6 || Math.abs(dy) > 0.6) standDrag.moved = true;
  const maxX = Math.max(0, 100 - standDrag.w);
  const maxY = Math.max(0, 100 - standDrag.h);
  const newX = Math.min(maxX, Math.max(0, standDrag.origX + dx));
  const newY = Math.min(maxY, Math.max(0, standDrag.origY + dy));
  const box = document.getElementById('stand-' + standDrag.letter);
  if (box) { box.style.left = newX + '%'; box.style.top = newY + '%'; }
  standDrag.newX = newX;
  standDrag.newY = newY;
}

function endStandDrag() {
  if (!standDrag) return;
  const { letter, moved, newX, newY } = standDrag;
  const box = document.getElementById('stand-' + letter);
  if (box) box.classList.remove('dragging');

  window.removeEventListener('mousemove', onStandDragMove);
  window.removeEventListener('touchmove', onStandDragMove);
  window.removeEventListener('mouseup', endStandDrag);
  window.removeEventListener('touchend', endStandDrag);

  if (moved && newX != null) {
    dbLayout.child('stands').child(letter).update({ x: newX, y: newY });
  } else {
    openStandDetail(letter);
  }
  standDrag = null;
}

function startStandResize(evt, letter) {
  if (currentRole !== 'admin' || !layoutEditMode) return;
  evt.preventDefault();
  evt.stopPropagation();
  const canvas = document.getElementById('layout-grid');
  const rect = canvas.getBoundingClientRect();
  const point = evt.touches ? evt.touches[0] : evt;
  const s = layoutData.stands[letter] || {};
  standResize = {
    letter,
    rect,
    startX: point.clientX,
    startY: point.clientY,
    origW: s.w || STAND_SIZE_PRESETS.medium.w,
    origH: s.h || STAND_SIZE_PRESETS.medium.h,
    x: s.x || 0,
    y: s.y || 0
  };
  const box = document.getElementById('stand-' + letter);
  if (box) box.classList.add('dragging');
  window.addEventListener('mousemove', onStandResizeMove);
  window.addEventListener('touchmove', onStandResizeMove, { passive: false });
  window.addEventListener('mouseup', endStandResize);
  window.addEventListener('touchend', endStandResize);
}

function onStandResizeMove(evt) {
  if (!standResize) return;
  evt.preventDefault();
  const point = evt.touches ? evt.touches[0] : evt;
  const dxPercent = ((point.clientX - standResize.startX) / standResize.rect.width) * 100;
  const dyPercent = ((point.clientY - standResize.startY) / standResize.rect.height) * 100;
  const MIN_SIZE = 6;
  const maxW = 100 - standResize.x;
  const maxH = 100 - standResize.y;
  const newW = Math.min(maxW, Math.max(MIN_SIZE, standResize.origW + dxPercent));
  const newH = Math.min(maxH, Math.max(MIN_SIZE, standResize.origH + dyPercent));
  const box = document.getElementById('stand-' + standResize.letter);
  if (box) {
    box.style.width = newW + '%';
    box.style.height = newH + '%';
  }
  standResize.newW = newW;
  standResize.newH = newH;
}

function endStandResize() {
  if (!standResize) return;
  const { letter, newW, newH } = standResize;
  const box = document.getElementById('stand-' + letter);
  if (box) box.classList.remove('dragging');

  window.removeEventListener('mousemove', onStandResizeMove);
  window.removeEventListener('touchmove', onStandResizeMove);
  window.removeEventListener('mouseup', endStandResize);
  window.removeEventListener('touchend', endStandResize);

  if (newW != null) {
    dbLayout.child('stands').child(letter).update({
      w: Math.round(newW * 10) / 10,
      h: Math.round(newH * 10) / 10
    });
  }
  standResize = null;
}

function openStandDetail(letter) {
  const s = layoutData.stands[letter];
  if (!s) return;
  document.getElementById('stand-detail-title').textContent = `Stand ${letter}${s.label ? ' — ' + s.label : ''}`;
  const itemsInStand = productsInStand(letter);
  const bySlot = {};
  itemsInStand.forEach(p => {
    const slotNum = p.location.split('-')[1] || '?';
    if (!bySlot[slotNum]) bySlot[slotNum] = [];
    bySlot[slotNum].push(p);
  });

  let html = '<div class="slot-grid">';
  const slotCount = s.slotCount || 0;
  for (let i = 1; i <= slotCount; i++) {
    const items = bySlot[String(i)] || [];
    html += `
      <div class="slot-cell ${items.length ? 'filled' : ''}">
        <div class="slot-num">${letter}-${i}</div>
        ${items.map(p => `<div class="slot-item">${p.name}</div>`).join('') || '<div class="slot-item" style="color:var(--steel-line);">boş</div>'}
      </div>
    `;
  }
  html += '</div>';
  document.getElementById('stand-detail-body').innerHTML = html;
  document.getElementById('stand-detail-modal').style.display = 'block';
}

function closeStandDetail() {
  document.getElementById('stand-detail-modal').style.display = 'none';
}

// Stand adını değiştirme (Yerleşim sekmesi)
function editStandLabel() {
  const modal = document.getElementById('stand-detail-modal');
  const titleEl = document.getElementById('stand-detail-title');
  const currentText = titleEl.textContent;
  const letter = currentText.split(' ')[1]; // "Stand A — ..." -> A
  if (!letter) return;
  const s = layoutData.stands[letter];
  if (!s) return;
  const newLabel = prompt("Stand için yeni açıklama girin:", s.label || '');
  if (newLabel === null) return;
  dbLayout.child('stands').child(letter).update({ label: newLabel.trim() }, (err) => {
    if (!err) {
      showToast("Stand adı güncellendi.");
      closeStandDetail();
    }
  });
}

function findProductLocation() {
  const q = document.getElementById('layout-search').value.trim().toLowerCase();
  const resultBox = document.getElementById('layout-search-result');
  if (highlightTimer) { clearTimeout(highlightTimer); highlightTimer = null; }
  document.querySelectorAll('.stand-box.highlight').forEach(el => el.classList.remove('highlight'));

  if (!q) { resultBox.innerHTML = ''; return; }

  const matches = Object.values(productsData).filter(p =>
    (p.name && p.name.toLowerCase().includes(q)) || (p.code && p.code.toLowerCase().includes(q))
  ).slice(0, 8);

  if (matches.length === 0) {
    resultBox.innerHTML = `<p style="font-size:12px; color:var(--steel); margin-top:8px;">Eşleşen ürün yok.</p>`;
    return;
  }

  resultBox.innerHTML = matches.map(p => `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-top:1px solid var(--steel-line);">
      <span style="font-size:13px;">${p.name}</span>
      ${p.location
        ? `<span class="location-badge" onclick="highlightStand('${p.location.split('-')[0]}')">📍 ${p.location}</span>`
        : `<span style="font-size:11px; color:var(--steel);">Konum atanmamış</span>`}
    </div>
  `).join('');
}

function highlightStand(letter) {
  const s = layoutData.stands ? layoutData.stands[letter] : null;
  if (!s) { showToast("Bu stand krokide bulunamadı: " + letter); return; }

  const targetPlanId = s.planId || 'magaza';
  const plan = layoutPlans[targetPlanId];
  if (plan && plan.visibility === 'admin' && currentRole !== 'admin') {
    showToast("Bu konum sadece yöneticiye açık bir krokide.");
    return;
  }

  const doHighlight = () => {
    const box = document.getElementById('stand-' + letter);
    if (!box) return;
    document.querySelectorAll('.stand-box.highlight').forEach(el => el.classList.remove('highlight'));
    box.classList.add('highlight');
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (highlightTimer) clearTimeout(highlightTimer);
    highlightTimer = setTimeout(() => box.classList.remove('highlight'), 4000);
  };

  if (currentPlanId !== targetPlanId) {
    currentPlanId = targetPlanId;
    renderPlanSelector();
    renderLayoutGrid();
    setTimeout(doHighlight, 60);
  } else {
    doHighlight();
  }
}

function goToLocation(location) {
  if (!location) return;
  switchTab('yerlesim');
  setTimeout(() => highlightStand(location.split('-')[0]), 150);
}

function currentBrandList() {
  return Object.keys(brandSettingsData).sort((a, b) => a.localeCompare(b, 'tr'));
}

function maybeSeedDefaultBrands() {
  if (Object.keys(brandSettingsData).length > 0) return;
  const updates = {};
  DEFAULT_BRANDS.forEach(b => {
    updates['brand_settings/' + b] = { discount: 0, vat: 0 };
  });
  dbRoot.update(updates);
}

function populateBrandSelect(selectId, selectedValue) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = '<option value="">Marka Seçilmedi</option>' +
    currentBrandList().map(b => `<option value="${b}">${b}</option>`).join('');
  sel.value = selectedValue || '';
}

function addBrandGroup() {
  if (currentRole !== 'admin') return;
  const input = document.getElementById('new-brand-name');
  const name = input.value.trim();
  if (!name) { alert("Marka adı girin."); return; }
  if (brandSettingsData[name]) { alert("Bu marka zaten listede: " + name); return; }
  dbBrandSettings.child(name).set({ discount: 0, vat: 0 }, (err) => {
    if (err) { alert("Eklenemedi: " + err.message); return; }
    input.value = '';
    showToast("Marka eklendi: " + name);
  });
}

function deleteBrandGroup(evt, brand) {
  if (currentRole !== 'admin') return;
  evt.stopPropagation();
  if (!confirm(`"${brand}" markasını listeden kalıcı olarak silmek istiyor musunuz? (Bu markaya atanmış ürünlerin marka bilgisi otomatik temizlenmez.)`)) return;
  dbBrandSettings.child(brand).remove(() => showToast("Marka silindi: " + brand));
}

function renderBrandSettings() {
  const box = document.getElementById('brand-settings-list');
  if (!box) return;
  const brands = currentBrandList();

  let html = `
    <div style="display:flex; gap:8px; align-items:flex-end; padding-bottom:10px; margin-bottom:4px; border-bottom:2px solid var(--charcoal);">
      <div style="flex:1;"><label style="margin-bottom:2px;">Yeni Marka Adı</label><input type="text" id="new-brand-name" placeholder="Örn: Makita"></div>
      <button class="btn btn-primary btn-sm" style="width:auto;" onclick="addBrandGroup()">+ Marka Ekle</button>
    </div>
  `;

  if (brands.length === 0) {
    html += `<p style="font-size:12px; color:var(--steel); text-align:center; padding:14px 0;">Henüz marka eklenmedi.</p>`;
  } else {
    html += brands.map(brand => {
      const s = brandSettingsData[brand] || {};
      return `
        <div style="display:flex; gap:8px; align-items:flex-end; padding:8px 0; border-top:1px solid var(--steel-line);">
          <div style="flex:1.2;"><label style="margin-bottom:2px;">${brand}</label></div>
          <div style="flex:1;">
            <label style="margin-bottom:2px;">İskonto %</label>
            <input type="number" step="0.01" id="bs-discount-${brand}" value="${s.discount != null ? s.discount : ''}" placeholder="0">
          </div>
          <div style="flex:1;">
            <label style="margin-bottom:2px;">KDV %</label>
            <input type="number" step="0.01" id="bs-vat-${brand}" value="${s.vat != null ? s.vat : ''}" placeholder="0">
          </div>
          <button class="btn btn-dark btn-sm" style="width:auto;" onclick="saveBrandSetting('${brand}')">Kaydet</button>
          <button class="stand-del" style="position:static; font-size:16px;" onclick="deleteBrandGroup(event, '${brand}')" title="Markayı Sil">✕</button>
        </div>
      `;
    }).join('');
  }

  box.innerHTML = html;
}

function saveBrandSetting(brand) {
  if (currentRole !== 'admin') return;
  const discount = parseFloat(document.getElementById(`bs-discount-${brand}`).value) || 0;
  const vat = parseFloat(document.getElementById(`bs-vat-${brand}`).value) || 0;
  dbBrandSettings.child(brand).set({ discount, vat }, (err) => {
    if (err) { alert("Kaydedilemedi: " + err.message); return; }
    showToast(`${brand} için oranlar kaydedildi.`);
  });
}

function updateCostCalc(prefix, costFieldId) {
  const brand = document.getElementById(`${prefix}-brand`).value;
  const costInput = document.getElementById(costFieldId || `${prefix}-cost-price`);
  const costPrice = costInput ? parseFloat(costInput.value) : NaN;
  const box = document.getElementById(`${prefix}-cost-calc`);

  if (!brand || isNaN(costPrice) || costPrice <= 0) {
    box.classList.remove('active');
    box.innerHTML = '';
    return;
  }

  const s = brandSettingsData[brand];
  if (!s || (s.discount == null && s.vat == null)) {
    box.classList.add('active');
    box.innerHTML = `<b>${brand}</b> için henüz iskonto/KDV oranı girilmemiş — "Marka İskonto/KDV Ayarları" panelinden ekleyin.`;
    return;
  }

  const discount = s.discount || 0;
  const vat = s.vat || 0;
  const afterDiscount = costPrice * (1 - discount / 100);
  const netCost = afterDiscount * (1 + vat / 100);

  box.classList.add('active');
  box.innerHTML = `
    Geliş Fiyatı: <b>₺${costPrice.toFixed(2)}</b> →
    İskonto (%${discount}) sonrası: <b>₺${afterDiscount.toFixed(2)}</b> →
    + KDV (%${vat}) = Net Maliyet: <b>₺${netCost.toFixed(2)}</b>
  `;
}

function updateAddProfit() {
  const cost = parseFloat(document.getElementById('f-cost-price').value);
  const vat = parseFloat(document.getElementById('f-vat').value) || 0;
  const profit = parseFloat(document.getElementById('f-profit').value) || 0;
  const suggestedInput = document.getElementById('f-suggested-price');

  if (!isNaN(cost) && cost > 0) {
    const costWithVat = cost * (1 + (vat / 100));
    const suggested = costWithVat * (1 + (profit / 100));
    suggestedInput.value = "₺ " + suggested.toFixed(2);
    suggestedInput.dataset.value = suggested.toFixed(2);
  } else {
    suggestedInput.value = "";
    suggestedInput.dataset.value = "";
  }
}

function updateEditProfit() {
  const cost = parseFloat(document.getElementById('edit-cost-price').value);
  const vat = parseFloat(document.getElementById('edit-vat').value) || 0;
  const profit = parseFloat(document.getElementById('edit-profit').value) || 0;
  const suggestedInput = document.getElementById('edit-suggested-price');

  if (!isNaN(cost) && cost > 0) {
    const costWithVat = cost * (1 + (vat / 100));
    const suggested = costWithVat * (1 + (profit / 100));
    suggestedInput.value = "₺ " + suggested.toFixed(2);
    suggestedInput.dataset.value = suggested.toFixed(2);
  } else {
    suggestedInput.value = "";
    suggestedInput.dataset.value = "";
  }
}

function updateFisProfit(prefix) {
  prefix = prefix || 'fis';
  const suggestedInput = document.getElementById(`${prefix}-suggested-price`);
  if(!suggestedInput) return;
  const cost = parseFloat(document.getElementById(`${prefix}-cost`).value);
  const vat = parseFloat(document.getElementById(`${prefix}-vat`).value) || 0;
  const profit = parseFloat(document.getElementById(`${prefix}-profit`).value) || 0;

  if(!isNaN(cost) && cost > 0) {
    const costWithVat = cost * (1 + (vat / 100));
    const suggested = costWithVat * (1 + (profit / 100));
    suggestedInput.value = "₺ " + suggested.toFixed(2);
    suggestedInput.dataset.value = suggested.toFixed(2);
  } else {
    suggestedInput.value = "";
    suggestedInput.dataset.value = "";
  }
}

function applySuggestedPrice(prefix) {
  const suggestedInput = document.getElementById(`${prefix}-suggested-price`);
  const val = suggestedInput.dataset.value;
  if (!val) { showToast("Önce geliş fiyatı ve hedef kârı girin."); return; }
  document.getElementById(`${prefix}-price`).value = val;
  showToast("Birim fiyat ₺" + val + " olarak dolduruldu.");
}

function renderRecentUpdates() {
  const box = document.getElementById('recent-updates-list');
  if (!box) return;
  const all = Object.values(productsData);
  const withDate = all.filter(p => p.lastPriceUpdate).sort((a, b) => new Date(b.lastPriceUpdate) - new Date(a.lastPriceUpdate));
  const withoutDate = all.filter(p => !p.lastPriceUpdate).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'tr'));
  const list = withDate.slice(0, 25);
  const extraCount = withoutDate.length;

  if (list.length === 0 && extraCount === 0) {
    box.innerHTML = `<p style="font-size:12px; color:var(--steel); text-align:center; padding:10px 0;">Henüz hiç ürün yok.</p>`;
    return;
  }

  let html = list.map(p => {
    const d = new Date(p.lastPriceUpdate);
    const dateStr = d.toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
    return `
      <div class="recent-update-row">
        <div>
          <div>${p.name} <span style="color:var(--steel); font-size:10px;">(${p.code})</span></div>
          <div class="ru-time">${dateStr}${p.lastUpdatedBy ? ' · ' + p.lastUpdatedBy : ''}</div>
        </div>
        <div style="text-align:right;">
          <div>Satış: <b>₺${formatMoney(p.price || 0)}</b></div>
          ${p.costPrice != null ? `<div style="color:var(--steel);">Geliş: ₺${formatMoney(p.costPrice)}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  if (extraCount > 0) {
    html += `
      <div class="recent-update-row" style="color:var(--steel); font-style:italic;">
        <div>${extraCount} üründe henüz güncelleme tarihi yok (bu özellik eklenmeden önce oluşturulmuş — bir kez düzenleyip kaydedince tarih başlayacak).</div>
      </div>
    `;
  }

  box.innerHTML = html;
}

function switchTab(tabName) {
  if(tabName === 'ekle' && currentRole !== 'admin') { alert("Yetkiniz yok!"); return; }
  if(tabName === 'toptanci' && currentRole !== 'admin') { alert("Yetkiniz yok!"); return; }
  if(tabName === 'borc' && currentRole !== 'admin') { alert("Yetkiniz yok!"); return; }
  if(tabName === 'acikhesap' && currentRole !== 'admin') { alert("Yetkiniz yok!"); return; }
  if((tabName === 'siparis' || tabName === 'raporlar' || tabName === 'gorevler' || tabName === 'yerlesim' || tabName === 'fis' || tabName === 'katalog') && currentRole !== 'admin' && currentRole !== 'staff') { alert("Yetkiniz yok!"); return; }

  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  
  document.getElementById('tab-' + tabName).classList.add('active');
  
  const allBtns = document.querySelectorAll('.tab-btn');
  for(let i=0; i<allBtns.length; i++) {
    if(allBtns[i].id === 'nav-' + tabName + '-btn') {
      allBtns[i].classList.add('active');
    }
  }
  if(tabName === 'okut') startScanner(); else stopScanner();
  if(tabName === 'acikhesap' && typeof renderCustomerAccounts === 'function') renderCustomerAccounts();
  if(tabName === 'katalog' && typeof initKatalogTab === 'function') initKatalogTab();
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', 2500);
}

function printThermalReceipt(items, total) {
  const now = new Date();
  document.getElementById('t-date').textContent = now.toLocaleDateString('tr-TR');
  document.getElementById('t-time').textContent = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  
  let itemsHtml = '';
  items.forEach(item => {
    itemsHtml += `
      <div style="margin-bottom: 3px; display:flex; justify-content:space-between; font-size:10px;">
        <span>${item.name} (${item.qty} ${item.unit || 'Adet'})</span>
        <span>₺${formatMoney(item.total)}</span>
      </div>
    `;
  });

  document.getElementById('t-items-list').innerHTML = itemsHtml;
  document.getElementById('t-total').textContent = '₺' + formatMoney(total);

  document.body.className = 'printing-receipt';
  setTimeout(() => {
    window.print();
    document.body.className = '';
  }, 250);
}

function renderNotifications() {
  const listDiv = document.getElementById('notifications-list');
  const badge = document.getElementById('notif-badge');
  if(!listDiv) return;
  
  listDiv.innerHTML = '';
  const keys = Object.keys(notificationsData);
  
  if(keys.length === 0) {
    listDiv.innerHTML = '<p style="font-size:13px; color:var(--steel); text-align:center; padding:10px;">Yeni bildirim bulunmuyor.</p>';
    badge.style.display = 'none';
    return;
  }
  
  badge.style.display = 'inline-block';
  badge.textContent = keys.length + " Yeni";
  
  const __notifParts = [];
  keys.reverse().forEach(key => {
    const n = notificationsData[key];
    __notifParts.push(`
      <div style="background:#F1F5F9; border:1px solid var(--steel-line); padding:10px; border-radius:6px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; gap:10px;">
         <div>
            <div style="font-size:12px; font-weight:bold; color:var(--charcoal);">📥 ${n.text}</div>
            <div style="font-size:10px; color:var(--steel); font-family:'IBM Plex Mono';">🕒 ${n.time}</div>
         </div>
         <div style="display:flex; flex-direction:column; gap:4px;">
           <button class="btn btn-primary btn-sm" onclick="convertNotifToTask('${key}')" style="white-space:nowrap;">Çalışana Görev Ata</button>
           <button class="sm-btn" onclick="dismissNotification('${key}')" style="color:var(--steel);">Yoksay / Kapat</button>
         </div>
      </div>
    `);
  });
  listDiv.innerHTML = __notifParts.join('');
}

function dismissNotification(notifKey) {
  if(currentRole !== 'admin') return;
  dbNotifications.child(notifKey).remove();
}

function convertNotifToTask(notifKey) {
  if(currentRole !== 'admin') return;
  const n = notificationsData[notifKey];
  if(!n) return;
  
  const personSelect = document.getElementById('m-task-person');
  const assignedPerson = personSelect ? personSelect.value : "Tüm Ekip";
  const taskText = `Ürün Giriş Yerleşimi: ${n.text}`;
  dbTasks.push({
    text: taskText,
    person: assignedPerson,
    category: "Ürün Kabul",
    status: "Bekliyor",
    time: "-"
  }, (err) => {
    if(!err) {
      dbNotifications.child(notifKey).remove();
      showToast("Bildirim başarıyla çalışana görev olarak atandı!");
    }
  });
}

function handleManagerAssignTask(e) {
  e.preventDefault();
  if(currentRole !== 'admin') return;
  
  const text = document.getElementById('m-task-desc').value.trim();
  const person = document.getElementById('m-task-person').value;
  
  if(!text) return;
  
  dbTasks.push({
    text: text,
    person: person,
    category: "Yönetici Talimatı",
    status: "Bekliyor",
    time: "-"
  }, (err) => {
    if(!err) {
      document.getElementById('m-task-desc').value = '';
      showToast("Görev başarıyla eklendi!");
    }
  });
}

function toggleTaskStatus(taskId) {
  if(currentRole !== 'admin' && currentRole !== 'staff') return;
  const task = tasksData[taskId];
  if(!task) return;
  
  const newStatus = task.status === 'Tamamlandı' ? 'Bekliyor' : 'Tamamlandı';
  const newTime = newStatus === 'Tamamlandı' ? new Date().toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit'}) : '-';
  
  dbTasks.child(taskId).update({
    status: newStatus,
    time: newTime
  }, (err) => {
    if(!err) {
      showToast(newStatus === 'Tamamlandı' ? "Görev tamamlandı olarak işaretlendi! ✅" : "Görev durumu güncellendi.");
    }
  });
}

function deleteTask(taskId) {
  if(currentRole !== 'admin') return;
  if(confirm("Bu görevi silmek istediğinize emin misiniz?")) {
    dbTasks.child(taskId).remove();
    showToast("Görev silindi.");
  }
}

function toggleSelectAllTasks(masterCheckbox) {
  selectedTaskIds.clear();
  if (masterCheckbox.checked) {
    Object.keys(tasksData).forEach(id => selectedTaskIds.add(id));
  }
  renderTasks();
}

function toggleTaskSelection(taskId, checkbox) {
  if (checkbox.checked) {
    selectedTaskIds.add(taskId);
  } else {
    selectedTaskIds.delete(taskId);
  }
  updateBulkDeleteUI();

  const master = document.getElementById('select-all-tasks');
  const allKeys = Object.keys(tasksData);
  if (master) {
    master.checked = allKeys.length > 0 && allKeys.every(k => selectedTaskIds.has(k));
  }
}

function updateBulkDeleteUI() {
  const actionContainer = document.getElementById('bulk-task-actions');
  const bulkBtn = document.getElementById('bulk-del-btn');
  const countSpan = document.getElementById('selected-task-count');
  
  if (!actionContainer || !bulkBtn) return;

  if (currentRole === 'admin') {
    actionContainer.style.display = 'flex';
    countSpan.textContent = `${selectedTaskIds.size} görev seçildi`;
    if (selectedTaskIds.size > 0) {
      bulkBtn.style.display = 'inline-block';
    } else {
      bulkBtn.style.display = 'none';
    }
  } else {
    actionContainer.style.display = 'none';
  }
}

function deleteSelectedTasks() {
  if (currentRole !== 'admin') return;
  if (selectedTaskIds.size === 0) return;

  if (confirm(`Seçilen ${selectedTaskIds.size} görevi kalıcı olarak silmek istediğinize emin misiniz?`)) {
    const updates = {};
    selectedTaskIds.forEach(id => {
      updates[id] = null;
    });

    dbTasks.update(updates, (err) => {
      if (!err) {
        showToast(`${selectedTaskIds.size} görev silindi.`);
        selectedTaskIds.clear();
        renderTasks();
      }
    });
  }
}

function renderTasks() {
  const tbody = document.getElementById('tasks-table-body');
  if(!tbody) return;
  
  const keys = Object.keys(tasksData);
  const __taskParts = [];
  selectedTaskIds.forEach(id => { if(!tasksData[id]) selectedTaskIds.delete(id); });
  updateBulkDeleteUI();

  if(keys.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:15px; color:var(--steel);">Kayıtlı görev bulunmuyor.</td></tr>`;
    const master = document.getElementById('select-all-tasks');
    if(master) master.checked = false;
    return;
  }
  
  keys.reverse().forEach(key => {
    const t = tasksData[key];
    const isDone = t.status === 'Tamamlandı';
    const isSelected = selectedTaskIds.has(key);
    const isAdmin = currentRole === 'admin';
    
    __taskParts.push(`
      <tr style="border-bottom:1px dashed var(--steel-line);">
        <td style="padding:10px 4px; text-align:center;">
          <input type="checkbox" value="${key}" ${isSelected ? 'checked' : ''} onclick="toggleTaskSelection('${key}', this)">
        </td>
        <td style="padding:10px 4px;">
          <strong>${t.text}</strong><br>
          <span style="font-size:10px; color:var(--steel);">Kategori: ${t.category || 'Genel'}</span>
        </td>
        <td style="padding:10px 4px; font-weight:500;">${t.person}</td>
        <td style="padding:10px 4px;">
          ${isDone ? `<span style="color:var(--success); font-weight:bold; font-size:12px;">✅ Tamamlandı (${t.time})</span>` : `<span style="color:var(--rust); font-weight:bold; font-size:12px;">⏳ Bekliyor</span>`}
        </td>
        <td style="padding:10px 4px; text-align:center; white-space:nowrap;">
          <button class="btn btn-sm ${isDone ? 'btn-success' : 'btn-dark'}" onclick="toggleTaskStatus('${key}')">
            ${isDone ? '✅ Tamamlandı (Geri Al)' : '🔲 Yeşil Tik İle Bitir'}
          </button>
          ${isAdmin ? `<button class="sm-btn" onclick="deleteTask('${key}')" style="color:var(--rust); margin-left:8px;">Sil</button>` : ''}
        </td>
      </tr>
    `);
  });
  tbody.innerHTML = __taskParts.join('');

  const master = document.getElementById('select-all-tasks');
  if(master) {
    master.checked = keys.length > 0 && keys.every(k => selectedTaskIds.has(k));
  }
}

function updateOrderProductList() {
  const dl = document.getElementById('order-product-list');
  const dlFis = document.getElementById('fis-product-list');
  if(dl) dl.innerHTML = '';
  if(dlFis) dlFis.innerHTML = '';
  Object.values(productsData).forEach(p => {
    const optVal = `${p.code} - ${p.name}`;
    if(dl) { const opt = document.createElement('option'); opt.value = optVal; dl.appendChild(opt); }
    if(dlFis) { const optF = document.createElement('option'); optF.value = optVal; dlFis.appendChild(optF); }
  });
}

function normalizeTr(str) {
  return (str || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[^a-z0-9ğüşıöç\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Folds Turkish-specific letters to their closest ASCII equivalent (ş→s, ı→i, ö→o,
// ü→u, ç→c, ğ→g) so "Musluk Bataryasi" and "Musluk Bataryası" — or any other
// typo that swaps a Turkish letter for its plain counterpart — are still recognized
// as the same product when scanning for duplicates.
function foldTr(str) {
  return normalizeTr(str)
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g');
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
      dp[j] = a[i-1] === b[j-1] ? prev : 1 + Math.min(prev, dp[j], dp[j-1]);
      prev = temp;
    }
  }
  return dp[n];
}

function similarityRatio(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - (levenshteinDistance(a, b) / maxLen);
}

// Cache each product's normalized/folded name + token set so we don't redo that
// work (and re-run Levenshtein prep) on every single keystroke — this is what was
// making name search feel slow once the product list grew large.
let _prodMatchCache = {};
function getProductMatchMeta(p) {
  const cached = _prodMatchCache[p.code];
  if (cached && cached.name === p.name) return cached;
  const norm = normalizeTr(p.name || '');
  const fold = foldTr(p.name || '');
  const tokens = new Set(fold.split(' ').filter(t => t.length > 2));
  const meta = { name: p.name, norm, fold, tokens };
  _prodMatchCache[p.code] = meta;
  return meta;
}

function findSimilarProducts(inputName, limit) {
  limit = limit || 4;
  const norm = normalizeTr(inputName);
  if (!norm || norm.length < 4) return [];

  const inputTokens = norm.split(' ').filter(Boolean);
  if (inputTokens.length === 1 && inputTokens[0].length < 4) return [];

  const foldInput = foldTr(inputName);
  const foldInputTokens = new Set(foldInput.split(' ').filter(t => t.length > 2));

  const scored = [];
  const allProducts = Object.values(productsData);
  for (let idx = 0; idx < allProducts.length; idx++) {
    const p = allProducts[idx];
    const meta = getProductMatchMeta(p);
    if (!meta.norm || meta.norm.length < 3) continue;

    // Cheap pre-filter before running Levenshtein: only bother comparing names
    // that already look at least loosely related (shared word, one contains the
    // other, or similar length). This is what keeps large product lists fast.
    const substringHit = meta.fold.includes(foldInput) || foldInput.includes(meta.fold);
    let foldedOverlapCount = 0;
    foldInputTokens.forEach(t => { if (meta.tokens.has(t)) foldedOverlapCount++; });
    const lengthClose = Math.abs(meta.norm.length - norm.length) <= Math.max(4, Math.ceil(norm.length * 0.4));
    if (!substringHit && foldedOverlapCount === 0 && !lengthClose) continue;

    let score = Math.max(similarityRatio(norm, meta.norm), similarityRatio(foldInput, meta.fold));
    if (substringHit || meta.norm.includes(norm) || norm.includes(meta.norm)) score = Math.max(score, 0.85);

    const pnTokens = meta.norm.split(' ').filter(Boolean);
    if (inputTokens.length > 0 && pnTokens.length > 0) {
      const overlap = inputTokens.filter(t => t.length > 2 && pnTokens.includes(t)).length;
      score = Math.max(score, (overlap / inputTokens.length) * 0.9);
    }
    if (foldInputTokens.size > 0 && foldedOverlapCount > 0) {
      score = Math.max(score, (foldedOverlapCount / foldInputTokens.size) * 0.9);
    }

    // No upper cap here: if what's typed matches an existing product's name exactly
    // (just with/without Turkish-specific letters, e.g. "Bataryasi" vs "Bataryası"),
    // that's precisely the duplicate we want to catch and surface as a suggestion.
    if (score >= 0.70) scored.push({ product: p, score });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

let _nameDupDebounce = null;
function checkNameDuplicate() {
  const nameInput = document.getElementById('f-name');
  const warnBox = document.getElementById('f-name-duplicate-warning');
  if (!nameInput || !warnBox) return;
  const val = nameInput.value.trim();

  if (_nameDupDebounce) clearTimeout(_nameDupDebounce);
  if (!val) { warnBox.innerHTML = ''; warnBox.style.display = 'none'; return; }

  // Debounce the fuzzy search itself so it runs once after the user pauses typing,
  // not on every keystroke — this is what was making the search feel slow/laggy.
  _nameDupDebounce = setTimeout(() => {
    const matches = findSimilarProducts(val);
    if (matches.length === 0) { warnBox.innerHTML = ''; warnBox.style.display = 'none'; return; }

    warnBox.style.display = 'block';
    warnBox.innerHTML = `
      <div style="font-weight:600; margin-bottom:6px;">⚠️ Bu ürün sistemde zaten kayıtlı olabilir. Yeni ürün olarak mı devam edelim, yoksa aşağıdakinin üstüne mi ekleyelim?</div>
      ${matches.map(m => `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:5px 0; border-top:1px dashed var(--steel-line);">
          <span>${m.product.name} <small style="color:var(--steel); font-family:'IBM Plex Mono';">(${m.product.code}, stok: ${m.product.qty ?? 0})</small></span>
          <button type="button" class="sm-btn" style="flex-shrink:0;" onclick="openEditModal('${m.product.code}')">Üstüne Ekle / Düzenle</button>
        </div>
      `).join('')}
    `;
  }, 250);
}

function renderFisWholesalerOptions() {
  const sel = document.getElementById('fis-wholesaler');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">-- Toptancı Seçin --</option>';
  Object.keys(wholesalersData).forEach(key => {
    const w = wholesalersData[key];
    if ((w.status || 'aktif') === 'pasif') return;
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = w.name;
    sel.appendChild(opt);
  });
  if (current && wholesalersData[current]) sel.value = current;
}

function addToCart() {
  if(currentRole !== 'admin' && currentRole !== 'staff') return;
  const inputVal = document.getElementById('cart-product').value;
  const qty = parseFloat(document.getElementById('cart-qty').value);
  
  if(!inputVal || isNaN(qty) || qty <= 0) {
    alert("Lütfen geçerli bir ürün ve miktar girin.");
    return;
  }
  
  const code = inputVal.split(' - ')[0].trim();
  const p = productsData[code];
  
  if(!p) { alert("Ürün bulunamadı! Lütfen listeden seçin."); return; }
  
  const existingIndex = cart.findIndex(item => item.code === code);
  if(existingIndex !== -1) {
    cart[existingIndex].qty += qty;
    cart[existingIndex].total = cart[existingIndex].qty * cart[existingIndex].price;
  } else {
    const price = Number(p.price || 0);
    cart.push({ code: p.code, name: p.name, price: price, qty: qty, unit: p.unit || 'Adet', total: price * qty });
  }
  
  document.getElementById('cart-product').value = '';
  document.getElementById('cart-qty').value = '1';
  renderCart();
  showToast("Ürün sepete eklendi!");
}

function renderCart() {
  // Sepeti her değişimde tarayıcıya kaydet, böylece sayfa kapansa/yenilense bile kaybolmaz
  localStorage.setItem('reyhani_cart', JSON.stringify(cart));

  const container = document.getElementById('cart-container');
  const tbody = document.getElementById('cart-items');
  
  if(cart.length === 0) { container.style.display = 'none'; return; }
  
  container.style.display = 'block';
  let grandTotal = 0;
  const __cartParts = [];
  
  cart.forEach((item, index) => {
    grandTotal += item.total;
    __cartParts.push(`
      <tr style="border-bottom:1px dashed var(--steel-line);">
        <td style="padding:10px 0; line-height:1.3;">
          <strong>${item.name}</strong><br>
          <small style="color:var(--steel); font-family:'IBM Plex Mono';">${item.code}</small>
        </td>
        <td>₺${formatMoney(item.price)}</td>
        <td style="font-weight:bold;">${item.qty} ${item.unit}</td>
        <td style="font-weight:bold; color:var(--rust);">₺${formatMoney(item.total)}</td>
        <td><button class="btn btn-dark btn-sm" onclick="removeFromCart(${index})">Çıkar</button></td>
      </tr>
    `);
  });
  tbody.innerHTML = __cartParts.join('');
  
  document.getElementById('cart-total').textContent = "₺" + formatMoney(grandTotal);
}

function removeFromCart(index) {
  cart.splice(index, 1);
  renderCart();
}

async function completeOrder() {
  if(cart.length === 0) return;
  
  const dateStr = new Date().toISOString().slice(0, 10);
  const timeStr = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const orderId = "SATIŞ-" + new Date().getTime();
  
  let grandTotal = 0;
  cart.forEach(i => grandTotal += i.total);
  
  cart.forEach(item => {
    if(!productsData[item.code]) return;
    let appliedChange = 0;
    db.child(item.code).child('qty').transaction((currentQty) => {
      const cur = Number(currentQty || 0);
      const next = Math.max(0, cur - item.qty);
      appliedChange = next - cur;
      return next;
    }, (error, committed) => {
      if (error) { console.error(error); return; }
      if (committed && appliedChange !== 0) {
        logMovement(item.code, item.name, appliedChange, 'SATIŞ YAPILDI (SEPET)');
      }
    });
  });

  const orderData = { time: timeStr, items: cart, total: grandTotal };
  
  dbOrders.child(dateStr).child(orderId).set(orderData, async (err) => {
    if(!err) {
      if(confirm("Satış başarıyla tamamlandı. Bu satış için Excel raporu oluşturulsun ve kaydedilsin mi?")) {
        await generateOrderExcel(orderData, orderId, dateStr);
      }
      
      if(confirm("Müşteri için termal fiş basılsın mı?")) {
        printThermalReceipt(cart, grandTotal);
      }
      
      cart = [];
      renderCart();
      renderGrid();
      showToast("Satış ve sepet işlemleri başarıyla tamamlandı!");
    }
  });
}

async function generateOrderExcel(order, orderId, dateStr) {
  const dataRow = [["Sıra", "Ürün Kodu", "Ürün Adı", "Birim Fiyat", "Miktar", "Toplam"]];
  order.items.forEach((item, idx) => {
    dataRow.push([idx+1, item.code, item.name, item.price, item.qty, item.total]);
  });
  dataRow.push(["", "", "", "", "GENEL TOPLAM:", order.total]);

  const ws = XLSX.utils.aoa_to_sheet(dataRow);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Satis");
  
  await saveExcelFile(wb, `Reyhani_Satis_${dateStr}_${orderId}.xlsx`);
}

async function downloadOrderById(orderId) {
  const target = globalPastOrders[orderId];
  if(target) {
    if(confirm("Bu geçmiş satış için Excel raporu tekrar indirilsin mi?")) {
      await generateOrderExcel(target.orderData, orderId, target.date);
    }
  } else {
    alert("Bu satışın detayları bulunamadı.");
  }
}

let _fisMatchDebounce = null;
function checkFisProductMatch() {
  const inputVal = document.getElementById('fis-product').value.trim();
  const possibleCode = inputVal.split(' - ')[0].trim();
  const p = productsData[possibleCode];
  const exists = !!p;

  const newFields = document.getElementById('fis-new-fields');
  const priceFields = document.getElementById('fis-price-fields');
  const priceNote = document.getElementById('fis-price-note');
  const existingUpdateWrap = document.getElementById('fis-existing-update-check-wrap');

  if(!inputVal) {
    if(newFields) newFields.style.display = 'none';
    if(priceFields) priceFields.style.display = 'none';
    if(existingUpdateWrap) existingUpdateWrap.style.display = 'none';
  } else if(exists) {
    if(newFields) newFields.style.display = 'none';
    if(priceFields) priceFields.style.display = 'block';
    if(existingUpdateWrap) existingUpdateWrap.style.display = 'flex';
    if(priceNote) {
      priceNote.innerHTML = `✏️ Bu ürün stokta kayıtlı — şu anki: Geliş ₺${formatMoney(p.costPrice||0)} · Satış ₺${formatMoney(p.price||0)}${p.vat!=null?' · KDV %'+p.vat:''}${p.targetProfit!=null?' · Kâr %'+p.targetProfit:''}. Piyasa fiyatı değiştiyse KDV/kâr oranını girip aşağıdan güncelleyebilirsiniz.`;
    }
    const vatInput = document.getElementById('fis-vat');
    const profitInput = document.getElementById('fis-profit');
    const priceInput = document.getElementById('fis-price');
    const brandInput = document.getElementById('fis-brand');
    if(vatInput && !vatInput.value && p.vat != null) vatInput.value = p.vat;
    if(profitInput && !profitInput.value && p.targetProfit != null) profitInput.value = p.targetProfit;
    if(priceInput && !priceInput.value) priceInput.value = p.price != null ? p.price : '';
    if(brandInput && !brandInput.value) brandInput.value = p.brand || '';
    updateFisProfit();
  } else {
    if(priceFields) priceFields.style.display = 'block';
    if(existingUpdateWrap) existingUpdateWrap.style.display = 'none';
    if(priceNote) priceNote.innerHTML = `ℹ️ Bu malzeme sistemde bulunamadı, <b>YENİ ÜRÜN</b> olarak stoğa eklenecek. Barkod/birim/kategori bilgilerini de girin, aşağıdan satış fiyatını belirleyin:`;
    if(newFields) {
      newFields.style.display = 'block';
      const nb = document.getElementById('fis-new-barcode');
      const pending = document.getElementById('fis-barcode-pending-code').value;
      if(nb && !nb.value && pending) nb.value = pending;
    }
  }

  const warnBox = document.getElementById('fis-duplicate-warning');
  if(!warnBox) return;

  if(_fisMatchDebounce) clearTimeout(_fisMatchDebounce);
  if(!inputVal || exists) { warnBox.innerHTML = ''; warnBox.style.display = 'none'; return; }

  // Debounce the fuzzy search itself so it runs once after the user pauses typing,
  // not on every keystroke — this is what was making name search feel slow.
  _fisMatchDebounce = setTimeout(() => {
    const matches = findSimilarProducts(inputVal);
    if(matches.length === 0) { warnBox.innerHTML = ''; warnBox.style.display = 'none'; return; }

    warnBox.style.display = 'block';
    warnBox.innerHTML = `
      <div style="font-weight:600; margin-bottom:6px;">⚠️ Bu malzeme sistemde zaten kayıtlı olabilir. Gerçekten yeni bir ürün mü, yoksa aşağıdakinin üstüne mi ekleyelim?</div>
      ${matches.map(m => `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:5px 0; border-top:1px dashed var(--steel-line);">
          <span>${m.product.name} <small style="color:var(--steel); font-family:'IBM Plex Mono';">(${m.product.code}, stok: ${m.product.qty ?? 0})</small></span>
          <button type="button" class="sm-btn" style="flex-shrink:0;" onclick="selectFisSuggestion('${m.product.code}')">Üstüne Ekle</button>
        </div>
      `).join('')}
    `;
  }, 250);
}

function selectFisSuggestion(code) {
  const p = productsData[code];
  if(!p) return;
  document.getElementById('fis-product').value = `${p.code} - ${p.name}`;
  checkFisProductMatch();
}

async function createNewProductRecord(item, sourceLabel, extraUsedCodes) {
  let code = item.code;

  if (code) {
    if (productsData[code] || (extraUsedCodes && extraUsedCodes.has(code))) {
      throw new Error(`'${code}' kodu/barkodu zaten sistemde kayıtlı bir üründe kullanılıyor!`);
    }
  } else {
    do {
      code = "RYH-" + Math.floor(100000 + Math.random() * 900000);
    } while (productsData[code] || (extraUsedCodes && extraUsedCodes.has(code)));
  }

  await db.child(code).set({
    name: item.name, qty: 0, price: item.price || 0, unit: item.unit,
    category: item.category || 'Diğer', brand: item.brand || null, costPrice: item.cost || 0, vat: item.vat || 0,
    targetProfit: item.targetProfit || null, code, lastPriceUpdate: new Date().toISOString(),
    lastUpdatedBy: sourceLabel
  });

  if (!code.startsWith('RYH-')) {
    dbBarcodeCache.child(code).set({ name: item.name, source: 'manuel', savedAt: new Date().toISOString() });
  }
  productsData[code] = {
    code, name: item.name, qty: 0, unit: item.unit, price: item.price || 0,
    category: item.category || 'Diğer', brand: item.brand || null, costPrice: item.cost || 0, vat: item.vat || 0, targetProfit: item.targetProfit || null
  };
  return code;
}

async function addToGoodsReceipt() {
  if(currentRole !== 'admin' && currentRole !== 'staff') return;
  const inputVal = document.getElementById('fis-product').value.trim();
  const qty = parseFloat(document.getElementById('fis-qty').value);
  const costRaw = document.getElementById('fis-cost').value;
  const costEntered = costRaw === '' ? null : parseFloat(costRaw);

  if(!inputVal || isNaN(qty) || qty <= 0) {
    alert("Lütfen geçerli bir malzeme adı/kodu ve miktar girin.");
    return;
  }

  const possibleCode = inputVal.split(' - ')[0].trim();
  const p = productsData[possibleCode];

  let item;
  if(p) {
    const cost = (costEntered !== null && !isNaN(costEntered)) ? costEntered : Number(p.costPrice || 0);
    const updatePrices = document.getElementById('fis-update-existing-price').checked;
    const vatRaw = document.getElementById('fis-vat').value;
    const profitRaw = document.getElementById('fis-profit').value;
    const newPriceRaw = document.getElementById('fis-price').value;

    item = { code: p.code, name: p.name, unit: p.unit || 'Adet', qty: qty, cost: cost, isNew: false, updatePrices: updatePrices };
    if(updatePrices) {
      const brandRaw = document.getElementById('fis-brand').value;
      item.brand = brandRaw || null;
      if(vatRaw !== '') item.vat = parseFloat(vatRaw) || 0;
      if(profitRaw !== '') item.targetProfit = parseFloat(profitRaw) || 0;
      if(newPriceRaw !== '') item.newPrice = Math.max(0, parseFloat(newPriceRaw) || 0);
    }
  } else {
    const cost = (costEntered !== null && !isNaN(costEntered)) ? costEntered : 0;
    const salePriceRaw = document.getElementById('fis-price').value;
    const salePrice = salePriceRaw === '' ? 0 : (parseFloat(salePriceRaw) || 0);
    const unit = document.getElementById('fis-unit').value || 'Adet';
    const category = document.getElementById('fis-category').value || 'Diğer';
    const brand = document.getElementById('fis-brand').value || null;
    const vat = parseFloat(document.getElementById('fis-vat').value) || 0;
    const profit = parseFloat(document.getElementById('fis-profit').value) || 0;
    const pendingBarcode = document.getElementById('fis-barcode-pending-code').value.trim();
    item = { code: pendingBarcode || null, name: inputVal, unit: unit, category: category, brand: brand, price: salePrice, vat: vat, targetProfit: profit || null, qty: qty, cost: cost, isNew: true };

    const createNow = document.getElementById('fis-create-now').checked;
    if (createNow) {
      const wKeyNow = document.getElementById('fis-wholesaler').value;
      const wholesalerNameNow = (wKeyNow && wholesalersData[wKeyNow]) ? wholesalersData[wKeyNow].name : 'Malzeme Fişi';
      try {
        const assignedCode = await createNewProductRecord(item, 'Malzeme Fişi (' + wholesalerNameNow + ')');
        item.code = assignedCode;
        item.isNew = false;
        item.justCreated = true;
      } catch (err) {
        alert("Ürün stoğa hemen eklenemedi: " + (err.message || err));
        return;
      }
    }
  }
  item.discount = Math.max(0, parseFloat(document.getElementById('fis-discount').value) || 0);
  item.total = Math.max(0, item.qty * item.cost - item.discount);

  const wasEditing = fisEditingIndex !== null;
  if (wasEditing) {
    // Düzenleme modu: yeni bir kalem eklemek yerine, düzenlenen kalemin yerine koy.
    goodsReceiptCart[fisEditingIndex] = item;
    fisEditingIndex = null;
  } else {
    goodsReceiptCart.push(item);
  }

  const banner = document.getElementById('fis-edit-banner');
  if (banner) banner.style.display = 'none';
  const addBtn = document.getElementById('fis-add-btn');
  if (addBtn) addBtn.textContent = '+ Fişe Malzeme Ekle';

  document.getElementById('fis-product').value = '';
  document.getElementById('fis-qty').value = '1';
  document.getElementById('fis-cost').value = '';
  document.getElementById('fis-discount').value = '';
  document.getElementById('fis-price').value = '';
  document.getElementById('fis-unit').value = 'Adet';
  document.getElementById('fis-category').value = 'Diğer';
  document.getElementById('fis-brand').value = '';
  document.getElementById('fis-cost-calc').innerHTML = '';
  document.getElementById('fis-cost-calc').classList.remove('active');
  document.getElementById('fis-vat').value = '';
  document.getElementById('fis-profit').value = '';
  document.getElementById('fis-suggested-price').value = '';
  document.getElementById('fis-suggested-price').dataset.value = '';
  document.getElementById('fis-new-fields').style.display = 'none';
  document.getElementById('fis-price-fields').style.display = 'none';
  document.getElementById('fis-existing-update-check-wrap').style.display = 'none';
  document.getElementById('fis-update-existing-price').checked = true;
  document.getElementById('fis-duplicate-warning').innerHTML = '';
  document.getElementById('fis-duplicate-warning').style.display = 'none';
  document.getElementById('fis-barcode-lookup').value = '';
  document.getElementById('fis-barcode-lookup-status').innerHTML = '';
  document.getElementById('fis-barcode-pending-code').value = '';
  document.getElementById('fis-new-barcode').value = '';
  renderGoodsReceiptCart();
  showToast(wasEditing ? "Malzeme kalemi güncellendi." : (item.isNew ? "Sistemde bulunmayan yeni malzeme fişe eklendi." : "Malzeme fişe eklendi."));
}

function applyBulkFisPricing() {
  const checkbox = document.getElementById('fis-bulk-price-apply');
  const profitEl = document.getElementById('fis-bulk-profit');
  const vatEl = document.getElementById('fis-bulk-vat');
  const statusEl = document.getElementById('fis-bulk-price-status');

  if (!checkbox || !profitEl || !vatEl) return;

  if (!checkbox.checked) {
    if (statusEl) statusEl.textContent = '';
    return;
  }

  if (!goodsReceiptCart || goodsReceiptCart.length === 0) {
    checkbox.checked = false;
    if (statusEl) statusEl.textContent = 'Önce AI ile fişi okutun veya fişe ürün ekleyin.';
    return;
  }

  const profitRaw = profitEl.value.trim();
  const vatRaw = vatEl.value.trim();
  if (profitRaw === '' || vatRaw === '') {
    if (statusEl) statusEl.textContent = 'Lütfen Kâr ve KDV yüzdelerini girin.';
    return;
  }

  const profit = Math.max(0, parseFloat(profitRaw) || 0);
  const vat = Math.max(0, parseFloat(vatRaw) || 0);
  let calculated = 0;
  let waitingCost = 0;

  goodsReceiptCart.forEach(item => {
    const product = item.code ? productsData[item.code] : null;
    const cost = Number(item.cost) > 0 ? Number(item.cost) : Number(product?.costPrice || 0);

    item.vat = vat;
    item.targetProfit = profit;
    item.bulkPriceApplied = true;

    if (cost > 0) {
      // Mevcut sistemdeki fiyat formülü aynen korunuyor:
      // geliş × (1 + KDV) × (1 + kâr)
      const salePrice = Number((cost * (1 + vat / 100) * (1 + profit / 100)).toFixed(2));
      item.price = salePrice;
      if (!item.isNew && !item.justCreated) {
        item.newPrice = salePrice;
        item.updatePrices = true;
      }
      if (!(Number(item.cost) > 0) && product?.costPrice) item.cost = Number(product.costPrice);
      calculated++;
    } else {
      if (!item.isNew && !item.justCreated) item.updatePrices = true;
      waitingCost++;
    }
  });

  renderGoodsReceiptCart();

  if (statusEl) {
    statusEl.style.color = waitingCost ? '#B45309' : '#047857';
    statusEl.textContent = `✅ ${calculated} ürünün satış fiyatı hesaplandı ve kayda hazırlandı.` +
      (waitingCost ? ` ${waitingCost} üründe geliş fiyatı olmadığı için satış fiyatı hesaplanamadı.` : '');
  }
}

function renderGoodsReceiptCart() {
  const container = document.getElementById('fis-container');
  const tbody = document.getElementById('fis-items');
  if(!container || !tbody) return;

  if(goodsReceiptCart.length === 0) { container.style.display = 'none'; return; }

  container.style.display = 'block';
  let grandTotal = 0;
  const __fisParts = [];

  goodsReceiptCart.forEach((item, index) => {
    grandTotal += item.total;
    const tickIcon = item.isNew
      ? '<span title="Stokta kayıtlı bulunamadı, YENİ ürün olarak eklenecek" style="color:#2563EB;">🔵</span>'
      : '<span title="Mevcut stoktaki bir ürünle eşleşti, stok bunun üzerine eklenecek" style="color:#DC2626;">🔴</span>';
    const overrideLink = (!item.isNew && item.matched)
      ? ` <a href="javascript:void(0)" onclick="markFisItemAsNew(${index})" style="font-size:10px; color:var(--rust); text-decoration:underline;">yanlış eşleşme mi? yeni ürün yap</a>`
      : (item.isNew && item.aiOriginalName)
        ? ` <a href="javascript:void(0)" onclick="editFisItem(${index})" style="font-size:10px; color:var(--info); text-decoration:underline;">aslında kayıtlı mı? elle eşleştir</a>`
        : '';
    const isBeingEdited = (fisEditingIndex === index);
    const rowStyle = isBeingEdited
      ? 'border-bottom:1px dashed var(--steel-line); background:#FEF3C7;'
      : 'border-bottom:1px dashed var(--steel-line);';
    const editBtnLabel = isBeingEdited ? '✏️ Düzenleniyor…' : '✏️ Düzenle';
    __fisParts.push(`
      <tr style="${rowStyle}">
        <td style="padding:10px 0; line-height:1.3;">
          ${tickIcon} <strong>${item.name}</strong>${item.isNew ? ' <span style="color:var(--info); font-size:10px;">(YENİ ÜRÜN' + (item.category ? ' — ' + item.category : '') + ')</span>' : ''}${item.justCreated ? ' <span style="color:var(--success); font-size:10px;">(✅ STOĞA DÜŞTÜ)</span>' : ''}${isBeingEdited ? ' <span style="color:#B45309; font-size:10px; font-weight:700;">(DÜZENLENİYOR)</span>' : ''}${overrideLink}<br>
          <small style="color:var(--steel); font-family:'IBM Plex Mono';">${item.code ? ((item.isNew || item.justCreated) ? 'Kod: ' + item.code : item.code) : 'Kod otomatik atanacak'}</small>
          ${(item.price || item.newPrice) ? `<br><small style="color:var(--steel);">Satış Fiyatı: ₺${formatMoney(item.price || item.newPrice)}${item.vat !== undefined ? ' (KDV %' + item.vat + ')' : ''}${item.targetProfit !== undefined && item.targetProfit !== null ? ' · Kâr %' + item.targetProfit : ''}</small>` : ''}
        </td>
        <td>₺${formatMoney(item.cost)}</td>
        <td style="font-weight:bold;">${item.qty} ${item.unit}</td>
        <td style="font-weight:bold; color:var(--rust);">₺${formatMoney(item.total)}${item.discount ? `<br><small style="color:var(--success); font-weight:normal;">-₺${formatMoney(item.discount)} iskonto</small>` : ''}</td>
        <td style="display:flex; gap:4px; flex-wrap:wrap;">
          <button class="btn btn-info btn-sm" style="width:auto;" onclick="editFisItem(${index})">${editBtnLabel}</button>
          <button class="btn btn-dark btn-sm" style="width:auto;" onclick="removeFromGoodsReceipt(${index})">Çıkar</button>
        </td>
      </tr>
    `);
  });
  tbody.innerHTML = __fisParts.join('');

  document.getElementById('fis-total').textContent = "₺" + formatMoney(grandTotal);
}

function markFisItemAsNew(index) {
  const item = goodsReceiptCart[index];
  if (!item) return;
  item.code = null;
  item.isNew = true;
  item.matched = false;
  item.category = item.category || 'Diğer';
  item.price = item.price || 0;
  renderGoodsReceiptCart();
  showToast('Bu kalem "Yeni Ürün" olarak işaretlendi. Fişi tamamlamadan önce ✏️ Düzenle ile fiyat/kategori bilgisini girin.');
}

function removeFromGoodsReceipt(index) {
  goodsReceiptCart.splice(index, 1);

  // Silinen kalem şu an düzenlenen kalemse, düzenleme modunu iptal et.
  if (fisEditingIndex === index) {
    cancelFisEdit();
    return; // cancelFisEdit() zaten renderGoodsReceiptCart() çağırıyor
  } else if (fisEditingIndex !== null && index < fisEditingIndex) {
    // Aradan bir kalem silindiği için düzenlenen kalemin index'i bir azaldı.
    fisEditingIndex -= 1;
  }

  renderGoodsReceiptCart();
}

function editFisItem(index) {
  const item = goodsReceiptCart[index];
  if (!item) return;

  // ÖNEMLİ: Kalemi burada listeden SİLMİYORUZ. Sadece "düzenleme modu"na alıyoruz.
  // Böylece kullanıcı formu doldururken vazgeçip başka bir kalemi düzenlemeye
  // basarsa veya sayfadan ayrılırsa, ilk kalem fişten kaybolmuyor.
  fisEditingIndex = index;

  document.getElementById('fis-product').value = item.isNew ? item.name : `${item.code} - ${item.name}`;
  document.getElementById('fis-qty').value = item.qty;
  document.getElementById('fis-cost').value = item.cost;
  document.getElementById('fis-discount').value = item.discount || '';

  checkFisProductMatch();

  if (item.isNew) {
    document.getElementById('fis-price').value = item.price || '';
    document.getElementById('fis-unit').value = item.unit || 'Adet';
    document.getElementById('fis-category').value = item.category || 'Diğer';
    document.getElementById('fis-brand').value = item.brand || '';
    document.getElementById('fis-vat').value = item.vat || '';
    document.getElementById('fis-profit').value = item.targetProfit || '';
    updateFisProfit();
    updateCostCalc('fis', 'fis-cost');
    setFisPendingBarcode(item.code || '');
  }

  const banner = document.getElementById('fis-edit-banner');
  if (banner) banner.style.display = 'flex';
  const addBtn = document.getElementById('fis-add-btn');
  if (addBtn) addBtn.textContent = '💾 Düzenlemeyi Kaydet';

  renderGoodsReceiptCart(); // düzenlenen satırı vurgulamak için yeniden çiz

  document.getElementById('fis-product').scrollIntoView({ behavior: 'smooth', block: 'center' });
  document.getElementById('fis-product').focus();
  showToast("Malzeme düzenlemeniz için forma yüklendi. Değişiklik yapıp '💾 Düzenlemeyi Kaydet' butonuna basın — kalem siz kaydedene kadar fişte kalmaya devam edecek.");
}

function cancelFisEdit() {
  fisEditingIndex = null;
  const banner = document.getElementById('fis-edit-banner');
  if (banner) banner.style.display = 'none';
  const addBtn = document.getElementById('fis-add-btn');
  if (addBtn) addBtn.textContent = '+ Fişe Malzeme Ekle';

  document.getElementById('fis-product').value = '';
  document.getElementById('fis-qty').value = '1';
  document.getElementById('fis-cost').value = '';
  document.getElementById('fis-discount').value = '';
  document.getElementById('fis-price').value = '';
  document.getElementById('fis-unit').value = 'Adet';
  document.getElementById('fis-category').value = 'Diğer';
  document.getElementById('fis-vat').value = '';
  document.getElementById('fis-profit').value = '';
  const spEl = document.getElementById('fis-suggested-price');
  if (spEl) { spEl.value = ''; spEl.dataset.value = ''; }
  document.getElementById('fis-new-fields').style.display = 'none';
  document.getElementById('fis-price-fields').style.display = 'none';
  document.getElementById('fis-existing-update-check-wrap').style.display = 'none';
  document.getElementById('fis-duplicate-warning').innerHTML = '';
  document.getElementById('fis-duplicate-warning').style.display = 'none';
  document.getElementById('fis-barcode-lookup').value = '';
  document.getElementById('fis-barcode-lookup-status').innerHTML = '';
  document.getElementById('fis-barcode-pending-code').value = '';
  document.getElementById('fis-new-barcode').value = '';

  renderGoodsReceiptCart();
}

async function completeGoodsReceipt() {
  if(currentRole !== 'admin' && currentRole !== 'staff') return;
  if(goodsReceiptCart.length === 0) return;

  const wKey = document.getElementById('fis-wholesaler').value;
  if(!wKey || !wholesalersData[wKey]) { alert("Lütfen fişin ait olduğu toptancıyı seçin."); return; }
  const wholesaler = wholesalersData[wKey];

  const fisNo = document.getElementById('fis-no').value.trim();
  const note = document.getElementById('fis-note').value.trim();
  const addDebt = document.getElementById('fis-add-debt').checked;

  const dateStr = new Date().toISOString().slice(0, 10);
  const timeStr = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const receiptId = "FIS-" + new Date().getTime();

  let grandTotal = 0;
  goodsReceiptCart.forEach(i => grandTotal += i.total);

  const usedCodes = new Set();
  const finalItems = [];

  try {
    for(const item of goodsReceiptCart) {
      if(item.isNew) {
        let code = item.code;

        if(code) {
          if(productsData[code] || usedCodes.has(code)) {
            alert(`HATA: '${code}' barkodu zaten sistemde kayıtlı bir üründe kullanılıyor! Lütfen "${item.name}" kalemini fişten çıkarıp barkodu tekrar arayın.`);
            return;
          }
        } else {
          do {
            code = "RYH-" + Math.floor(100000 + Math.random() * 900000);
          } while (productsData[code] || usedCodes.has(code));
        }
        usedCodes.add(code);

        await db.child(code).set({
          name: item.name, qty: 0, price: item.price || 0, unit: item.unit,
          category: item.category || 'Diğer', brand: item.brand || null, costPrice: item.cost || 0, vat: item.vat || 0,
          targetProfit: item.targetProfit || null, code, lastPriceUpdate: new Date().toISOString(),
          lastUpdatedBy: 'Malzeme Fişi (' + wholesaler.name + ')'
        });
        if(!code.startsWith('RYH-')) {
          dbBarcodeCache.child(code).set({ name: item.name, source: 'manuel', savedAt: new Date().toISOString() });
        }
        productsData[code] = { code, name: item.name, qty: 0, unit: item.unit, brand: item.brand || null };
        finalItems.push(Object.assign({}, item, { code }));
      } else {
        finalItems.push(item);
      }
    }
  } catch(err) {
    alert("Yeni malzeme(ler) sisteme kaydedilirken hata oluştu: " + (err.message || err));
    return;
  }

  finalItems.forEach(item => {
    db.child(item.code).child('qty').transaction((currentQty) => {
      return Number(currentQty || 0) + Number(item.qty);
    }, (error, committed) => {
      if(error) { console.error(error); return; }
      if(committed) {
        logMovement(item.code, item.name, item.qty, 'TOPTANCI MAL GİRİŞİ: ' + wholesaler.name);
      }
    });
    if(item.cost && item.cost > 0) {
      db.child(item.code).child('costPrice').set(item.cost);
    }

    // Sadece zaten stokta kayıtlı olan (bu fişte yeni oluşturulmamış) ürünler için,
    // ve admin/çalışan bunu açıkça onayladıysa (fis-update-existing-price kutucuğu),
    // yeni KDV/kâr oranını ve hesaplanan satış fiyatını da stoğa işle.
    if(!item.isNew && !item.justCreated && item.updatePrices) {
      const priceUpdates = {
        lastPriceUpdate: new Date().toISOString(),
        lastUpdatedBy: (currentRole === 'admin' ? 'Yönetici' : 'Çalışan') + ' (Malzeme Fişi: ' + wholesaler.name + ')'
      };
      let hasChange = false;
      if(item.vat !== undefined) { priceUpdates.vat = item.vat; hasChange = true; }
      if(item.targetProfit !== undefined) { priceUpdates.targetProfit = item.targetProfit; hasChange = true; }
      if(item.newPrice !== undefined) { priceUpdates.price = item.newPrice; hasChange = true; }
      if(item.brand !== undefined) { priceUpdates.brand = item.brand; hasChange = true; }
      if(hasChange) {
        db.child(item.code).update(priceUpdates);
      }
    }
  });

  const receiptData = {
    wholesalerKey: wKey,
    wholesalerName: wholesaler.name,
    fisNo: fisNo || null,
    note: note || null,
    date: dateStr,
    time: timeStr,
    items: finalItems,
    total: grandTotal,
    addedToDebt: addDebt
  };

  dbGoodsReceipts.child(dateStr).child(receiptId).set(receiptData, (err) => {
    if(!err) {
      if(addDebt && grandTotal > 0) {
        dbWholesalers.child(wKey).child('balance').transaction(cur => (cur || 0) - grandTotal, (err2) => {
          if(!err2) {
            dbWholesalers.child(wKey).child('transactions').push({
              desc: 'Malzeme Fişi: ' + (fisNo || receiptId),
              amount: grandTotal,
              type: 'borc',
              date: new Date().toLocaleString('tr-TR')
            });
          }
        });
      }
      dbNotifications.push({
        text: `Malzeme Fişi: ${wholesaler.name} firmasından ${finalItems.length} kalem malzeme girişi yapıldı (₺${formatMoney(grandTotal)}).`,
        time: new Date().toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit'})
      });

      goodsReceiptCart = [];
      fisEditingIndex = null;
      const editBanner = document.getElementById('fis-edit-banner');
      if (editBanner) editBanner.style.display = 'none';
      const fisAddBtn = document.getElementById('fis-add-btn');
      if (fisAddBtn) fisAddBtn.textContent = '+ Fişe Malzeme Ekle';
      renderGoodsReceiptCart();
      document.getElementById('fis-wholesaler').value = '';
      document.getElementById('fis-no').value = '';
      document.getElementById('fis-note').value = '';
      const bulkApplyEl = document.getElementById('fis-bulk-price-apply');
      const bulkProfitEl = document.getElementById('fis-bulk-profit');
      const bulkVatEl = document.getElementById('fis-bulk-vat');
      const bulkStatusEl = document.getElementById('fis-bulk-price-status');
      if (bulkApplyEl) bulkApplyEl.checked = false;
      if (bulkProfitEl) bulkProfitEl.value = '';
      if (bulkVatEl) bulkVatEl.value = '';
      if (bulkStatusEl) bulkStatusEl.textContent = '';
      showToast("Malzeme fişi başarıyla işlendi, stok güncellendi!");
    } else {
      alert("Fiş kaydedilemedi: " + err.message);
    }
  });
}

async function generateReceiptExcel(receipt, receiptId, dateStr) {
  const dataRow = [["Sıra", "Ürün Kodu", "Malzeme Adı", "Birim Alış Fiyatı", "Miktar", "Toplam"]];
  (receipt.items || []).forEach((item, idx) => {
    dataRow.push([idx+1, item.code, item.name, item.cost, item.qty, item.total]);
  });
  dataRow.push(["", "", "", "", "GENEL TOPLAM:", receipt.total]);
  dataRow.push(["", "", "", "", "", ""]);
  dataRow.push(["Toptancı:", receipt.wholesalerName, "", "İrsaliye No:", receipt.fisNo || '-', ""]);

  const ws = XLSX.utils.aoa_to_sheet(dataRow);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Malzeme Fisi");

  await saveExcelFile(wb, `Reyhani_Malzeme_Fisi_${dateStr}_${receiptId}.xlsx`);
}

async function downloadReceiptById(receiptId) {
  const target = globalPastReceipts[receiptId];
  if(target) {
    await generateReceiptExcel(target.receiptData, receiptId, target.date);
  } else {
    alert("Bu fişin detayları bulunamadı.");
  }
}

// ============================================================
// KAYDEDİLMİŞ MALZEME FİŞİNİ SONRADAN DÜZENLEME
// (eksik/hatalı eklenen kalemler için — fiş kapandıktan sonra da
// miktar/fiyat düzeltme, kalem ekleme/çıkarma, hatta o gün eklenmesi
// unutulmuş TAMAMEN YENİ bir ürünü tanımlayıp fişe işleme imkanı)
// ============================================================
let receiptEditItems = [];
let receiptEditTarget = null;
let reEditingIndex = null; // null = yeni kalem ekleme modu; sayı ise o index'teki kalem düzenleniyor demektir
let _reAddMatchDebounce = null;

function openReceiptEditModal(receiptId) {
  if(currentRole !== 'admin' && currentRole !== 'staff') return;
  const target = globalPastReceipts[receiptId];
  if(!target) { alert("Bu fişin detayları bulunamadı."); return; }

  receiptEditTarget = { receiptId, date: target.date, original: target.receiptData };
  receiptEditItems = (target.receiptData.items || []).map(it => Object.assign({}, it));

  const header = document.getElementById('re-header');
  if(header) {
    header.textContent = `${target.receiptData.wholesalerName || 'Bilinmeyen Toptancı'} — ${target.date}${target.receiptData.fisNo ? ' (İrsaliye: ' + target.receiptData.fisNo + ')' : ''}`;
  }

  resetReceiptAddForm();
  populateReceiptEditProductList();
  renderReceiptEditItems();
  document.getElementById('receipt-edit-modal').style.display = 'flex';
}

function closeReceiptEditModal() {
  document.getElementById('receipt-edit-modal').style.display = 'none';
  receiptEditItems = [];
  receiptEditTarget = null;
  reEditingIndex = null;
}

// ============================================================
// MÜKERRER ÜRÜN BİRLEŞTİRME (aynı ürünün yanlışlıkla birden fazla
// barkotla/kayıtla oluşturulduğu durumları düzeltmek için — örn. aynı
// malzeme fişi AI'a birden fazla kez gönderilip her seferinde "yeni ürün"
// olarak kaydedilmişse)
// ============================================================
let mergeSelectedCodes = new Set();
let mergeCanonicalCode = null;

function normalizeProductNameForMerge(name) {
  return (name || '').toLocaleLowerCase('tr-TR').trim().replace(/\s+/g, ' ');
}

function openMergeProductsModal() {
  if(currentRole !== 'admin') { alert("Yetkiniz yok!"); return; }
  mergeSelectedCodes = new Set();
  mergeCanonicalCode = null;
  document.getElementById('merge-search').value = '';
  renderMergeSuggestions();
  renderMergeProductList();
  renderMergeSummary();
  document.getElementById('merge-products-modal').style.display = 'flex';
}

function closeMergeProductsModal() {
  document.getElementById('merge-products-modal').style.display = 'none';
  mergeSelectedCodes = new Set();
  mergeCanonicalCode = null;
}

// Aynı isimdeki ürünleri otomatik grupla ve "muhtemel mükerrer" olarak öner.
function renderMergeSuggestions() {
  const box = document.getElementById('merge-suggestions-box');
  if(!box) return;
  const groups = {};
  Object.values(productsData).forEach(p => {
    const key = normalizeProductNameForMerge(p.name);
    if(!key) return;
    if(!groups[key]) groups[key] = [];
    groups[key].push(p);
  });
  const dupGroups = Object.values(groups).filter(g => g.length > 1);

  if(dupGroups.length === 0) {
    box.innerHTML = `<p style="font-size:12px; color:var(--steel);">Aynı isimle kayıtlı, otomatik tespit edilen mükerrer ürün grubu bulunamadı. Aşağıdaki arama kutusundan elle seçebilirsiniz.</p>`;
    return;
  }

  box.innerHTML = `<div style="font-size:11px; font-weight:600; text-transform:uppercase; color:var(--steel); margin-bottom:6px;">⚠️ Aynı isimle kayıtlı olası mükerrer gruplar (${dupGroups.length})</div>` +
    dupGroups.map(g => {
      const codes = g.map(p => p.code);
      const totalQty = g.reduce((s,p) => s + (Number(p.qty)||0), 0);
      return `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; background:#FFF7E0; border:1px solid #F5C542; border-radius:6px; padding:8px 10px; margin-bottom:6px; flex-wrap:wrap;">
          <div style="font-size:12px;"><strong>${g[0].name}</strong> — ${g.length} farklı kayıt, toplam ${totalQty} adet <br><small style="color:var(--steel); font-family:'IBM Plex Mono';">${codes.join(', ')}</small></div>
          <button type="button" class="btn btn-warning btn-sm" style="width:auto;" onclick='loadMergeGroup(${JSON.stringify(codes)})'>Bu Grubu Seç</button>
        </div>
      `;
    }).join('');
}

function loadMergeGroup(codes) {
  mergeSelectedCodes = new Set(codes.filter(c => productsData[c]));
  // Miktarı en çok olanı varsayılan "ana ürün" yap (genelde en çok işlem gören/asıl kayıt budur).
  let best = null;
  mergeSelectedCodes.forEach(c => {
    const p = productsData[c];
    if(!best || (Number(p.qty)||0) > (Number(productsData[best].qty)||0)) best = c;
  });
  mergeCanonicalCode = best;
  renderMergeProductList();
  renderMergeSummary();
}

function renderMergeProductList() {
  const listBox = document.getElementById('merge-product-list');
  if(!listBox) return;
  const term = (document.getElementById('merge-search').value || '').toLocaleLowerCase('tr-TR').trim();
  const all = Object.values(productsData)
    .filter(p => !term || p.name.toLocaleLowerCase('tr-TR').includes(term) || (p.code||'').toLocaleLowerCase('tr-TR').includes(term))
    .sort((a,b) => a.name.localeCompare(b.name, 'tr-TR'));

  if(all.length === 0) {
    listBox.innerHTML = `<p style="font-size:12px; color:var(--steel); text-align:center; margin:10px 0;">Ürün bulunamadı.</p>`;
    return;
  }

  listBox.innerHTML = all.map(p => `
    <label style="display:flex; align-items:center; gap:8px; padding:5px 4px; cursor:pointer; ${mergeSelectedCodes.has(p.code) ? 'background:#FFF7E0;' : ''}">
      <input type="checkbox" ${mergeSelectedCodes.has(p.code) ? 'checked' : ''} onchange="toggleMergeCode('${p.code}')">
      <span style="flex:1; font-size:13px;">${p.name} <small style="color:var(--steel); font-family:'IBM Plex Mono';">(${p.code}, ${p.qty||0} ${p.unit||'Adet'}, ₺${formatMoney(p.price||0)})</small></span>
    </label>
  `).join('');
}

function toggleMergeCode(code) {
  if(mergeSelectedCodes.has(code)) {
    mergeSelectedCodes.delete(code);
    if(mergeCanonicalCode === code) mergeCanonicalCode = mergeSelectedCodes.size ? Array.from(mergeSelectedCodes)[0] : null;
  } else {
    mergeSelectedCodes.add(code);
    if(!mergeCanonicalCode) mergeCanonicalCode = code;
  }
  renderMergeSummary();
}

function setMergeCanonical(code) {
  mergeCanonicalCode = code;
  renderMergeSummary();
}

function renderMergeSummary() {
  const box = document.getElementById('merge-summary-box');
  const execBtn = document.getElementById('merge-execute-btn');
  if(!box) return;

  const selected = Array.from(mergeSelectedCodes).map(c => productsData[c]).filter(Boolean);
  if(selected.length < 2) {
    box.innerHTML = `<p style="font-size:12px; color:var(--steel);">Birleştirmek için en az 2 ürün seçin.</p>`;
    if(execBtn) execBtn.disabled = true;
    return;
  }

  const totalQty = selected.reduce((s,p) => s + (Number(p.qty)||0), 0);

  box.innerHTML = `
    <div style="border:1px solid var(--steel-line); border-radius:6px; padding:10px;">
      <div style="font-size:11px; font-weight:600; text-transform:uppercase; color:var(--steel); margin-bottom:8px;">Ana ürün olarak kalacak kayıt:</div>
      ${selected.map(p => `
        <label style="display:flex; align-items:center; gap:8px; padding:4px 0; cursor:pointer;">
          <input type="radio" name="merge-canonical" value="${p.code}" ${mergeCanonicalCode === p.code ? 'checked' : ''} onchange="setMergeCanonical('${p.code}')">
          <span style="font-size:13px;">${p.name} <small style="color:var(--steel); font-family:'IBM Plex Mono';">(${p.code}, ${p.qty||0} ${p.unit||'Adet'})</small></span>
        </label>
      `).join('')}
      <div style="margin-top:8px; padding-top:8px; border-top:1px solid var(--steel-line); font-size:13px;">
        Birleştirmeden sonra <strong>${totalQty} ${selected[0].unit || 'Adet'}</strong> olarak tek kayıtta toplanacak. Diğer ${selected.length - 1} kayıt silinecek ve geçmiş fiş kayıtlarındaki ürün kodları ana ürüne güncellenecek.
      </div>
    </div>
  `;
  if(execBtn) execBtn.disabled = !mergeCanonicalCode;
}

async function executeMergeProducts() {
  const selectedCodes = Array.from(mergeSelectedCodes);
  if(selectedCodes.length < 2 || !mergeCanonicalCode || !productsData[mergeCanonicalCode]) {
    alert("Lütfen en az 2 ürün ve bir ana ürün seçin.");
    return;
  }
  const duplicateCodes = selectedCodes.filter(c => c !== mergeCanonicalCode);
  const canonical = productsData[mergeCanonicalCode];
  const duplicates = duplicateCodes.map(c => productsData[c]).filter(Boolean);
  const addedQty = duplicates.reduce((s,p) => s + (Number(p.qty)||0), 0);
  const newTotalQty = (Number(canonical.qty)||0) + addedQty;

  if(!confirm(`"${canonical.name}" (${mergeCanonicalCode}) ana ürün olarak kalacak.\n\n${duplicates.map(p => `- ${p.name} (${p.code}, ${p.qty||0} ${p.unit||'Adet'})`).join('\n')}\n\nBu ${duplicates.length} kayıt silinecek, toplam miktar ${newTotalQty} ${canonical.unit||'Adet'} olacak ve geçmiş fiş kayıtlarında bu kodlar ana ürüne güncellenecek.\n\nBu işlem GERİ ALINAMAZ. Onaylıyor musunuz?`)) {
    return;
  }

  const execBtn = document.getElementById('merge-execute-btn');
  if(execBtn) { execBtn.disabled = true; execBtn.textContent = '⏳ Birleştiriliyor...'; }

  try {
    const dupSet = new Set(duplicateCodes);

    // 1) Geçmiş fiş kayıtlarında bu kodlara referans veren kalemleri ana ürüne güncelle.
    const receiptUpdates = [];
    Object.entries(globalPastReceipts).forEach(([receiptId, entry]) => {
      const rec = entry.receiptData;
      if(!rec || !Array.isArray(rec.items)) return;
      let changed = false;
      const newItems = rec.items.map(it => {
        if(it.code && dupSet.has(it.code)) {
          changed = true;
          return Object.assign({}, it, { code: mergeCanonicalCode, name: canonical.name });
        }
        return it;
      });
      if(changed) {
        receiptUpdates.push(
          dbGoodsReceipts.child(entry.date).child(receiptId).update({
            items: newItems,
            lastEditedAt: new Date().toISOString(),
            lastEditedBy: (currentRole === 'admin' ? 'Yönetici' : 'Çalışan') + ' (Ürün Birleştirme)'
          })
        );
      }
    });
    await Promise.all(receiptUpdates);

    // 2) Ana üründe miktarı topla.
    await db.child(mergeCanonicalCode).update({
      qty: newTotalQty,
      lastPriceUpdate: new Date().toISOString(),
      lastUpdatedBy: (currentRole === 'admin' ? 'Yönetici' : 'Çalışan') + ' (Ürün Birleştirme)'
    });
    productsData[mergeCanonicalCode].qty = newTotalQty;

    // 3) Mükerrer kayıtları sil.
    for(const code of duplicateCodes) {
      await db.child(code).remove();
      await dbProductImages.child(code).remove();
      await dbBarcodeCache.child(code).remove();
      delete productsData[code];
    }

    // 4) Denetim izi için stok hareketine not düş.
    if(addedQty !== 0) {
      logMovement(mergeCanonicalCode, canonical.name, addedQty, 'ÜRÜN BİRLEŞTİRME: ' + duplicateCodes.join(', ') + ' kodlarından taşındı');
    }

    showToast(`✅ Birleştirme tamamlandı: "${canonical.name}" artık tek kayıt (${mergeCanonicalCode}, ${newTotalQty} ${canonical.unit||'Adet'}). ${duplicateCodes.length} mükerrer kayıt silindi, ${receiptUpdates.length} geçmiş fiş kaydı güncellendi.`);
    closeMergeProductsModal();
    if(typeof renderGrid === 'function') renderGrid();
  } catch(err) {
    alert("Birleştirme sırasında bir hata oluştu: " + (err.message || err) + "\n\nBazı adımlar uygulanmış olabilir, lütfen stok listesini kontrol edin.");
  } finally {
    if(execBtn) { execBtn.disabled = false; execBtn.textContent = '🔗 Seçilenleri Birleştir'; }
  }
}

// ============================================================
// MÜKERRER FİŞ TESPİTİ (Malzeme Fişi geçmişi ekranında otomatik) —
// aynı toptancı + aynı ürünler + aynı miktar/fiyat + aynı toplamla
// kaydedilmiş (yani gerçekten bire bir aynı) fişleri bulur.
// ============================================================
let duplicateReceiptGroups = [];
let activeDuplicateGroupIndex = null;
let duplicateReceiptCanonicalId = null;

function buildReceiptFingerprint(rec) {
  const itemsSig = (rec.items || [])
    .map(it => `${normalizeProductNameForMerge(it.name)}|${Number(it.qty)||0}|${Number(it.cost)||0}`)
    .sort()
    .join(';');
  return `${rec.wholesalerKey || ''}::${(Number(rec.total)||0).toFixed(2)}::${itemsSig}`;
}

function detectDuplicateReceiptGroups() {
  const groups = {};
  Object.entries(globalPastReceipts).forEach(([receiptId, entry]) => {
    const rec = entry.receiptData;
    if(!rec || !Array.isArray(rec.items) || rec.items.length === 0) return;
    const fp = buildReceiptFingerprint(rec);
    if(!groups[fp]) groups[fp] = [];
    groups[fp].push({ receiptId, date: entry.date, rec });
  });
  return Object.values(groups)
    .filter(g => g.length > 1)
    .sort((a,b) => b.length - a.length);
}

function renderDuplicateReceiptsBox() {
  const box = document.getElementById('duplicate-receipts-box');
  if(!box) return;
  duplicateReceiptGroups = detectDuplicateReceiptGroups();

  if(duplicateReceiptGroups.length === 0) {
    box.innerHTML = '';
    return;
  }

  box.innerHTML = duplicateReceiptGroups.map((group, idx) => {
    const rec = group[0].rec;
    const dates = group.map(g => `${g.date} ${g.rec.time || ''}`).join(' / ');
    return `
      <div style="background:#FEE2E2; border:1px solid #DC2626; border-radius:8px; padding:12px; margin-bottom:10px;">
        <div style="font-weight:700; color:#991B1B; font-size:13px; margin-bottom:4px;">🚨 ${group.length} kere kaydedilmiş, birbirinin aynısı bir fiş bulundu</div>
        <div style="font-size:12px; color:#7F1D1D;">🚚 ${rec.wholesalerName || 'Bilinmeyen Toptancı'} · 📦 ${(rec.items||[]).length} kalem · ₺${formatMoney(rec.total)}<br>🕒 ${dates}</div>
        <button type="button" class="btn btn-danger btn-sm" style="width:auto; margin-top:8px;" onclick="openDuplicateReceiptModal(${idx})">🔍 İncele ve Mükerrerleri İptal Et</button>
      </div>
    `;
  }).join('');
}

function openDuplicateReceiptModal(idx) {
  if(currentRole !== 'admin') { alert("Yetkiniz yok!"); return; }
  activeDuplicateGroupIndex = idx;
  const group = duplicateReceiptGroups[idx];
  if(!group) return;
  // Varsayılan olarak en eski (ilk girilen) fişi "gerçek/tutulacak" fiş kabul et.
  duplicateReceiptCanonicalId = group.slice().sort((a,b) => (a.date+  (a.rec.time||'')).localeCompare(b.date + (b.rec.time||'')))[0].receiptId;
  renderDuplicateReceiptDetail();
  document.getElementById('duplicate-receipt-modal').style.display = 'flex';
}

function closeDuplicateReceiptModal() {
  document.getElementById('duplicate-receipt-modal').style.display = 'none';
  activeDuplicateGroupIndex = null;
  duplicateReceiptCanonicalId = null;
}

function setDuplicateReceiptCanonical(receiptId) {
  duplicateReceiptCanonicalId = receiptId;
  renderDuplicateReceiptDetail();
}

function renderDuplicateReceiptDetail() {
  const box = document.getElementById('duplicate-receipt-detail');
  if(!box) return;
  const group = duplicateReceiptGroups[activeDuplicateGroupIndex];
  if(!group) return;

  const rec0 = group[0].rec;
  const itemsTable = `
    <div style="font-size:11px; font-weight:600; text-transform:uppercase; color:var(--steel); margin:10px 0 4px;">Fişteki ürünler (tümünde birebir aynı)</div>
    <table style="width:100%; font-size:12px; border-collapse:collapse;">
      <tr style="border-bottom:1px solid var(--steel-line); text-align:left;"><th style="padding:4px;">Ürün</th><th style="padding:4px;">Miktar</th><th style="padding:4px;">Alış Fiyatı</th></tr>
      ${(rec0.items||[]).map(it => `<tr style="border-bottom:1px solid var(--steel-line);"><td style="padding:4px;">${it.name}</td><td style="padding:4px;">${it.qty} ${it.unit||'Adet'}</td><td style="padding:4px;">₺${formatMoney(it.cost||0)}</td></tr>`).join('')}
    </table>
  `;

  const receiptChoices = `
    <div style="font-size:11px; font-weight:600; text-transform:uppercase; color:var(--steel); margin:14px 0 4px;">Hangisi tutulsun? (diğerleri iptal edilecek)</div>
    ${group.map(g => `
      <label style="display:flex; align-items:center; gap:8px; padding:6px; border:1px solid var(--steel-line); border-radius:6px; margin-bottom:6px; cursor:pointer; ${duplicateReceiptCanonicalId === g.receiptId ? 'background:#ECFDF5; border-color:#10B981;' : ''}">
        <input type="radio" name="dup-canonical" value="${g.receiptId}" ${duplicateReceiptCanonicalId === g.receiptId ? 'checked' : ''} onchange="setDuplicateReceiptCanonical('${g.receiptId}')">
        <span style="font-size:12px;">📄 ${g.rec.fisNo || g.receiptId} — ${g.date} ${g.rec.time||''}${duplicateReceiptCanonicalId === g.receiptId ? ' <strong style=\"color:#10B981;\">(tutulacak)</strong>' : ' <span style=\"color:#DC2626;\">(iptal edilecek)</span>'}</span>
      </label>
    `).join('')}
  `;

  box.innerHTML = itemsTable + receiptChoices;
}

async function reverseWholesalerDebtForReceipt(rec, receiptId) {
  if(!rec.addedToDebt || !rec.wholesalerKey || !rec.total) return;
  const wKey = rec.wholesalerKey;
  await dbWholesalers.child(wKey).child('balance').transaction(cur => (cur || 0) + (Number(rec.total)||0));
  try {
    const snap = await dbWholesalers.child(wKey).child('transactions').once('value');
    const txs = snap.val() || {};
    const matchKey = Object.keys(txs).find(tid => {
      const t = txs[tid];
      return t.type === 'borc' && Math.abs((Number(t.amount)||0) - (Number(rec.total)||0)) < 0.01 &&
             t.desc && (t.desc.includes(receiptId) || (rec.fisNo && t.desc.includes(rec.fisNo)));
    });
    if(matchKey) {
      await dbWholesalers.child(wKey).child('transactions').child(matchKey).remove();
    } else {
      await dbWholesalers.child(wKey).child('transactions').push({
        desc: 'Mükerrer Fiş İptali (Düzeltme): ' + (rec.fisNo || receiptId),
        amount: Number(rec.total)||0,
        type: 'odeme',
        date: new Date().toLocaleString('tr-TR')
      });
    }
  } catch(e) { console.error(e); }
}

async function executeDuplicateReceiptMerge() {
  const group = duplicateReceiptGroups[activeDuplicateGroupIndex];
  if(!group || !duplicateReceiptCanonicalId) return;
  const canonical = group.find(g => g.receiptId === duplicateReceiptCanonicalId);
  const duplicates = group.filter(g => g.receiptId !== duplicateReceiptCanonicalId);
  if(!canonical || duplicates.length === 0) return;

  if(!confirm(`"${canonical.rec.fisNo || canonical.receiptId}" (${canonical.date}) tutulacak.\n\n${duplicates.length} mükerrer fiş iptal edilecek: stok miktarları geri alınacak, toptancı borcu düzeltilecek ve sadece bu mükerrer kayıtlar için oluşturulmuş ürün kartları silinecek.\n\nBu işlem GERİ ALINAMAZ. Onaylıyor musunuz?`)) {
    return;
  }

  const btn = document.getElementById('duplicate-receipt-execute-btn');
  if(btn) { btn.disabled = true; btn.textContent = '⏳ İşleniyor...'; }

  let removedProductCount = 0;
  let partialReversalCount = 0;

  try {
    // Bu grup dışındaki tüm fişlerde hangi ürün kodlarının kullanıldığını
    // önceden çıkaralım — bir ürün kartını tamamen silmek güvenli mi diye
    // kontrol etmek için (başka bir fişte / harekette geçmiyor olmalı).
    const codesUsedElsewhere = new Set();
    Object.entries(globalPastReceipts).forEach(([rid, entry]) => {
      if(group.some(g => g.receiptId === rid)) return; // bu grubun kendisini sayma
      (entry.receiptData.items || []).forEach(it => { if(it.code) codesUsedElsewhere.add(it.code); });
    });

    for(const dup of duplicates) {
      const rec = dup.rec;

      for(const item of (rec.items || [])) {
        if(!item.code) continue;
        const canonicalItem = (canonical.rec.items || []).find(ci => normalizeProductNameForMerge(ci.name) === normalizeProductNameForMerge(item.name));
        const isSharedWithCanonical = canonicalItem && canonicalItem.code === item.code;

        if(isSharedWithCanonical) {
          // Aynı ürün kodu canonical fişte de kullanılmış — bu mükerrer fişin eklediği
          // miktarı geri al, ürün kaydını SİLME (canonical hâlâ ona ihtiyaç duyuyor).
          await db.child(item.code).child('qty').transaction(cur => Number(cur||0) - (Number(item.qty)||0));
          if(productsData[item.code]) productsData[item.code].qty = (Number(productsData[item.code].qty)||0) - (Number(item.qty)||0);
          logMovement(item.code, item.name, -(Number(item.qty)||0), 'MÜKERRER FİŞ İPTALİ: geri alındı');
        } else if(productsData[item.code]) {
          // Bu ürün kodu büyük olasılıkla sadece bu mükerrer fiş yüzünden oluşturuldu.
          const safeToDelete = !codesUsedElsewhere.has(item.code) &&
            Math.abs((Number(productsData[item.code].qty)||0) - (Number(item.qty)||0)) < 0.001;
          if(safeToDelete) {
            await db.child(item.code).remove();
            await dbProductImages.child(item.code).remove();
            await dbBarcodeCache.child(item.code).remove();
            delete productsData[item.code];
            removedProductCount++;
          } else {
            // Bu kod başka yerde de kullanılmış veya miktarı sonradan değişmiş —
            // güvenli olması için sadece bu fişin eklediği miktarı geri alıyoruz,
            // kartı silmiyoruz; admin isterse Stok Listesi'ndeki "Mükerrer Ürünleri
            // Birleştir" aracıyla elle inceleyebilir.
            await db.child(item.code).child('qty').transaction(cur => Number(cur||0) - (Number(item.qty)||0));
            if(productsData[item.code]) productsData[item.code].qty = (Number(productsData[item.code].qty)||0) - (Number(item.qty)||0);
            logMovement(item.code, item.name, -(Number(item.qty)||0), 'MÜKERRER FİŞ İPTALİ: kısmi geri alım (kart korundu)');
            partialReversalCount++;
          }
        }
      }

      await reverseWholesalerDebtForReceipt(rec, dup.receiptId);
      await dbGoodsReceipts.child(dup.date).child(dup.receiptId).remove();
    }

    let msg = `✅ ${duplicates.length} mükerrer fiş iptal edildi. ${removedProductCount} sadece bu kayıtlar için oluşmuş ürün kartı silindi.`;
    if(partialReversalCount > 0) msg += ` ⚠️ ${partialReversalCount} kalemde kart korunup sadece miktar geri alındı (başka hareketi olduğu için) — "Mükerrer Ürünleri Birleştir" aracından kontrol edin.`;
    showToast(msg);
    closeDuplicateReceiptModal();
    if(typeof renderGrid === 'function') renderGrid();
  } catch(err) {
    alert("Mükerrer fiş iptali sırasında bir hata oluştu: " + (err.message || err) + "\n\nBazı adımlar uygulanmış olabilir, lütfen stok ve toptancı bakiyesini kontrol edin.");
  } finally {
    if(btn) { btn.disabled = false; btn.textContent = '🔗 Seçileni Tut, Diğerlerini İptal Et'; }
  }
}

// ============================================================
// TOPLU İÇE AKTARIMI GERİ ALMA — Excel ile toplu yüklenmiş, o zamandan
// beri fiyatı/bilgisi elle değiştirilmemiş ürünleri tespit edip toplu
// silmek için (finalizeBulkImport() sırasında kaydedilen lastUpdatedBy
// etiketi "Toplu Aktarım" bilgisini taşımaya devam ediyorsa yakalanır).
// ============================================================
let importCleanupSelected = new Set();

function detectBulkImportProducts() {
  return Object.values(productsData).filter(p => (p.lastUpdatedBy || '').includes('Toplu Aktarım'));
}

function openImportCleanupModal() {
  if(currentRole !== 'admin') { alert("Yetkiniz yok!"); return; }
  const candidates = detectBulkImportProducts();
  // Varsayılan olarak sadece "yeni ürün olarak eklenen" kayıtları işaretli getir;
  // mevcut bir ürünün üzerine yazılanları admin bilerek seçsin.
  importCleanupSelected = new Set(candidates.filter(p => (p.lastUpdatedBy || '').includes('Toplu Aktarım)') && !(p.lastUpdatedBy || '').includes('Güncellendi')).map(p => p.code));
  document.getElementById('import-cleanup-search').value = '';
  renderImportCleanupList();
  document.getElementById('import-cleanup-modal').style.display = 'flex';
}

function closeImportCleanupModal() {
  document.getElementById('import-cleanup-modal').style.display = 'none';
  importCleanupSelected = new Set();
}

function toggleImportCleanupCode(code) {
  if(importCleanupSelected.has(code)) importCleanupSelected.delete(code);
  else importCleanupSelected.add(code);
  renderImportCleanupSummary();
  const btn = document.getElementById('import-cleanup-execute-btn');
  if(btn) btn.disabled = importCleanupSelected.size === 0;
}

function toggleAllImportCleanup(select) {
  const term = (document.getElementById('import-cleanup-search').value || '').toLocaleLowerCase('tr-TR').trim();
  const visible = detectBulkImportProducts().filter(p => !term || p.name.toLocaleLowerCase('tr-TR').includes(term) || (p.code||'').toLocaleLowerCase('tr-TR').includes(term));
  visible.forEach(p => { if(select) importCleanupSelected.add(p.code); else importCleanupSelected.delete(p.code); });
  renderImportCleanupList();
}

function renderImportCleanupSummary() {
  const box = document.getElementById('import-cleanup-summary');
  const all = detectBulkImportProducts();
  if(!box) return;
  if(all.length === 0) {
    box.innerHTML = `<p style="font-size:12px; color:var(--steel);">Toplu içe aktarımdan kalma, hâlâ dokunulmamış görünen bir ürün bulunamadı.</p>`;
    return;
  }
  box.innerHTML = `<div style="font-size:12px;"><strong>${all.length}</strong> ürün toplu aktarımdan kalma görünüyor. <strong>${importCleanupSelected.size}</strong> tanesi seçili.</div>`;
}

function renderImportCleanupList() {
  const listBox = document.getElementById('import-cleanup-list');
  if(!listBox) return;
  renderImportCleanupSummary();

  const term = (document.getElementById('import-cleanup-search').value || '').toLocaleLowerCase('tr-TR').trim();
  const all = detectBulkImportProducts()
    .filter(p => !term || p.name.toLocaleLowerCase('tr-TR').includes(term) || (p.code||'').toLocaleLowerCase('tr-TR').includes(term))
    .sort((a,b) => a.name.localeCompare(b.name, 'tr-TR'));

  if(all.length === 0) {
    listBox.innerHTML = `<p style="font-size:12px; color:var(--steel); text-align:center; margin:10px 0;">Ürün bulunamadı.</p>`;
    document.getElementById('import-cleanup-execute-btn').disabled = importCleanupSelected.size === 0;
    return;
  }

  listBox.innerHTML = all.map(p => {
    const isOverwrite = (p.lastUpdatedBy || '').includes('Güncellendi');
    return `
      <label style="display:flex; align-items:center; gap:8px; padding:5px 4px; cursor:pointer; ${importCleanupSelected.has(p.code) ? 'background:#FEE2E2;' : ''}">
        <input type="checkbox" ${importCleanupSelected.has(p.code) ? 'checked' : ''} onchange="toggleImportCleanupCode('${p.code}')">
        <span style="flex:1; font-size:13px;">${p.name} <small style="color:var(--steel); font-family:'IBM Plex Mono';">(${p.code}, ${p.qty||0} ${p.unit||'Adet'}, ₺${formatMoney(p.price||0)})</small>${isOverwrite ? ' <small style="color:#DC2626; font-weight:600;">— mevcut kaydın üzerine yazılmış!</small>' : ''}</span>
      </label>
    `;
  }).join('');
  document.getElementById('import-cleanup-execute-btn').disabled = importCleanupSelected.size === 0;
}

async function executeImportCleanup() {
  const codes = Array.from(importCleanupSelected).filter(c => productsData[c]);
  if(codes.length === 0) return;

  const confirmWord = prompt(`${codes.length} ürün KALICI OLARAK silinecek. Bu işlem geri alınamaz.\n\nOnaylamak için kutuya büyük harflerle "SİL" yazın:`);
  if(confirmWord !== 'SİL') { showToast("İptal edildi, hiçbir şey silinmedi."); return; }

  const btn = document.getElementById('import-cleanup-execute-btn');
  if(btn) { btn.disabled = true; btn.textContent = '⏳ Siliniyor...'; }

  try {
    const productUpdates = {};
    const imageUpdates = {};
    const barcodeUpdates = {};
    codes.forEach(c => { productUpdates[c] = null; imageUpdates[c] = null; barcodeUpdates[c] = null; });

    await db.update(productUpdates);
    await dbProductImages.update(imageUpdates);
    await dbBarcodeCache.update(barcodeUpdates);
    codes.forEach(c => delete productsData[c]);

    showToast(`✅ ${codes.length} toplu içe aktarım kaydı kalıcı olarak silindi.`);
    closeImportCleanupModal();
    if(typeof renderGrid === 'function') renderGrid();
  } catch(err) {
    alert("Silme sırasında bir hata oluştu: " + (err.message || err) + "\n\nBazı ürünler silinmiş olabilir, lütfen stok listesini kontrol edin.");
  } finally {
    if(btn) { btn.disabled = false; btn.textContent = '🗑️ Seçilenleri Kalıcı Olarak Sil'; }
  }
}

function populateReceiptEditProductList() {
  const dl = document.getElementById('receipt-edit-product-list');
  if(!dl) return;
  dl.innerHTML = '';
  Object.values(productsData).forEach(p => {
    const opt = document.createElement('option');
    opt.value = `${p.code} - ${p.name}`;
    dl.appendChild(opt);
  });
}

function resetReceiptAddForm() {
  ['re-add-product','re-add-qty','re-add-cost','re-add-discount','re-add-vat','re-add-profit','re-add-price','re-add-suggested-price','re-add-barcode','re-add-barcode-pending'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.value = '';
  });
  const unitEl = document.getElementById('re-add-unit'); if(unitEl) unitEl.value = 'Adet';
  const catEl = document.getElementById('re-add-category'); if(catEl) catEl.value = 'Diğer';
  const priceFields = document.getElementById('re-add-price-fields'); if(priceFields) priceFields.style.display = 'none';
  const newFields = document.getElementById('re-add-new-fields'); if(newFields) newFields.style.display = 'none';
  const warnBox = document.getElementById('re-add-duplicate-warning'); if(warnBox) { warnBox.innerHTML = ''; warnBox.style.display = 'none'; }
  const updateCheck = document.getElementById('re-add-update-existing-price'); if(updateCheck) updateCheck.checked = true;

  // Düzenleme modundan çıkılıyorsa (iptal / kaydetme sonrası) formu ve butonu eski haline döndür.
  reEditingIndex = null;
  const banner = document.getElementById('re-add-edit-banner'); if(banner) banner.style.display = 'none';
  const addBtn = document.getElementById('re-add-btn'); if(addBtn) addBtn.textContent = '+ Listeye Ekle';
}

function cancelReceiptEditItemEdit() {
  resetReceiptAddForm();
  renderReceiptEditItems();
}

// Fişteki mevcut bir kalemin GELİŞ FİYATI, SATIŞ FİYATI, KDV/KÂR YÜZDESİ, MİKTARI,
// BİRİMİ ve SINIFI dahil tüm özelliklerini düzenlemek için "Kaleme Ekle" formuna yükler.
// editFisItem'ın (yeni fiş ekranındaki) bu modaldaki karşılığıdır.
function editReceiptEditItem(idx) {
  const item = receiptEditItems[idx];
  if(!item) return;

  reEditingIndex = idx;

  document.getElementById('re-add-product').value = item.isNew ? item.name : `${item.code} - ${item.name}`;
  document.getElementById('re-add-qty').value = item.qty;
  document.getElementById('re-add-cost').value = item.cost;
  document.getElementById('re-add-discount').value = item.discount || '';

  checkReceiptEditProductMatch();

  // checkReceiptEditProductMatch() sadece boş alanları stoktaki mevcut değerlerle doldurur;
  // bu kalemde daha önce girilmiş kendi değerleri varsa (isNew ya da updatePrices ile
  // kaydedilmiş) onların üzerine yazıp gösteriyoruz ki gerçekten düzenlediğiniz şey bu olsun.
  if(item.isNew) {
    document.getElementById('re-add-price').value = item.price || '';
    document.getElementById('re-add-unit').value = item.unit || 'Adet';
    document.getElementById('re-add-category').value = item.category || 'Diğer';
    document.getElementById('re-add-vat').value = (item.vat != null) ? item.vat : '';
    document.getElementById('re-add-profit').value = (item.targetProfit != null) ? item.targetProfit : '';
    updateFisProfit('re-add');
    const barcodeEl = document.getElementById('re-add-barcode'); if(barcodeEl) barcodeEl.value = item.code || '';
    const barcodePendingEl = document.getElementById('re-add-barcode-pending'); if(barcodePendingEl) barcodePendingEl.value = item.code || '';
  } else if(item.updatePrices) {
    if(item.vat != null) document.getElementById('re-add-vat').value = item.vat;
    if(item.targetProfit != null) document.getElementById('re-add-profit').value = item.targetProfit;
    if(item.newPrice != null) document.getElementById('re-add-price').value = item.newPrice;
    const updateCheck = document.getElementById('re-add-update-existing-price'); if(updateCheck) updateCheck.checked = true;
    updateFisProfit('re-add');
  }

  const banner = document.getElementById('re-add-edit-banner'); if(banner) banner.style.display = 'flex';
  const addBtn = document.getElementById('re-add-btn'); if(addBtn) addBtn.textContent = '💾 Düzenlemeyi Kaydet';

  renderReceiptEditItems(); // düzenlenen satırı vurgulamak için yeniden çiz

  const productInput = document.getElementById('re-add-product');
  if(productInput) { productInput.scrollIntoView({ behavior: 'smooth', block: 'center' }); productInput.focus(); }
  showToast("Kalem düzenlemeniz için forma yüklendi. Geliş/satış fiyatı, yüzde, miktar — ne değiştirdiyseniz '💾 Düzenlemeyi Kaydet' butonuna basın.");
}

// checkFisProductMatch'in aynısı — sadece 're-add-' alanlarına ve bu modalın
// kendi tekrarlama uyarı kutusuna hitap edecek şekilde uyarlanmış hali.
function checkReceiptEditProductMatch() {
  const inputVal = document.getElementById('re-add-product').value.trim();
  const possibleCode = inputVal.split(' - ')[0].trim();
  const p = productsData[possibleCode];
  const exists = !!p;

  const priceFields = document.getElementById('re-add-price-fields');
  const priceNote = document.getElementById('re-add-price-note');
  const newFields = document.getElementById('re-add-new-fields');
  const existingUpdateWrap = document.getElementById('re-add-existing-update-check-wrap');

  if(!inputVal) {
    if(priceFields) priceFields.style.display = 'none';
    if(newFields) newFields.style.display = 'none';
    if(existingUpdateWrap) existingUpdateWrap.style.display = 'none';
  } else if(exists) {
    if(priceFields) priceFields.style.display = 'block';
    if(newFields) newFields.style.display = 'none';
    if(existingUpdateWrap) existingUpdateWrap.style.display = 'flex';
    if(priceNote) {
      priceNote.innerHTML = `✏️ Bu ürün stokta kayıtlı — şu anki: Geliş ₺${formatMoney(p.costPrice||0)} · Satış ₺${formatMoney(p.price||0)}${p.vat!=null?' · KDV %'+p.vat:''}${p.targetProfit!=null?' · Kâr %'+p.targetProfit:''}. Piyasa fiyatı değiştiyse KDV/kâr oranını girip güncelleyebilirsiniz.`;
    }
    const vatInput = document.getElementById('re-add-vat');
    const profitInput = document.getElementById('re-add-profit');
    const priceInput = document.getElementById('re-add-price');
    if(vatInput && !vatInput.value && p.vat != null) vatInput.value = p.vat;
    if(profitInput && !profitInput.value && p.targetProfit != null) profitInput.value = p.targetProfit;
    if(priceInput && !priceInput.value) priceInput.value = p.price != null ? p.price : '';
    updateFisProfit('re-add');
  } else {
    if(priceFields) priceFields.style.display = 'block';
    if(existingUpdateWrap) existingUpdateWrap.style.display = 'none';
    if(priceNote) priceNote.innerHTML = `ℹ️ Bu malzeme sistemde bulunamadı, <b>YENİ ÜRÜN</b> olarak sisteme kaydedilip bu fişe işlenecek. Barkod/birim/kategori bilgilerini de girin, satış fiyatını belirleyin:`;
    if(newFields) newFields.style.display = 'block';
  }

  const warnBox = document.getElementById('re-add-duplicate-warning');
  if(!warnBox) return;
  if(_reAddMatchDebounce) clearTimeout(_reAddMatchDebounce);
  if(!inputVal || exists) { warnBox.innerHTML = ''; warnBox.style.display = 'none'; return; }

  _reAddMatchDebounce = setTimeout(() => {
    const matches = findSimilarProducts(inputVal);
    if(matches.length === 0) { warnBox.innerHTML = ''; warnBox.style.display = 'none'; return; }
    warnBox.style.display = 'block';
    warnBox.innerHTML = `
      <div style="font-weight:600; margin-bottom:6px;">⚠️ Bu malzeme sistemde zaten kayıtlı olabilir. Gerçekten yeni bir ürün mü, yoksa aşağıdakinin üstüne mi ekleyelim?</div>
      ${matches.map(m => `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:5px 0; border-top:1px dashed var(--steel-line);">
          <span>${m.product.name} <small style="color:var(--steel); font-family:'IBM Plex Mono';">(${m.product.code}, stok: ${m.product.qty ?? 0})</small></span>
          <button type="button" class="sm-btn" style="flex-shrink:0;" onclick="selectReceiptEditSuggestion('${m.product.code}')">Üstüne Ekle</button>
        </div>
      `).join('')}
    `;
  }, 250);
}

function selectReceiptEditSuggestion(code) {
  const p = productsData[code];
  if(!p) return;
  document.getElementById('re-add-product').value = `${p.code} - ${p.name}`;
  checkReceiptEditProductMatch();
}

function renderReceiptEditItems() {
  const box = document.getElementById('re-items-list');
  if(!box) return;

  if(receiptEditItems.length === 0) {
    box.innerHTML = '<p style="color:var(--steel); font-size:12px; text-align:center; padding:10px 0;">Listede hiç kalem yok. Aşağıdan ekleyebilirsiniz.</p>';
  } else {
    box.innerHTML = receiptEditItems.map((it, idx) => `
      <div style="display:flex; align-items:center; gap:8px; padding:8px; border-bottom:1px solid var(--steel-line); flex-wrap:wrap; ${idx === reEditingIndex ? 'background:#FFF7E0; border-radius:6px; outline:2px solid var(--warning, #E0A800);' : ''}">
        <div style="flex:2; min-width:160px;">
          <strong>${it.name}</strong>${it.isNew ? ' <span style="color:var(--info); font-size:10px; font-weight:600;">(YENİ ÜRÜN' + (it.category ? ' — ' + it.category : '') + ')</span>' : ''}${idx === reEditingIndex ? ' <span style="color:#E0A800; font-size:10px; font-weight:600;">(DÜZENLENİYOR)</span>' : ''}<br>
          <small style="color:var(--steel); font-family:'IBM Plex Mono';">${it.isNew ? (it.code || 'Kod otomatik atanacak') : (it.code || '-')} ${it.unit ? '· ' + it.unit : ''}</small>
          ${it.isNew && it.price ? `<br><small style="color:var(--steel);">Satış: ₺${formatMoney(it.price)}${it.vat?' · KDV %'+it.vat:''}${it.targetProfit!=null && it.targetProfit!==''?' · Kâr %'+it.targetProfit:''}</small>` : ''}
          ${!it.isNew && it.updatePrices ? `<br><small style="color:var(--success);">↻ Geliş ₺${formatMoney(it.cost||0)}${it.newPrice!=null?' · Satış ₺'+formatMoney(it.newPrice):''}${it.vat!=null?' · KDV %'+it.vat:''}${it.targetProfit!=null?' · Kâr %'+it.targetProfit:''} stokta güncellenecek</small>` : ''}
        </div>
        <div style="width:90px;">
          <label style="font-size:9px; text-transform:uppercase; color:var(--steel);">Miktar</label>
          <input type="number" step="0.01" value="${it.qty}" oninput="updateReceiptEditItem(${idx}, 'qty', this.value)">
        </div>
        <div style="width:120px;">
          <label style="font-size:9px; text-transform:uppercase; color:var(--steel);">Alış Fiyatı</label>
          <input type="number" step="0.01" value="${it.cost || 0}" oninput="updateReceiptEditItem(${idx}, 'cost', this.value)">
        </div>
        <div style="width:100px;">
          <label style="font-size:9px; text-transform:uppercase; color:var(--steel);">İskonto (₺)</label>
          <input type="number" step="0.01" value="${it.discount || 0}" oninput="updateReceiptEditItem(${idx}, 'discount', this.value)">
        </div>
        <div id="re-line-total-${idx}" style="width:90px; text-align:right; font-family:'IBM Plex Mono'; font-weight:bold;">₺${formatMoney(Math.max(0, (Number(it.qty)||0) * (Number(it.cost)||0) - (Number(it.discount)||0)))}</div>
        <button type="button" class="btn btn-info btn-sm" style="width:auto; flex-shrink:0;" title="Geliş/satış fiyatı, yüzde, birim gibi tüm özellikleri düzenle" onclick="editReceiptEditItem(${idx})">✏️ Düzenle</button>
        <button type="button" class="btn btn-danger btn-sm" style="width:auto; flex-shrink:0;" onclick="removeReceiptEditItem(${idx})">🗑</button>
      </div>
    `).join('');
  }
  updateReceiptEditTotal();
}

function updateReceiptEditItem(idx, field, val) {
  if(!receiptEditItems[idx]) return;
  receiptEditItems[idx][field] = parseFloat(val) || 0;
  const lineTotal = Math.max(0, (Number(receiptEditItems[idx].qty)||0) * (Number(receiptEditItems[idx].cost)||0) - (Number(receiptEditItems[idx].discount)||0));
  receiptEditItems[idx].total = lineTotal;

  // Sadece ilgili satırın toplamını güncelle — tüm listeyi yeniden çizmiyoruz
  // ki kullanıcı yazarken input'un odağı (focus) kaybolmasın.
  const cell = document.getElementById(`re-line-total-${idx}`);
  if(cell) cell.textContent = '₺' + formatMoney(lineTotal);
  updateReceiptEditTotal();
}

function addReceiptEditItem() {
  const inputEl = document.getElementById('re-add-product');
  const inputVal = inputEl.value.trim();
  const qty = parseFloat(document.getElementById('re-add-qty').value);
  const costRaw = document.getElementById('re-add-cost').value;
  const costEntered = costRaw === '' ? null : parseFloat(costRaw);
  const discount = Math.max(0, parseFloat(document.getElementById('re-add-discount').value) || 0);

  if(!inputVal || isNaN(qty) || qty <= 0) {
    alert("Lütfen geçerli bir malzeme adı/kodu ve miktar girin.");
    return;
  }

  const possibleCode = inputVal.split(' - ')[0].trim();
  const p = productsData[possibleCode];

  let newEntry;
  if(p) {
    // Mevcut ürün
    const cost = (costEntered !== null && !isNaN(costEntered)) ? costEntered : Number(p.costPrice || 0);
    const updateCheckbox = document.getElementById('re-add-update-existing-price');
    const updatePrices = updateCheckbox ? updateCheckbox.checked : false;
    const vatRaw = document.getElementById('re-add-vat').value;
    const profitRaw = document.getElementById('re-add-profit').value;
    const newPriceRaw = document.getElementById('re-add-price').value;

    newEntry = { code: p.code, name: p.name, unit: p.unit || 'Adet', qty, cost, discount, isNew: false };
    if(updatePrices) {
      newEntry.updatePrices = true;
      if(vatRaw !== '') newEntry.vat = parseFloat(vatRaw) || 0;
      if(profitRaw !== '') newEntry.targetProfit = parseFloat(profitRaw) || 0;
      if(newPriceRaw !== '') newEntry.newPrice = Math.max(0, parseFloat(newPriceRaw) || 0);
    }

    // Düzenleme modundaysak (bir kalemin ✏️ Düzenle'sine basılmışsa), yeni bir satır
    // açmak yerine düzenlenen kalemin yerine koyuyoruz — kod farklı bir ürüne
    // değiştirilmiş olsa bile bu geçerli, çünkü "elle eşleştir" ile ürün de değişebilir.
    if(reEditingIndex !== null && receiptEditItems[reEditingIndex]) {
      receiptEditItems[reEditingIndex] = newEntry;
      resetReceiptAddForm();
      renderReceiptEditItems();
      return;
    }

    // Aynı mevcut üründen fişte zaten varsa ayrı satır açmak yerine miktarını artır.
    const existingIdx = receiptEditItems.findIndex(it => !it.isNew && it.code === p.code);
    if(existingIdx > -1) {
      receiptEditItems[existingIdx].qty = (Number(receiptEditItems[existingIdx].qty)||0) + qty;
      receiptEditItems[existingIdx].discount = (Number(receiptEditItems[existingIdx].discount)||0) + discount;
      if(updatePrices) Object.assign(receiptEditItems[existingIdx], newEntry, { qty: receiptEditItems[existingIdx].qty, discount: receiptEditItems[existingIdx].discount });
      resetReceiptAddForm();
      renderReceiptEditItems();
      return;
    }
  } else {
    // Tamamen yeni ürün — kaydedildiğinde sisteme tanımlanıp bu fişe işlenecek.
    const cost = (costEntered !== null && !isNaN(costEntered)) ? costEntered : 0;
    const rawBarcode = document.getElementById('re-add-barcode').value.trim();
    const vat = parseFloat(document.getElementById('re-add-vat').value) || 0;
    const profit = parseFloat(document.getElementById('re-add-profit').value) || 0;
    const price = parseFloat(document.getElementById('re-add-price').value) || 0;
    const unit = document.getElementById('re-add-unit').value;
    const category = document.getElementById('re-add-category').value;

    if(rawBarcode) {
      const usedElsewhere = receiptEditItems.some((it, i) => it.code === rawBarcode && i !== reEditingIndex);
      if(productsData[rawBarcode] || usedElsewhere) {
        alert(`'${rawBarcode}' barkodu zaten kullanılıyor. Lütfen kontrol edin.`);
        return;
      }
    }

    newEntry = {
      code: rawBarcode || null, name: inputVal, unit, category,
      qty, cost, discount, vat, targetProfit: profit, price, isNew: true
    };
  }

  if(reEditingIndex !== null && receiptEditItems[reEditingIndex]) {
    receiptEditItems[reEditingIndex] = newEntry;
  } else {
    receiptEditItems.push(newEntry);
  }
  resetReceiptAddForm();
  renderReceiptEditItems();
}

function removeReceiptEditItem(idx) {
  if(!confirm("Bu kalemi fişten kaldırmak istediğinize emin misiniz? Kaydettiğinizde bu kadar miktar stoktan geri düşülecek.")) return;
  receiptEditItems.splice(idx, 1);
  renderReceiptEditItems();
}

function updateReceiptEditTotal() {
  const total = receiptEditItems.reduce((sum, it) => sum + Math.max(0, (Number(it.qty)||0) * (Number(it.cost)||0) - (Number(it.discount)||0)), 0);
  const el = document.getElementById('re-total');
  if(el) el.textContent = formatMoney(total);
}

async function saveReceiptEdit() {
  if(currentRole !== 'admin' && currentRole !== 'staff') return;
  if(!receiptEditTarget) return;

  const { receiptId, date, original } = receiptEditTarget;
  const wholesalerName = original.wholesalerName || 'Bilinmeyen Toptancı';
  const editedBy = (currentRole === 'admin' ? 'Yönetici' : 'Çalışan');

  // 0) Listede "YENİ ÜRÜN" olarak eklenmiş kalemler varsa, önce bunları
  // gerçekten sisteme kaydet (barkod/kod çakışması varsa burada durur).
  const usedCodes = new Set(receiptEditItems.filter(it => it.code).map(it => it.code));
  const resolvedItems = [];
  try {
    for(const it of receiptEditItems) {
      if(it.isNew) {
        const code = await createNewProductRecord(it, editedBy + ' (Fiş Düzenleme: ' + wholesalerName + ')', usedCodes);
        usedCodes.add(code);
        resolvedItems.push(Object.assign({}, it, { code, isNew: false }));
      } else {
        resolvedItems.push(it);
      }
    }
  } catch(err) {
    alert("Yeni malzeme(ler) sisteme kaydedilirken hata oluştu: " + (err.message || err));
    return;
  }

  const newItems = resolvedItems.map(it => {
    const clean = Object.assign({}, it);
    clean.qty = Number(it.qty) || 0;
    clean.cost = Number(it.cost) || 0;
    clean.discount = Math.max(0, Number(it.discount) || 0);
    clean.total = Math.max(0, clean.qty * clean.cost - clean.discount);
    return clean;
  }).filter(it => it.qty > 0 && it.code);

  if(newItems.length === 0) {
    if(!confirm("Listede hiç kalem kalmadı. Bu fişi tamamen boşaltmak (tüm ürünleri stoktan geri düşmek) istediğinize emin misiniz?")) return;
  }

  const oldItems = original.items || [];
  const oldByCode = {};
  oldItems.forEach(it => { if(it.code) oldByCode[it.code] = (oldByCode[it.code]||0) + (Number(it.qty)||0); });
  const newByCode = {};
  newItems.forEach(it => { newByCode[it.code] = (newByCode[it.code]||0) + (Number(it.qty)||0); });

  const allCodes = new Set([...Object.keys(oldByCode), ...Object.keys(newByCode)]);
  const deltas = [];
  allCodes.forEach(code => {
    const delta = (newByCode[code]||0) - (oldByCode[code]||0);
    if(Math.abs(delta) > 0.0001) deltas.push({ code, delta });
  });

  // Kodlardan biri artık sistemde kayıtlı değilse (ürün silinmiş), stok
  // düzeltmesi güvenli yapılamayacağından işlemi başlatmadan durduruyoruz.
  for(const d of deltas) {
    if(!productsData[d.code]) {
      alert(`'${d.code}' kodlu ürün artık sistemde kayıtlı değil, stok düzeltmesi yapılamıyor. Değişikliği iptal edip tekrar deneyin.`);
      return;
    }
  }

  const newTotal = newItems.reduce((s,it) => s + it.total, 0);
  const oldTotal = Number(original.total) || 0;
  const totalDelta = newTotal - oldTotal;

  try {
    // 1) Stok miktarlarını eski/yeni fark üzerinden güncelle + hareket kaydı düş.
    for(const d of deltas) {
      await new Promise((resolve, reject) => {
        db.child(d.code).child('qty').transaction(cur => Number(cur||0) + d.delta, (error, committed) => {
          if(error) { reject(error); return; }
          if(committed) {
            logMovement(d.code, productsData[d.code].name, d.delta, 'MALZEME FİŞİ DÜZENLEME: ' + wholesalerName);
          }
          resolve();
        });
      });
    }

    // 2) Değişen/eklenen alış fiyatlarını güncel maliyet olarak stoğa yansıt.
    newItems.forEach(it => {
      if(it.cost > 0) db.child(it.code).child('costPrice').set(it.cost);
    });

    // 2b) "Fiyat/kâr güncelle" işaretlenmiş mevcut ürünler için KDV/kâr/satış fiyatını da stoğa yansıt.
    newItems.forEach(item => {
      if(item.updatePrices) {
        const priceUpdates = {
          lastPriceUpdate: new Date().toISOString(),
          lastUpdatedBy: editedBy + ' (Fiş Düzenleme: ' + wholesalerName + ')'
        };
        let hasChange = false;
        if(item.vat !== undefined) { priceUpdates.vat = item.vat; hasChange = true; }
        if(item.targetProfit !== undefined) { priceUpdates.targetProfit = item.targetProfit; hasChange = true; }
        if(item.newPrice !== undefined) { priceUpdates.price = item.newPrice; hasChange = true; }
        if(item.brand !== undefined) { priceUpdates.brand = item.brand; hasChange = true; }
        if(hasChange) db.child(item.code).update(priceUpdates);
      }
    });

    // 3) Fiş kaydının kendisini güncelle.
    await dbGoodsReceipts.child(date).child(receiptId).update({
      items: newItems,
      total: newTotal,
      lastEditedAt: new Date().toISOString(),
      lastEditedBy: editedBy
    });

    // 4) Bu fiş toptancı borcuna işlenmişse, toplam farkını bakiyeye de yansıt.
    if(original.addedToDebt && Math.abs(totalDelta) > 0.0001 && original.wholesalerKey) {
      await new Promise((resolve) => {
        dbWholesalers.child(original.wholesalerKey).child('balance').transaction(cur => (cur||0) - totalDelta, (err2) => {
          if(!err2) {
            dbWholesalers.child(original.wholesalerKey).child('transactions').push({
              desc: 'Malzeme Fişi Düzenleme: ' + (original.fisNo || receiptId),
              amount: Math.abs(totalDelta),
              type: totalDelta > 0 ? 'borc' : 'odeme',
              date: new Date().toLocaleString('tr-TR')
            });
          }
          resolve();
        });
      });
    }

    dbNotifications.push({
      text: `Malzeme fişi düzenlendi: ${wholesalerName} (${date}) — ${editedBy} tarafından güncellendi.`,
      time: new Date().toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit'})
    });

    showToast("Fiş güncellendi, stok ve bakiye farka göre düzeltildi!");
    closeReceiptEditModal();
  } catch(err) {
    alert("Fiş güncellenirken hata oluştu: " + (err.message || err));
  }
}


function openWholesalerEdit(key) {
  if(currentRole !== 'admin') return;
  const w = wholesalersData[key];
  if(!w) return;
  document.getElementById('we-key').value = key;
  document.getElementById('we-name').value = w.name || '';
  document.getElementById('we-contact').value = w.contact || '';
  document.getElementById('we-phone').value = w.phone || '';
  document.getElementById('we-whatsapp').value = w.whatsapp || '';
  document.getElementById('we-category').value = w.category || 'Genel';
  document.getElementById('we-day').value = w.day || 'Belirsiz';
  document.getElementById('we-payment-term').value = w.paymentTerm || 'Peşin';
  document.getElementById('we-tax').value = w.tax || '';
  document.getElementById('we-iban').value = w.iban || '';
  document.getElementById('we-address').value = w.address || '';
  document.getElementById('we-notes').value = w.notes || '';
  document.getElementById('we-status').value = w.status || 'aktif';
  document.getElementById('wholesaler-edit-modal').style.display = 'flex';
}

function closeWholesalerEdit() {
  document.getElementById('wholesaler-edit-modal').style.display = 'none';
}

function saveWholesalerEdit() {
  if(currentRole !== 'admin') return;
  const key = document.getElementById('we-key').value;
  const name = document.getElementById('we-name').value.trim();
  const contact = document.getElementById('we-contact').value.trim();
  const phone = document.getElementById('we-phone').value.trim();
  const whatsapp = document.getElementById('we-whatsapp').value.trim();
  const category = document.getElementById('we-category').value;
  const day = document.getElementById('we-day').value;
  const paymentTerm = document.getElementById('we-payment-term').value;
  const tax = document.getElementById('we-tax').value.trim();
  const iban = document.getElementById('we-iban').value.trim();
  const address = document.getElementById('we-address').value.trim();
  const notes = document.getElementById('we-notes').value.trim();
  const status = document.getElementById('we-status').value;

  if(!key) return;
  if(!name) { alert("Firma adı boş olamaz."); return; }

  dbWholesalers.child(key).update({
    name, contact, phone, whatsapp, category, day, paymentTerm, tax, iban, address, notes, status
  }, (err) => {
    if(!err) {
      showToast("Toptancı bilgileri güncellendi.");
      closeWholesalerEdit();
    } else {
      alert("Güncellenemedi: " + err.message);
    }
  });
}

function renderGrid() {
  const grid = document.getElementById('grid');
  const search = document.getElementById('search').value.toLowerCase();
  const sortBy = document.getElementById('sort-select').value;

  if (search !== lastGridSearch) {
    gridCurrentPage = 1;
    lastGridSearch = search;
  }

  let count = 0, units = 0, value = 0;
  const canEdit = (currentRole === 'admin' || currentRole === 'staff');
  const isAdmin = (currentRole === 'admin');

  let matchedProducts = [];
  Object.values(productsData).forEach(p => {
    const pName = p.name ? p.name.toLowerCase() : '';
    const pCat = p.category ? p.category.toLowerCase() : '';
    const pCode = p.code ? p.code.toLowerCase() : '';
    const pLoc = p.location ? p.location.toLowerCase() : '';
    const pBrand = p.brand ? p.brand.toLowerCase() : '';

    if (pName.includes(search) || pCat.includes(search) || pCode.includes(search) || pLoc.includes(search) || pBrand.includes(search)) {
      count++;
      units += parseFloat(p.qty || 0);
      const itemCost = p.costPrice != null ? parseFloat(p.costPrice) : parseFloat(p.price || 0);
      value += parseFloat(p.qty || 0) * itemCost;
      matchedProducts.push(p);
    }
  });

  // Sıralama
  switch(sortBy) {
    case 'name-asc': matchedProducts.sort((a,b) => (a.name || '').localeCompare(b.name || '', 'tr')); break;
    case 'name-desc': matchedProducts.sort((a,b) => (b.name || '').localeCompare(a.name || '', 'tr')); break;
    case 'price-asc': matchedProducts.sort((a,b) => (a.price || 0) - (b.price || 0)); break;
    case 'price-desc': matchedProducts.sort((a,b) => (b.price || 0) - (a.price || 0)); break;
    case 'qty-asc': matchedProducts.sort((a,b) => (a.qty || 0) - (b.qty || 0)); break;
    case 'qty-desc': matchedProducts.sort((a,b) => (b.qty || 0) - (a.qty || 0)); break;
    case 'value-desc': matchedProducts.sort((a,b) => {
      const aCost = a.costPrice != null ? parseFloat(a.costPrice) : parseFloat(a.price || 0);
      const bCost = b.costPrice != null ? parseFloat(b.costPrice) : parseFloat(b.price || 0);
      return ((b.qty || 0) * bCost) - ((a.qty || 0) * aCost);
    }); break;
    case 'category-asc': matchedProducts.sort((a,b) => (a.category || '').localeCompare(b.category || '', 'tr')); break;
    default: break;
  }

  const visibleCount = Math.min(matchedProducts.length, gridCurrentPage * GRID_PAGE_SIZE);
  const pageProducts = matchedProducts.slice(0, visibleCount);
  const matchedCodes = [];

  const htmlParts = [];

  pageProducts.forEach(p => {
    matchedCodes.push(p.code);
    const isLow = p.qty <= 5;
    const hasCostPrice = p.costPrice != null && parseFloat(p.costPrice) > 0;
    const effectiveCost = hasCostPrice ? parseFloat(p.costPrice) : parseFloat(p.price || 0);
    const itemInventoryValue = parseFloat(p.qty || 0) * effectiveCost;

    let editActions = '';
    if (canEdit) {
      editActions = `
        <div style="display:flex; justify-content:space-between; margin-top:10px; border-top:1px solid var(--steel-line); padding-top:8px;">
          <button class="sm-btn" onclick="openEditModal('${p.code}')">✏️ Düzenle</button>
          ${isAdmin ? `<button class="sm-btn" onclick="deleteProduct('${p.code}')" style="color:var(--rust);">🗑️ Sil</button>` : ''}
        </div>
      `;
    }

    htmlParts.push(`
      <div class="tag ${isLow ? 'low' : ''}" id="card-${p.code}">
        <div class="tag-header">
          <div>
            <div class="tag-title">${p.name}</div>
            <div class="tag-code">${p.code}</div>
            <div class="tag-code" style="margin-top:2px;">${p.category || 'Belirtilmedi'}${p.brand ? ` • <span style="color:var(--charcoal-soft, var(--charcoal)); font-weight:600;">${p.brand}</span>` : ''}${p.location ? ` <span class="location-badge" onclick="goToLocation('${p.location}')">📍 ${p.location}</span>` : ''}</div>
          </div>
          <div style="display:flex; flex-direction:column; gap:4px; align-items:flex-end; flex-shrink:0;">
            <button class="sm-btn" onclick="printQR('${p.code}')" ${!canEdit ? 'style="display:none;"' : ''}>🖨️ Yazdır</button>
            <button class="sm-btn" onclick="printBarcodeLabel('${p.code}')" ${!canEdit ? 'style="display:none;"' : ''}>🏷️ Barkod Yazıcı</button>
          </div>
        </div>

        <div class="product-photo" id="photo-${p.code}"><span class="photo-placeholder">📷</span></div>
        <button class="qr-toggle-link" onclick="toggleQR('${p.code}')">🔳 Karekodu Görüntüle</button>
        <div class="qr-box-mini hidden" id="grid-qr-${p.code}"></div>

        <div class="price-info-box">
           <span>Birim Fiyatı: <strong style="color:var(--charcoal);font-size:13px;">₺${formatMoney(p.price || 0)}</strong></span>
           <button class="sm-btn" onclick="updatePrice('${p.code}')" ${!isAdmin ? 'style="display:none;"' : ''}>Güncelle</button>
        </div>
        ${isAdmin ? `
        <div style="font-size:10px; color:var(--steel); margin:-6px 0 8px; display:flex; justify-content:space-between; align-items:center;">
          <span>Envanter Değeri: <b style="color:var(--charcoal);">₺${formatMoney(itemInventoryValue)}</b></span>
          ${!hasCostPrice && p.qty > 0 ? `<span style="color:var(--rust); font-weight:600;" title="Bu üründe geliş/maliyet fiyatı girilmemiş, hesaplamada satış fiyatı kullanılıyor.">⚠️ Maliyet girilmemiş</span>` : ''}
        </div>` : ''}

        <div class="qty-control">
          <button class="qty-btn" onclick="updateQty('${p.code}', -1)" ${!canEdit ? 'disabled' : ''}>-</button>
          <div class="qty-val">${p.qty} <span style="font-size:10px;font-family:'Inter';color:var(--steel);">${p.unit || 'Adet'}</span></div>
          <button class="qty-btn" onclick="updateQty('${p.code}', 1)" ${!canEdit ? 'disabled' : ''}>+</button>
        </div>
        ${editActions}
      </div>
    `);
  });

  grid.innerHTML = htmlParts.join('');

  const moreWrap = document.getElementById('grid-load-more-wrap');
  if (moreWrap) {
    const remaining = matchedProducts.length - visibleCount;
    if (remaining > 0) {
      moreWrap.innerHTML = `<button class="btn btn-dark" style="width:auto; padding:10px 24px;" onclick="gridCurrentPage++; renderGrid();">⬇️ Daha Fazla Göster (${remaining} ürün daha)</button>`;
    } else {
      moreWrap.innerHTML = '';
    }
  }

  matchedCodes.forEach(code => loadProductImageIntoCard(code));

  document.getElementById('sum-count').textContent = count;
  document.getElementById('sum-units').textContent = units.toFixed(1);
  document.getElementById('sum-value').textContent = isAdmin ? ("₺" + formatMoney(value)) : "***";
}


// ============================================================
// KATALOG MODÜLÜ — Marka katalogları (PDF), tekil ürün fişleri,
// boru tipi/boyut sistemi, katalogdan hızlı arama ve fiyatlandırma paneli.
// ============================================================

// Firebase anahtarı olarak yasak olan karakterleri (. # $ [ ] /) temizler;
// marka adının kendisini (Türkçe karakterler dahil) bozmadan sadece bunu yapar.
function sanitizeFirebaseKey(str) {
  return (str || '').toString().replace(/[.#$\[\]\/]/g, '-').trim() || 'diger';
}

// Katalog sekmesi her açıldığında listeleri ve dropdown'ları tazeler.
function initKatalogTab() {
  populateBrandSelect('katalog-single-brand');
  populateBrandSelect('kp-brand');
  populateBrandSelect('pipe-size-brand');
  renderBrandCatalogList();
  renderSingleReceipts();
  renderPipeTypesList();
  const searchEl = document.getElementById('katalog-search');
  if (searchEl) searchEl.value = '';
  renderKatalogSearchResults();
}

function populateProductDatalist(datalistId) {
  const dl = document.getElementById(datalistId);
  if (!dl) return;
  dl.innerHTML = '';
  Object.values(productsData).forEach(p => {
    const opt = document.createElement('option');
    opt.value = `${p.code} - ${p.name}`;
    dl.appendChild(opt);
  });
}

// ---------- 1) MARKA KATALOGLARI (PDF) ----------

function renderBrandCatalogList() {
  const box = document.getElementById('katalog-brand-list');
  if (!box) return;
  const brands = currentBrandList();
  if (brands.length === 0) {
    box.innerHTML = `<p style="font-size:12px; color:var(--steel); text-align:center; padding:14px 0;">Henüz marka tanımlanmadı — "Marka İskonto/KDV Ayarları" panelinden marka ekleyin.</p>`;
    return;
  }
  box.innerHTML = brands.map(brand => {
    const brandKey = sanitizeFirebaseKey(brand);
    const pdfs = catalogPdfsData[brandKey] || {};
    const pdfEntries = Object.entries(pdfs);
    return `
      <div style="border:1px solid var(--steel-line); border-radius:8px; padding:10px; margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong>${brand}</strong>
          <button type="button" class="btn btn-primary btn-sm" style="width:auto;" onclick="openKatalogPdfUploadModal('${brand.replace(/'/g, "\\'")}')">+ PDF Yükle</button>
        </div>
        ${pdfEntries.length === 0
          ? `<p style="font-size:11px; color:var(--steel); margin:6px 0 0;">Bu markaya henüz katalog yüklenmedi.</p>`
          : pdfEntries.map(([pdfId, p]) => `
              <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-top:1px dashed var(--steel-line); font-size:12px;">
                <span style="cursor:pointer; color:var(--info); text-decoration:underline;" onclick="openKatalogPdfPreview('${brandKey}','${pdfId}')">📄 ${p.name} <small style="color:var(--steel);">(${p.sizeKB||0} KB · ${new Date(p.uploadedAt).toLocaleDateString('tr-TR')})</small></span>
                <button type="button" class="btn btn-danger btn-sm" style="width:auto;" onclick="deleteCatalogPdf('${brandKey}','${pdfId}')">🗑</button>
              </div>
            `).join('')
        }
      </div>
    `;
  }).join('');
}

let katalogPdfUploadBrand = null;

function openKatalogPdfUploadModal(brand) {
  if (currentRole !== 'admin' && currentRole !== 'staff') { alert("Yetkiniz yok!"); return; }
  katalogPdfUploadBrand = brand;
  document.getElementById('katalog-pdf-upload-brand-label').textContent = brand;
  document.getElementById('katalog-pdf-name').value = '';
  document.getElementById('katalog-pdf-file').value = '';
  const statusEl = document.getElementById('katalog-pdf-upload-status');
  statusEl.style.display = 'none';
  document.getElementById('katalog-pdf-upload-modal').style.display = 'flex';
}

function closeKatalogPdfUploadModal() {
  document.getElementById('katalog-pdf-upload-modal').style.display = 'none';
  katalogPdfUploadBrand = null;
}

async function uploadCatalogPdf(event) {
  const file = event.target.files[0];
  if (!file) return;
  const nameInput = document.getElementById('katalog-pdf-name');
  const name = nameInput.value.trim() || file.name.replace(/\.pdf$/i, '');
  const statusEl = document.getElementById('katalog-pdf-upload-status');
  const sizeKB = Math.round(file.size / 1024);

  if (sizeKB > 2048) {
    if (!confirm(`Bu PDF ${sizeKB} KB (2 MB üzeri). Firebase'e base64 olarak kaydetmek yavaş olabilir ve veritabanı boyutunu hızla büyütür. Mümkünse dosyayı sıkıştırıp küçültmenizi öneririz. Yine de devam etmek istiyor musunuz?`)) {
      event.target.value = '';
      return;
    }
  }

  statusEl.style.display = 'block';
  statusEl.style.color = '#F59E0B';
  statusEl.textContent = "Yükleniyor, lütfen bekleyin...";

  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = e => reject(e);
      reader.readAsDataURL(file);
    });

    const brandKey = sanitizeFirebaseKey(katalogPdfUploadBrand);
    const newRef = dbCatalogPdfs.child(brandKey).push();
    await newRef.set({
      name, brand: katalogPdfUploadBrand, data: dataUrl, sizeKB,
      uploadedAt: new Date().toISOString(),
      uploadedBy: currentRole === 'admin' ? 'Yönetici' : 'Çalışan'
    });

    statusEl.style.color = '#10B981';
    statusEl.textContent = "✅ Katalog kaydedildi.";
    showToast(`"${name}" kataloğu ${katalogPdfUploadBrand} markasına eklendi.`);
    setTimeout(() => closeKatalogPdfUploadModal(), 800);
  } catch (err) {
    statusEl.style.color = '#EF4444';
    statusEl.textContent = "❌ Yüklenemedi: " + err.message;
  } finally {
    event.target.value = '';
  }
}

function deleteCatalogPdf(brandKey, pdfId) {
  if (currentRole !== 'admin') { alert("Yetkiniz yok!"); return; }
  if (!confirm("Bu katalog PDF'ini kalıcı olarak silmek istiyor musunuz?")) return;
  dbCatalogPdfs.child(brandKey).child(pdfId).remove(() => showToast("Katalog silindi."));
}

function openKatalogPdfPreview(brandKey, pdfId) {
  const p = (catalogPdfsData[brandKey] || {})[pdfId];
  if (!p) return;
  document.getElementById('katalog-pdf-preview-title').textContent = `${p.brand} — ${p.name}`;
  document.getElementById('katalog-pdf-preview-frame').src = p.data;
  document.getElementById('katalog-pdf-preview-modal').style.display = 'flex';
}

function closeKatalogPdfPreview() {
  document.getElementById('katalog-pdf-preview-modal').style.display = 'none';
  document.getElementById('katalog-pdf-preview-frame').src = '';
}

// ---------- 2) TEKİL ÜRÜN FİŞLERİ ----------

async function uploadSingleReceipt(event) {
  if (currentRole !== 'admin' && currentRole !== 'staff') { alert("Yetkiniz yok!"); event.target.value = ''; return; }
  const file = event.target.files[0];
  if (!file) return;

  const name = document.getElementById('katalog-single-name').value.trim();
  if (!name) { alert("Lütfen önce ürün adını girin."); event.target.value = ''; return; }

  const brand = document.getElementById('katalog-single-brand').value;
  const barcode = document.getElementById('katalog-single-barcode').value.trim();
  const catalogPrice = parseFloat(document.getElementById('katalog-single-price').value) || 0;
  const note = document.getElementById('katalog-single-note').value.trim();
  const statusEl = document.getElementById('katalog-single-status');
  statusEl.style.display = 'block';
  statusEl.style.color = '#F59E0B';
  statusEl.textContent = "Kaydediliyor...";

  try {
    let fileData;
    if (file.type === 'application/pdf') {
      const sizeKB = Math.round(file.size / 1024);
      if (sizeKB > 2048 && !confirm(`Bu PDF ${sizeKB} KB (2 MB üzeri). Devam edilsin mi?`)) {
        event.target.value = ''; statusEl.style.display = 'none'; return;
      }
      fileData = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = e => reject(e);
        reader.readAsDataURL(file);
      });
    } else {
      fileData = await compressImageFile(file, 900, 0.7);
    }

    const newRef = dbCatalogMeta.push();
    await newRef.set({
      name, brand: brand || null, barcode: barcode || null, catalogPrice,
      note: note || null, photo: fileData, fileType: file.type,
      createdAt: new Date().toISOString(),
      createdBy: currentRole === 'admin' ? 'Yönetici' : 'Çalışan'
    });

    statusEl.style.color = '#10B981';
    statusEl.textContent = "✅ Fiş kaydedildi.";
    ['katalog-single-name', 'katalog-single-barcode', 'katalog-single-price', 'katalog-single-note'].forEach(id => document.getElementById(id).value = '');
    showToast(`"${name}" fişi kaydedildi.`);
  } catch (err) {
    statusEl.style.color = '#EF4444';
    statusEl.textContent = "❌ Kaydedilemedi: " + err.message;
  } finally {
    event.target.value = '';
  }
}

function renderSingleReceipts() {
  const box = document.getElementById('katalog-single-list');
  if (!box) return;
  const entries = Object.entries(catalogMetaData).sort((a, b) => new Date(b[1].createdAt) - new Date(a[1].createdAt));
  if (entries.length === 0) {
    box.innerHTML = `<p style="font-size:12px; color:var(--steel); text-align:center; padding:10px 0;">Henüz tekil ürün fişi kaydedilmedi.</p>`;
    return;
  }
  box.innerHTML = entries.map(([id, m]) => `
    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:8px 0; border-top:1px dashed var(--steel-line); font-size:12px;">
      <span>
        <strong>${m.name}</strong> ${m.brand ? `<small style="color:var(--steel);">(${m.brand})</small>` : ''}
        ${m.catalogPrice ? `<br><small style="color:var(--steel);">Katalog Fiyatı: ₺${formatMoney(m.catalogPrice)}</small>` : ''}
      </span>
      <span style="display:flex; gap:6px; flex-shrink:0;">
        <button type="button" class="btn btn-info btn-sm" style="width:auto;" onclick="viewSingleReceiptFile('${id}')">👁</button>
        <button type="button" class="btn btn-success btn-sm" style="width:auto;" onclick="openKatalogPricingModalFromMeta('${id}')">💰</button>
        <button type="button" class="btn btn-danger btn-sm" style="width:auto;" onclick="deleteSingleReceipt('${id}')">🗑</button>
      </span>
    </div>
  `).join('');
}

function viewSingleReceiptFile(id) {
  const m = catalogMetaData[id];
  if (!m) return;
  if (m.fileType === 'application/pdf') {
    document.getElementById('katalog-pdf-preview-title').textContent = m.name;
    document.getElementById('katalog-pdf-preview-frame').src = m.photo;
    document.getElementById('katalog-pdf-preview-modal').style.display = 'flex';
  } else {
    openImageModal(m.photo);
  }
}

function deleteSingleReceipt(id) {
  if (currentRole !== 'admin') { alert("Yetkiniz yok!"); return; }
  if (!confirm("Bu fişi kalıcı olarak silmek istiyor musunuz?")) return;
  dbCatalogMeta.child(id).remove(() => showToast("Fiş silindi."));
}

// ---------- 3) FİYATLANDIRMA PANELİ ----------

let katalogPricingContext = null; // { sourceType: 'meta'|'existing'|'search', name, brand, cost, existingCode? }

function openKatalogPricingModal(ctx) {
  if (currentRole !== 'admin' && currentRole !== 'staff') { alert("Yetkiniz yok!"); return; }
  katalogPricingContext = ctx;
  document.getElementById('kp-product-name').textContent = ctx.name || '';
  populateBrandSelect('kp-brand', ctx.brand || '');
  document.getElementById('kp-cost').value = ctx.cost || '';
  const discEl = document.getElementById('kp-discount'); discEl.value = ''; discEl.dataset.auto = '';
  const vatEl = document.getElementById('kp-vat'); vatEl.value = ''; vatEl.dataset.auto = '';
  document.getElementById('kp-profit').value = '';
  document.getElementById('kp-unit').value = 'Adet';
  document.getElementById('kp-existing-search').value = ctx.existingCode ? `${ctx.existingCode} - ${ctx.name}` : '';
  populateProductDatalist('katalog-existing-product-list');
  updateKatalogPricing();
  document.getElementById('katalog-pricing-modal').style.display = 'flex';
}

function openKatalogPricingModalFromMeta(id) {
  const m = catalogMetaData[id];
  if (!m) return;
  openKatalogPricingModal({ sourceType: 'meta', sourceId: id, name: m.name, brand: m.brand, cost: m.catalogPrice });
}

function openKatalogPricingModalFromProduct(code) {
  const p = productsData[code];
  if (!p) return;
  openKatalogPricingModal({ sourceType: 'existing', name: p.name, brand: p.brand, cost: p.costPrice, existingCode: code });
}

function closeKatalogPricingModal() {
  document.getElementById('katalog-pricing-modal').style.display = 'none';
  katalogPricingContext = null;
}

function updateKatalogPricing() {
  const brand = document.getElementById('kp-brand').value;
  const box = document.getElementById('kp-calc-box');

  // Marka seçilince, kullanıcı henüz elle değiştirmediyse iskonto/KDV'yi marka
  // varsayılanından otomatik doldur (üzerine yazılabilir).
  if (brand && brandSettingsData[brand]) {
    const s = brandSettingsData[brand];
    const discEl = document.getElementById('kp-discount');
    const vatEl = document.getElementById('kp-vat');
    if (discEl.value === '' || discEl.dataset.auto === '1') { discEl.value = s.discount || 0; discEl.dataset.auto = '1'; }
    if (vatEl.value === '' || vatEl.dataset.auto === '1') { vatEl.value = s.vat || 0; vatEl.dataset.auto = '1'; }
  }

  const cost = parseFloat(document.getElementById('kp-cost').value);
  const discount = parseFloat(document.getElementById('kp-discount').value) || 0;
  const vat = parseFloat(document.getElementById('kp-vat').value) || 0;
  const profit = parseFloat(document.getElementById('kp-profit').value) || 0;

  if (isNaN(cost) || cost <= 0) { box.classList.remove('active'); box.innerHTML = ''; delete box.dataset.salePrice; return; }

  const afterDiscount = cost * (1 - discount / 100);
  const netCost = afterDiscount * (1 + vat / 100);
  const salePrice = netCost * (1 + profit / 100);

  box.classList.add('active');
  box.innerHTML = `
    Katalog Fiyatı: <b>₺${cost.toFixed(2)}</b> → İskonto (%${discount}) sonrası: <b>₺${afterDiscount.toFixed(2)}</b> →
    + KDV (%${vat}) = Net Maliyet: <b>₺${netCost.toFixed(2)}</b> → + Kâr (%${profit}) =
    <b style="color:var(--success); font-size:13px;">Önerilen Satış: ₺${salePrice.toFixed(2)}</b>
  `;
  box.dataset.salePrice = salePrice.toFixed(2);
}

async function applyToExistingProduct() {
  if (currentRole !== 'admin' && currentRole !== 'staff') { alert("Yetkiniz yok!"); return; }
  const box = document.getElementById('kp-calc-box');
  if (!box.dataset.salePrice) { alert("Önce geçerli bir katalog (geliş) fiyatı girin."); return; }

  const inputVal = document.getElementById('kp-existing-search').value.trim();
  const code = inputVal.split(' - ')[0].trim();
  const p = productsData[code];
  if (!p) { alert("Lütfen listeden geçerli bir ürün seçin."); return; }

  const brand = document.getElementById('kp-brand').value;
  const vat = parseFloat(document.getElementById('kp-vat').value) || 0;
  const profit = parseFloat(document.getElementById('kp-profit').value) || 0;
  const cost = parseFloat(document.getElementById('kp-cost').value) || 0;
  const price = parseFloat(box.dataset.salePrice);

  if (!confirm(`"${p.name}" (${code}) ürününün fiyat bilgileri güncellenecek:\n\nGeliş: ₺${cost.toFixed(2)}\nKDV: %${vat}\nKâr: %${profit}\nSatış: ₺${price.toFixed(2)}\n\nOnaylıyor musunuz?`)) return;

  try {
    await db.child(code).update({
      costPrice: cost, vat, targetProfit: profit, price, brand: brand || p.brand || null,
      lastPriceUpdate: new Date().toISOString(),
      lastUpdatedBy: (currentRole === 'admin' ? 'Yönetici' : 'Çalışan') + ' (Katalog Fiyatlandırma)'
    });
    productsData[code] = Object.assign({}, p, { costPrice: cost, vat, targetProfit: profit, price, brand: brand || p.brand || null });

    showToast(`"${p.name}" fiyatı katalogdan güncellendi.`);
    closeKatalogPricingModal();
    if (typeof renderGrid === 'function') renderGrid();
  } catch (err) {
    alert("Güncellenemedi: " + err.message);
  }
}

async function addAsNewProductFromKatalog() {
  if (currentRole !== 'admin' && currentRole !== 'staff') { alert("Yetkiniz yok!"); return; }
  const box = document.getElementById('kp-calc-box');
  if (!box.dataset.salePrice) { alert("Önce geçerli bir katalog (geliş) fiyatı girin."); return; }
  if (!katalogPricingContext || !katalogPricingContext.name) { alert("Ürün bilgisi bulunamadı."); return; }

  const brand = document.getElementById('kp-brand').value;
  const vat = parseFloat(document.getElementById('kp-vat').value) || 0;
  const profit = parseFloat(document.getElementById('kp-profit').value) || 0;
  const cost = parseFloat(document.getElementById('kp-cost').value) || 0;
  const price = parseFloat(box.dataset.salePrice);
  const unit = document.getElementById('kp-unit').value.trim() || 'Adet';

  try {
    const code = await createNewProductRecord({
      name: katalogPricingContext.name, unit, category: 'Diğer', brand: brand || null,
      cost, vat, targetProfit: profit, price
    }, (currentRole === 'admin' ? 'Yönetici' : 'Çalışan') + ' (Katalogdan Eklendi)');

    showToast(`"${katalogPricingContext.name}" yeni ürün olarak eklendi (${code}). Stok miktarı 0 — malzeme fişiyle veya "🔢 Stok Gir" ile stok girin.`);
    closeKatalogPricingModal();
    if (typeof renderGrid === 'function') renderGrid();
  } catch (err) {
    alert("Eklenemedi: " + err.message);
  }
}

// ---------- 4) BORU TİPLERİ (BOYUT BAZLI) ----------

function addPipeType() {
  if (currentRole !== 'admin' && currentRole !== 'staff') { alert("Yetkiniz yok!"); return; }
  const input = document.getElementById('pipe-type-name');
  const name = input.value.trim();
  if (!name) { alert("Tip adı girin."); return; }
  const exists = Object.values(pipeTypesData).some(t => (t.name || '').toLocaleLowerCase('tr-TR') === name.toLocaleLowerCase('tr-TR'));
  if (exists) { alert("Bu isimde bir boru tipi zaten var: " + name); return; }

  const newRef = dbPipeTypes.push();
  newRef.child('name').set(name, (err) => {
    if (err) { alert("Eklenemedi: " + err.message); return; }
    input.value = '';
    showToast("Boru tipi eklendi: " + name);
  });
}

function deletePipeType(tipId) {
  if (currentRole !== 'admin') { alert("Yetkiniz yok!"); return; }
  const t = pipeTypesData[tipId];
  if (!t) return;
  const sizeCount = Object.keys(t).filter(k => k !== 'name').length;
  if (!confirm(`"${t.name}" tipini ve altındaki ${sizeCount} boyutu bu listeden silmek istiyor musunuz? Stoktaki karşılık gelen ürün kayıtları (PIPE-... kodlu) otomatik silinmez, Stok Listesi'nden ayrıca silebilirsiniz.`)) return;
  dbPipeTypes.child(tipId).remove(() => showToast("Boru tipi silindi."));
}

function renderPipeTypesList() {
  const box = document.getElementById('pipe-types-list');
  if (!box) return;
  const tips = Object.entries(pipeTypesData);
  if (tips.length === 0) {
    box.innerHTML = `<p style="font-size:12px; color:var(--steel); text-align:center; padding:10px 0;">Henüz boru tipi tanımlanmadı.</p>`;
    return;
  }
  box.innerHTML = tips.map(([tipId, t]) => {
    const sizes = Object.entries(t).filter(([k]) => k !== 'name');
    return `
      <div style="border:1px solid var(--steel-line); border-radius:8px; padding:10px; margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong>${t.name}</strong>
          <span style="display:flex; gap:6px;">
            <button type="button" class="btn btn-primary btn-sm" style="width:auto;" onclick="openPipeSizeModal('${tipId}')">+ Boyut Ekle</button>
            <button type="button" class="btn btn-danger btn-sm" style="width:auto;" onclick="deletePipeType('${tipId}')">🗑 Tipi Sil</button>
          </span>
        </div>
        ${sizes.length === 0
          ? `<p style="font-size:11px; color:var(--steel); margin:6px 0 0;">Bu tipe henüz boyut eklenmedi.</p>`
          : sizes.map(([boyutId, s]) => `
              <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-top:1px dashed var(--steel-line); font-size:12px;">
                <span>${s.size} ${s.brand ? `<small style="color:var(--steel);">(${s.brand})</small>` : ''} — Satış: <b>₺${formatMoney(s.price||0)}</b> · Stok: ${s.stock||0}</span>
                <span style="display:flex; gap:6px; flex-shrink:0;">
                  <button type="button" class="btn btn-info btn-sm" style="width:auto;" onclick="openPipeSizeModal('${tipId}','${boyutId}')">✏️</button>
                  <button type="button" class="btn btn-danger btn-sm" style="width:auto;" onclick="deletePipeSize('${tipId}','${boyutId}')">🗑</button>
                </span>
              </div>
            `).join('')
        }
      </div>
    `;
  }).join('');
}

let pipeSizeContext = null; // { tipId, boyutId (null = yeni boyut) }

function openPipeSizeModal(tipId, boyutId) {
  if (currentRole !== 'admin' && currentRole !== 'staff') { alert("Yetkiniz yok!"); return; }
  const t = pipeTypesData[tipId];
  if (!t) return;
  pipeSizeContext = { tipId, boyutId: boyutId || null };
  document.getElementById('pipe-size-type-label').textContent = t.name;
  populateBrandSelect('pipe-size-brand');

  const existing = boyutId ? t[boyutId] : null;
  document.getElementById('pipe-size-value').value = existing ? existing.size : '';
  document.getElementById('pipe-size-brand').value = existing ? (existing.brand || '') : '';
  document.getElementById('pipe-size-cost').value = existing ? (existing.cost || '') : '';
  document.getElementById('pipe-size-stock').value = existing ? (existing.stock || 0) : 0;
  document.getElementById('pipe-size-discount').value = existing ? (existing.discount || 0) : 0;
  document.getElementById('pipe-size-vat').value = existing ? (existing.vat || 0) : 0;
  document.getElementById('pipe-size-profit').value = existing ? (existing.profit || 0) : 0;
  const priceEl = document.getElementById('pipe-size-price');
  priceEl.value = existing ? (existing.price || '') : '';
  priceEl.dataset.manual = '';

  updatePipeSizeCalc();
  document.getElementById('pipe-size-modal').style.display = 'flex';
}

function closePipeSizeModal() {
  document.getElementById('pipe-size-modal').style.display = 'none';
  pipeSizeContext = null;
}

function updatePipeSizeCalc() {
  const box = document.getElementById('pipe-size-calc-box');
  const cost = parseFloat(document.getElementById('pipe-size-cost').value);
  const discount = parseFloat(document.getElementById('pipe-size-discount').value) || 0;
  const vat = parseFloat(document.getElementById('pipe-size-vat').value) || 0;
  const profit = parseFloat(document.getElementById('pipe-size-profit').value) || 0;

  if (isNaN(cost) || cost <= 0) { box.classList.remove('active'); box.innerHTML = ''; return; }

  const afterDiscount = cost * (1 - discount / 100);
  const netCost = afterDiscount * (1 + vat / 100);
  const suggested = netCost * (1 + profit / 100);

  box.classList.add('active');
  box.innerHTML = `Net Maliyet: <b>₺${netCost.toFixed(2)}</b> → Önerilen Satış: <b style="color:var(--success);">₺${suggested.toFixed(2)}</b>`;

  const priceEl = document.getElementById('pipe-size-price');
  if (!priceEl.dataset.manual) priceEl.value = suggested.toFixed(2);
}

async function saveCurrentPipeSize() {
  if (currentRole !== 'admin' && currentRole !== 'staff') { alert("Yetkiniz yok!"); return; }
  if (!pipeSizeContext) return;
  const { tipId } = pipeSizeContext;
  const t = pipeTypesData[tipId];
  if (!t) return;

  const size = document.getElementById('pipe-size-value').value.trim();
  if (!size) { alert("Boyut/ölçü girin."); return; }

  const brand = document.getElementById('pipe-size-brand').value;
  const cost = parseFloat(document.getElementById('pipe-size-cost').value) || 0;
  const stock = parseFloat(document.getElementById('pipe-size-stock').value) || 0;
  const discount = parseFloat(document.getElementById('pipe-size-discount').value) || 0;
  const vat = parseFloat(document.getElementById('pipe-size-vat').value) || 0;
  const profit = parseFloat(document.getElementById('pipe-size-profit').value) || 0;
  const price = parseFloat(document.getElementById('pipe-size-price').value) || 0;

  // boyutId: düzenlemede mevcut id kullanılır; yeni eklemede aynı isimde boyut zaten
  // varsa onun üzerine yazılır, yoksa yeni bir push id üretilir.
  let boyutId = pipeSizeContext.boyutId;
  if (!boyutId) {
    const existingEntry = Object.entries(t).find(([k, v]) => k !== 'name' && v.size === size);
    boyutId = existingEntry ? existingEntry[0] : dbPipeTypes.child(tipId).push().key;
  }

  const sizeData = { size, price, cost, vat, profit, discount, stock, brand: brand || null, updatedAt: new Date().toISOString() };

  try {
    await dbPipeTypes.child(tipId).child(boyutId).set(sizeData);

    // Bu boyutu normal stokta da bir ürün olarak senkronize et — böylece arama,
    // sipariş/borç satışı gibi mevcut akışlarda normal bir ürün gibi davranır.
    const productCode = `PIPE-${tipId}-${boyutId}`;
    const productName = `${t.name} ${size}`;
    await db.child(productCode).set({
      code: productCode, name: productName, unit: 'Adet', qty: stock, price, costPrice: cost,
      vat, targetProfit: profit, category: 'Boru/Fitings', brand: brand || null,
      lastPriceUpdate: new Date().toISOString(),
      lastUpdatedBy: (currentRole === 'admin' ? 'Yönetici' : 'Çalışan') + ' (Boru Tipi: ' + t.name + ')'
    });
    productsData[productCode] = { code: productCode, name: productName, unit: 'Adet', qty: stock, price, costPrice: cost, vat, targetProfit: profit, category: 'Boru/Fitings', brand: brand || null };

    showToast(`"${productName}" boyutu kaydedildi ve stokta güncellendi.`);
    closePipeSizeModal();
    if (typeof renderGrid === 'function') renderGrid();
  } catch (err) {
    alert("Kaydedilemedi: " + err.message);
  }
}

function deletePipeSize(tipId, boyutId) {
  if (currentRole !== 'admin') { alert("Yetkiniz yok!"); return; }
  if (!confirm("Bu boyutu bu listeden silmek istiyor musunuz? (Stoktaki karşılık gelen ürün kaydı otomatik silinmez, Stok Listesi'nden ayrıca silebilirsiniz.)")) return;
  dbPipeTypes.child(tipId).child(boyutId).remove(() => showToast("Boyut silindi."));
}

// ---------- 5) SAYIM OLMADAN SATIŞ İÇİN MANUEL STOK GİRİŞİ ----------

function openManualStockOverride(code) {
  if (currentRole !== 'admin' && currentRole !== 'staff') { alert("Yetkiniz yok!"); return; }
  const p = productsData[code];
  if (!p) return;
  const val = prompt(`"${p.name}" için GERÇEK stok miktarını girin (henüz sayım yapılmadıysa buradan düzeltebilirsiniz):`, p.qty || 0);
  if (val === null) return;
  const qty = parseFloat(val);
  if (isNaN(qty) || qty < 0) { alert("Geçerli bir miktar girin."); return; }

  db.child(code).child('qty').set(qty, (err) => {
    if (err) { alert("Güncellenemedi: " + err.message); return; }
    const oldQty = productsData[code].qty || 0;
    productsData[code].qty = qty;
    logMovement(code, p.name, qty - oldQty, 'SAYIM/ELLE STOK GİRİŞİ (Katalog)');
    showToast(`"${p.name}" stoğu ${qty} olarak güncellendi.`);
    if (typeof renderGrid === 'function') renderGrid();
    renderKatalogSearchResults();
  });
}

// ---------- 6) KATALOGDAN HIZLI ARAMA ----------

function renderKatalogSearchResults() {
  const box = document.getElementById('katalog-search-results');
  if (!box) return;
  const term = (document.getElementById('katalog-search').value || '').trim();
  if (term.length < 2) { box.innerHTML = ''; return; }

  const results = [];

  // Stoktaki ürünler: doğrudan kod eşleşmesi + akıllı isim eşleştirme.
  const directCodeMatch = productsData[term.toUpperCase()];
  if (directCodeMatch) results.push({ type: 'stok', product: directCodeMatch });
  findSimilarProducts(term, 8).forEach(m => {
    if (!results.some(r => r.type === 'stok' && r.product.code === m.product.code)) {
      results.push({ type: 'stok', product: m.product });
    }
  });

  // Tekil ürün fişleri
  const termNorm = normalizeTr(term);
  Object.entries(catalogMetaData).forEach(([id, m]) => {
    if (normalizeTr(m.name).includes(termNorm) || (m.brand && normalizeTr(m.brand).includes(termNorm))) {
      results.push({ type: 'fis', id, meta: m });
    }
  });

  // Boru tipi/boyutları
  Object.entries(pipeTypesData).forEach(([tipId, t]) => {
    if (!normalizeTr(t.name).includes(termNorm)) return;
    Object.entries(t).forEach(([k, s]) => {
      if (k === 'name') return;
      results.push({ type: 'boru', tipId, boyutId: k, tipName: t.name, size: s });
    });
  });

  if (results.length === 0) {
    box.innerHTML = `<p style="font-size:12px; color:var(--steel); text-align:center; padding:10px 0;">Sonuç bulunamadı.</p>`;
    return;
  }

  box.innerHTML = results.slice(0, 30).map(r => {
    if (r.type === 'stok') {
      const p = r.product;
      return `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-top:1px dashed var(--steel-line); font-size:12px;">
          <span>📦 <strong>${p.name}</strong> <small style="color:var(--steel); font-family:'IBM Plex Mono';">(${p.code}${p.brand ? ', ' + p.brand : ''})</small><br><small style="color:var(--steel);">Stok: ${p.qty||0} · Satış: ₺${formatMoney(p.price||0)}</small></span>
          <span style="display:flex; gap:6px; flex-shrink:0;">
            <button type="button" class="btn btn-info btn-sm" style="width:auto;" onclick="openManualStockOverride('${p.code}')">🔢 Stok</button>
            <button type="button" class="btn btn-success btn-sm" style="width:auto;" onclick="openKatalogPricingModalFromProduct('${p.code}')">💰</button>
          </span>
        </div>
      `;
    }
    if (r.type === 'fis') {
      const m = r.meta;
      return `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-top:1px dashed var(--steel-line); font-size:12px;">
          <span>🧾 <strong>${m.name}</strong> ${m.brand ? `<small style="color:var(--steel);">(${m.brand})</small>` : ''}${m.catalogPrice ? `<br><small style="color:var(--steel);">Katalog Fiyatı: ₺${formatMoney(m.catalogPrice)}</small>` : ''}</span>
          <button type="button" class="btn btn-success btn-sm" style="width:auto;" onclick="openKatalogPricingModalFromMeta('${r.id}')">💰 Fiyatlandır</button>
        </div>
      `;
    }
    const s = r.size;
    return `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-top:1px dashed var(--steel-line); font-size:12px;">
        <span>🔧 <strong>${r.tipName} ${s.size}</strong> ${s.brand ? `<small style="color:var(--steel);">(${s.brand})</small>` : ''}<br><small style="color:var(--steel);">Stok: ${s.stock||0} · Satış: ₺${formatMoney(s.price||0)}</small></span>
        <button type="button" class="btn btn-info btn-sm" style="width:auto;" onclick="openPipeSizeModal('${r.tipId}','${r.boyutId}')">✏️ Düzenle</button>
      </div>
    `;
  }).join('');
}
