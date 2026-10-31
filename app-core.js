var APP_BUILD_CORE = '21';
var fisUndoStack; if (typeof fisUndoStack === 'undefined' || !fisUndoStack) fisUndoStack = []; // geri alma geçmişi (her dosyada güvenli tanım)
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
const dbBrandPriceHistory = dbRoot.child('brand_price_history'); // Marka bazlı toplu fiyat güncellemelerinin geçmişi — geri alma için
const dbBrandAssignHistory = dbRoot.child('brand_assign_history'); // Ürünleri toplu markaya atama geçmişi — geri alma için
const dbBarcodeCache = dbRoot.child('barcode_cache');
const dbCustomerDebts = dbRoot.child('customer_debts');
const dbCustomers = dbRoot.child('customers');
const dbSenetler = dbRoot.child('senetler');
const dbCatalogPdfs = dbRoot.child('catalog_pdfs');
const dbCatalogMeta = dbRoot.child('catalog_meta');
const dbPipeTypes = dbRoot.child('pipe_types');
const dbCatalogAiHistory = dbRoot.child('catalog_ai_history'); // AI ile yapılan her katalog okuma/kaydetme işleminin geçmişi — toplu geri alma için

const DEFAULT_BRANDS = ["BMS", "Kale", "Ege Yıldız", "İzeltaş", "RTRMAX", "Bosch", "Lider", "Bahco", "Filli Boya", "Avon", "Filli Boya", "Marshall", "Kalde"];
let brandSeedChecked = false;

let productsData = {};
let barcodeCacheData = {}; // dbBarcodeCache'in hafızadaki kopyası — satış sepeti gibi ekranlarda barkodu anında (beklemeden) çözebilmek için
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
let catalogPdfsData = {};   // { brandKey: { pdfId: {name, brand, data, sizeKB, uploadedAt, uploadedBy} } }
let catalogMetaData = {};   // { itemId: {name, brand, barcode, catalogPrice, note, photo, createdAt, createdBy} }
let pipeTypesData = {};     // { tipId: {name, [boyutId]: {size, price, cost, vat, profit, discount, stock, brand, updatedAt}} }
let catalogAiHistoryData = {}; // { historyId: {brand, fileName, processedAt, touchedSizes:[{tipId,tipName,boyutId,productCode}]} }

let html5QrcodeScanner = null;
let currentRole = 'guest';
let cart = JSON.parse(localStorage.getItem('reyhani_cart') || '[]'); // Sepet kalıcılığı: sayfa/oturum kapansa da sepet kaybolmasın
let cartPhotoReviewItems = []; // Borç kağıdı/not fotoğrafından AI ile okunan, onay bekleyen kalemler
let goodsReceiptCart = [];
var fisSlipInfo = null; // Fişten okunan eski bakiye / ara toplam / genel toplam bilgisi
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
// Çalışan cihaz bağlantısı: bu kodla açılan cihaz SADECE çalışan paneline girebilir.
// Depolama değeri: 'true' = yönetici+çalışan yetkili cihaz, 'staff' = yalnızca çalışan.
const STAFF_DEVICE_AUTH_HASH = "5ba805ecb97573c1ea6ee102459f8510b3567c781a78c301b69bb3a7ff945ad0";

function getDeviceAuthLevel() {
  try {
    const v = localStorage.getItem(DEVICE_AUTH_STORAGE_KEY);
    if (v === 'true') return 'admin';
    if (v === 'staff') return 'staff';
    return null;
  } catch (e) { return null; }
}

function isDeviceAuthorized() {
  return getDeviceAuthLevel() !== null;
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
    } else if (hash === STAFF_DEVICE_AUTH_HASH) {
      // Yönetici yetkili bir cihazı çalışan seviyesine DÜŞÜRME.
      if (getDeviceAuthLevel() !== 'admin') {
        localStorage.setItem(DEVICE_AUTH_STORAGE_KEY, 'staff');
      }
      // Bağlantıyı açan kişi doğrudan çalışan olarak girer (yönetici değil).
      if (currentRole === 'guest') {
        currentRole = 'staff';
        await ensureDeviceNamed();
        updateAuthUI();
        showToast("Çalışan girişi başarılı!");
      }
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

// ============================================================
// CİHAZ KİMLİĞİ (İşlem Takibi İçin) — Cihaz Yetkilendirme (güvenlik) ile
// KARIŞTIRILMAMALI, o ayrı bir sistem. Burada amaç: her tarayıcıya kalıcı,
// benzersiz bir kimlik verip, ilk girişte kullanıcıdan bu cihaza bir isim
// vermesini istemek (örn. "İşyeri Bilgisayarı", "Ahmet - Telefon"). Bu isim,
// o cihazdan yapılan her fiyat/stok/kayıt güncellemesinde "kim tarafından"
// bilgisine otomatik eklenir — böylece hangi işlemin hangi cihazdan, ne
// zaman yapıldığı görülebilir (bkz. Ana Sayfa > Son Güncellenenler).
// ============================================================
const dbDevices = dbRoot.child('devices');
let devicesData = {};
let currentDeviceId = null;
let currentDeviceName = null;
let currentDeviceIP = null; // Bu cihazın gerçek genel (public) IP adresi — girişte otomatik alınır

// ---------- SORUN / HATA BİLDİRİM SİSTEMİ (AI destekli) ----------
// Kullanıcı sorunu kendi cümleleriyle yazar → yapay zeka bunu düzgün, net bir
// metne çevirir → yönetici panelinde "Talepler" olarak görünür. Yönetici
// çözünce, bildiren cihaza site üzerinden otomatik bilgi gider.
const dbIssueReports = dbRoot.child('issue_reports');
let issueReportsData = {};
let issueReportsLoaded = false;     // Firebase'den veri en az bir kez geldi mi? ("boş" ile "henüz yüklenmedi" ayrımı için
let issueReportSeenIds = new Set(); // bu oturumda zaten gösterdiğimiz "çözüldü" uyarıları tekrar açılmasın
let issueAdminDismissedCount = 0;   // yönetici üstteki kırmızı uyarı çubuğunu kapattığında, aynı sayıda açık talep için tekrar açılmasın
let pendingIssueReport = null;      // AI'nin ürettiği metin, kullanıcı onaylayana kadar burada bekler

function getOrCreateDeviceId() {
  try {
    let id = localStorage.getItem('reyhani_device_id');
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : 'dev-' + Date.now() + '-' + Math.random().toString(36).slice(2));
      localStorage.setItem('reyhani_device_id', id);
    }
    return id;
  } catch (e) {
    return 'dev-unknown-' + Math.random().toString(36).slice(2);
  }
}

// Cihazın kendi yazdığı isimle SINIRLI kalmamak için, bu cihazın bağlandığı
// ağın gerçek genel IP adresini otomatik olarak alır (ücretsiz, anahtarsız
// bir dış servisten). Aynı mağazadaki cihazlar aynı IP'yi paylaşabilir
// (aynı modem/router), ama farklı bir yerden (ev, mobil veri, başka şube)
// yapılan HER işlem farklı bir IP ile anında ayırt edilir — isim ise
// kullanıcı tarafından yazıldığı için tek başına güvenilir değildir.
async function fetchPublicIP() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); // IP servisi yavaş/erişilemezse girişi kilitleme
    const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
    clearTimeout(timeoutId);
    const data = await res.json();
    currentDeviceIP = data && data.ip ? data.ip : null;
  } catch (e) {
    currentDeviceIP = null; // İnternet erişimi/CORS engeli/zaman aşımı olursa sessizce yoksay
  }
  return currentDeviceIP;
}

