// SPLASH SCREEN SÜRESİ
setTimeout(() => {
  const s = document.getElementById('splash-screen');
  if (s) s.classList.add('hidden');
}, 3000);

// FIREBASE BAĞLANTISI
const firebaseConfig = { databaseURL: "https://reyhani-stok-default-rtdb.firebaseio.com/" };
firebase.initializeApp(firebaseConfig);

const dbRoot = firebase.database().ref();
const db = dbRoot.child('products');
const dbMovements = dbRoot.child('daily_movements');
const dbWholesalers = dbRoot.child('wholesalers');
const dbGoodsReceipts = dbRoot.child('goods_receipts');
const dbOrders = dbRoot.child('orders');
const dbNotifications = dbRoot.child('notifications');
const dbTasks = dbRoot.child('tasks');
const dbZReports = dbRoot.child('z_reports');
const dbProductImages = dbRoot.child('product_images');
const dbLayout = dbRoot.child('store_layout');
const dbBrandSettings = dbRoot.child('brand_settings');
const dbBarcodeCache = dbRoot.child('barcode_cache');
const dbCustomerDebts = dbRoot.child('customer_debts');
const dbCustomers = dbRoot.child('customers');
const dbSenetler = dbRoot.child('senetler');

const DEFAULT_BRANDS = ["BMS", "Kale", "Ege", "Yıldız", "İzeltaş", "RTRMAX", "Bosch", "Lider", "Bahco", "Filli Boya", "Avon"];
let brandSeedChecked = false;

let productsData = {};
let wholesalersData = {};
let globalPastOrders = {};
let globalZReports = {};
let movementsData = {};
let notificationsData = {};
let tasksData = {};
let selectedTaskIds = new Set();
let imageCache = {};
let pendingImageDataUrl = null;
let layoutData = { stands: {} };
let layoutPlans = {};
let currentPlanId = 'magaza';
let planSeedChecked = false;
let brandSettingsData = {};
let highlightTimer = null;

let html5QrcodeScanner = null;
let currentRole = 'guest';
let cart = JSON.parse(localStorage.getItem('reyhani_cart') || '[]'); // Sepet kalıcılığı: sayfa/oturum kapansa da sepet kaybolmasın
let goodsReceiptCart = [];
let fisEditingIndex = null; // null = yeni ekleme modu; sayı ise o index düzenleniyor demektir
let globalPastReceipts = {};
let gridCurrentPage = 1;
let lastGridSearch = null;
const GRID_PAGE_SIZE = 60;
const actionCooldowns = {};

const ADMIN_HASH = "50e65b1455800c98b480cec56db88524fabd630ddd992df1a58faf5a6edd2430";
const STAFF_HASH = "2b084c9efd9150fb848e4efb0b5f03f455470f68b153814944e14a6204ec5b9a";

// ============================================================
// CİHAZ YETKİLENDİRME (Device Authorization)
// Bu statik sitede sunucu tarafı IP/cihaz kısıtlaması yapılamaz — bunun yerine
// tarayıcının kalıcı hafızasına (localStorage) bir "yetkili cihaz" damgası
// yazılır. Bu damga olmayan bir cihazda, yönetici/çalışan şifresi doğru
// girilse bile giriş denemesi başlamadan reddedilir; sadece ziyaretçi
// paneli görünür kalır. Yeni bir cihazı yetkilendirmek için, o cihazda
// siteyi bir defaya mahsus "?authorize_device=GİZLİ_KOD" bağlantısıyla açmak
// yeterlidir — bağlantı doğrulandığında damga kalıcı olarak kaydedilir.
// ============================================================
const DEVICE_AUTH_HASH = "12a7d32afcd5140951fe6ea7b2c8ed7a9c2b196333190f28f899aaf85699c7e6";
const DEVICE_AUTH_STORAGE_KEY = 'reyhani_device_authorized_v1';

function isDeviceAuthorized() {
  try { return localStorage.getItem(DEVICE_AUTH_STORAGE_KEY) === 'true'; }
  catch (e) { return false; }
}

async function checkDeviceAuthorizationLink() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('authorize_device');
  if (!code) return;

  // URL'den kodu hemen temizle ki adres çubuğunda / geçmişte uzun süre görünmesin.
  params.delete('authorize_device');
  const cleanUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '') + window.location.hash;
  window.history.replaceState({}, document.title, cleanUrl);

  try {
    const hash = await sha256Hex(code);
    if (hash === DEVICE_AUTH_HASH) {
      localStorage.setItem(DEVICE_AUTH_STORAGE_KEY, 'true');
      alert("✅ Bu cihaz yönetici paneli için kalıcı olarak yetkilendirildi. Artık bu tarayıcıdan normal şekilde giriş yapabilirsiniz.");
    } else {
      alert("⚠️ Cihaz yetkilendirme kodu geçersiz.");
    }
  } catch (e) {
    alert("Cihaz yetkilendirmesi bu bağlantıda çalışamadı. Sitenin https:// ile açıldığından emin olun.");
  }
}

async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

let reyhaniDirHandle = null;

async function getReyhaniFolder() {
  if (!reyhaniDirHandle && window.showDirectoryPicker) {
    try {
      alert("Lütfen raporların ve fişlerin otomatik kaydedilmesi için tarayıcınızda 'Reyhani Yapi Satis Raporlari' adında bir klasör seçin veya oluşturun.");
      reyhaniDirHandle = await window.showDirectoryPicker();
    } catch (err) {
      console.log("Klasör seçimi iptal edildi:", err);
    }
  }
  return reyhaniDirHandle;
}

async function saveExcelFile(wb, defaultFilename) {
  let savedViaFolder = false;
  const dirHandle = await getReyhaniFolder();
  
  if (dirHandle) {
    try {
      const fileHandle = await dirHandle.getFileHandle(defaultFilename, { create: true });
      const writable = await fileHandle.createWritable();
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/octet-stream' });
      
      await writable.write(blob);
      await writable.close();
      savedViaFolder = true;
      showToast(`Dosya seçilen klasöre kaydedildi: ${defaultFilename}`);
    } catch (err) {
      console.error("Klasöre yazma hatası:", err);
    }
  }
  
  if (!savedViaFolder) {
    XLSX.writeFile(wb, defaultFilename);
    showToast(`Dosya indirildi: ${defaultFilename}`);
  }
}

function formatMoney(amount) {
  return Number(amount).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function openImageModal(src) {
  if(!src) return;
  document.getElementById('enlarged-image').src = src;
  document.getElementById('image-modal').style.display = 'block';
}
function closeImageModal() {
  document.getElementById('image-modal').style.display = 'none';
}

function compressImageFile(file, maxDim, quality) {
  maxDim = maxDim || 360;
  quality = quality || 0.55;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Dosya okunamadı"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Görsel yüklenemedi"));
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) { height = Math.round(height * maxDim / width); width = maxDim; }
        else if (height > maxDim) { width = Math.round(width * maxDim / height); height = maxDim; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function setEditPhotoPreview(dataUrl) {
  const box = document.getElementById('edit-photo-preview');
  const removeBtn = document.getElementById('edit-photo-remove-btn');
  if (dataUrl) {
    box.innerHTML = `<img src="${dataUrl}" style="cursor:pointer;" onclick="openImageModal('${dataUrl}')">`;
    removeBtn.style.display = 'inline-block';
  } else {
    box.innerHTML = `<span class="photo-placeholder">📷</span>`;
    removeBtn.style.display = 'none';
  }
}

document.getElementById('edit-photo-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const code = document.getElementById('edit-code').value;
  const statusEl = document.getElementById('edit-photo-status');
  statusEl.textContent = "Sıkıştırılıyor ve yükleniyor...";
  try {
    const dataUrl = await compressImageFile(file);
    pendingImageDataUrl = dataUrl;
    setEditPhotoPreview(dataUrl);
    dbProductImages.child(code).set(dataUrl, (err) => {
      if (err) { statusEl.textContent = "Yükleme başarısız."; return; }
      imageCache[code] = dataUrl;
      statusEl.textContent = "Fotoğraf kaydedildi (~" + Math.round(dataUrl.length / 1024) + " KB).";
      refreshCardPhoto(code);
    });
  } catch (err) {
    statusEl.textContent = "Fotoğraf işlenemedi, tekrar deneyin.";
    console.error(err);
  }
});

function removeProductImage() {
  const code = document.getElementById('edit-code').value;
  if (!code) return;
  if (!confirm("Bu ürünün fotoğrafını kaldırmak istiyor musunuz?")) return;
  dbProductImages.child(code).remove(() => {
    imageCache[code] = null;
    pendingImageDataUrl = null;
    setEditPhotoPreview(null);
    document.getElementById('edit-photo-status').textContent = "Fotoğraf kaldırıldı.";
    refreshCardPhoto(code);
  });
}

function refreshCardPhoto(code) {
  const el = document.getElementById(`photo-${code}`);
  if (!el) return;
  const dataUrl = imageCache[code];
  el.innerHTML = dataUrl ? `<img src="${dataUrl}" style="cursor:pointer;" onclick="openImageModal('${dataUrl}')">` : `<span class="photo-placeholder">📷</span>`;
}

function loadProductImageIntoCard(code) {
  const el = document.getElementById(`photo-${code}`);
  if (!el) return;

  if (Object.prototype.hasOwnProperty.call(imageCache, code)) {
    el.innerHTML = imageCache[code] ? `<img src="${imageCache[code]}" style="cursor:pointer;" onclick="openImageModal('${imageCache[code]}')">` : `<span class="photo-placeholder">📷</span>`;
    return;
  }

  dbProductImages.child(code).once('value', snap => {
    const val = snap.val();
    imageCache[code] = val || null;
    const el2 = document.getElementById(`photo-${code}`);
    if (el2) el2.innerHTML = val ? `<img src="${val}" style="cursor:pointer;" onclick="openImageModal('${val}')">` : `<span class="photo-placeholder">📷</span>`;
  });
}

function toggleQR(code) {
  const box = document.getElementById(`grid-qr-${code}`);
  if (!box) return;
  const isHidden = box.classList.contains('hidden');
  if (isHidden && box.childElementCount === 0) {
    const currentBaseUrl = window.location.href.split('?')[0];
    new QRCode(box, { text: `${currentBaseUrl}?item=${code}`, width: 68, height: 68 });
  }
  box.classList.toggle('hidden');
}

const urlParams = new URLSearchParams(window.location.search);
const targetCode = urlParams.get('item');

db.on('value', (snapshot) => {
  productsData = snapshot.val() || {};
  renderGrid();
  updateOrderProductList();
  updateBorcOrderProductList();
  updateAhLedgerProductList();
  renderLayoutGrid();
  if (typeof renderCart === 'function') renderCart(); // localStorage'dan geri yüklenen sepeti göster
  if (typeof renderDashboard === 'function') renderDashboard();
  if(currentRole === 'admin') renderRecentUpdates();
  if (targetCode && productsData[targetCode]) {
    document.getElementById('search').value = targetCode;
    renderGrid();
  }
});

dbWholesalers.on('value', (snapshot) => {
  wholesalersData = snapshot.val() || {};
  if(currentRole === 'admin') renderWholesalers();
  renderFisWholesalerOptions();
});

