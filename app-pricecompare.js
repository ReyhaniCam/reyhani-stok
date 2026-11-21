// ============================================================
// TOPTANCI FİYAT KARŞILAŞTIRMA
// Aynı malzemenin farklı toptancılardan geliş fiyatlarını malzeme fişlerinden (goods_receipts) karşılaştırır.
//  1) "💱 Fiyat Karşılaştırma" sekmesi (yönetici): ürün bazında en ucuz / en pahalı toptancı, % fark,
//     tahmini fazla ödeme, toptancı karnesi, Excel çıktısı.
//  2) Malzeme Fişi ekranında anlık uyarı: kalem girerken / fişe eklenmişken "başka toptancıda daha ucuz" bilgisi.
// Karşılaştırma birim fiyatı: iskonto düşülmüş NET geliş fiyatı (KDV hariç; istenirse KDV dahil).
// Veri kaynağı: allGoodsReceiptsRaw (app-core.js), wholesalersData, productsData.
// ============================================================
(function () {
  'use strict';

  var st = { q: '', period: 180, minDiff: 0, sort: 'diff', vat: 'ex', merge: true, onlyMulti: true, limit: 40, open: {} };
  var viewCache = null;   // sekme için hesaplanmış gruplar
  var hintCache = null;   // fiş ekranı için (365 gün, KDV hariç, isim birleştirmeli)
  var lastList = [];

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function norm(v) { return String(v == null ? '' : v).toLocaleLowerCase('tr-TR').replace(/[^a-z0-9çğıöşüâîû]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function money(n) { return (typeof formatMoney === 'function') ? formatMoney(n) : Number(n).toFixed(2); }
  function fmtDate(d) { var p = String(d || '').split('-'); return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : (d || ''); }
  function pct(a, b) { return b > 0 ? (a - b) / b * 100 : 0; }
  function fmtPct(n) { return n.toLocaleString('tr-TR', { maximumFractionDigits: 1 }); }

  // ---------- Veri toplama ----------
  function wholesalerResolver() {
    var nameToKey = {};
    Object.keys(wholesalersData || {}).forEach(function (k) {
      var w = wholesalersData[k]; if (w && w.name) nameToKey[norm(w.name)] = k;
    });
    return function (r) {
      var key = (r.wholesalerKey && wholesalersData[r.wholesalerKey]) ? r.wholesalerKey : nameToKey[norm(r.wholesalerName)];
      if (!key) key = 'n:' + norm(r.wholesalerName || 'bilinmeyen');
      var name = (wholesalersData[key] && wholesalersData[key].name) || r.wholesalerName || 'Bilinmeyen Toptancı';
      return { key: key, name: name };
    };
  }

  // opts: { period (gün, 0=tümü), vat ('ex'|'inc'), merge (bool) }
  function build(opts) {
    var raw = (typeof allGoodsReceiptsRaw !== 'undefined' && allGoodsReceiptsRaw) || {};
    var resolve = wholesalerResolver();
    var cutoff = '';
    if (opts.period > 0) { var c = new Date(); c.setDate(c.getDate() - opts.period); cutoff = c.toISOString().slice(0, 10); }

    var parent = {};
    function find(x) { if (!(x in parent)) parent[x] = x; while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
    function union(a, b) { a = find(a); b = find(b); if (a !== b) parent[b] = a; }

    var entries = [];
    Object.keys(raw).sort().forEach(function (date) {
      if (cutoff && date < cutoff) return;
      var day = raw[date] || {};
      Object.keys(day).forEach(function (rid) {
        var r = day[rid]; if (!r || !r.items) return;
        var w = resolve(r);
        r.items.forEach(function (it) {
          if (!it) return;
          var qty = Number(it.qty) || 0;
          var unit = Number(it.cost) || 0;
          if (qty > 0 && it.total != null && isFinite(it.total) && Number(it.total) > 0) unit = Number(it.total) / qty; // iskonto sonrası net birim fiyat
          if (!(unit > 0)) return;
          var vat = (it.vat != null && isFinite(it.vat)) ? Number(it.vat) : ((r.pricing && r.pricing.vat != null) ? Number(r.pricing.vat) : 0);
          if (opts.vat === 'inc') unit = unit * (1 + vat / 100);
          var nameNode = 'n:' + norm(it.name);
          var codeNode = it.code ? 'c:' + it.code : null;
          var key;
          if (opts.merge) { find(nameNode); if (codeNode) union(nameNode, codeNode); key = nameNode; }
          else { key = codeNode || nameNode; find(key); }
          entries.push({ key: key, wk: w.key, wname: w.name, date: date, time: r.time || '', rid: rid, fisNo: r.fisNo || '',
            name: it.name || '', code: it.code || '', unitName: it.unit || 'Adet', price: unit, qty: qty });
        });
      });
    });

    var groups = {};
    entries.forEach(function (e) {
      var id = find(e.key);
      var g = groups[id] || (groups[id] = { id: id, entries: [], codes: {}, names: {}, units: {} });
      g.entries.push(e);
      if (e.code) g.codes[e.code] = true;
      g.names[norm(e.name)] = e.name;
      g.units[e.unitName] = true;
    });

    var list = Object.keys(groups).map(function (id) {
      var g = groups[id];
      g.entries.sort(function (a, b) { return (a.date + a.time) < (b.date + b.time) ? -1 : 1; });
      var codes = Object.keys(g.codes);
      var prod = null; for (var i = 0; i < codes.length && !prod; i++) prod = productsData[codes[i]] || null;
      g.name = (prod && prod.name) || g.entries[g.entries.length - 1].name;
      g.codeList = codes;
      g.unitList = Object.keys(g.units);
      var ws = {};
      g.entries.forEach(function (e) {
        var w = ws[e.wk] || (ws[e.wk] = { key: e.wk, name: e.wname, entries: [], qty: 0 });
        w.entries.push(e); w.qty += e.qty;
      });
      g.ws = Object.keys(ws).map(function (k) {
        var w = ws[k]; w.last = w.entries[w.entries.length - 1]; w.price = w.last.price; w.count = w.entries.length;
        return w;
      }).sort(function (a, b) { return a.price - b.price; });
      var newest = g.ws.reduce(function (m, w) { return w.last.date > m ? w.last.date : m; }, '');
      var nd = new Date(newest).getTime();
      g.ws.forEach(function (w) { w.stale = (nd - new Date(w.last.date).getTime()) > 90 * 86400000; });
      g.min = g.ws[0].price; g.max = g.ws[g.ws.length - 1].price;
      g.multi = g.ws.length > 1;
      g.diffPct = g.multi ? pct(g.max, g.min) : 0;
      g.diffAbs = g.max - g.min;
      g.overpay = 0;
      g.ws.forEach(function (w, idx) { if (idx > 0) g.overpay += w.qty * Math.max(0, w.price - g.min); });
      g.unitMismatch = g.unitList.length > 1;
      return g;
    });
    return { groups: list, byCode: indexBy(list, 'code'), byName: indexBy(list, 'name') };
  }

  function indexBy(list, how) {
    var m = {};
    list.forEach(function (g) {
      if (how === 'code') g.codeList.forEach(function (c) { m[c] = g; });
      else Object.keys(g.names).forEach(function (n) { m[n] = g; });
    });
    return m;
  }

  function getHintData() { if (!hintCache) hintCache = build({ period: 365, vat: 'ex', merge: true }); return hintCache; }
  function findGroup(code, name) {
    var d = getHintData();
    return (code && d.byCode[code]) || d.byName[norm(name)] || null;
  }

  // ---------- Sekme ----------
  function computeView() {
    viewCache = build({ period: st.period, vat: st.vat, merge: st.merge });
    return viewCache;
  }

  function filtered() {
    var d = viewCache || computeView();
    var q = norm(st.q);
    var arr = d.groups.filter(function (g) {
      if (st.onlyMulti && !g.multi) return false;
      if (g.multi && g.diffPct < st.minDiff) return false;
      if (!g.multi && st.minDiff > 0) return false;
      if (q) {
        var hay = norm(g.name + ' ' + g.codeList.join(' ') + ' ' + g.ws.map(function (w) { return w.name; }).join(' '));
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
    arr.sort(function (a, b) {
      if (st.sort === 'overpay') return b.overpay - a.overpay;
      if (st.sort === 'abs') return b.diffAbs - a.diffAbs;
      if (st.sort === 'name') return a.name.localeCompare(b.name, 'tr');
      return b.diffPct - a.diffPct;
    });
    return arr;
  }

  function badgeColor(p) { return p >= 20 ? '#DC2626' : (p >= 8 ? '#D97706' : '#059669'); }

  function renderScore(multi) {
    var box = document.getElementById('pc-score'); if (!box) return;
    var sc = {};
    multi.forEach(function (g) {
      g.ws.forEach(function (w, i) {
        var s = sc[w.key] || (sc[w.key] = { name: w.name, n: 0, cheapest: 0, sumPct: 0, extra: 0 });
        s.n++; if (i === 0) s.cheapest++;
        s.sumPct += pct(w.price, g.min);
        if (i > 0) s.extra += w.qty * (w.price - g.min);
      });
    });
    var rows = Object.keys(sc).map(function (k) { return sc[k]; }).filter(function (s) { return s.n > 0; })
      .sort(function (a, b) { return (a.sumPct / a.n) - (b.sumPct / b.n); });
    if (!rows.length) { box.innerHTML = ''; return; }
    var maxAvg = Math.max.apply(null, rows.map(function (s) { return s.sumPct / s.n; }).concat([1]));
    box.innerHTML = '<div class="form-card" style="padding:16px;"><div style="font-family:\'Oswald\',sans-serif; font-size:17px; margin-bottom:4px;">🏅 Toptancı Karnesi</div>' +
      '<div style="font-size:11px; color:var(--steel); margin-bottom:10px;">Birden fazla toptancıdan alınmış ürünlerde, her toptancının en ucuza göre ortalama farkı (düşük = iyi).</div>' +
      rows.map(function (s) {
        var avg = s.sumPct / s.n;
        return '<div style="display:flex; align-items:center; gap:10px; padding:6px 0; border-bottom:1px dashed var(--steel-line); flex-wrap:wrap;">' +
          '<div style="flex:1 1 150px; min-width:130px;"><b>' + esc(s.name) + '</b><div style="font-size:11px; color:var(--steel);">' + s.n + ' üründe karşılaştırıldı · ' + s.cheapest + ' üründe en ucuz</div></div>' +
          '<div style="flex:1 1 120px; background:#E2E8F0; border-radius:4px; height:10px; overflow:hidden;"><div style="width:' + Math.max(2, avg / maxAvg * 100) + '%; height:100%; background:' + badgeColor(avg) + ';"></div></div>' +
          '<div style="width:70px; text-align:right; font-family:\'IBM Plex Mono\',monospace; font-weight:700; color:' + badgeColor(avg) + ';">' + (avg < 0.05 ? 'en ucuz' : '+%' + fmtPct(avg)) + '</div>' +
          '</div>';
      }).join('') + '</div>';
  }

  function renderSummary(multiAll, shown) {
    var box = document.getElementById('pc-summary'); if (!box) return;
    var over = shown.reduce(function (s, g) { return s + g.overpay; }, 0);
    var top = shown.length ? shown.slice().sort(function (a, b) { return b.diffPct - a.diffPct; })[0] : null;
    function card(label, val, sub, color) {
      return '<div style="flex:1 1 170px; background:#fff; border:1px solid var(--steel-line); border-radius:10px; padding:12px 14px;">' +
        '<div style="font-size:11px; color:var(--steel); text-transform:uppercase; letter-spacing:.4px;">' + label + '</div>' +
        '<div style="font-family:\'Oswald\',sans-serif; font-size:24px; color:' + (color || 'var(--charcoal)') + ';">' + val + '</div>' +
        (sub ? '<div style="font-size:11px; color:var(--steel);">' + sub + '</div>' : '') + '</div>';
    }
    box.innerHTML = '<div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:16px;">' +
      card('Karşılaştırılabilir ürün', multiAll.length, 'en az 2 toptancıdan alınmış') +
      card('Filtreye uyan', shown.length, st.minDiff ? '%' + st.minDiff + ' ve üzeri fark' : 'tüm farklar') +
      card('Tahmini fazla ödeme', '₺' + money(over), 'en ucuzdan alınsaydı (dönem içi)', over > 0 ? '#DC2626' : '') +
      (top ? card('En büyük fark', '%' + fmtPct(top.diffPct), esc(top.name), badgeColor(top.diffPct)) : '') +
      '</div>';
  }

  function renderGroup(g, i) {
    var open = !!st.open[g.id];
    var max = g.max || 1;
    var rows = g.ws.map(function (w, idx) {
      var isMin = idx === 0 && g.multi;
      var p = pct(w.price, g.min);
      var tag = !g.multi ? '' : (isMin ? '<span style="background:#D1FAE5; color:#047857; font-weight:700; font-size:11px; padding:2px 8px; border-radius:10px;">EN UCUZ</span>'
        : '<span style="background:#FEE2E2; color:' + badgeColor(p) + '; font-weight:700; font-size:11px; padding:2px 8px; border-radius:10px;">+%' + fmtPct(p) + ' (+₺' + money(w.price - g.min) + ')</span>');
      return '<div style="padding:7px 0; border-top:1px dashed var(--steel-line);' + (w.stale ? ' opacity:.65;' : '') + '">' +
        '<div style="display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap; align-items:center;">' +
        '<div style="flex:1 1 140px;"><b>' + esc(w.name) + '</b><div style="font-size:11px; color:var(--steel);">son alım ' + fmtDate(w.last.date) + (w.stale ? ' · <b style="color:#B45309;">eski fiyat</b>' : '') + ' · ' + w.count + ' alım</div></div>' +
        '<div style="font-family:\'IBM Plex Mono\',monospace; font-weight:700; font-size:15px;">₺' + money(w.price) + '<span style="font-weight:400; font-size:11px; color:var(--steel);"> /' + esc(w.last.unitName) + '</span></div>' +
        '<div style="min-width:120px; text-align:right;">' + tag + '</div></div>' +
        '<div style="height:5px; background:#E2E8F0; border-radius:3px; margin-top:5px; overflow:hidden;"><div style="width:' + Math.max(3, w.price / max * 100) + '%; height:100%; background:' + (isMin ? '#10B981' : badgeColor(p)) + ';"></div></div></div>';
    }).join('');

    var hist = '';
    if (open) {
      hist = '<div style="margin-top:8px; background:#F8FAFC; border-radius:8px; padding:8px 10px; font-size:12px;">' +
        '<div style="font-weight:700; margin-bottom:4px;">Alım geçmişi</div>' +
        g.entries.slice().reverse().map(function (e) {
          return '<div style="display:flex; justify-content:space-between; gap:8px; padding:2px 0; flex-wrap:wrap;"><span>' + fmtDate(e.date) + ' · ' + esc(e.wname) + (e.fisNo ? ' · 📄 ' + esc(e.fisNo) : '') + '</span>' +
            '<span style="font-family:\'IBM Plex Mono\',monospace;">' + e.qty + ' ' + esc(e.unitName) + ' × ₺' + money(e.price) + '</span></div>';
        }).join('') + '</div>';
    }

    var head = g.multi
      ? '<div style="text-align:right;"><div style="font-family:\'Oswald\',sans-serif; font-size:22px; color:' + badgeColor(g.diffPct) + ';">%' + fmtPct(g.diffPct) + ' fark</div>' +
        '<div style="font-size:11px; color:var(--steel);">fazla ödeme ≈ ₺' + money(g.overpay) + '</div></div>'
      : '<div style="font-size:11px; color:var(--steel); text-align:right;">tek toptancı</div>';

    return '<div style="background:#fff; border:1px solid var(--steel-line); border-radius:12px; padding:14px; margin-bottom:10px; box-shadow:var(--shadow);">' +
      '<div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">' +
      '<div><div style="font-weight:800; font-size:15px; overflow-wrap:anywhere;">' + esc(g.name) + '</div>' +
      '<div style="font-family:\'IBM Plex Mono\',monospace; font-size:11px; color:var(--steel);">' + (g.codeList.length ? esc(g.codeList.join(', ')) : 'stok kodu yok') + '</div>' +
      (g.unitMismatch ? '<div style="font-size:11px; color:#B45309; margin-top:2px;">⚠️ Birimler farklı (' + esc(g.unitList.join(' / ')) + ') — fiyatlar birebir kıyaslanamayabilir</div>' : '') + '</div>' +
      head + '</div>' + rows + hist +
      '<div style="margin-top:6px;"><a href="javascript:void(0)" onclick="pcToggle(' + i + ')" style="font-size:12px; color:var(--info);">' + (open ? '▲ Geçmişi gizle' : '▼ Alım geçmişini göster') + '</a></div></div>';
  }

  function render() {
    var list = document.getElementById('pc-list'); if (!list) return;
    var d = computeView();
    var multiAll = d.groups.filter(function (g) { return g.multi; });
    var shown = filtered();
    lastList = shown;
    renderSummary(multiAll, shown.filter(function (g) { return g.multi; }));
    renderScore(multiAll);
    if (!d.groups.length) { list.innerHTML = '<p style="color:var(--steel); text-align:center;">Seçili dönemde fiyatlı malzeme fişi bulunamadı.</p>'; return; }
    if (!shown.length) { list.innerHTML = '<p style="color:var(--steel); text-align:center;">Bu filtreye uyan ürün yok. Dönemi uzatmayı ya da farkı "Tümü" yapmayı deneyin.</p>'; return; }
    var html = shown.slice(0, st.limit).map(renderGroup).join('');
    if (shown.length > st.limit) html += '<button class="btn btn-info btn-sm" style="width:100%;" onclick="pcMore()">Daha fazla göster (' + (shown.length - st.limit) + ' ürün daha)</button>';
    list.innerHTML = html;
  }

  function rerenderListOnly() {
    var list = document.getElementById('pc-list'); if (!list) return;
    var html = lastList.slice(0, st.limit).map(renderGroup).join('');
    if (lastList.length > st.limit) html += '<button class="btn btn-info btn-sm" style="width:100%;" onclick="pcMore()">Daha fazla göster (' + (lastList.length - st.limit) + ' ürün daha)</button>';
    list.innerHTML = html;
  }

  window.pcToggle = function (i) { var g = lastList[i]; if (!g) return; st.open[g.id] = !st.open[g.id]; rerenderListOnly(); };
  window.pcMore = function () { st.limit += 40; rerenderListOnly(); };
  window.pcSet = function (k, v) {
    if (k === 'period' || k === 'minDiff') v = Number(v);
    if (k === 'merge' || k === 'onlyMulti') v = !!v;
    st[k] = v; st.limit = 40; render();
  };

  window.pcExportExcel = function () {
    if (typeof XLSX === 'undefined') { alert('Excel bileşeni yüklenemedi.'); return; }
    var rows = [];
    filtered().forEach(function (g) {
      g.ws.forEach(function (w, idx) {
        rows.push({
          'Ürün': g.name, 'Kod': g.codeList.join(', '), 'Birim': w.last.unitName, 'Toptancı': w.name,
          'Son Fiyat (₺)': Number(w.price.toFixed(2)), 'Son Alım Tarihi': fmtDate(w.last.date), 'Alım Sayısı': w.count,
          'Durum': g.multi ? (idx === 0 ? 'EN UCUZ' : 'Daha pahalı') : 'Tek toptancı',
          'En Ucuza Göre Fark %': g.multi ? Number(pct(w.price, g.min).toFixed(1)) : 0,
          'En Ucuza Göre Fark ₺': g.multi ? Number((w.price - g.min).toFixed(2)) : 0
        });
      });
    });
    if (!rows.length) { alert('Aktarılacak veri yok.'); return; }
    var ws = XLSX.utils.json_to_sheet(rows), wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Fiyat Karşılaştırma');
    XLSX.writeFile(wb, 'toptanci-fiyat-karsilastirma-' + new Date().toISOString().slice(0, 10) + '.xlsx');
  };

  window.initPriceCompareTab = function () { render(); };

  // Fiş verisi değişince (app-core.js dinleyicisi çağırır)
  window.priceCmpOnReceiptsChanged = function () {
    hintCache = null; viewCache = null;
    var tab = document.getElementById('tab-fiyat');
    if (tab && tab.classList.contains('active')) render();
    if (typeof priceCmpFisHint === 'function') priceCmpFisHint();
  };

  // ---------- Malzeme Fişi ekranı: anlık uyarılar ----------
  function currentWholesaler() {
    var sel = document.getElementById('fis-wholesaler'); var key = sel ? sel.value : '';
    return key ? { key: key, name: (wholesalersData[key] && wholesalersData[key].name) || '' } : null;
  }

  // Bir birim fiyatı, grubun diğer toptancılarıyla kıyaslar. Dönüş: { html } veya null
  function compareHtml(g, price, curW, compact) {
    if (!g) return null;
    var others = g.ws.filter(function (w) { return !curW || w.key !== curW.key; });
    var own = curW ? g.ws.filter(function (w) { return w.key === curW.key; })[0] : null;
    if (!others.length && !own) return null;
    var out = [];
    if (own && price > 0) {
      var ch = pct(price, own.price);
      if (Math.abs(ch) >= 0.5) out.push((ch > 0 ? '📈' : '📉') + ' Bu toptancıdan son alış ₺' + money(own.price) + ' (' + fmtDate(own.last.date) + ') → <b style="color:' + (ch > 0 ? '#DC2626' : '#059669') + ';">%' + (ch > 0 ? '+' : '') + fmtPct(ch) + '</b>');
    }
    if (others.length && price > 0) {
      var best = others[0]; // fiyata göre artan sıralı
      var diff = pct(price, best.price);
      if (diff >= 1) out.push('⚠️ <b style="color:#DC2626;">' + esc(best.name) + '</b>\'da ₺' + money(best.price) + ' (' + fmtDate(best.last.date) + ') — bu fiyat <b style="color:#DC2626;">%' + fmtPct(diff) + ' daha pahalı</b>');
      else if (diff <= -1) out.push('✅ Diğer toptancılardan ucuz (en yakın: ' + esc(best.name) + ' ₺' + money(best.price) + ', %' + fmtPct(-diff) + ' fark)');
      else out.push('➖ ' + esc(best.name) + ' ile aynı seviyede (₺' + money(best.price) + ')');
    }
    if (!compact && !out.length) return null;
    var all = '';
    if (!compact) {
      all = '<div style="margin-top:4px; font-size:11px; color:var(--steel);">Son alış fiyatları: ' + g.ws.map(function (w) {
        return esc(w.name) + ' ₺' + money(w.price) + ' (' + fmtDate(w.last.date) + ')';
      }).join(' · ') + '</div>';
    }
    return out.length || all ? { html: out.join('<br>') + all } : null;
  }

  window.priceCmpFisHint = function () {
    var box = document.getElementById('fis-price-compare-hint'); if (!box) return;
    var inp = document.getElementById('fis-product'); var val = inp ? inp.value.trim() : '';
    if (!val) { box.style.display = 'none'; box.innerHTML = ''; return; }
    var code = val.split(' - ')[0].trim();
    var name = (productsData[code] && productsData[code].name) || val;
    var g = findGroup(productsData[code] ? code : '', name);
    if (!g) { box.style.display = 'none'; box.innerHTML = ''; return; }
    var cost = parseFloat(String(document.getElementById('fis-cost').value || '').replace(',', '.')) || 0;
    var qty = parseFloat(String(document.getElementById('fis-qty').value || '').replace(',', '.')) || 1;
    var disc = parseFloat(String(document.getElementById('fis-discount').value || '').replace(',', '.')) || 0;
    var unit = cost > 0 ? Math.max(0, cost - (disc > 0 && qty > 0 ? disc / qty : 0)) : 0;
    var r = compareHtml(g, unit, currentWholesaler(), false);
    if (!r) { box.style.display = 'none'; box.innerHTML = ''; return; }
    box.style.display = 'block';
    box.innerHTML = '<b>💱 Fiyat karşılaştırma</b><br>' + r.html;
  };

  // Fiş sepetindeki kalemin altına küçük uyarı (renderGoodsReceiptCart çağırır)
  window.priceCmpCartBadge = function (item) {
    try {
      if (!item || !(Number(item.cost) > 0)) return '';
      var g = findGroup(item.code && productsData[item.code] ? item.code : '', item.name);
      if (!g) return '';
      var qty = Number(item.qty) || 0;
      var unit = (qty > 0 && item.total > 0) ? item.total / qty : Number(item.cost);
      var r = compareHtml(g, unit, currentWholesaler(), true);
      return r && r.html ? '<div style="font-size:11px; line-height:1.5; margin-top:3px; padding:4px 8px; background:#F8FAFC; border-left:3px solid var(--safety); border-radius:4px;">' + r.html + '</div>' : '';
    } catch (e) { return ''; }
  };
})();