// Tarayıcının kendi bildirdiği işletim sistemi/tarayıcı bilgisinden basit bir
// etiket üretir (örn. "Windows - Chrome", "iPhone/iPad - Safari"). IP ile
// birlikte kullanıldığında "hangi bilgisayardan" sorusuna çok daha net bir
// cevap verir.
function getDeviceEnvironmentLabel() {
  const ua = navigator.userAgent || '';
  let os = 'Bilinmeyen Cihaz';
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iPhone/iPad';
  else if (/Macintosh|Mac OS/i.test(ua)) os = 'Mac';
  else if (/Linux/i.test(ua)) os = 'Linux';
  let browser = '';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\//i.test(ua)) browser = 'Opera';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua)) browser = 'Safari';
  return browser ? `${os} - ${browser}` : os;
}

// Girişten hemen sonra çağrılır: bu cihazın daha önce verilmiş bir adı var mı
// kontrol eder (önce bu tarayıcının kendi hafızası, yoksa sistemdeki kayıt),
// hâlâ yoksa kullanıcıya bir isim sorar ve kaydeder.
async function ensureDeviceNamed() {
  currentDeviceId = getOrCreateDeviceId();
  try { currentDeviceName = localStorage.getItem('reyhani_device_name') || null; }
  catch (e) { currentDeviceName = null; }

  // Gerçek IP adresini ve cihaz türünü HER girişte tazele — bu bilgiler
  // kullanıcı tarafından değiştirilemez, sadece isim değiştirilebilir.
  await fetchPublicIP();
  const envLabel = getDeviceEnvironmentLabel();

  if (!currentDeviceName) {
    try {
      const snap = await dbDevices.child(currentDeviceId).once('value');
      const existing = snap.val();
      if (existing && existing.name) {
        currentDeviceName = existing.name;
        try { localStorage.setItem('reyhani_device_name', currentDeviceName); } catch (e) {}
      }
    } catch (e) { /* yoksay, aşağıda soracağız */ }
  }

  if (!currentDeviceName) {
    const name = prompt("Bu cihazdan sisteme ilk kez giriş yapılıyor.\n\nBu cihaza bir isim verin (örn. 'İşyeri Bilgisayarı', 'Ahmet - Telefon') — bundan sonra yaptığınız her güncellemede bu isim, gerçek IP adresiniz ve cihaz türünüz (Windows/Android/iPhone vb.) birlikte kaydedilecek:");
    currentDeviceName = (name || '').trim() || 'İsimsiz Cihaz';
    try { localStorage.setItem('reyhani_device_name', currentDeviceName); } catch (e) {}
    await dbDevices.child(currentDeviceId).set({
      name: currentDeviceName,
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      lastRole: currentRole,
      lastIP: currentDeviceIP,
      env: envLabel
    });
  } else {
    dbDevices.child(currentDeviceId).update({ lastSeenAt: new Date().toISOString(), lastRole: currentRole, lastIP: currentDeviceIP, env: envLabel });
  }

  updateDeviceBadge();
}

// Rol + cihaz adı + gerçek IP adresini birleştiren TEK merkezi fonksiyon —
// sistemdeki her "kim yaptı" alanı (lastUpdatedBy, createdBy, uploadedBy,
// processedBy...) bunu kullanır. Bu fonksiyonu güncellemek, sistemdeki HER
// modüldeki kaydı otomatik olarak IP adresiyle birlikte gösterir hâle getirir.
function getActorLabel() {
  const role = currentRole === 'admin' ? 'Yönetici' : 'Çalışan';
  let label = role;
  if (currentDeviceName) label += ` (${currentDeviceName})`;
  if (currentDeviceIP) label += ` [IP: ${currentDeviceIP}]`;
  return label;
}

function updateDeviceBadge() {
  const badge = document.getElementById('device-badge');
  const nameEl = document.getElementById('device-badge-name');
  if (!badge || !nameEl) return;
  if (currentRole !== 'guest' && currentDeviceName) {
    nameEl.textContent = currentDeviceName + (currentDeviceIP ? ' · ' + currentDeviceIP : '');
    badge.style.display = 'inline-flex';
  } else {
    badge.style.display = 'none';
  }
}

// ============================================================
// SORUN / HATA BİLDİRİM SİSTEMİ — AI destekli
// ============================================================

// Yönetici rozetini ve üstteki kırmızı uyarı çubuğunu günceller. Açık talep
// sayısı, yönetici en son kapattığı sayıdan FAZLAYSA çubuk tekrar açılır —
// böylece hem girişte hem de yeni bir talep geldiğinde otomatik uyarı verilir.
function updateIssueAdminBadge() {
  const btn = document.getElementById('issue-admin-btn');
  const badge = document.getElementById('issue-admin-badge');
  const banner = document.getElementById('issue-alert-banner');
  const bannerText = document.getElementById('issue-alert-banner-text');
  if (!btn || !badge) return;

  if (currentRole !== 'admin') {
    btn.style.display = 'none';
    if (banner) banner.style.display = 'none';
    return;
  }
  btn.style.display = 'inline-flex';

  const openCount = Object.values(issueReportsData).filter(r => r.status !== 'Çözüldü').length;
  badge.textContent = openCount;
  badge.style.display = openCount > 0 ? 'inline-block' : 'none';

  if (banner && bannerText) {
    if (openCount > 0 && openCount > issueAdminDismissedCount) {
      bannerText.textContent = `${openCount} adet çözülmemiş kullanıcı bildirimi var!`;
      banner.style.display = 'flex';
    } else if (openCount === 0) {
      banner.style.display = 'none';
      issueAdminDismissedCount = 0;
    }
  }
}

// Yönetici üstteki uyarı çubuğunu kapatır (paneli açmadan "görüldü" sayar).
function dismissIssueAlertBanner() {
  const banner = document.getElementById('issue-alert-banner');
  if (banner) banner.style.display = 'none';
  issueAdminDismissedCount = Object.values(issueReportsData).filter(r => r.status !== 'Çözüldü').length;
}

// Bu cihazdan gönderilmiş, yönetici tarafından çözülmüş ama henüz
// görülmemiş bir talep var mı diye bakar; varsa kullanıcıya açık bir
// mesajla bildirir ki işlemine güvenle devam edebilsin.
function checkIssueReportsForCurrentDevice() {
  if (!currentDeviceId) return;
  Object.entries(issueReportsData).forEach(([id, r]) => {
    if (r.deviceId === currentDeviceId && r.status === 'Çözüldü' && !r.seenByReporter && !issueReportSeenIds.has(id)) {
      issueReportSeenIds.add(id);
      showIssueResolvedBanner(r);
      dbIssueReports.child(id).update({ seenByReporter: true });
    }
  });
}

function showIssueResolvedBanner(report) {
  alert(
    "✅ Bildirdiğiniz sorun çözüldü!\n\n" +
    "Bildiriminiz: \"" + (report.aiText || report.rawText || '') + "\"\n\n" +
    (report.resolutionNote ? ("Yönetici notu: " + report.resolutionNote + "\n\n") : "") +
    "İşleminize güvenle devam edebilirsiniz."
  );
}

function openIssueReportModal() {
  if (currentRole === 'guest') { alert("Bu özelliği kullanmak için giriş yapmalısınız."); return; }
  document.getElementById('issue-report-raw').value = '';
  document.getElementById('issue-report-step-1').style.display = 'block';
  document.getElementById('issue-report-step-2').style.display = 'none';
  const previewEl = document.getElementById('issue-report-ai-preview');
  previewEl.style.display = 'none';
  previewEl.textContent = '';
  document.getElementById('issue-report-ai-status').textContent = '';
  const sendBtn = document.getElementById('issue-report-send-btn');
  sendBtn.disabled = true;
  sendBtn.textContent = '✅ Bu Şekilde Gönder';
  pendingIssueReport = null;
  document.getElementById('issue-report-modal').style.display = 'flex';
}