dbGoodsReceipts.on('value', snapshot => {
  const data = snapshot.val() || {};
  const listDiv = document.getElementById('past-receipts-list');
  if(!listDiv) return;
  listDiv.innerHTML = '';
  globalPastReceipts = {};

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 60);
  const cutoffStr = cutoffDate.toISOString().slice(0, 10);

  let hasReceipts = false;
  const __receiptParts = [];

  Object.keys(data).sort().reverse().forEach(dateStr => {
    if(dateStr < cutoffStr) return;

    const receiptsOnDate = data[dateStr];
    Object.keys(receiptsOnDate).reverse().forEach(receiptId => {
      hasReceipts = true;
      const rec = receiptsOnDate[receiptId];
      globalPastReceipts[receiptId] = { receiptData: rec, date: dateStr };

      const itemsSummary = (rec.items || []).map(it => `${it.name} (${it.qty} ${it.unit || 'Adet'})`).join(', ');

      __receiptParts.push(`
        <div class="tag" style="margin-bottom:10px;">
           <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
              <div>
                 <div class="tag-title">🚚 ${rec.wholesalerName || 'Bilinmeyen Toptancı'} — ${dateStr}</div>
                 <div class="tag-code">🕒 ${rec.time || ''} ${rec.fisNo ? '| 📄 ' + rec.fisNo : ''} | 📦 ${(rec.items || []).length} Kalem</div>
              </div>
              <div style="text-align:right;">
                 <div style="font-family:'IBM Plex Mono'; font-weight:bold; font-size:15px; margin-bottom:4px; color:var(--charcoal);">₺${formatMoney(rec.total)}</div>
                 <div style="display:flex; gap:6px; justify-content:flex-end; flex-wrap:wrap;">
                   <button class="btn btn-warning btn-sm" style="width:auto;" onclick="openReceiptEditModal('${receiptId}')">✏️ Listeyi Düzenle</button>
                   <button class="btn btn-info btn-sm" onclick="downloadReceiptById('${receiptId}')">İndir (Excel)</button>
                 </div>
                 ${rec.lastEditedAt ? `<div style="font-size:9px; color:var(--steel); margin-top:4px;">✏️ Düzenlendi (${rec.lastEditedBy || '-'})</div>` : ''}
              </div>
           </div>
           <div style="font-size:11px; color:var(--steel); margin-top:8px; line-height:1.4;">${itemsSummary}</div>
           ${rec.note ? `<div style="font-size:11px; color:var(--charcoal); margin-top:4px; font-style:italic;">Not: ${rec.note}</div>` : ''}
        </div>
      `);
    });
  });

  listDiv.innerHTML = hasReceipts ? __receiptParts.join('') : '<p style="color:var(--steel);font-size:13px;text-align:center;">Henüz kaydedilmiş malzeme fişi bulunamadı.</p>';
  if(typeof renderDuplicateReceiptsBox === 'function') renderDuplicateReceiptsBox();
});

dbMovements.on('value', (snapshot) => {
  movementsData = snapshot.val() || {};
});

dbNotifications.on('value', (snapshot) => {
  notificationsData = snapshot.val() || {};
  if(currentRole === 'admin') renderNotifications();
});

dbTasks.on('value', (snapshot) => {
  tasksData = snapshot.val() || {};
  renderTasks();
});

dbLayout.on('value', (snapshot) => {
  layoutData = snapshot.val() || { stands: {}, plans: {} };
  if (!layoutData.stands) layoutData.stands = {};
  if (!layoutData.plans) layoutData.plans = {};
  layoutPlans = layoutData.plans;
  renderPlanSelector();
  renderLayoutGrid();
  if (!planSeedChecked) {
    planSeedChecked = true;
    maybeSeedDefaultPlans();
  }
});

dbBrandSettings.on('value', (snapshot) => {
  brandSettingsData = snapshot.val() || {};
  renderBrandSettings();
  const fBrandSel = document.getElementById('f-brand');
  if (fBrandSel) populateBrandSelect('f-brand', fBrandSel.value);
  const fisBrandSel = document.getElementById('fis-brand');
  if (fisBrandSel) populateBrandSelect('fis-brand', fisBrandSel.value);
  if (!brandSeedChecked) {
    brandSeedChecked = true;
    maybeSeedDefaultBrands();
  }
});

dbZReports.on('value', (snapshot) => {
  const data = snapshot.val() || {};
  const listDiv = document.getElementById('past-z-reports-list');
  if(!listDiv) return;
  listDiv.innerHTML = '';
  globalZReports = {};
  
  let hasReports = false;
  const __zReportParts = [];
  Object.keys(data).sort().reverse().forEach(dateStr => {
    hasReports = true;
    const rep = data[dateStr];
    globalZReports[dateStr] = rep;
    
    __zReportParts.push(`
      <div class="tag" style="margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
         <div>
            <div class="tag-title">📅 Z Raporu: ${rep.date}</div>
            <div class="tag-code">🕒 Oluşturma: ${rep.time || 'N/A'} | 📦 Mal Giriş: ${rep.malGirisi} | 📤 Mal Çıkış: ${rep.malCikisi}</div>
            <div style="font-size:12px; margin-top:4px; color:var(--charcoal);">
               Para Girişi: <strong style="color:var(--success);">₺${formatMoney(rep.paraGirisi)}</strong> | 
               Para Çıkışı: <strong style="color:var(--rust);">₺${formatMoney(rep.paraCikisi)}</strong>
            </div>
         </div>
         <div style="text-align:right;">
            <button class="btn btn-success btn-sm" onclick="downloadZReportByDate('${dateStr}')">📊 Z Raporu Excel İndir</button>
         </div>
      </div>
    `);
  });
  
  listDiv.innerHTML = hasReports ? __zReportParts.join('') : '<p style="color:var(--steel);font-size:13px;text-align:center;">Henüz arşivlenmiş Z Raporu bulunmuyor.</p>';
});

dbOrders.on('value', snapshot => {
  const data = snapshot.val() || {};
  const listDiv = document.getElementById('past-orders-list');
  if(!listDiv) return;
  listDiv.innerHTML = '';
  globalPastOrders = {};
  
  const cutoffDate = new Date(); 
  cutoffDate.setDate(cutoffDate.getDate() - 40);
  const cutoffStr = cutoffDate.toISOString().slice(0, 10);
  
  let hasOrders = false;
  const __orderParts = [];
  
  Object.keys(data).sort().reverse().forEach(dateStr => {
    if(dateStr < cutoffStr) {
      return;
    }
    
    const ordersOnDate = data[dateStr];
    Object.keys(ordersOnDate).reverse().forEach(orderId => {
      hasOrders = true;
      const order = ordersOnDate[orderId];
      globalPastOrders[orderId] = { orderData: order, date: dateStr };

      __orderParts.push(`
        <div class="tag" style="margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
           <div>
              <div class="tag-title">Satış / Sipariş: ${dateStr}</div>
              <div class="tag-code">🕒 ${order.time} | 📦 ${order.items.length} Çeşit Ürün</div>
           </div>
           <div style="text-align:right;">
              <div style="font-family:'IBM Plex Mono'; font-weight:bold; font-size:15px; margin-bottom:4px; color:var(--charcoal);">₺${formatMoney(order.total)}</div>
              <button class="btn btn-info btn-sm" onclick="downloadOrderById('${orderId}')">İndir (Excel)</button>
           </div>
        </div>
      `);
    });
  });
  
  listDiv.innerHTML = hasOrders ? __orderParts.join('') : '<p style="color:var(--steel);font-size:13px;text-align:center;">Geçmiş satış bulunamadı.</p>';
  if (typeof renderDashboard === 'function') renderDashboard();
});

function clearSalesHistory() {
  if(currentRole !== 'admin') {
    alert("Bu işlem için yönetici yetkisi gereklidir!");
    return;
  }
  
  if (confirm("Tüm satış geçmişi ve 40 günlük arşiv kayıtları kalıcı olarak silinecektir. Devam etmek istiyor musunuz?")) {
    dbOrders.remove((err) => {
      if (!err) {
        globalPastOrders = {};
        document.getElementById('past-orders-list').innerHTML = '<p style="color:var(--steel);font-size:13px;text-align:center;">Geçmiş satış bulunamadı.</p>';
        showToast("Satış geçmişi ve arşiv başarıyla sıfırlandı!");
      } else {
        alert("Temizleme sırasında bir hata oluştu.");
      }
    });
  }
}

function logMovement(code, name, change, type) {
  const dateStr = new Date().toISOString().slice(0, 10);
  const timeStr = new Date().toLocaleTimeString('tr-TR');
  dbMovements.child(dateStr).push({ time: timeStr, code: code, name: name, change: change, type: type });
  // Her giriş/çıkışta, otomatik güncelleme açıksa güncel stok Excel dosyasını sessizce yeniden yaz.
  autoUpdateStockExcel();
}

let autoStockUpdateEnabled = false;

// Kullanıcı bir kez klasör seçtiğinde, o andan itibaren her stok hareketinde
// aynı dosya (Reyhani_Stok_Guncel.xlsx) sessizce yeniden yazılır — yani "kendini günceller".
async function enableAutoStockUpdate() {
  if (currentRole !== 'admin') return;
  const dirHandle = await getReyhaniFolder();
  if (!dirHandle) {
    alert("Klasör seçilmedi. Otomatik güncelleme açılamadı.");
    return;
  }
  autoStockUpdateEnabled = true;
  const btn = document.getElementById('auto-update-btn');
  if (btn) { btn.textContent = '✅ Otomatik Güncelleme Açık'; btn.classList.add('btn-success'); btn.classList.remove('btn-info'); }
  showToast("Otomatik stok güncellemesi açıldı. Her giriş/çıkışta 'Reyhani_Stok_Guncel.xlsx' dosyası bu klasörde otomatik yenilenecek.");
  autoUpdateStockExcel(); // ilk anlık güncel halini de hemen yaz
}

async function autoUpdateStockExcel() {
  if (!autoStockUpdateEnabled || !reyhaniDirHandle) return;
  try {
    const dataRow = [["Ürün Kodu", "Ürün Adı", "Kategori", "Marka", "Miktar", "Birim", "Satış Fiyatı", "Geliş Fiyatı", "Konum", "Envanter (Maliyet)", "Son Güncelleme"]];
    const now = new Date().toLocaleString('tr-TR');
    Object.values(productsData).forEach(p => {
      const cost = p.costPrice != null ? p.costPrice : (p.price || 0);
      dataRow.push([
        p.code, p.name, p.category || '', p.brand || '', p.qty, p.unit || 'Adet',
        p.price, p.costPrice || '', p.location || '', parseFloat(p.qty) * cost, now
      ]);
    });
    const ws = XLSX.utils.aoa_to_sheet(dataRow);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stok");
    // Sabit dosya adı: tarihe göre değişmez, her seferinde aynı dosyanın üzerine yazılır.
    const fileHandle = await reyhaniDirHandle.getFileHandle('Reyhani_Stok_Guncel.xlsx', { create: true });
    const writable = await fileHandle.createWritable();
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    await writable.write(blob);
    await writable.close();
  } catch (err) {
    console.error("Otomatik stok güncelleme hatası:", err);
  }
}

async function toggleAuth() {
  if(currentRole === 'guest') {
    if (!isDeviceAuthorized()) {
      alert("Bu cihazda yönetici paneli aktif değil.");
      return;
    }
    const p = prompt("Giriş Şifresini Giriniz:");
    if (p === null) return;
    let hash;
    try {
      hash = await sha256Hex(p);
    } catch (e) {
      alert("Şifre doğrulaması bu bağlantıda çalışamadı. Sitenin https:// ile açıldığından emin olun.");
      return;
    }
    if(hash === ADMIN_HASH) { currentRole = 'admin'; showToast("Yönetici girişi başarılı!"); }
    else if(hash === STAFF_HASH) { currentRole = 'staff'; showToast("Çalışan girişi başarılı!"); }
    else { alert("Hatalı Şifre!"); return; }
  } else {
    currentRole = 'guest'; showToast("Çıkış yapıldı.");
  }
  updateAuthUI();
}

// ============================================================
// DASHBOARD / KARŞILAMA PANELİ
// ============================================================
function renderDashboard() {
  // Kullanıcı adını göster
  const nameEl = document.getElementById('dash-user-name');
  if (nameEl) {
    if (currentRole === 'admin') nameEl.textContent = 'Yönetici';
    else if (currentRole === 'staff') nameEl.textContent = 'Çalışan';
    else nameEl.textContent = 'Ziyaretçi';
  }

  const allProducts = Object.values(productsData || {});
  const totalProducts = allProducts.length;
  const criticalStock = allProducts.filter(p => Number(p.qty || 0) <= 5).length;

  animateNumber('dash-total-products', totalProducts);
  animateNumber('dash-critical-stock', criticalStock);

  // Ciro ve müşteri borcu hassas mali bilgiler — sadece yönetici görebilir,
  // ziyaretçi/çalışan modunda kart tamamen gizlenir (veri bile sorgulanmaz).
  const isAdminView = (currentRole === 'admin');
  const revenueCard = document.getElementById('dash-stat-card-revenue');
  const debtCard = document.getElementById('dash-stat-card-debt');
  if (revenueCard) revenueCard.style.display = isAdminView ? '' : 'none';
  if (debtCard) debtCard.style.display = isAdminView ? '' : 'none';

  if (isAdminView) {
    const todayStr = new Date().toISOString().slice(0, 10);
    let todayRevenue = 0;
    Object.values(globalPastOrders || {}).forEach(entry => {
      if (entry.date === todayStr) {
        todayRevenue += Number(entry.orderData?.total || 0);
      }
    });
    animateNumber('dash-today-revenue', todayRevenue, '₺');

    if (typeof dbCustomerDebts !== 'undefined') {
      dbCustomerDebts.once('value', snap => {
        const data = snap.val() || {};
        let totalDebt = 0;
        Object.values(data).forEach(d => {
          if (d.status === 'Açık' || d.status === 'Kısmi') {
            totalDebt += Number(d.remaining || d.amount || 0);
          }
        });
        animateNumber('dash-total-debt', totalDebt, '₺');
      });
    }
  }

  // Son güncellenen 5 ürünü göster
  const recentContainer = document.getElementById('dash-recent-products');
  if (recentContainer) {
    const sorted = allProducts
      .filter(p => p.lastPriceUpdate)
      .sort((a, b) => new Date(b.lastPriceUpdate) - new Date(a.lastPriceUpdate))
      .slice(0, 5);

    if (sorted.length === 0) {
      recentContainer.innerHTML = `<p style="color:#94A3B8; font-size:14px;">Henüz güncellenmiş ürün yok.</p>`;
    } else {
      recentContainer.innerHTML = sorted.map(p => {
        const date = new Date(p.lastPriceUpdate);
        const timeStr = date.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        return `<div class="recent-item">
                  <span class="name">${p.name}</span>
                  <span class="meta">${timeStr} · ${p.lastUpdatedBy || '-'}</span>
                </div>`;
      }).join('');
    }
  }

  // Hızlı erişim kartlarını yetkiye göre göster/gizle ve tıklama olaylarını ata
  document.querySelectorAll('.action-card[data-tab]').forEach(card => {
    const req = card.getAttribute('data-role');
    let visible = true;
    if (req === 'admin') visible = (currentRole === 'admin');
    if (req === 'staff') visible = (currentRole === 'admin' || currentRole === 'staff');
    card.style.display = visible ? '' : 'none';

    card.onclick = function() {
      const tab = this.dataset.tab;
      if (tab) switchTab(tab);
    };
  });
}

// Sayı animasyonu (0'dan hedefe doğru sayar)
function animateNumber(elementId, target, prefix = '', suffix = '') {
  const el = document.getElementById(elementId);
  if (!el) return;
  const isCurrency = prefix === '₺';
  const start = 0;
  const duration = 800;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // easeOutQuart
    const eased = 1 - Math.pow(1 - progress, 4);
    const current = start + (target - start) * eased;
    el.textContent = (isCurrency ? '₺' : '') + (current % 1 === 0 ? Math.round(current) : current.toFixed(1));
    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      el.textContent = (isCurrency ? '₺' : '') + (target % 1 === 0 ? Math.round(target) : target.toFixed(1));
    }
  }
  requestAnimationFrame(update);
}

// ============================================================
// GLOBAL ARAMA / COMMAND PALETTE (Ctrl+K / Cmd+K)
// ============================================================
const COMMAND_MODULES = [
  { label: 'Ana Sayfa', icon: '🏠', tab: 'dashboard', keywords: 'ana sayfa dashboard anasayfa panel karsilama' },
  { label: 'Stok Listesi', icon: '📦', tab: 'stok', keywords: 'stok liste envanter urunler urun listesi' },
  { label: 'Ürün Ekle', icon: '➕', tab: 'ekle', keywords: 'yeni urun ekle', role: 'admin' },
  { label: 'QR Okut', icon: '📷', tab: 'okut', keywords: 'qr barkod okut tara kamera' },
  { label: 'Günlük Görevler', icon: '📋', tab: 'gorevler', keywords: 'gorev task yapilacaklar', role: 'staff' },
  { label: 'Toptancılar', icon: '🤝', tab: 'toptanci', keywords: 'toptanci tedarikci', role: 'admin' },
  { label: 'Malzeme Fişi', icon: '📥', tab: 'fis', keywords: 'fis mal girisi malzeme fisi', role: 'staff' },
  { label: 'Satış / Sepet', icon: '🛒', tab: 'siparis', keywords: 'satis sepet siparis sat', role: 'staff' },
  { label: 'Yerleşim', icon: '🗺️', tab: 'yerlesim', keywords: 'yerlesim kroki stand harita magaza plani', role: 'staff' },
  { label: 'Raporlar', icon: '📊', tab: 'raporlar', keywords: 'rapor raporlar', role: 'staff' },
  { label: 'Müşteri Borç', icon: '💰', tab: 'borc', keywords: 'borc musteri alacak', role: 'admin' },
  { label: 'Açık Hesap', icon: '📖', tab: 'acikhesap', keywords: 'acik hesap musteri defteri sayfa senet cari hesap kayit', role: 'admin' }
];

let cmdkActiveIndex = 0;

function cmdkCanSee(mod) {
  if (!mod.role) return true;
  if (mod.role === 'admin') return currentRole === 'admin';
  if (mod.role === 'staff') return currentRole === 'admin' || currentRole === 'staff';
  return true;
}

function openCommandPalette() {
  const overlay = document.getElementById('command-palette-overlay');
  overlay.style.display = 'flex';
  const input = document.getElementById('cmdk-input');
  input.value = '';
  renderCommandPaletteResults();
  setTimeout(() => input.focus(), 30);
}

function closeCommandPalette() {
  document.getElementById('command-palette-overlay').style.display = 'none';
}

function cmdkUpdateActiveHighlight() {
  const items = document.querySelectorAll('#cmdk-results .cmdk-item');
  items.forEach((el, i) => el.classList.toggle('active', i === cmdkActiveIndex));
}

function handleCommandPaletteKeydown(e) {
  const items = document.querySelectorAll('#cmdk-results .cmdk-item');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    cmdkActiveIndex = Math.min(cmdkActiveIndex + 1, items.length - 1);
    cmdkUpdateActiveHighlight();
    items[cmdkActiveIndex] && items[cmdkActiveIndex].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    cmdkActiveIndex = Math.max(cmdkActiveIndex - 1, 0);
    cmdkUpdateActiveHighlight();
    items[cmdkActiveIndex] && items[cmdkActiveIndex].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    e.preventDefault();
    items[cmdkActiveIndex] && items[cmdkActiveIndex].click();
  } else if (e.key === 'Escape') {
    closeCommandPalette();
  }
}

function renderCommandPaletteResults() {
  const rawQ = document.getElementById('cmdk-input').value;
  const q = normalizeProductName(rawQ);
  const resultsDiv = document.getElementById('cmdk-results');
  cmdkActiveIndex = 0;

  let html = '';
  let flatCount = 0;

  const moduleMatches = COMMAND_MODULES.filter(m => cmdkCanSee(m) && (!q || normalizeProductName(m.label).includes(q) || normalizeProductName(m.keywords).includes(q)));
  if (moduleMatches.length > 0) {
    html += `<div class="cmdk-section-title">Sekmeler / Modüller</div>`;
    moduleMatches.forEach(m => {
      html += `<div class="cmdk-item" data-idx="${flatCount}" onclick="cmdkGoTab('${m.tab}')">
        <div class="cmdk-item-icon">${m.icon}</div>
        <div class="cmdk-item-main"><div class="cmdk-item-title">${m.label}</div></div>
      </div>`;
      flatCount++;
    });
  }

  // Ürün araması: sadece anlamlı bir sorgu varken (3600+ ürünü boşken listelememek için)
  if (q && q.length >= 2) {
    const all = Object.values(productsData || {});
    const productMatches = all.filter(p => normalizeProductName((p.name || '') + ' ' + (p.code || '')).includes(q)).slice(0, 8);

    if (productMatches.length > 0) {
      html += `<div class="cmdk-section-title">Ürünler</div>`;
      const canEdit = (currentRole === 'admin' || currentRole === 'staff');
      productMatches.forEach(p => {
        html += `<div class="cmdk-item" data-idx="${flatCount}" onclick="cmdkDefaultProductAction('${p.code}')">
          <div class="cmdk-item-icon">📦</div>
          <div class="cmdk-item-main">
            <div class="cmdk-item-title">${p.name}</div>
            <div class="cmdk-item-sub">${p.code} · Stok: ${p.qty ?? 0} ${p.unit || ''} · ₺${formatMoney(p.price || 0)}</div>
          </div>
          <div class="cmdk-item-actions">
            ${canEdit ? `<button onclick="event.stopPropagation(); cmdkEditProduct('${p.code}')">✏️ Düzenle</button>` : ''}
            ${p.location ? `<button onclick="event.stopPropagation(); cmdkGoLocation('${p.location}')">📍 Konuma Git</button>` : ''}
          </div>
        </div>`;
        flatCount++;
      });
    }
  }

  if (!html) {
    html = `<div class="cmdk-empty">Sonuç bulunamadı. Ürün adı/kodu veya bir modül adı (örn. "satış", "rapor") yazmayı deneyin.</div>`;
  }

  resultsDiv.innerHTML = html;
  cmdkUpdateActiveHighlight();
}

function cmdkGoTab(tab) {
  closeCommandPalette();
  switchTab(tab);
}

function cmdkEditProduct(code) {
  closeCommandPalette();
  switchTab('stok');
  setTimeout(() => openEditModal(code), 150);
}

function cmdkGoLocation(location) {
  closeCommandPalette();
  goToLocation(location);
}

function cmdkDefaultProductAction(code) {
  const p = productsData[code];
  if (!p) return;
  if (currentRole === 'admin' || currentRole === 'staff') { cmdkEditProduct(code); }
  else if (p.location) { cmdkGoLocation(p.location); }
}

document.addEventListener('keydown', (e) => {
  const isK = (e.key === 'k' || e.key === 'K');
  if ((e.ctrlKey || e.metaKey) && isK) {
    e.preventDefault();
    const overlay = document.getElementById('command-palette-overlay');
    if (overlay.style.display === 'flex') closeCommandPalette(); else openCommandPalette();
  } else if (e.key === 'Escape') {
    const overlay = document.getElementById('command-palette-overlay');
    if (overlay.style.display === 'flex') closeCommandPalette();
  }
});