function closeIssueReportModal() {
  document.getElementById('issue-report-modal').style.display = 'none';
}

function backToIssueReportEdit() {
  document.getElementById('issue-report-step-1').style.display = 'block';
  document.getElementById('issue-report-step-2').style.display = 'none';
}

// Kullanıcının yazdığı ham metni, sistemin diğer yerlerinde kullanılan AYNI
// yapay zeka modeliyle (Gemini) düzgün, profesyonel bir metne çevirir.
async function submitIssueReportToAI() {
  const rawText = (document.getElementById('issue-report-raw').value || '').trim();
  if (!rawText) { alert("Lütfen yaşadığınız sorunu kısaca yazın."); return; }

  let apiKey = getGeminiApiKey();
  if (!apiKey) {
    apiKey = prompt("Bu özelliği kullanabilmek için Google API Anahtarınızı girmelisiniz:");
    if (!apiKey) return;
    localStorage.setItem('gemini_api_key', apiKey.trim());
  }

  document.getElementById('issue-report-step-1').style.display = 'none';
  document.getElementById('issue-report-step-2').style.display = 'block';
  const statusEl = document.getElementById('issue-report-ai-status');
  const previewEl = document.getElementById('issue-report-ai-preview');
  const sendBtn = document.getElementById('issue-report-send-btn');
  statusEl.style.color = '#F59E0B';
  statusEl.textContent = '⏳ Yapay zeka mesajınızı düzenliyor...';
  previewEl.style.display = 'none';
  sendBtn.disabled = true;

  try {
    const apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=" + encodeURIComponent(apiKey.trim());
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: "Sen, bir hırdavat/nalburiye/cam mağazasının Firebase tabanlı stok-satış takip web uygulamasında çalışan kıdemli bir yazılım mühendisi/QA uzmanısın. Sistemin ana modülleri şunlar: Stok Listesi (ürün arama/listeleme), Satış Sepeti (ürün arayıp sepete ekleme, barkod okutma), Malzeme Fişi (toptancıdan mal girişi), Borç/Veresiye, Katalog (PDF/AI ile ürün okuma), Kasa/Z Raporu, Görevler, Cihaz Takibi. Bir çalışan/kullanıcı, yaşadığı bir sorunu aşağıda GÜNLÜK KONUŞMA DİLİYLE, teknik olmayan şekilde anlattı. Bunu, işi bu uygulamanın kodunu düzeltmek olan bir yazılım mühendisine (bir sonraki adımda bu metni doğrudan ona iletecek olan yöneticiye) aktarılacak YAPILANDIRILMIŞ bir TEKNİK HATA RAPORUNA (bug report) dönüştür. ŞU BAŞLIKLARI KULLAN (başlık bulunamıyorsa o satırı 'Belirtilmemiş' yaz, uydurma): '🔧 Başlık:' (sorunun 5-8 kelimelik özeti) / '📍 Etkilenen Modül (tahmini):' (yukarıdaki modül listesinden kullanıcının anlattığına en çok uyanı seç) / '👤 Kullanıcının Anlattığı Durum:' (kullanıcının söylediklerini sadeleştirip birebir, abartmadan ve uydurma detay EKLEMEDEN aktar) / '🎯 Beklenen Davranış:' (normalde ne olması gerekiyordu) / '❌ Gerçekleşen Davranış:' (bunun yerine ne oldu) / '🔁 Tekrar Üretme Adımları:' (kullanıcının anlattığından çıkarabildiğin kadarıyla numaralı adımlar; çıkaramıyorsan 'Kullanıcı net adım belirtmedi' yaz) / '💡 Olası Teknik Neden (TAHMİN - doğrulanmadı):' (bir yazılım mühendisinin bu tür bir semptomdan yola çıkarak düşüneceği, kodla ilgili 1-2 makul hipotez; örn. 'arama/eşleştirme fonksiyonu girilen değeri normalize etmiyor olabilir', 'ilgili Firebase yazma işlemi sessizce başarısız oluyor olabilir', 'bu alan responsive/mobil tarayıcıda farklı davranıyor olabilir' gibi GENEL YAZILIM MÜHENDİSLİĞİ KALIPLARI kullan; KESİN TEŞHİS KOYMA, bunun bir varsayım olduğunu belirt). KURALLAR: 1) Kullanıcının belirtmediği hiçbir somut bilgiyi (hata kodu, saat, ürün adı vb.) UYDURMA. 2) 'Olası Teknik Neden' kısmı HER ZAMAN bir tahmin olduğu açık olacak şekilde yazılmalı. 3) SADECE yukarıdaki başlıklı metni yaz; başka hiçbir açıklama, giriş cümlesi, selamlama veya markdown (** gibi) işareti ekleme, başlıkları olduğu gibi kullan. Çalışanın yazdığı orijinal metin: \"" + rawText.replace(/"/g, "'") + "\""
          }]
        }]
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    const aiText = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text)
      ? data.candidates[0].content.parts[0].text.trim()
      : null;
    if (!aiText) throw new Error("Yapay zeka bir yanıt üretemedi.");

    pendingIssueReport = { rawText, aiText };
    statusEl.style.color = '#10B981';
    statusEl.textContent = '✅ Mesajınız hazır. Göndermeden önce kontrol edebilirsiniz:';
    previewEl.style.display = 'block';
    previewEl.textContent = aiText;
    sendBtn.disabled = false;
  } catch (err) {
    statusEl.style.color = '#EF4444';
    statusEl.textContent = '❌ Düzenlenemedi: ' + (typeof friendlyAIErrorMessage === 'function' ? friendlyAIErrorMessage(err) : err.message);
    // Yapay zeka başarısız olsa bile kullanıcı mağdur kalmasın diye ham metni
    // olduğu gibi göndermeyi teklif ediyoruz.
    pendingIssueReport = { rawText, aiText: rawText };
    previewEl.style.display = 'block';
    previewEl.textContent = rawText;
    sendBtn.disabled = false;
    sendBtn.textContent = '✅ Düzenlenmeden Gönder';
  }
}

// AI'nin hazırladığı (veya ham) metni, hangi cihazdan/kimden geldiği bilgisiyle
// birlikte "Talepler" kutusuna gönderir.
function finalizeIssueReportSend() {
  if (!pendingIssueReport) return;
  // Firebase, bir alanı "undefined" olan nesneleri SESSİZCE DEĞİL, senkron bir
  // hatayla reddeder (ör. cihaz kimliği henüz oluşmamışsa) — bu da kaydın hiç
  // atılmamasına, kullanıcının ise bunu fark etmemesine yol açabilir. Bu yüzden
  // her alan için güvenli bir yedek değer veriyor ve işlemi try/catch içine alıyoruz.
  const payload = {
    rawText: pendingIssueReport.rawText || '',
    aiText: pendingIssueReport.aiText || pendingIssueReport.rawText || '',
    reportedBy: getActorLabel() || 'Bilinmeyen Kullanıcı',
    deviceId: currentDeviceId || 'bilinmeyen-cihaz',
    reportedAt: new Date().toISOString(),
    status: 'Açık',
    seenByReporter: false
  };

  try {
    dbIssueReports.push(payload, (err) => {
      if (err) {
        console.error('Sorun bildirimi kaydedilemedi:', err);
        alert("❌ Bildirim gönderilemedi: " + err.message + "\n\nLütfen internet bağlantınızı kontrol edip tekrar deneyin.");
        return;
      }
      closeIssueReportModal();
      showToast("✅ Bildiriminiz iletildi, en kısa sürede incelenecektir.");
    });
  } catch (err) {
    // push() senkron olarak hata fırlatırsa (ör. geçersiz veri), kullanıcıyı
    // sessizce yarı yolda bırakmamak için burada da yakalıyoruz.
    console.error('Sorun bildirimi gönderilirken beklenmeyen hata:', err);
    alert("❌ Bildirim gönderilirken beklenmeyen bir hata oluştu: " + (err.message || err) + "\n\nSayfayı yenileyip tekrar deneyin.");
  }
}