function updateAuthUI() {
  const statusBadge = document.getElementById('admin-status');
  const authBtn = document.getElementById('auth-btn');
  const addCard = document.getElementById('add-form-card');
  const backupBtn = document.getElementById('backup-btn');
  const autoUpdateBtn = document.getElementById('auto-update-btn');
  const printAllBtn = document.getElementById('print-all-btn');
  
  document.getElementById('nav-add-btn').style.display = (currentRole === 'admin') ? 'block' : 'none';
  document.getElementById('nav-toptanci-btn').style.display = (currentRole === 'admin') ? 'block' : 'none';
  document.getElementById('nav-borc-btn').style.display = (currentRole === 'admin') ? 'block' : 'none';
  document.getElementById('nav-acikhesap-btn').style.display = (currentRole === 'admin') ? 'block' : 'none';
  const mergeProductsBtn = document.getElementById('merge-products-btn');
  if(mergeProductsBtn) mergeProductsBtn.style.display = (currentRole === 'admin') ? 'inline-block' : 'none';
  if (typeof renderDashboard === 'function') renderDashboard();
  
  const canAccessStaffOrAdmin = (currentRole === 'admin' || currentRole === 'staff');
  document.getElementById('nav-siparis-btn').style.display = canAccessStaffOrAdmin ? 'block' : 'none';
  document.getElementById('nav-fis-btn').style.display = canAccessStaffOrAdmin ? 'block' : 'none';
  document.getElementById('nav-yerlesim-btn').style.display = canAccessStaffOrAdmin ? 'block' : 'none';
  document.getElementById('nav-reports-btn').style.display = canAccessStaffOrAdmin ? 'block' : 'none';
  document.getElementById('nav-gorevler-btn').style.display = canAccessStaffOrAdmin ? 'block' : 'none';

  if(currentRole === 'admin') {
    statusBadge.textContent = "Yönetici"; statusBadge.className = "admin-badge role-admin"; authBtn.textContent = "Çıkış Yap";
    addCard.classList.remove('disabled-action'); backupBtn.classList.remove('disabled-action'); autoUpdateBtn.classList.remove('disabled-action');
    printAllBtn.style.display = 'inline-block';
    document.getElementById('manager-task-section').style.display = 'block';
    document.getElementById('toggle-stand-form-btn').style.display = 'inline-block';
    document.getElementById('edit-mode-toggle-btn').style.display = 'inline-block';
    document.getElementById('add-plan-btn').style.display = 'inline-block';
    document.getElementById('brand-settings-card').classList.remove('disabled-action');
    document.getElementById('bulk-import-card').classList.remove('disabled-action');
    document.getElementById('bulk-ai-stock-card').classList.remove('disabled-action');
    document.getElementById('barcode-fix-card').classList.remove('disabled-action');
    document.getElementById('recent-updates-card').classList.remove('disabled-action');
    document.getElementById('recent-updates-card').style.display = 'block';
  } else if(currentRole === 'staff') {
    statusBadge.textContent = "Çalışan Modu"; statusBadge.className = "admin-badge role-staff"; authBtn.textContent = "Çıkış Yap";
    addCard.classList.add('disabled-action'); backupBtn.classList.add('disabled-action'); autoUpdateBtn.classList.add('disabled-action');
    printAllBtn.style.display = 'inline-block';
    layoutEditMode = false;
    document.getElementById('manager-task-section').style.display = 'none';
    document.getElementById('toggle-stand-form-btn').style.display = 'none';
    document.getElementById('edit-mode-toggle-btn').style.display = 'none';
    document.getElementById('add-plan-btn').style.display = 'none';
    document.getElementById('new-plan-form').style.display = 'none';
    document.getElementById('stand-form-card').style.display = 'none';
    document.getElementById('brand-settings-card').classList.add('disabled-action');
    document.getElementById('bulk-import-card').classList.add('disabled-action');
    document.getElementById('bulk-ai-stock-card').classList.add('disabled-action');
    document.getElementById('barcode-fix-card').classList.add('disabled-action');
    document.getElementById('recent-updates-card').style.display = 'none';
  } else {
    statusBadge.textContent = "Ziyaretçi Modu"; statusBadge.className = "admin-badge role-guest"; authBtn.textContent = "Giriş Yap";
    addCard.classList.add('disabled-action'); backupBtn.classList.add('disabled-action'); autoUpdateBtn.classList.add('disabled-action');
    printAllBtn.style.display = 'none';
    layoutEditMode = false;
    document.getElementById('manager-task-section').style.display = 'none';
    document.getElementById('toggle-stand-form-btn').style.display = 'none';
    document.getElementById('edit-mode-toggle-btn').style.display = 'none';
    document.getElementById('add-plan-btn').style.display = 'none';
    document.getElementById('new-plan-form').style.display = 'none';
    document.getElementById('stand-form-card').style.display = 'none';
    document.getElementById('brand-settings-card').classList.add('disabled-action');
    document.getElementById('bulk-import-card').classList.add('disabled-action');
    document.getElementById('barcode-fix-card').classList.add('disabled-action');
    document.getElementById('recent-updates-card').style.display = 'none';
  }
  renderGrid();
  renderPlanSelector();
  renderLayoutGrid();
  renderBrandSettings();
  if(currentRole === 'admin') {
    renderWholesalers();
    renderRecentUpdates();
    renderNotifications();
    renderCustomerDebts();
  }
  renderTasks();
}

// ============================================================
// BORÇ SEPETİ (MÜŞTERİ SATIŞ)
// ============================================================

let borcCart = [];

function updateBorcOrderProductList() {
  const dl = document.getElementById('borc-order-product-list');
  if (!dl) return;
  dl.innerHTML = '';
  Object.values(productsData).forEach(p => {
    const opt = document.createElement('option');
    opt.value = `${p.code} - ${p.name}`;
    dl.appendChild(opt);
  });
}

function addToBorcCart() {
  if (currentRole !== 'admin' && currentRole !== 'staff') {
    alert("Bu işlem için yetkiniz yok!");
    return;
  }
  
  const inputVal = document.getElementById('borc-cart-product').value;
  const qty = parseFloat(document.getElementById('borc-cart-qty').value);
  
  if (!inputVal || isNaN(qty) || qty <= 0) {
    alert("Lütfen geçerli bir ürün ve miktar girin.");
    return;
  }
  
  const code = inputVal.split(' - ')[0].trim();
  const p = productsData[code];
  
  if (!p) {
    alert("Ürün bulunamadı! Lütfen listeden seçin.");
    return;
  }
  
  if (p.qty < qty) {
    alert(`Yetersiz stok! Mevcut: ${p.qty} ${p.unit || 'Adet'}`);
    return;
  }
  
  const existingIndex = borcCart.findIndex(item => item.code === code);
  if (existingIndex !== -1) {
    const newQty = borcCart[existingIndex].qty + qty;
    if (p.qty < newQty) {
      alert(`Yetersiz stok! Mevcut: ${p.qty} ${p.unit || 'Adet'}`);
      return;
    }
    borcCart[existingIndex].qty = newQty;
    borcCart[existingIndex].total = newQty * borcCart[existingIndex].price;
  } else {
    const price = Number(p.price || 0);
    borcCart.push({
      code: p.code,
      name: p.name,
      price: price,
      qty: qty,
      unit: p.unit || 'Adet',
      total: price * qty
    });
  }
  
  document.getElementById('borc-cart-product').value = '';
  document.getElementById('borc-cart-qty').value = '1';
  renderBorcCart();
  showToast("Ürün sepete eklendi!");
}

function renderBorcCart() {
  const container = document.getElementById('borc-cart-container');
  const tbody = document.getElementById('borc-cart-items');
  
  if (borcCart.length === 0) {
    container.style.display = 'none';
    return;
  }
  
  container.style.display = 'block';
  let grandTotal = 0;
  const __borcCartParts = [];
  
  borcCart.forEach((item, index) => {
    grandTotal += item.total;
    __borcCartParts.push(`
      <tr style="border-bottom:1px dashed var(--steel-line);">
        <td style="padding:10px 0; line-height:1.3;">
          <strong>${item.name}</strong><br>
          <small style="color:var(--steel); font-family:'IBM Plex Mono';">${item.code}</small>
        </td>
        <td>₺${formatMoney(item.price)}</td>
        <td style="font-weight:bold;">${item.qty} ${item.unit}</td>
        <td style="font-weight:bold; color:var(--rust);">₺${formatMoney(item.total)}</td>
        <td><button class="btn btn-dark btn-sm" onclick="removeFromBorcCart(${index})">Çıkar</button></td>
      </tr>
    `);
  });
  tbody.innerHTML = __borcCartParts.join('');
  
  document.getElementById('borc-cart-total').textContent = "₺" + formatMoney(grandTotal);
}

function removeFromBorcCart(index) {
  borcCart.splice(index, 1);
  renderBorcCart();
}

function clearBorcCart() {
  if (borcCart.length === 0) return;
  if (!confirm("Sepeti temizlemek istediğinize emin misiniz?")) return;
  borcCart = [];
  renderBorcCart();
  showToast("Sepet temizlendi.");
}

function completeBorcSale() {
  if (currentRole !== 'admin') {
    alert("Bu işlem için yönetici yetkisi gerekir!");
    return;
  }
  
  if (borcCart.length === 0) {
    alert("Sepette ürün yok!");
    return;
  }
  
  const customer = document.getElementById('borc-sale-customer').value.trim();
  const phone = document.getElementById('borc-sale-phone').value.trim();
  const termDays = parseInt(document.getElementById('borc-sale-term').value);
  const note = document.getElementById('borc-sale-note').value.trim();
  
  if (!customer) {
    alert("Lütfen müşteri adını girin!");
    return;
  }
  
  let grandTotal = 0;
  borcCart.forEach(item => grandTotal += item.total);
  
  let stockError = false;
  borcCart.forEach(item => {
    if (!productsData[item.code]) return;
    const currentQty = productsData[item.code].qty || 0;
    if (currentQty < item.qty) {
      alert(`Yetersiz stok: ${item.name} (Mevcut: ${currentQty}, İstenen: ${item.qty})`);
      stockError = true;
    }
  });
  if (stockError) return;
  
  borcCart.forEach(item => {
    db.child(item.code).child('qty').transaction((currentQty) => {
      const cur = Number(currentQty || 0);
      return Math.max(0, cur - item.qty);
    }, (error, committed) => {
      if (error) { console.error(error); return; }
      if (committed) {
        logMovement(item.code, item.name, -item.qty, 'BORÇ SATIŞI: ' + customer);
      }
    });
  });
  
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  
  const dueDate = new Date(now);
  dueDate.setDate(dueDate.getDate() + termDays);
  const dueDateStr = dueDate.toISOString().slice(0, 10);
  
  const itemsDesc = borcCart.map(item => `${item.name} (${item.qty} ${item.unit})`).join(', ');
  const fullDesc = `Satış: ${itemsDesc}`;
  
  const debtData = {
    customer: customer,
    phone: phone || '',
    description: fullDesc,
    amount: grandTotal,
    remaining: grandTotal,
    term: termDays + ' Gün',
    dueDate: dueDateStr,
    status: 'Açık',
    note: note || '',
    date: dateStr,
    time: timeStr,
    createdAt: now.toISOString(),
    lastUpdatedBy: 'Yönetici',
    items: borcCart.map(item => ({
      code: item.code,
      name: item.name,
      price: item.price,
      qty: item.qty,
      unit: item.unit,
      total: item.total
    })),
    saleType: 'borc_sale'
  };
  
  const newDebtRef = dbCustomerDebts.push(debtData, (err) => {
    if (!err) {
      const faturaData = {
        musteriAdi: customer,
        telefon: phone,
        tarih: new Date().toLocaleDateString('tr-TR'),
        saat: timeStr,
        vadeSuresi: termDays + ' Gün',
        vadeTarihi: dueDateStr,
        genelToplam: grandTotal,
        urunler: borcCart.map(item => ({
          urunAdi: item.name,
          miktar: item.qty,
          birimFiyat: item.price,
          toplam: item.total
        })),
        islemTipi: 'Borç Satış',
        belgeNo: 'BORÇ-' + Date.now()
      };
      localStorage.setItem('guncelSiparis', JSON.stringify(faturaData));
      window.open('fatura.html', '_blank');
      
      showToast(`Satış tamamlandı! ${customer} için ${formatMoney(grandTotal)}₺ borç oluşturuldu. Fatura açılıyor...`);

      // Açık Hesap: müşteri kayıtlı değilse otomatik olarak deftere eklenir.
      if (typeof upsertCustomerAccount === 'function') upsertCustomerAccount(customer, phone);

      borcCart = [];
      renderBorcCart();
      document.getElementById('borc-sale-customer').value = '';
      document.getElementById('borc-sale-phone').value = '';
      document.getElementById('borc-sale-note').value = '';
      renderCustomerDebts();
      renderGrid();

      // Borç kaydedildiğinde, bu borç için yasal senet düzenlenmek istenip istenmediği sorulur.
      if (typeof printSenet === 'function' && newDebtRef && newDebtRef.key) {
        setTimeout(() => {
          if (confirm(`${customer} için ${formatMoney(grandTotal)}₺ tutarında yasal senet kağıdı düzenlemek ister misiniz?`)) {
            printSenet(newDebtRef.key);
          }
        }, 600);
      }
    } else {
      alert("Satış kaydedilemedi: " + err.message);
    }
  });
}

// ============================================================
// MÜŞTERİ BORÇ YÖNETİMİ (Güncellendi: Düzenleme ile sepet düzenleme)
// ============================================================

function addCustomerDebt() {
  if (currentRole !== 'admin') { alert("Bu işlem için yönetici yetkisi gerekir!"); return; }

  const customer = document.getElementById('borc-customer').value.trim();
  const phone = document.getElementById('borc-phone').value.trim();
  const desc = document.getElementById('borc-desc').value.trim();
  const amount = parseFloat(document.getElementById('borc-amount').value);
  const term = document.getElementById('borc-term').value;
  const status = document.getElementById('borc-status').value;
  const note = document.getElementById('borc-note').value.trim();

  if (!customer) { alert("Müşteri adı giriniz!"); return; }
  if (!desc) { alert("Borç açıklaması giriniz!"); return; }
  if (isNaN(amount) || amount <= 0) { alert("Geçerli bir borç tutarı giriniz!"); return; }

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

  let dueDate = null;
  if (term !== 'Belirsiz') {
    const days = parseInt(term);
    const due = new Date(now);
    due.setDate(due.getDate() + days);
    dueDate = due.toISOString().slice(0, 10);
  }

  const debtData = {
    customer,
    phone: phone || '',
    description: desc,
    amount: amount,
    remaining: amount,
    term: term,
    dueDate: dueDate,
    status: status,
    note: note || '',
    date: dateStr,
    time: timeStr,
    createdAt: now.toISOString(),
    lastUpdatedBy: currentRole === 'admin' ? 'Yönetici' : 'Çalışan'
  };

  dbCustomerDebts.push(debtData, (err) => {
    if (!err) {
      showToast("Borç kaydedildi!");
      document.getElementById('borc-customer').value = '';
      document.getElementById('borc-phone').value = '';
      document.getElementById('borc-desc').value = '';
      document.getElementById('borc-amount').value = '';
      document.getElementById('borc-note').value = '';
      renderCustomerDebts();
    } else {
      alert("Kaydedilemedi: " + err.message);
    }
  });
}

function renderCustomerDebts() {
  const listDiv = document.getElementById('customer-debts-list');
  if (!listDiv) return;

  const filter = document.getElementById('borc-filter-status').value;

  dbCustomerDebts.once('value', (snapshot) => {
    const data = snapshot.val() || {};
    const keys = Object.keys(data).reverse();

    if (keys.length === 0) {
      listDiv.innerHTML = '<p style="color:var(--steel); font-size:13px; text-align:center;">Henüz kayıtlı borç yok.</p>';
      return;
    }

    let html = '';
    let totalOpen = 0;
    let totalRemaining = 0;

    keys.forEach(key => {
      const d = data[key];
      if (filter !== 'hepsi' && d.status !== filter) return;

      const isOpen = d.status === 'Açık' || d.status === 'Kısmi';
      const isPastDue = d.dueDate && d.dueDate < new Date().toISOString().slice(0, 10) && isOpen;

      if (isOpen) {
        totalOpen += d.amount;
        totalRemaining += (d.remaining || d.amount);
      }

      html += `
        <div class="tag" style="margin-bottom:10px; ${isPastDue ? 'border-left: 4px solid var(--rust);' : ''}">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
            <div>
              <div class="tag-title">${d.customer} ${d.phone ? '📞 ' + d.phone : ''}</div>
              <div class="tag-code">
                📅 ${d.date} ${d.time} | 💰 ${d.amount}₺ 
                ${d.remaining != null && d.remaining !== d.amount ? `| Kalan: ${d.remaining}₺` : ''}
                ${d.status === 'Açık' ? '🔴 Açık' : d.status === 'Kısmi' ? '🟡 Kısmi Ödendi' : '🟢 Kapalı'}
                ${d.dueDate ? `| ⏰ Vade: ${d.dueDate} ${isPastDue ? '🚨 GECİKTİ!' : ''}` : '| ⏰ Vade: Belirsiz'}
                <br>📝 ${d.description}
                ${d.note ? `<br>📌 ${d.note}` : ''}
                ${d.senetNo ? `<br>🖋️ Senet No: ${d.senetNo} (${d.senetDate || ''})` : ''}
              </div>
            </div>
            <div style="text-align:right; display:flex; flex-direction:column; gap:4px;">
              ${currentRole === 'admin' ? `
                <button class="btn btn-success btn-sm" onclick="payDebt('${key}', ${d.amount})" style="width:auto;">💰 Ödeme Al</button>
                <button class="btn btn-info btn-sm" onclick="openBorcEditModal('${key}')" style="width:auto;">✏️ Düzenle</button>
                <button class="btn btn-danger btn-sm" onclick="deleteCustomerDebt('${key}')" style="width:auto;">🗑️ Sil</button>
                <button class="btn btn-dark btn-sm" onclick="printDebtSlip('${key}')" style="width:auto;">🖨️ Borç Fişi</button>
                <button class="btn btn-primary btn-sm" onclick="reprintInvoice('${key}')" style="width:auto;">🧾 A4 Fatura</button>
                <button class="btn btn-warning btn-sm" onclick="printSenet('${key}')" style="width:auto;">🖋️ Senet Yazdır</button>
              ` : ''}
              ${d.status !== 'Kapalı' && currentRole === 'admin' ? `
                <button class="btn btn-primary btn-sm" onclick="markDebtClosed('${key}')" style="width:auto;">✅ Kapat</button>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    });

    if (filter === 'hepsi' || filter === 'Açık') {
      html += `
        <div style="background:var(--paper); border:1px solid var(--steel-line); border-radius:var(--radius); padding:12px; margin-top:10px; display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px;">
          <span style="font-weight:bold;">Toplam Açık Borç: <span style="color:var(--rust);">${totalOpen}₺</span></span>
          <span style="font-weight:bold;">Kalan Toplam: <span style="color:var(--safety);">${totalRemaining}₺</span></span>
        </div>
      `;
    }

    listDiv.innerHTML = html;
  });
}

function payDebt(key, totalAmount) {
  if (currentRole !== 'admin') return;
  const amount = prompt("Alınan ödeme tutarını girin (₺):");
  if (amount === null) return;
  const parsed = parseFloat(amount);
  if (isNaN(parsed) || parsed <= 0) { alert("Geçerli bir tutar girin!"); return; }

  dbCustomerDebts.child(key).once('value', (snap) => {
    const d = snap.val();
    if (!d) { alert("Borç bulunamadı!"); return; }

    const remaining = d.remaining || d.amount;
    const newRemaining = Math.max(0, remaining - parsed);
    const newStatus = newRemaining === 0 ? 'Kapalı' : 'Kısmi';

    dbCustomerDebts.child(key).update({
      remaining: newRemaining,
      status: newStatus,
      lastUpdatedBy: 'Yönetici'
    }, (err) => {
      if (!err) {
        showToast(`${parsed}₺ ödeme alındı! Kalan: ${newRemaining}₺`);
        renderCustomerDebts();
      }
    });
  });
}

function markDebtClosed(key) {
  if (currentRole !== 'admin') return;
  if (!confirm("Bu borcu tamamen kapatmak istediğinize emin misiniz?")) return;

  dbCustomerDebts.child(key).update({
    remaining: 0,
    status: 'Kapalı',
    lastUpdatedBy: 'Yönetici'
  }, (err) => {
    if (!err) {
      showToast("Borç kapatıldı!");
      renderCustomerDebts();
    }
  });
}

function deleteCustomerDebt(key) {
  if (currentRole !== 'admin') return;
  if (!confirm("Bu borç kaydını kalıcı olarak silmek istediğinize emin misiniz?")) return;
  dbCustomerDebts.child(key).remove(() => {
    showToast("Borç silindi.");
    renderCustomerDebts();
  });
}

// --- YENİ: Borç Düzenleme Modalı (Sepet düzenleme) ---
let borcEditItems = [];
let borcEditKey = null;

function openBorcEditModal(key) {
  dbCustomerDebts.child(key).once('value', (snap) => {
    const d = snap.val();
    if (!d) return;
    borcEditKey = key;
    borcEditItems = (d.items || []).map(item => ({ ...item }));
    document.getElementById('borc-edit-customer').value = d.customer || '';
    document.getElementById('borc-edit-phone').value = d.phone || '';
    document.getElementById('borc-edit-note').value = d.note || '';

    // Ürün listesini doldur
    const dl = document.getElementById('borc-edit-product-list');
    dl.innerHTML = '';
    Object.values(productsData).forEach(p => {
      const opt = document.createElement('option');
      opt.value = `${p.code} - ${p.name}`;
      dl.appendChild(opt);
    });

    renderBorcEditItems();
    document.getElementById('borc-edit-modal').style.display = 'flex';
  });
}

function closeBorcEditModal() {
  document.getElementById('borc-edit-modal').style.display = 'none';
  borcEditItems = [];
  borcEditKey = null;
}

function renderBorcEditItems() {
  const container = document.getElementById('borc-edit-items-container');
  let html = '';
  let total = 0;
  borcEditItems.forEach((item, idx) => {
    total += item.total || (item.price * item.qty);
    html += `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-top:1px solid var(--steel-line);">
        <span><strong>${item.name}</strong> (${item.qty} ${item.unit || 'Adet'}) - ₺${formatMoney(item.price)}</span>
        <span style="font-weight:bold;">₺${formatMoney(item.total || item.price * item.qty)}</span>
        <button class="btn btn-dark btn-sm" onclick="removeBorcEditItem(${idx})">Çıkar</button>
      </div>
    `;
  });
  if (borcEditItems.length === 0) html = '<p style="color:var(--steel); font-size:12px;">Sepet boş.</p>';
  container.innerHTML = html;
  document.getElementById('borc-edit-new-total').textContent = '₺' + formatMoney(total);
}

function removeBorcEditItem(idx) {
  borcEditItems.splice(idx, 1);
  renderBorcEditItems();
}

function addItemToBorcEdit() {
  const inputVal = document.getElementById('borc-edit-product').value;
  const qty = parseFloat(document.getElementById('borc-edit-qty').value);
  if (!inputVal || isNaN(qty) || qty <= 0) { alert("Geçerli ürün ve miktar girin."); return; }
  const code = inputVal.split(' - ')[0].trim();
  const p = productsData[code];
  if (!p) { alert("Ürün bulunamadı!"); return; }
  // Stok kontrolü: mevcut borçtaki miktarı da hesaba kat
  const existing = borcEditItems.find(it => it.code === code);
  const currentInCart = existing ? existing.qty : 0;
  const totalQty = currentInCart + qty;
  if (p.qty < totalQty) {
    alert(`Yetersiz stok! Mevcut: ${p.qty}, İstenen: ${totalQty}`);
    return;
  }
  if (existing) {
    existing.qty = totalQty;
    existing.total = existing.qty * existing.price;
  } else {
    borcEditItems.push({
      code: p.code,
      name: p.name,
      price: Number(p.price || 0),
      qty: qty,
      unit: p.unit || 'Adet',
      total: qty * Number(p.price || 0)
    });
  }
  document.getElementById('borc-edit-product').value = '';
  document.getElementById('borc-edit-qty').value = '1';
  renderBorcEditItems();
}

function saveBorcEdit() {
  if (!borcEditKey) return;
  const customer = document.getElementById('borc-edit-customer').value.trim();
  const phone = document.getElementById('borc-edit-phone').value.trim();
  const note = document.getElementById('borc-edit-note').value.trim();
  if (!customer) { alert("Müşteri adı boş olamaz."); return; }

  let grandTotal = 0;
  borcEditItems.forEach(item => grandTotal += (item.total || item.price * item.qty));

  // Stok güncellemeleri: önce eski ürünleri geri ekle, sonra yenileri düş
  dbCustomerDebts.child(borcEditKey).once('value', (snap) => {
    const oldData = snap.val();
    if (!oldData) return;
    const oldItems = oldData.items || [];

    // Eski ürünleri stoklara geri ekle
    oldItems.forEach(item => {
      db.child(item.code).child('qty').transaction(cur => Number(cur || 0) + Number(item.qty));
    });

    // Yeni ürünleri stoktan düş
    borcEditItems.forEach(item => {
      db.child(item.code).child('qty').transaction(cur => Math.max(0, Number(cur || 0) - Number(item.qty)));
    });

    // Borç kaydını güncelle
    const dueDate = oldData.dueDate || null;
    const term = oldData.term || 'Belirsiz';
    const status = grandTotal > 0 ? 'Açık' : 'Kapalı';
    dbCustomerDebts.child(borcEditKey).update({
      customer,
      phone,
      note,
      items: borcEditItems.map(item => ({
        code: item.code,
        name: item.name,
        price: item.price,
        qty: item.qty,
        unit: item.unit || 'Adet',
        total: item.total || item.price * item.qty
      })),
      amount: grandTotal,
      remaining: grandTotal,
      status: status,
      lastUpdatedBy: 'Yönetici (Düzenlendi)'
    }, (err) => {
      if (!err) {
        showToast("Borç güncellendi, stoklar düzeltildi.");
        closeBorcEditModal();
        renderCustomerDebts();
        renderGrid();
      } else {
        alert("Güncelleme hatası: " + err.message);
      }
    });
  });
}