function openIssueAdminModal() {
  if (currentRole !== 'admin') { alert("Yetkiniz yok!"); return; }
  dismissIssueAlertBanner();
  if (typeof renderIssueAdminList === 'function') renderIssueAdminList();
  document.getElementById('issue-admin-modal').style.display = 'flex';
}

function closeIssueAdminModal() {
  document.getElementById('issue-admin-modal').style.display = 'none';
}

// Yönetici bir talebi çözdüğünde: durumu günceller, isteğe bağlı bir not
// ekler; bildiren cihaz sisteme girdiğinde (veya hâlâ açıksa anında) bunu
// "işlem tamamlandı" mesajıyla görür.
function resolveIssueReport(id) {
  if (currentRole !== 'admin') { alert("Yetkiniz yok!"); return; }
  const note = prompt("İsteğe bağlı: çözüm hakkında kısa bir not ekleyin (bildiren kişi bu notu görecek):", "");
  if (note === null) return; // vazgeçildi
  try {
    dbIssueReports.child(id).update({
      status: 'Çözüldü',
      resolvedBy: getActorLabel() || 'Bilinmeyen Kullanıcı',
      resolvedAt: new Date().toISOString(),
      resolutionNote: note.trim() || null,
      seenByReporter: false
    }, (err) => {
      if (err) { console.error('Talep güncellenemedi:', err); alert("Güncellenemedi: " + err.message); return; }
      showToast("Bildirim çözüldü olarak işaretlendi.");
    });
  } catch (err) {
    console.error('Talep güncellenirken beklenmeyen hata:', err);
    alert("Güncellenirken beklenmeyen bir hata oluştu: " + (err.message || err));
  }
}

// Yöneticinin, AI'nin hazırladığı teknik raporu tek tıkla kopyalayıp bir
// geliştiriciye veya yapay zekaya (ör. Claude sohbetine) yapıştırabilmesi için.
function copyIssueReportText(id) {
  const r = issueReportsData[id];
  if (!r) return;
  const text = r.aiText || r.rawText || '';
  const finish = () => showToast("📋 Rapor metni kopyalandı — doğrudan yapıştırabilirsiniz.");
  const fail = () => {
    // Pano erişimi engellendiyse (izin/http vb.) kullanıcı en azından metni görüp elle kopyalayabilsin.
    prompt("Otomatik kopyalama başarısız oldu. Aşağıdaki metni elle kopyalayın:", text);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(finish).catch(fail);
  } else {
    fail();
  }
}

function renameCurrentDevice() {
  if (currentRole === 'guest' || !currentDeviceId) return;
  const name = prompt("Bu cihazın sistemdeki adını değiştirin:", currentDeviceName || '');
  if (name === null) return;
  currentDeviceName = name.trim() || 'İsimsiz Cihaz';
  try { localStorage.setItem('reyhani_device_name', currentDeviceName); } catch (e) {}
  dbDevices.child(currentDeviceId).update({ name: currentDeviceName, lastSeenAt: new Date().toISOString() });
  updateDeviceBadge();
  showToast("Cihaz adı güncellendi: " + currentDeviceName);
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
  // Bozuk kayıtlara karşı koruma: obje olmayan kayıtları at, "code" alanı eksik olanlara Firebase anahtarını yaz
  Object.keys(productsData).forEach(k => {
    const p = productsData[k];
    if (!p || typeof p !== 'object') { delete productsData[k]; return; }
    if (!p.code) p.code = k;
  });
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
           ${rec.processedBy ? `<div style="font-size:10px; color:var(--info); margin-top:6px;">📱 İşlemi Yapan: <b>${rec.processedBy}</b></div>` : ''}
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
  if (typeof populateGridBrandFilter === 'function') populateGridBrandFilter();
  if (typeof renderGrid === 'function' && document.getElementById('brand-filter')) renderGrid();
  if (!brandSeedChecked) {
    brandSeedChecked = true;
    maybeSeedDefaultBrands();
  }
});

dbCatalogPdfs.on('value', (snapshot) => {
  catalogPdfsData = snapshot.val() || {};
  if (document.getElementById('tab-katalog')?.classList.contains('active') && typeof renderBrandCatalogList === 'function') renderBrandCatalogList();
});

dbCatalogMeta.on('value', (snapshot) => {
  catalogMetaData = snapshot.val() || {};
  if (document.getElementById('tab-katalog')?.classList.contains('active') && typeof renderSingleReceipts === 'function') renderSingleReceipts();
});

dbPipeTypes.on('value', (snapshot) => {
  pipeTypesData = snapshot.val() || {};
  if (document.getElementById('tab-katalog')?.classList.contains('active') && typeof renderPipeTypesList === 'function') renderPipeTypesList();
});

dbCatalogAiHistory.on('value', (snapshot) => {
  catalogAiHistoryData = snapshot.val() || {};
  if (document.getElementById('tab-katalog')?.classList.contains('active') && typeof renderAiHistoryList === 'function') renderAiHistoryList();
});

dbDevices.on('value', (snapshot) => {
  devicesData = snapshot.val() || {};
  if (typeof renderDevicesList === 'function') renderDevicesList();
});

dbBarcodeCache.on('value', (snapshot) => {
  barcodeCacheData = snapshot.val() || {};
});