function reprintInvoice(key) {
  dbCustomerDebts.child(key).once('value', (snap) => {
    const d = snap.val();
    if (!d) { alert("Borç kaydı bulunamadı!"); return; }
    if (!d.items || d.items.length === 0) {
      alert("Bu borç kaydında ürün detayı yok, bunun yerine 'Borç Fişi' butonunu kullanabilirsiniz.");
      return;
    }
    const faturaData = {
      musteriAdi: d.customer,
      telefon: d.phone || '',
      tarih: d.date || new Date().toLocaleDateString('tr-TR'),
      saat: d.time || '',
      vadeSuresi: d.term || '',
      vadeTarihi: d.dueDate || '',
      genelToplam: d.amount,
      urunler: d.items.map(item => ({
        urunAdi: item.name,
        miktar: item.qty,
        birimFiyat: item.price,
        toplam: item.total
      })),
      islemTipi: 'Borç Satış',
      belgeNo: 'BORÇ-' + key
    };
    localStorage.setItem('guncelSiparis', JSON.stringify(faturaData));
    window.open('fatura.html', '_blank');
  });
}

function printDebtSlip(key) {
  dbCustomerDebts.child(key).once('value', (snap) => {
    const d = snap.val();
    if (!d) { alert("Borç bulunamadı!"); return; }

    const printArea = document.getElementById('print-area');
    const now = new Date();
    const dateStr = now.toLocaleDateString('tr-TR');
    const timeStr = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

    printArea.innerHTML = `
      <div style="width: 100%; max-width: 400px; margin: 0 auto; padding: 20px; font-family: 'Courier New', monospace; background: #fff; border: 2px solid #000; border-radius: 8px;">
        <div style="text-align: center; border-bottom: 2px dashed #000; padding-bottom: 10px; margin-bottom: 10px;">
          <h2 style="margin: 0; font-size: 18px; text-transform: uppercase;">REYHANİ CAM HIRDAVAT</h2>
          <p style="margin: 4px 0; font-size: 11px;">Borç Fişi / Müşteri Borç Dekontu</p>
        </div>

        <div style="font-size: 12px; margin-bottom: 10px;">
          <p><strong>Tarih:</strong> ${dateStr} ${timeStr}</p>
          <p><strong>Müşteri:</strong> ${d.customer}</p>
          ${d.phone ? `<p><strong>Telefon:</strong> ${d.phone}</p>` : ''}
          <p><strong>Borç Açıklaması:</strong> ${d.description}</p>
          <p><strong>Vade:</strong> ${d.dueDate || 'Belirsiz'}</p>
          ${d.note ? `<p><strong>Not:</strong> ${d.note}</p>` : ''}
        </div>

        <div style="border-top: 2px dashed #000; border-bottom: 2px dashed #000; padding: 10px 0; margin: 10px 0; text-align: center;">
          <div style="font-size: 14px; font-weight: bold;">BORÇ TUTARI</div>
          <div style="font-size: 28px; font-weight: bold; color: var(--rust, #C1440E);">₺${formatMoney(d.amount)}</div>
          ${d.remaining != null && d.remaining !== d.amount ? `<div style="font-size: 12px; color: var(--steel);">Ödenen: ₺${formatMoney(d.amount - d.remaining)} | Kalan: ₺${formatMoney(d.remaining)}</div>` : ''}
          <div style="font-size: 11px; margin-top: 4px; font-weight: bold;">Durum: ${d.status}</div>
        </div>

        <div style="text-align: center; font-size: 10px; color: var(--steel); padding-top: 10px; border-top: 1px solid #ddd;">
          <p>Bu belge, Reyhani Cam Hırdavat tarafından düzenlenmiştir.</p>
          <p>Borcunuzu ödemek için lütfen belirtilen vade tarihine uyunuz.</p>
        </div>
      </div>
    `;

    document.body.className = 'printing-label';
    setTimeout(() => {
      window.print();
      document.body.className = '';
    }, 400);
  });
}

function exportCustomerDebts() {
  if (currentRole !== 'admin') return;

  dbCustomerDebts.once('value', (snapshot) => {
    const data = snapshot.val() || {};
    const rows = [["Müşteri", "Telefon", "Açıklama", "Tutar", "Kalan", "Durum", "Vade", "Tarih", "Not"]];

    Object.values(data).forEach(d => {
      rows.push([
        d.customer || '',
        d.phone || '',
        d.description || '',
        d.amount || 0,
        d.remaining || d.amount || 0,
        d.status || '',
        d.dueDate || 'Belirsiz',
        d.date || '',
        d.note || ''
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "MusteriBorclar");
    const dateStr = new Date().toISOString().slice(0,10);
    saveExcelFile(wb, `Reyhani_Musteri_Borclari_${dateStr}.xlsx`);
  });
}

// ============================================================
// AÇIK HESAP (MÜŞTERİ KAYIT DEFTERİ) — Müşteri profilleri + sayfa sayfa hesap ekstresi + senet
// ============================================================

let customersData = {};

dbCustomers.on('value', (snapshot) => {
  customersData = snapshot.val() || {};
  const tab = document.getElementById('tab-acikhesap');
  if (tab && tab.classList.contains('active')) renderCustomerAccounts();
});

// Bir borç kaydının, verilen müşteri (isim/telefon) ile eşleşip eşleşmediğini kontrol eder.
// Telefon numarası varsa telefon üzerinden, yoksa isim üzerinden eşleştirir.
function matchesCustomer(d, name, phone) {
  const cleanPhone = (phone || '').replace(/\s+/g, '');
  if (cleanPhone) {
    return (d.phone || '').replace(/\s+/g, '') === cleanPhone;
  }
  return (d.customer || '').trim().toLowerCase() === (name || '').trim().toLowerCase();
}

// Aynı isim/telefonla kayıtlı bir müşteri var mı diye bakar, varsa kaydının anahtarını döner.
function findCustomerKey(name, phone) {
  const cleanPhone = (phone || '').replace(/\s+/g, '');
  const cleanName = (name || '').trim().toLowerCase();
  const keys = Object.keys(customersData || {});
  for (const k of keys) {
    const c = customersData[k];
    if (cleanPhone && c.phone && c.phone.replace(/\s+/g, '') === cleanPhone) return k;
    if (!cleanPhone && c.name && c.name.trim().toLowerCase() === cleanName) return k;
  }
  return null;
}

// Borç satışı sırasında girilen müşteri, açık hesap defterinde kayıtlı değilse otomatik olarak ekler.
function upsertCustomerAccount(name, phone) {
  if (!name) return;
  if (findCustomerKey(name, phone)) return;
  dbCustomers.push({
    name: name,
    phone: phone || '',
    address: '',
    tckn: '',
    note: '',
    createdAt: new Date().toISOString(),
    createdBy: currentRole === 'admin' ? 'Yönetici' : 'Çalışan',
    autoCreated: true
  });
}

function registerCustomerAccount() {
  if (currentRole !== 'admin') { alert("Bu işlem için yönetici yetkisi gerekir!"); return; }

  const name = document.getElementById('ah-cust-name').value.trim();
  const phone = document.getElementById('ah-cust-phone').value.trim();
  const address = document.getElementById('ah-cust-address').value.trim();
  const tckn = document.getElementById('ah-cust-tckn').value.trim();
  const note = document.getElementById('ah-cust-note').value.trim();

  if (!name) { alert("Müşteri adı giriniz!"); return; }

  if (findCustomerKey(name, phone)) {
    alert("Bu müşteri (aynı isim/telefon ile) zaten kayıtlı. Listeden '✏️ Düzenle' ile güncelleyebilirsiniz.");
    return;
  }

  dbCustomers.push({
    name, phone, address, tckn, note,
    createdAt: new Date().toISOString(),
    createdBy: currentRole === 'admin' ? 'Yönetici' : 'Çalışan'
  }, (err) => {
    if (!err) {
      showToast("Müşteri kaydedildi!");
      ['ah-cust-name', 'ah-cust-phone', 'ah-cust-address', 'ah-cust-tckn', 'ah-cust-note'].forEach(id => document.getElementById(id).value = '');
      renderCustomerAccounts();
    } else {
      alert("Kaydedilemedi: " + err.message);
    }
  });
}

let ahCurrentPage = 1;
const AH_PAGE_SIZE = 8;

function renderCustomerAccounts() {
  const listDiv = document.getElementById('ah-customer-list');
  const pagDiv = document.getElementById('ah-pagination');
  if (!listDiv) return;

  const search = (document.getElementById('ah-search').value || '').trim().toLowerCase();

  dbCustomerDebts.once('value', (snap) => {
    const debts = snap.val() || {};
    let entries = Object.keys(customersData || {}).map(key => ({ key, ...customersData[key] }));

    if (search) {
      entries = entries.filter(c =>
        (c.name || '').toLowerCase().includes(search) ||
        (c.phone || '').toLowerCase().includes(search)
      );
    }

    entries.forEach(c => {
      let totalDebt = 0, totalRemaining = 0, txCount = 0;
      Object.values(debts).forEach(d => {
        if (matchesCustomer(d, c.name, c.phone)) {
          txCount++;
          totalDebt += Number(d.amount || 0);
          totalRemaining += Number(d.remaining != null ? d.remaining : d.amount || 0);
        }
      });
      c._totalDebt = totalDebt;
      c._totalRemaining = totalRemaining;
      c._txCount = txCount;
    });

    entries.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'tr'));

    if (entries.length === 0) {
      listDiv.innerHTML = '<p style="color:var(--steel); font-size:13px; text-align:center;">Henüz kayıtlı müşteri yok. Yukarıdan yeni müşteri ekleyin.</p>';
      pagDiv.innerHTML = '';
      return;
    }

    const totalPages = Math.max(1, Math.ceil(entries.length / AH_PAGE_SIZE));
    if (ahCurrentPage > totalPages) ahCurrentPage = totalPages;
    if (ahCurrentPage < 1) ahCurrentPage = 1;
    const pageEntries = entries.slice((ahCurrentPage - 1) * AH_PAGE_SIZE, ahCurrentPage * AH_PAGE_SIZE);

    listDiv.innerHTML = pageEntries.map(c => `
      <div class="tag" style="margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
          <div>
            <div class="tag-title">${c.name} ${c.phone ? '📞 ' + c.phone : ''}</div>
            <div class="tag-code">
              ${c.address ? '📍 ' + c.address + '<br>' : ''}
              🧾 ${c._txCount} işlem | 💰 Toplam: ${formatMoney(c._totalDebt)}₺ | Kalan: <strong style="color:${c._totalRemaining > 0 ? 'var(--rust)' : 'var(--success)'}">${formatMoney(c._totalRemaining)}₺</strong>
            </div>
          </div>
          <div style="text-align:right; display:flex; flex-direction:column; gap:4px;">
            <button class="btn btn-info btn-sm" onclick="openCustomerLedger('${c.key}')" style="width:auto;">📖 Hesabı Aç</button>
            <button class="btn btn-dark btn-sm" onclick="openCustomerEditModal('${c.key}')" style="width:auto;">✏️ Düzenle</button>
            <button class="btn btn-danger btn-sm" onclick="deleteCustomerAccount('${c.key}')" style="width:auto;">🗑️ Sil</button>
          </div>
        </div>
      </div>
    `).join('');

    let pagHtml = '';
    if (totalPages > 1) {
      pagHtml += `<button class="btn btn-dark btn-sm" style="width:auto;" onclick="ahChangePage(-1)" ${ahCurrentPage <= 1 ? 'disabled' : ''}>◀ Önceki</button>`;
      pagHtml += `<span style="font-size:12px; color:var(--steel);">Sayfa ${ahCurrentPage} / ${totalPages}</span>`;
      pagHtml += `<button class="btn btn-dark btn-sm" style="width:auto;" onclick="ahChangePage(1)" ${ahCurrentPage >= totalPages ? 'disabled' : ''}>Sonraki ▶</button>`;
    }
    pagDiv.innerHTML = pagHtml;
  });
}

function ahChangePage(delta) {
  ahCurrentPage += delta;
  renderCustomerAccounts();
}

function openCustomerEditModal(key) {
  const c = customersData[key];
  if (!c) return;
  document.getElementById('ah-edit-key').value = key;
  document.getElementById('ah-edit-name').value = c.name || '';
  document.getElementById('ah-edit-phone').value = c.phone || '';
  document.getElementById('ah-edit-address').value = c.address || '';
  document.getElementById('ah-edit-tckn').value = c.tckn || '';
  document.getElementById('ah-edit-note').value = c.note || '';
  document.getElementById('ah-cust-edit-modal').style.display = 'flex';
}

function closeCustomerEditModal() {
  document.getElementById('ah-cust-edit-modal').style.display = 'none';
}

function saveCustomerEdit() {
  const key = document.getElementById('ah-edit-key').value;
  if (!key) return;
  const name = document.getElementById('ah-edit-name').value.trim();
  if (!name) { alert("Müşteri adı boş olamaz."); return; }

  dbCustomers.child(key).update({
    name,
    phone: document.getElementById('ah-edit-phone').value.trim(),
    address: document.getElementById('ah-edit-address').value.trim(),
    tckn: document.getElementById('ah-edit-tckn').value.trim(),
    note: document.getElementById('ah-edit-note').value.trim()
  }, (err) => {
    if (!err) {
      showToast("Müşteri bilgileri güncellendi.");
      closeCustomerEditModal();
      renderCustomerAccounts();
    } else {
      alert("Güncellenemedi: " + err.message);
    }
  });
}

function deleteCustomerAccount(key) {
  if (currentRole !== 'admin') return;
  if (!confirm("Bu müşteri kartını silmek istediğinize emin misiniz? (Geçmiş borç/işlem kayıtları silinmez, sadece müşteri kartı kaldırılır.)")) return;
  dbCustomers.child(key).remove(() => {
    showToast("Müşteri kaydı silindi.");
    renderCustomerAccounts();
  });
}

// --- MÜŞTERİ SAYFASI: geçmiş işlemleri sayfa sayfa gösteren ekstre ---
let ahLedgerCustomerKey = null;
let ahLedgerPage = 1;
const AH_LEDGER_PAGE_SIZE = 5;

function openCustomerLedger(key) {
  ahLedgerCustomerKey = key;
  ahLedgerPage = 1;
  ahLedgerCart = [];
  document.getElementById('ah-ledger-product').value = '';
  document.getElementById('ah-ledger-qty').value = '1';
  document.getElementById('ah-ledger-manual-desc').value = '';
  document.getElementById('ah-ledger-manual-amount').value = '';
  document.getElementById('ah-ledger-note').value = '';
  renderLedgerCart();
  document.getElementById('ah-ledger-modal').style.display = 'flex';
  renderCustomerLedger();
}

function closeCustomerLedger() {
  document.getElementById('ah-ledger-modal').style.display = 'none';
  ahLedgerCustomerKey = null;
  ahLedgerCart = [];
}

function renderCustomerLedger() {
  const c = customersData[ahLedgerCustomerKey];
  if (!c) { closeCustomerLedger(); return; }
  document.getElementById('ah-ledger-title').textContent = '📖 ' + c.name + (c.phone ? ' — 📞 ' + c.phone : '');

  dbCustomerDebts.once('value', (snap) => {
    const debts = snap.val() || {};
    const txs = Object.keys(debts)
      .filter(k => matchesCustomer(debts[k], c.name, c.phone))
      .map(k => ({ key: k, ...debts[k] }))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    let totalDebt = 0, totalRemaining = 0;
    txs.forEach(t => {
      totalDebt += Number(t.amount || 0);
      totalRemaining += Number(t.remaining != null ? t.remaining : t.amount || 0);
    });

    document.getElementById('ah-ledger-summary').innerHTML = `
      <div style="background:var(--bg); border:1px solid var(--steel-line); border-radius:var(--radius); padding:12px; margin-bottom:14px; display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px; font-size:13px;">
        <span><strong>${txs.length}</strong> işlem kaydı</span>
        <span>Toplam: <strong>${formatMoney(totalDebt)}₺</strong></span>
        <span>Kalan: <strong style="color:${totalRemaining > 0 ? 'var(--rust)' : 'var(--success)'}">${formatMoney(totalRemaining)}₺</strong></span>
      </div>
    `;

    const totalPages = Math.max(1, Math.ceil(txs.length / AH_LEDGER_PAGE_SIZE));
    if (ahLedgerPage > totalPages) ahLedgerPage = totalPages;
    if (ahLedgerPage < 1) ahLedgerPage = 1;
    const pageTxs = txs.slice((ahLedgerPage - 1) * AH_LEDGER_PAGE_SIZE, ahLedgerPage * AH_LEDGER_PAGE_SIZE);

    const listDiv = document.getElementById('ah-ledger-list');
    if (txs.length === 0) {
      listDiv.innerHTML = '<p style="color:var(--steel); font-size:13px; text-align:center;">Bu müşteriye ait işlem yok.</p>';
    } else {
      listDiv.innerHTML = pageTxs.map(d => `
        <div class="tag" style="margin-bottom:10px;">
          <div class="tag-title">📅 ${d.date || ''} ${d.time || ''}</div>
          <div class="tag-code">
            📝 ${d.description || (d.items ? d.items.map(i => i.name + ' x' + i.qty).join(', ') : '')}
            <br>💰 ${formatMoney(d.amount)}₺ ${d.remaining != null && d.remaining !== d.amount ? '| Kalan: ' + formatMoney(d.remaining) + '₺' : ''}
            ${d.status === 'Açık' ? ' | 🔴 Açık' : d.status === 'Kısmi' ? ' | 🟡 Kısmi' : ' | 🟢 Kapalı'}
            ${d.dueDate ? ' | ⏰ Vade: ' + d.dueDate : ''}
            ${d.senetNo ? '<br>🖋️ Senet No: ' + d.senetNo + ' (' + (d.senetDate || '') + ')' : ''}
          </div>
          <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:8px;">
            <button class="btn btn-dark btn-sm" style="width:auto;" onclick="printDebtSlip('${d.key}')">🖨️ Borç Fişi</button>
            ${d.items && d.items.length ? `<button class="btn btn-primary btn-sm" style="width:auto;" onclick="reprintInvoice('${d.key}')">🧾 A4 Fatura</button>` : ''}
            <button class="btn btn-warning btn-sm" style="width:auto;" onclick="printSenet('${d.key}')">🖋️ Senet Yazdır</button>
          </div>
        </div>
      `).join('');
    }

    let pagHtml = '';
    if (totalPages > 1) {
      pagHtml += `<button class="btn btn-dark btn-sm" style="width:auto;" onclick="ahLedgerChangePage(-1)" ${ahLedgerPage <= 1 ? 'disabled' : ''}>◀ Önceki Sayfa</button>`;
      pagHtml += `<span style="font-size:12px; color:var(--steel);">Sayfa ${ahLedgerPage} / ${totalPages}</span>`;
      pagHtml += `<button class="btn btn-dark btn-sm" style="width:auto;" onclick="ahLedgerChangePage(1)" ${ahLedgerPage >= totalPages ? 'disabled' : ''}>Sonraki Sayfa ▶</button>`;
    }
    document.getElementById('ah-ledger-pagination').innerHTML = pagHtml;
  });
}

function ahLedgerChangePage(delta) {
  ahLedgerPage += delta;
  renderCustomerLedger();
}

// --- MÜŞTERİ SAYFASINDAN DOĞRUDAN YENİ İŞLEM/BORÇ EKLEME (Müşteri Borç ile tam entegre) ---
let ahLedgerCart = [];

function updateAhLedgerProductList() {
  const dl = document.getElementById('ah-ledger-product-list');
  if (!dl) return;
  dl.innerHTML = '';
  Object.values(productsData).forEach(p => {
    const opt = document.createElement('option');
    opt.value = `${p.code} - ${p.name}`;
    dl.appendChild(opt);
  });
}

function addToLedgerCart() {
  if (currentRole !== 'admin' && currentRole !== 'staff') { alert("Bu işlem için yetkiniz yok!"); return; }

  const inputVal = document.getElementById('ah-ledger-product').value;
  const qty = parseFloat(document.getElementById('ah-ledger-qty').value);

  if (!inputVal || isNaN(qty) || qty <= 0) { alert("Lütfen geçerli bir ürün ve miktar girin."); return; }

  const code = inputVal.split(' - ')[0].trim();
  const p = productsData[code];
  if (!p) { alert("Ürün bulunamadı! Lütfen listeden seçin."); return; }

  const existingIndex = ahLedgerCart.findIndex(item => item.code === code);
  const currentInCart = existingIndex !== -1 ? ahLedgerCart[existingIndex].qty : 0;
  if (p.qty < currentInCart + qty) {
    alert(`Yetersiz stok! Mevcut: ${p.qty} ${p.unit || 'Adet'}`);
    return;
  }

  if (existingIndex !== -1) {
    ahLedgerCart[existingIndex].qty += qty;
    ahLedgerCart[existingIndex].total = ahLedgerCart[existingIndex].qty * ahLedgerCart[existingIndex].price;
  } else {
    const price = Number(p.price || 0);
    ahLedgerCart.push({ code: p.code, name: p.name, price, qty, unit: p.unit || 'Adet', total: price * qty });
  }

  document.getElementById('ah-ledger-product').value = '';
  document.getElementById('ah-ledger-qty').value = '1';
  renderLedgerCart();
}

function removeFromLedgerCart(idx) {
  ahLedgerCart.splice(idx, 1);
  renderLedgerCart();
}

function renderLedgerCart() {
  const container = document.getElementById('ah-ledger-cart-container');
  const tbody = document.getElementById('ah-ledger-cart-items');
  if (!container || !tbody) return;

  if (ahLedgerCart.length === 0) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'block';

  let total = 0;
  tbody.innerHTML = ahLedgerCart.map((item, idx) => {
    total += item.total;
    return `
      <tr style="border-bottom:1px solid var(--steel-line);">
        <td style="padding:5px 0;">${item.name}</td>
        <td>₺${formatMoney(item.price)}</td>
        <td>${item.qty} ${item.unit}</td>
        <td>₺${formatMoney(item.total)}</td>
        <td><button class="btn btn-danger btn-sm" style="width:auto; padding:4px 8px;" onclick="removeFromLedgerCart(${idx})">✕</button></td>
      </tr>
    `;
  }).join('');
  document.getElementById('ah-ledger-cart-total').textContent = '₺' + formatMoney(total);
}

function clearLedgerCart() {
  ahLedgerCart = [];
  renderLedgerCart();
  document.getElementById('ah-ledger-manual-desc').value = '';
  document.getElementById('ah-ledger-manual-amount').value = '';
}

// Açık Hesap sayfasından girilen işlemi, Müşteri Borç bölümüyle AYNI kaydı (dbCustomerDebts)
// kullanarak kaydeder — böylece iki bölüm arasında ayrı ayrı işlem girmeye gerek kalmaz.
function saveLedgerTransaction() {
  if (currentRole !== 'admin') { alert("Bu işlem için yönetici yetkisi gerekir!"); return; }

  const c = customersData[ahLedgerCustomerKey];
  if (!c) { alert("Müşteri bulunamadı!"); return; }

  const manualDesc = document.getElementById('ah-ledger-manual-desc').value.trim();
  const manualAmount = parseFloat(document.getElementById('ah-ledger-manual-amount').value);
  const hasManual = manualDesc && !isNaN(manualAmount) && manualAmount > 0;
  const hasCart = ahLedgerCart.length > 0;

  if (!hasCart && !hasManual) {
    alert("Sepete ürün ekleyin veya açıklama + tutar girerek serbest bir borç oluşturun.");
    return;
  }
  if (hasCart && hasManual) {
    alert("Aynı anda hem ürün sepeti hem serbest tutar giremezsiniz. Lütfen sadece birini kullanın.");
    return;
  }

  const termDays = parseInt(document.getElementById('ah-ledger-term').value);
  const note = document.getElementById('ah-ledger-note').value.trim();

  let stockError = false;
  if (hasCart) {
    ahLedgerCart.forEach(item => {
      const currentQty = productsData[item.code] ? (productsData[item.code].qty || 0) : 0;
      if (currentQty < item.qty) {
        alert(`Yetersiz stok: ${item.name} (Mevcut: ${currentQty}, İstenen: ${item.qty})`);
        stockError = true;
      }
    });
  }
  if (stockError) return;

  const grandTotal = hasCart ? ahLedgerCart.reduce((s, i) => s + i.total, 0) : manualAmount;

  if (hasCart) {
    ahLedgerCart.forEach(item => {
      db.child(item.code).child('qty').transaction((currentQty) => Math.max(0, Number(currentQty || 0) - item.qty), (error, committed) => {
        if (!error && committed) logMovement(item.code, item.name, -item.qty, 'AÇIK HESAP BORÇ: ' + c.name);
      });
    });
  }

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const dueDate = new Date(now);
  dueDate.setDate(dueDate.getDate() + termDays);
  const dueDateStr = dueDate.toISOString().slice(0, 10);

  const description = hasCart
    ? 'Satış: ' + ahLedgerCart.map(i => `${i.name} (${i.qty} ${i.unit})`).join(', ')
    : manualDesc;

  const debtData = {
    customer: c.name,
    phone: c.phone || '',
    description,
    amount: grandTotal,
    remaining: grandTotal,
    term: termDays + ' Gün',
    dueDate: dueDateStr,
    status: 'Açık',
    note: note || '',
    date: dateStr,
    time: timeStr,
    createdAt: now.toISOString(),
    lastUpdatedBy: currentRole === 'admin' ? 'Yönetici' : 'Çalışan',
    saleType: hasCart ? 'borc_sale' : 'manuel_borc'
  };
  if (hasCart) {
    debtData.items = ahLedgerCart.map(item => ({ code: item.code, name: item.name, price: item.price, qty: item.qty, unit: item.unit, total: item.total }));
  }

  const newRef = dbCustomerDebts.push(debtData, (err) => {
    if (!err) {
      showToast(`${c.name} hesabına ${formatMoney(grandTotal)}₺ borç işlendi!`);

      if (hasCart) {
        const faturaData = {
          musteriAdi: c.name,
          telefon: c.phone || '',
          tarih: now.toLocaleDateString('tr-TR'),
          saat: timeStr,
          vadeSuresi: termDays + ' Gün',
          vadeTarihi: dueDateStr,
          genelToplam: grandTotal,
          urunler: ahLedgerCart.map(i => ({ urunAdi: i.name, miktar: i.qty, birimFiyat: i.price, toplam: i.total })),
          islemTipi: 'Borç Satış',
          belgeNo: 'BORÇ-' + Date.now()
        };
        localStorage.setItem('guncelSiparis', JSON.stringify(faturaData));
        window.open('fatura.html', '_blank');
      }

      clearLedgerCart();
      renderCustomerLedger();
      renderCustomerAccounts();
      renderGrid();

      if (newRef && newRef.key) {
        setTimeout(() => {
          if (confirm(`${c.name} için ${formatMoney(grandTotal)}₺ tutarında yasal senet kağıdı düzenlemek ister misiniz?`)) {
            printSenet(newRef.key);
          }
        }, 600);
      }
    } else {
      alert("Kaydedilemedi: " + err.message);
    }
  });
}

// --- SAYIYI TÜRKÇE YAZIYA ÇEVİRME (senet üzerinde "bedel yazıyla" için) ---
function numberToTurkishWords(num) {
  num = Math.floor(Number(num) || 0);
  if (num === 0) return 'Sıfır';

  const ones = ['', 'Bir', 'İki', 'Üç', 'Dört', 'Beş', 'Altı', 'Yedi', 'Sekiz', 'Dokuz'];
  const tens = ['', 'On', 'Yirmi', 'Otuz', 'Kırk', 'Elli', 'Altmış', 'Yetmiş', 'Seksen', 'Doksan'];
  const scales = ['', 'Bin', 'Milyon', 'Milyar', 'Trilyon'];

  function threeDigits(n) {
    let s = '';
    const h = Math.floor(n / 100);
    const t = Math.floor((n % 100) / 10);
    const o = n % 10;
    if (h > 0) s += (h === 1 ? '' : ones[h] + ' ') + 'Yüz ';
    if (t > 0) s += tens[t] + ' ';
    if (o > 0) s += ones[o] + ' ';
    return s.trim();
  }

  let groups = [];
  let n = num;
  while (n > 0) { groups.push(n % 1000); n = Math.floor(n / 1000); }

  let words = '';
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue;
    if (i === 1 && groups[i] === 1) {
      words += 'Bin ';
    } else if (i > 0) {
      words += threeDigits(groups[i]) + ' ' + scales[i] + ' ';
    } else {
      words += threeDigits(groups[i]) + ' ';
    }
  }
  return words.trim();
}