dbIssueReports.on('value', (snapshot) => {
  issueReportsData = snapshot.val() || {};
  issueReportsLoaded = true;
  if (typeof renderIssueAdminList === 'function') renderIssueAdminList();
  updateIssueAdminBadge();
  checkIssueReportsForCurrentDevice();
}, (err) => {
  // Firebase izin/bağlantı hatası olursa sessizce kaybolmasın — konsola ve
  // (panel açıksa) ekrana yazdır ki "neden boş görünüyor" sorusu kaybolmasın.
  console.error('Sorun bildirimleri okunamadı:', err);
  issueReportsLoaded = true;
  const box = document.getElementById('issue-admin-list');
  if (box) box.innerHTML = `<p style="font-size:12px; color:var(--rust); text-align:center; padding:10px 0;">⚠️ Bildirimler yüklenemedi: ${err.message || err}</p>`;
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
            ${rep.createdBy ? `<div style="font-size:10px; color:var(--info); margin-top:2px;">📱 ${rep.createdBy}</div>` : ''}
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
              ${order.processedBy ? `<div style="font-size:10px; color:var(--info); margin-top:2px;">📱 ${order.processedBy}</div>` : ''}
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
  dbMovements.child(dateStr).push({ time: timeStr, code: code, name: name, change: change, type: type, by: getActorLabel() });
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
      alert("Bu cihazda giriş aktif değil.");
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
    // Sadece çalışan bağlantısıyla yetkilendirilmiş cihazlarda yönetici şifresi KABUL EDİLMEZ.
    if(hash === ADMIN_HASH && getDeviceAuthLevel() === 'admin') { currentRole = 'admin'; showToast("Yönetici girişi başarılı!"); }
    else if(hash === STAFF_HASH) { currentRole = 'staff'; showToast("Çalışan girişi başarılı!"); }
    else { alert("Hatalı Şifre!"); return; }
    await ensureDeviceNamed();
  } else {
    currentRole = 'guest'; showToast("Çıkış yapıldı.");
    updateDeviceBadge();
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
  const importCleanupBtn = document.getElementById('import-cleanup-btn');
  if(importCleanupBtn) importCleanupBtn.style.display = (currentRole === 'admin') ? 'inline-block' : 'none';
  const devicesBtn = document.getElementById('devices-btn');
  if(devicesBtn) devicesBtn.style.display = (currentRole === 'admin') ? 'inline-block' : 'none';
  updateDeviceBadge();

  // Sorun/Hata Bildir: giriş yapmış (misafir olmayan) herkes görebilir.
  const issueReportBtn = document.getElementById('issue-report-btn');
  if (issueReportBtn) issueReportBtn.style.display = (currentRole === 'admin' || currentRole === 'staff') ? 'inline-flex' : 'none';
  // Talepler paneli ve giriş uyarısı: sadece yönetici görür.
  if (typeof updateIssueAdminBadge === 'function') updateIssueAdminBadge();
  const canAccessKatalog = (currentRole === 'admin' || currentRole === 'staff');
  const katalogBtn = document.getElementById('nav-katalog-btn');
  if(katalogBtn) katalogBtn.style.display = canAccessKatalog ? 'block' : 'none';
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

// Satış sepetindeki ile AYNI canlı öneri listesi (native <datalist> yerine) —
// kod/barkod/isim farkları artık burada da "ürün bulunamadı" hatası vermiyor.
function renderBorcCartProductSuggestions() {
  const input = document.getElementById('borc-cart-product');
  const box = document.getElementById('borc-cart-product-suggestions');
  if (!input || !box) return;
  const raw = input.value.trim();

  if (!raw) { box.style.display = 'none'; box.innerHTML = ''; return; }

  const results = [];
  if (productsData[raw]) results.push(productsData[raw]);

  if (typeof findSimilarProducts === 'function') {
    findSimilarProducts(raw, 8).forEach(m => {
      if (!results.some(p => p.code === m.product.code)) results.push(m.product);
    });
  }

  if (results.length < 8 && raw.length >= 2) {
    Object.values(productsData).forEach(p => {
      if (results.length >= 8) return;
      if (p.code && p.code.toLowerCase().includes(raw.toLowerCase()) && !results.some(r => r.code === p.code)) {
        results.push(p);
      }
    });
  }

  if (results.length === 0) {
    box.style.display = 'block';
    box.innerHTML = `<div style="padding:10px; font-size:12px; color:var(--steel);">Eşleşen ürün bulunamadı. "Sepete Ekle"ye basarsanız barkod önbelleği de ayrıca kontrol edilecek.</div>`;
    return;
  }

  box.style.display = 'block';
  box.innerHTML = results.slice(0, 8).map(p => `
    <div style="padding:8px 10px; cursor:pointer; border-top:1px dashed var(--steel-line); font-size:12px;" onmousedown="selectBorcCartProduct('${p.code}')">
      <strong>${p.name}</strong> <span style="color:var(--steel); font-family:'IBM Plex Mono';">(${p.code})</span>
      <br><small style="color:var(--steel);">Stok: ${p.qty || 0} ${p.unit || 'Adet'} · ₺${formatMoney(p.price || 0)}</small>
    </div>
  `).join('');
}

function selectBorcCartProduct(code) {
  const input = document.getElementById('borc-cart-product');
  const box = document.getElementById('borc-cart-product-suggestions');
  const p = productsData[code];
  if (!input || !p) return;
  input.value = `${p.code} - ${p.name}`;
  if (box) { box.style.display = 'none'; box.innerHTML = ''; }
  const qtyInput = document.getElementById('borc-cart-qty');
  if (qtyInput) { qtyInput.focus(); qtyInput.select(); }
}

document.addEventListener('click', function(e) {
  const box = document.getElementById('borc-cart-product-suggestions');
  const input = document.getElementById('borc-cart-product');
  if (box && input && box.style.display !== 'none' && !box.contains(e.target) && e.target !== input) {
    box.style.display = 'none';
  }
});

function addToBorcCart() {
  if (currentRole !== 'admin' && currentRole !== 'staff') {
    alert("Bu işlem için yetkiniz yok!");
    return;
  }

  const inputEl = document.getElementById('borc-cart-product');
  const inputVal = inputEl.value;
  const qty = parseFloat(document.getElementById('borc-cart-qty').value);

  if (!inputVal || isNaN(qty) || qty <= 0) {
    alert("Lütfen geçerli bir ürün ve miktar girin.");
    return;
  }

  // Satış sepetindeki ile AYNI merkezi çözümleyici: tam kod → "KOD - İsim" →
  // barkod önbelleği → bulanık isim arama → kısmi kod eşleşmesi.
  const p = (typeof resolveProductInput === 'function') ? resolveProductInput(inputVal) : productsData[inputVal.split(' - ')[0].trim()];

  if (!p) {
    const looksLikeBarcode = /^\d{6,}$/.test(inputVal.trim());
    alert(
      looksLikeBarcode
        ? `"${inputVal.trim()}" barkodu stoktaki hiçbir ürünle eşleşmedi.\n\nBu ürün sisteme farklı bir kodla kaydedilmiş olabilir. Ürünü isim yazarak aramayı deneyin.`
        : `"${inputVal.trim()}" için stokta eşleşen bir ürün bulunamadı.\n\nÜrün adının birkaç harfini yazıp açılan öneri listesinden seçmeyi deneyin.`
    );
    return;
  }

  const code = p.code;

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

  inputEl.value = '';
  document.getElementById('borc-cart-qty').value = '1';
  const box = document.getElementById('borc-cart-product-suggestions');
  if (box) { box.style.display = 'none'; box.innerHTML = ''; }
  renderBorcCart();
  showToast(`"${p.name}" borç sepetine eklendi!`);
  inputEl.focus();
}

// ============================================================
// BORÇ KAĞIDI / SİPARİŞ NOTU FOTOĞRAFINDAN AI İLE BORÇ SEPETİNE AKTARMA
// Satış sepetindeki foto-okuma sistemiyle BİREBİR AYNI motor; tek fark,
// sonuçların cart yerine borcCart'a eklenmesi.
// ============================================================
let borcCartPhotoReviewItems = [];

async function processBorcCartPhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (currentRole !== 'admin' && currentRole !== 'staff') {
    alert("Bu işlem için yetkiniz yok.");
    event.target.value = '';
    return;
  }

  let apiKey = getGeminiApiKey();
  if (!apiKey) {
    apiKey = prompt("Bu özelliği kullanabilmek için Google API Anahtarınızı girmelisiniz:");
    if (!apiKey) { event.target.value = ''; return; }
    localStorage.setItem('gemini_api_key', apiKey.trim());
  }

  const statusEl = document.getElementById('borc-cart-photo-status');
  const reviewBox = document.getElementById('borc-cart-photo-review');
  if (statusEl) {
    statusEl.style.display = 'block';
    statusEl.style.color = '#F59E0B';
    statusEl.innerHTML = '⏳ Fotoğraf inceleniyor...';
  }
  borcCartPhotoReviewItems = [];
  if (reviewBox) reviewBox.style.display = 'none';

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
            { text: "Görseldeki, bir hırdavat/nalburiye/cam mağazası müşterisine ait EL YAZISI veya BASILI bir BORÇ KAĞIDI / SİPARİŞ NOTUDUR. Üzerindeki HER ürün satırını tespit et: ürün adı (name — varsa ölçüsünü/ebadını da ismin içine dahil et, örn. 'Dirsek 50'), ve miktarı (qty — belirtilmemişse 1 yaz). Fiyat varsa dikkate ALMA, sadece ürün adı ve miktarı çıkar. El yazısı bozuk/belirsizse bağlamdan en mantıklı hırdavat/nalburiye/cam ürünü adını tahmin et ama tamamen alakasız bir şey uydurma. SADECE geçerli bir JSON dizisi döndür, başka hiçbir açıklama veya markdown işareti ekleme. Örnek: [{\"name\": \"Dirsek 50\", \"qty\": 3}, {\"name\": \"Silikon Beyaz\", \"qty\": 1}]" },
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

    let textResult = data.candidates[0].content.parts[0].text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    const parsedItems = JSON.parse(textResult);
    if (!Array.isArray(parsedItems) || parsedItems.length === 0) throw new Error("Notta ürün bulunamadı.");

    borcCartPhotoReviewItems = parsedItems.map(item => {
      const aiName = (item.name || '').trim();
      const qty = parseFloat(item.qty) || 1;
      const { product, score } = aiName ? findBestProductMatch(aiName) : { product: null, score: 0 };
      const isMatch = !!(product && score >= FIS_MATCH_THRESHOLD);
      return {
        aiName,
        qty,
        matchedCode: isMatch ? product.code : null,
        matchedName: isMatch ? product.name : null,
        matchedPrice: isMatch ? (product.price || 0) : 0,
        matchedStock: isMatch ? (product.qty || 0) : 0,
        include: isMatch,
        matched: isMatch
      };
    }).filter(it => it.aiName);

    renderBorcCartPhotoReview();

    const matchedCount = borcCartPhotoReviewItems.filter(i => i.matched).length;
    const unmatchedCount = borcCartPhotoReviewItems.length - matchedCount;
    if (statusEl) {
      statusEl.style.color = '#10B981';
      statusEl.innerHTML = `✅ ${borcCartPhotoReviewItems.length} satır okundu (${matchedCount} stokla eşleşti, ${unmatchedCount} eşleşmedi). Borç sepetine eklemeden önce kontrol edin!`;
    }
  } catch (err) {
    if (statusEl) {
      statusEl.style.color = '#EF4444';
      statusEl.innerHTML = '❌ Not okunamadı: ' + (typeof friendlyAIErrorMessage === 'function' ? friendlyAIErrorMessage(err) : err.message);
    }
  } finally {
    event.target.value = '';
  }
}