function amountToTurkishWordsTL(amount) {
  amount = Number(amount) || 0;
  const lira = Math.floor(amount);
  const kurus = Math.round((amount - lira) * 100);
  let text = numberToTurkishWords(lira) + ' Türk Lirası';
  if (kurus > 0) text += ' ' + numberToTurkishWords(kurus) + ' Kuruş';
  return text + ' Sadece';
}

function setSenetPrintPageSize(active) {
  let s = document.getElementById('dynamic-senet-page-size');
  if (!s) {
    s = document.createElement('style');
    s.id = 'dynamic-senet-page-size';
    document.head.appendChild(s);
  }
  s.textContent = active ? '@page { size: A4; margin: 15mm; }' : '';
}

// --- YASAL SENET KAĞIDI OLUŞTUR VE YAZDIR (kalıcı olarak sistemde de saklanır) ---
function printSenet(key) {
  if (currentRole !== 'admin') { alert("Bu işlem için yönetici yetkisi gerekir!"); return; }

  dbCustomerDebts.child(key).once('value', (snap) => {
    const d = snap.val();
    if (!d) { alert("Borç kaydı bulunamadı!"); return; }

    const senetAmount = Number(d.amount || 0);
    if (senetAmount <= 0) { alert("Geçerli bir borç tutarı bulunamadı."); return; }

    dbRoot.child('senet_counter').transaction(cur => (Number(cur) || 0) + 1, (err, committed, snapAfter) => {
      if (err || !committed) { alert("Senet numarası oluşturulamadı, lütfen tekrar deneyin."); return; }

      const seq = snapAfter.val();
      const now = new Date();
      const senetNo = now.getFullYear() + '-' + String(seq).padStart(6, '0');
      const duzenlemeTarihi = now.toLocaleDateString('tr-TR');
      const vadeTarihi = d.dueDate ? new Date(d.dueDate).toLocaleDateString('tr-TR') : (d.term || 'Belirsiz');

      const customerInfo = Object.values(customersData || {}).find(c => matchesCustomer(d, c.name, c.phone));
      const address = customerInfo ? (customerInfo.address || '') : '';
      const tckn = customerInfo ? (customerInfo.tckn || '') : '';
      const amountWords = amountToTurkishWordsTL(senetAmount);

      const printArea = document.getElementById('print-area');
      printArea.innerHTML = `
        <div style="width:100%; max-width:700px; margin:0 auto; padding:10mm; font-family:'Inter',Arial,sans-serif; background:#fff; color:#000; border:2px solid #000;">
          <div style="text-align:center; border-bottom:2px solid #000; padding-bottom:10px; margin-bottom:16px;">
            <h2 style="margin:0; font-size:20px; letter-spacing:1px;">BONO / SENET</h2>
            <p style="margin:4px 0; font-size:11px;">Senet No: <strong>${senetNo}</strong></p>
          </div>

          <table style="width:100%; font-size:13px; border-collapse:collapse; margin-bottom:16px;">
            <tr><td style="padding:4px 0; width:40%;"><strong>Düzenlenme Tarihi:</strong></td><td>${duzenlemeTarihi}</td></tr>
            <tr><td style="padding:4px 0;"><strong>Düzenlenme Yeri:</strong></td><td>Arsuz / Hatay</td></tr>
            <tr><td style="padding:4px 0;"><strong>Vade Tarihi:</strong></td><td>${vadeTarihi}</td></tr>
          </table>

          <div style="border:1px solid #000; padding:12px; margin-bottom:16px; text-align:center;">
            <div style="font-size:12px;">İŞBU SENET KARŞILIĞINDA</div>
            <div style="font-size:22px; font-weight:bold; margin:8px 0;">₺${formatMoney(senetAmount)}</div>
            <div style="font-size:13px; font-style:italic;">(${amountWords})</div>
          </div>

          <p style="font-size:13px; line-height:1.7; text-align:justify;">
            İşbu senet karşılığında yukarıda yazılı bedeli, vade tarihinde <strong>REYHANİ CAM HIRDAVAT</strong>'a veya emrine, kayıtsız şartsız ödeyeceğimi kabul, beyan ve taahhüt ederim.
          </p>

          <table style="width:100%; font-size:13px; border-collapse:collapse; margin:16px 0;">
            <tr><td style="padding:4px 0; width:30%;"><strong>Borçlu Adı Soyadı / Ünvanı:</strong></td><td>${d.customer}</td></tr>
            <tr><td style="padding:4px 0;"><strong>Telefon:</strong></td><td>${d.phone || '-'}</td></tr>
            <tr><td style="padding:4px 0;"><strong>Adres:</strong></td><td>${address || '-'}</td></tr>
            <tr><td style="padding:4px 0;"><strong>T.C. Kimlik No / Vergi No:</strong></td><td>${tckn || '-'}</td></tr>
          </table>

          <div style="display:flex; justify-content:space-between; margin-top:50px; font-size:13px;">
            <div style="text-align:center; width:45%;">
              <div style="border-top:1px solid #000; padding-top:6px;">Borçlu İmza</div>
            </div>
            <div style="text-align:center; width:45%;">
              <div style="border-top:1px solid #000; padding-top:6px;">Alacaklı — Reyhani Cam Hırdavat</div>
            </div>
          </div>

          <p style="font-size:9px; color:#555; margin-top:24px; text-align:center;">
            Bu belge dahili kayıt/tahsilat takibi amaçlı düzenlenmiştir. Kambiyo senedi olarak tam hukuki geçerlilik için Türk Ticaret Kanunu'nun aradığı şekil şartlarına ve ıslak imzaya dikkat ediniz.
          </p>
        </div>
      `;

      // Senet kaydını sistemde kalıcı olarak sakla (tekrar sorgulanabilmesi / kaybolmaması için)
      dbSenetler.push({
        debtKey: key,
        senetNo,
        customer: d.customer,
        phone: d.phone || '',
        amount: senetAmount,
        amountWords,
        issueDate: duzenlemeTarihi,
        dueDate: vadeTarihi,
        createdAt: now.toISOString(),
        createdBy: currentRole === 'admin' ? 'Yönetici' : 'Çalışan'
      });

      dbCustomerDebts.child(key).update({ senetNo: senetNo, senetDate: duzenlemeTarihi });

      setSenetPrintPageSize(true);
      document.body.className = 'printing-senet';
      setTimeout(() => {
        window.print();
        document.body.className = '';
        setSenetPrintPageSize(false);
        renderCustomerDebts();
        if (ahLedgerCustomerKey) renderCustomerLedger();
      }, 400);
    });
  });
}