function renderBorcCartPhotoReview() {
  const box = document.getElementById('borc-cart-photo-review');
  const itemsEl = document.getElementById('borc-cart-photo-items');
  if (!box || !itemsEl) return;

  if (borcCartPhotoReviewItems.length === 0) { box.style.display = 'none'; return; }
  box.style.display = 'block';

  itemsEl.innerHTML = borcCartPhotoReviewItems.map((it, i) => {
    // Eşleşmeyen satırlar için satış sepetindeki ile AYNI "bunu mu
    // aramıştınız?" benzer-ürün önerisi (findSimilarProducts).
    const suggestions = !it.matched && it.aiName && typeof findSimilarProducts === 'function' ? findSimilarProducts(it.aiName, 3) : [];

    return `
    <div style="padding:8px 0; border-top:1px dashed var(--steel-line);">
      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
        <input type="checkbox" ${it.include ? 'checked' : ''} ${!it.matched ? 'disabled' : ''} onchange="borcCartPhotoReviewItems[${i}].include=this.checked">
        <div style="flex:1; min-width:160px;">
          <input type="text" value="${(it.aiName || '').replace(/"/g, '&quot;')}" style="width:100%; font-size:12px;" oninput="borcCartPhotoReviewItems[${i}].aiName=this.value">
          ${it.matched
            ? `<small style="color:var(--success);">✅ Eşleşti: ${it.matchedName} (${it.matchedCode}) · Stok: ${it.matchedStock} · ₺${formatMoney(it.matchedPrice)}</small>`
            : `<small style="color:var(--rust);">⚠️ "${it.aiName}" adıyla birebir eşleşen ürün yok</small>`}
        </div>
        <input type="number" value="${it.qty}" min="0.1" step="any" style="width:70px; font-size:12px;" oninput="borcCartPhotoReviewItems[${i}].qty=parseFloat(this.value)||0">
        ${!it.matched ? `<button type="button" class="btn btn-info btn-sm" style="width:auto;" onclick="researchBorcCartPhotoItem(${i})">🔍 Yeniden Ara</button>` : ''}
      </div>
      ${suggestions.length > 0 ? `
        <div style="margin:6px 0 0 26px; font-size:11px;">
          <span style="color:var(--steel);">Böyle bir ürün mevcut değil, bunu mu aramıştınız?</span>
          <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:4px;">
            ${suggestions.map(s => `
              <button type="button" class="btn btn-warning btn-sm" style="width:auto;" onclick="selectBorcCartPhotoSuggestion(${i}, '${s.product.code}')">
                ${s.product.name} <small>(stokta mevcut, ${s.product.qty ?? 0} ${s.product.unit || 'Adet'})</small>
              </button>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
  }).join('');
}

function researchBorcCartPhotoItem(i) {
  const it = borcCartPhotoReviewItems[i];
  if (!it) return;
  const { product, score } = findBestProductMatch(it.aiName);
  const isMatch = !!(product && score >= FIS_MATCH_THRESHOLD);
  it.matched = isMatch;
  it.matchedCode = isMatch ? product.code : null;
  it.matchedName = isMatch ? product.name : null;
  it.matchedPrice = isMatch ? (product.price || 0) : 0;
  it.matchedStock = isMatch ? (product.qty || 0) : 0;
  it.include = isMatch;
  renderBorcCartPhotoReview();
  if (!isMatch) showToast("Yine birebir eşleşen bir ürün bulunamadı — aşağıdaki \"bunu mu aramıştınız?\" önerilerine bakın.");
}

function selectBorcCartPhotoSuggestion(i, code) {
  const it = borcCartPhotoReviewItems[i];
  const p = productsData[code];
  if (!it || !p) return;
  it.matched = true;
  it.matchedCode = p.code;
  it.matchedName = p.name;
  it.matchedPrice = p.price || 0;
  it.matchedStock = p.qty || 0;
  it.include = true;
  renderBorcCartPhotoReview();
}

function confirmBorcCartPhotoItems() {
  const selected = borcCartPhotoReviewItems.filter(it => it.include && it.matched && it.matchedCode);
  if (selected.length === 0) { alert("Borç sepetine eklemek için en az bir eşleşen ve işaretli ürün olmalı."); return; }

  let blocked = [];
  selected.forEach(it => {
    const p = productsData[it.matchedCode];
    if (!p) return;
    const qty = it.qty > 0 ? it.qty : 1;
    const existingIndex = borcCart.findIndex(ci => ci.code === p.code);
    const currentCartQty = existingIndex !== -1 ? borcCart[existingIndex].qty : 0;
    if (p.qty < currentCartQty + qty) {
      blocked.push(`${p.name} (stokta ${p.qty}, istenen ${currentCartQty + qty})`);
      return;
    }
    if (existingIndex !== -1) {
      borcCart[existingIndex].qty += qty;
      borcCart[existingIndex].total = borcCart[existingIndex].qty * borcCart[existingIndex].price;
    } else {
      const price = Number(p.price || 0);
      borcCart.push({ code: p.code, name: p.name, price: price, qty: qty, unit: p.unit || 'Adet', total: price * qty });
    }
  });

  borcCartPhotoReviewItems = borcCartPhotoReviewItems.filter(it => !(it.include && it.matched));
  renderBorcCartPhotoReview();
  renderBorcCart();

  if (blocked.length > 0) {
    alert("⚠️ Şu ürünler yetersiz stok nedeniyle eklenemedi:\n\n" + blocked.join('\n'));
  } else {
    showToast(`✅ ${selected.length} ürün borç sepetine eklendi!`);
  }
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
  
  let insufficientItems = [];
  borcCart.forEach(item => {
    if (!productsData[item.code]) return;
    const currentQty = productsData[item.code].qty || 0;
    if (currentQty < item.qty) {
      insufficientItems.push(`${item.name} (Mevcut: ${currentQty}, İstenen: ${item.qty})`);
    }
  });
  if (insufficientItems.length > 0) {
    // Sayım henüz yapılmamış olabilir: stok yetersiz görünse bile satışı ENGELLEMİYORUZ,
    // sadece uyarıp devam etmek isteyip istemediğini soruyoruz (Kataloglar modülü — madde 6).
    const proceed = confirm(
      `⚠️ Şu ürünlerde kayıtlı stok yetersiz görünüyor (henüz sayım yapılmamış olabilir):\n\n` +
      insufficientItems.join('\n') +
      `\n\nYine de borç fişi kesilsin mi? (Gerçek stok miktarını sonradan "Kataloglar" ekranından girebilirsiniz.)`
    );
    if (!proceed) return;
  }
  
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
    lastUpdatedBy: getActorLabel(),
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
    lastUpdatedBy: getActorLabel()
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
                ${d.lastUpdatedBy ? `<br><span style="color:var(--info);">📱 ${d.lastUpdatedBy}</span>` : ''}
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
      lastUpdatedBy: getActorLabel()
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
    lastUpdatedBy: getActorLabel()
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
    createdBy: getActorLabel(),
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
    createdBy: getActorLabel()
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
    lastUpdatedBy: getActorLabel(),
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

// Senet logosu koda gömülüdür (dosya yolu / hosting sorunlarından etkilenmez)
const SENET_LOGO_SRC = 'data:image/jpeg;base64,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';

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
      const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const itemList = Array.isArray(d.items) ? d.items.filter(i => i && i.name) : [];
      const itemsTotal = itemList.reduce((a, i) => a + (Number(i.total) || 0), 0);
      const thS = `style="background:#E5E7EB; padding:1.6mm 2.5mm; text-align:left; font-size:10px; letter-spacing:0.5px; border-bottom:0.3mm solid #9AA0A6;"`;
      const itemsRows = itemList.map((i, n) => `
        <tr>
          <td style="padding:1.6mm 2.5mm; border-bottom:0.2mm solid #E5E7EB; width:8mm; color:#777;">${n + 1}</td>
          <td style="padding:1.6mm 2.5mm; border-bottom:0.2mm solid #E5E7EB;">${esc(i.name)}</td>
          <td style="padding:1.6mm 2.5mm; border-bottom:0.2mm solid #E5E7EB; text-align:right; white-space:nowrap;">${esc(i.qty)} ${esc(i.unit || '')}</td>
          <td style="padding:1.6mm 2.5mm; border-bottom:0.2mm solid #E5E7EB; text-align:right; white-space:nowrap;">₺${formatMoney(Number(i.price) || 0)}</td>
          <td style="padding:1.6mm 2.5mm; border-bottom:0.2mm solid #E5E7EB; text-align:right; white-space:nowrap; font-weight:700;">₺${formatMoney(Number(i.total) || 0)}</td>
        </tr>`).join('');
      const materialsHtml = itemList.length ? `
          <div style="margin-top:6mm; page-break-inside:auto;">
            <div style="background:${'#26282B'}; color:#fff; padding:2mm 4mm; font-size:10px; font-weight:700; letter-spacing:2px;">ALINAN MALZEMELER</div>
            <table style="width:100%; border-collapse:collapse; font-size:11px; border:0.3mm solid #BFC4C9; border-top:0;">
              <thead><tr>
                <th ${thS}>#</th><th ${thS}>Malzeme</th><th style="background:#E5E7EB; padding:1.6mm 2.5mm; text-align:right; font-size:10px; border-bottom:0.3mm solid #9AA0A6;">Miktar</th><th style="background:#E5E7EB; padding:1.6mm 2.5mm; text-align:right; font-size:10px; border-bottom:0.3mm solid #9AA0A6;">Birim Fiyat</th><th style="background:#E5E7EB; padding:1.6mm 2.5mm; text-align:right; font-size:10px; border-bottom:0.3mm solid #9AA0A6;">Tutar</th>
              </tr></thead>
              <tbody>${itemsRows}</tbody>
              <tfoot><tr>
                <td colspan="4" style="padding:2mm 2.5mm; text-align:right; font-weight:800; background:#F4F5F6;">GENEL TOPLAM</td>
                <td style="padding:2mm 2.5mm; text-align:right; font-weight:800; background:#F4F5F6; white-space:nowrap;">₺${formatMoney(itemsTotal || senetAmount)}</td>
              </tr></tfoot>
            </table>
          </div>` : (d.description ? `
          <div style="margin-top:6mm;">
            <div style="background:#26282B; color:#fff; padding:2mm 4mm; font-size:10px; font-weight:700; letter-spacing:2px;">BORCUN KONUSU / AÇIKLAMA</div>
            <div style="border:0.3mm solid #BFC4C9; border-top:0; padding:3mm 4mm; font-size:11.5px; line-height:1.6;">${esc(d.description)}</div>
          </div>` : '');
      const CH = '#26282B';   // kurumsal koyu antrasit
      const SV = '#9AA0A6';   // gümüş
      printArea.innerHTML = `
        <div style="width:100%; max-width:180mm; margin:0 auto; font-family:'Inter',Arial,sans-serif; color:#1F2937; background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact;">

          <!-- ÜST BİLGİ: LOGO + FİRMA + BELGE NO -->
          <table style="width:100%; border-collapse:collapse;">
            <tr>
              <td style="width:30mm; vertical-align:middle; padding:0;">
                <img src="${SENET_LOGO_SRC}" alt="Reyhani" style="width:28mm; height:28mm; object-fit:cover; border-radius:3mm; display:block; border:0.4mm solid ${SV};">
              </td>
              <td style="vertical-align:middle; padding:0 0 0 5mm;">
                <div style="font-size:20px; font-weight:800; letter-spacing:1.5px; color:${CH};">REYHANİ CAM HIRDAVAT</div>
                <div style="font-size:11px; color:#555; margin-top:2mm;">Arsuz / Hatay</div>
              </td>
              <td style="vertical-align:middle; text-align:right; padding:0; width:55mm;">
                <table style="margin-left:auto; border-collapse:collapse; font-size:11px;">
                  <tr><td style="padding:1mm 3mm; color:#555; text-align:right;">Senet No</td><td style="padding:1mm 0; font-weight:700; text-align:right;">${senetNo}</td></tr>
                  <tr><td style="padding:1mm 3mm; color:#555; text-align:right;">Düzenleme Tarihi</td><td style="padding:1mm 0; font-weight:700; text-align:right;">${duzenlemeTarihi}</td></tr>
                  <tr><td style="padding:1mm 3mm; color:#555; text-align:right;">Düzenleme Yeri</td><td style="padding:1mm 0; font-weight:700; text-align:right;">Arsuz / Hatay</td></tr>
                  ${d.term ? `<tr><td style="padding:1mm 3mm; color:#555; text-align:right;">Vade Süresi</td><td style="padding:1mm 0; font-weight:700; text-align:right;">${esc(d.term)}</td></tr>` : ''}
                </table>
              </td>
            </tr>
          </table>

          <!-- BAŞLIK ŞERİDİ -->
          <div style="margin-top:6mm; background:${CH}; color:#fff; padding:3.5mm 6mm; display:flex; justify-content:space-between; align-items:center; border-bottom:1.2mm solid ${SV};">
            <div style="font-size:19px; font-weight:800; letter-spacing:3px;">BONO / SENET</div>
            <div style="font-size:11px; letter-spacing:1px; color:#E5E7EB;">VADE: <strong style="color:#fff; font-size:13px;">${vadeTarihi}</strong></div>
          </div>

          <!-- TUTAR -->
          <div style="margin-top:5mm; border:0.5mm solid ${CH}; padding:4mm 6mm; text-align:center; background:#F4F5F6;">
            <div style="font-size:10px; letter-spacing:2px; color:#555;">İŞBU SENET KARŞILIĞINDA ÖDENECEK TUTAR</div>
            <div style="font-size:30px; font-weight:800; margin:2mm 0; color:${CH};">₺${formatMoney(senetAmount)}</div>
            <div style="font-size:12px; font-style:italic; color:#333;">( ${esc(amountWords)} )</div>
          </div>

          <!-- TARAFLAR -->
          <table style="width:100%; border-collapse:separate; border-spacing:0; margin-top:6mm; font-size:12px;">
            <tr>
              <td style="width:50%; vertical-align:top; padding:0 3mm 0 0;">
                <div style="background:${CH}; color:#fff; padding:2mm 4mm; font-size:10px; font-weight:700; letter-spacing:2px;">ALACAKLI</div>
                <div style="border:0.3mm solid #BFC4C9; border-top:0; padding:4mm; min-height:20mm; line-height:1.6;">
                  <div style="font-weight:800; font-size:13px;">REYHANİ CAM HIRDAVAT</div>
                  <div><span style="color:#555;">Yetkili:</span> <strong>Edihan Reyhani</strong></div>
                  <div>Arsuz / Hatay</div>
                </div>
              </td>
              <td style="width:50%; vertical-align:top; padding:0 0 0 3mm;">
                <div style="background:${CH}; color:#fff; padding:2mm 4mm; font-size:10px; font-weight:700; letter-spacing:2px;">BORÇLU</div>
                <div style="border:0.3mm solid #BFC4C9; border-top:0; padding:4mm; min-height:20mm; line-height:1.6;">
                  <div style="font-weight:800; font-size:13px;">${esc(d.customer)}</div>
                  <div><span style="color:#555;">Telefon:</span> ${esc(d.phone || '-')}</div>
                  <div><span style="color:#555;">T.C. / Vergi No:</span> ${esc(tckn || '-')}</div>
                  <div><span style="color:#555;">Adres:</span> ${esc(address || '-')}</div>
                </div>
              </td>
            </tr>
          </table>

          <!-- ALINAN MALZEMELER -->
          ${materialsHtml}

          <!-- TAAHHÜT -->
          <div style="margin-top:6mm; font-size:12px; line-height:1.7; text-align:justify; border-left:1.2mm solid ${SV}; padding-left:5mm;">
            İşbu senet karşılığında yukarıda yazılı <strong>₺${formatMoney(senetAmount)}</strong> (${esc(amountWords)}) bedeli, <strong>${vadeTarihi}</strong> vade tarihinde <strong>REYHANİ CAM HIRDAVAT</strong>'a (Yetkili: <strong>Edihan Reyhani</strong>) veya emrine, nakden ve defaten, kayıtsız şartsız ödeyeceğimi; vadesinde ödenmemesi halinde yasal yollara (icra takibi dahil) başvurulabileceğini kabul, beyan ve taahhüt ederim.
          </div>

          <!-- İMZA ALANLARI -->
          <table style="width:100%; border-collapse:separate; border-spacing:0; margin-top:7mm; font-size:11px; page-break-inside:avoid;">
            <tr>
              <td style="width:50%; padding:0 3mm 0 0;">
                <div style="border:0.3mm solid #BFC4C9; height:27mm; position:relative;">
                  <div style="padding:2mm 4mm; background:#F4F5F6; font-weight:700; letter-spacing:1px; border-bottom:0.3mm solid #BFC4C9;">BORÇLU — Ad Soyad / İmza</div>
                  <div style="position:absolute; bottom:2mm; left:4mm; right:4mm; color:#777; font-size:10px;">Tarih: ........ / ........ / ............</div>
                </div>
              </td>
              <td style="width:50%; padding:0 0 0 3mm;">
                <div style="border:0.3mm solid #BFC4C9; height:27mm; position:relative;">
                  <div style="padding:2mm 4mm; background:#F4F5F6; font-weight:700; letter-spacing:1px; border-bottom:0.3mm solid #BFC4C9;">ALACAKLI — Reyhani Cam Hırdavat</div>
                  <div style="padding:2mm 4mm 0 4mm; font-size:11px;">Yetkili: <strong>Edihan Reyhani</strong></div>
                  <div style="position:absolute; bottom:2mm; left:4mm; right:4mm; color:#777; font-size:10px;">Kaşe / İmza</div>
                </div>
              </td>
            </tr>
          </table>

          <!-- ALT BİLGİ -->
          <div style="margin-top:6mm; padding-top:3mm; border-top:0.5mm solid ${SV}; display:flex; justify-content:space-between; font-size:9px; color:#666;">
            <span>REYHANİ CAM HIRDAVAT · Arsuz / Hatay</span>
            <span>Senet No: ${senetNo}</span>
          </div>
          <p style="font-size:8.5px; color:#777; margin:3mm 0 0 0; text-align:center; line-height:1.5;">
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
        createdBy: getActorLabel()
      });

      dbCustomerDebts.child(key).update({ senetNo: senetNo, senetDate: duzenlemeTarihi });

      setSenetPrintPageSize(true);
      document.body.className = 'printing-senet';
      // Logo yüklenmeden yazdırma penceresi açılırsa kağıtta logo boş çıkar; önce yüklenmesini bekle
      let printStarted = false;
      const startPrint = () => {
        if (printStarted) return;
        printStarted = true;
        setTimeout(() => {
          window.print();
          document.body.className = '';
          setSenetPrintPageSize(false);
          renderCustomerDebts();
          if (ahLedgerCustomerKey) renderCustomerLedger();
        }, 250);
      };
      const logoPre = new Image();
      logoPre.onload = startPrint;
      logoPre.onerror = startPrint;
      logoPre.src = SENET_LOGO_SRC;
      setTimeout(startPrint, 2500); // güvenlik: en geç 2,5 sn sonra yine de yazdır
    });
  });
}


// Sol menüdeki sekme butonlarını "simge + yazı" olarak ayır (yerleşim için); butonların işlevi değişmez.
function decoratePosNav() {
  document.querySelectorAll('.nav-tabs .tab-btn').forEach(btn => {
    if (btn.querySelector('.nav-ico')) return;
    const t = btn.textContent.trim();
    const m = t.match(/^(\S+)\s+([\s\S]+)$/);
    if (!m) return;
    btn.innerHTML = '<span class="nav-ico">' + m[1] + '</span> <span class="nav-txt">' + m[2] + '</span>';
  });
}
decoratePosNav();
