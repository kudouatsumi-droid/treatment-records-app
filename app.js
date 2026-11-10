/*
 * Fiore Note — 1人サロン向け 施術記録アプリ（試作版）
 *
 * ・データはこの端末のブラウザ（localStorage）にだけ保存します。
 * ・外部への通信は一切行いません。
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'fioreNote.data.v1';
  var BACKUP_KEY = 'fioreNote.lastBackup';
  var APP_ID = 'fiore-note';
  var DATA_VERSION = 1;

  // ======================================================
  // データの読み書き
  // ======================================================
  var db = { customers: [], records: [] };

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      var normalized = normalizeData(parsed);
      if (normalized) db = normalized;
    } catch (e) {
      console.error(e);
      alert('保存データの読み込みに失敗しました。\nバックアップファイルがあれば「設定」から復元してください。');
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        app: APP_ID,
        version: DATA_VERSION,
        customers: db.customers,
        records: db.records
      }));
      return true;
    } catch (e) {
      console.error(e);
      alert('保存できませんでした。\n端末の空き容量が不足しているか、プライベートモードの可能性があります。\n念のため「設定」からバックアップを保存してください。');
      return false;
    }
  }

  // 読み込んだデータ（保存データ・バックアップ）を検証して整える
  function normalizeData(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (!Array.isArray(obj.customers) || !Array.isArray(obj.records)) return null;

    var customers = [];
    var ids = {};
    obj.customers.forEach(function (c) {
      if (!c || typeof c !== 'object') return;
      var name = str(c.name).trim().slice(0, 50);
      var id = str(c.id);
      if (!name || !id || ids[id]) return;
      ids[id] = true;
      customers.push({
        id: id,
        name: name,
        memo: str(c.memo).slice(0, 1000),
        createdAt: str(c.createdAt) || nowIso(),
        updatedAt: str(c.updatedAt) || nowIso()
      });
    });

    var records = [];
    var rids = {};
    obj.records.forEach(function (r) {
      if (!r || typeof r !== 'object') return;
      var id = str(r.id);
      var cid = str(r.customerId);
      var date = str(r.date);
      if (!id || rids[id] || !ids[cid] || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      rids[id] = true;
      records.push({
        id: id,
        customerId: cid,
        date: date,
        menu: str(r.menu).slice(0, 100),
        note: str(r.note).slice(0, 5000),
        createdAt: str(r.createdAt) || nowIso(),
        updatedAt: str(r.updatedAt) || nowIso()
      });
    });

    return { customers: customers, records: records };
  }

  function str(v) { return typeof v === 'string' ? v : (v == null ? '' : String(v)); }
  function nowIso() { return new Date().toISOString(); }

  function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  var WEEK = ['日', '月', '火', '水', '木', '金', '土'];
  function formatDate(s) {
    var p = s.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return +p[0] + '年' + (+p[1]) + '月' + (+p[2]) + '日（' + WEEK[d.getDay()] + '）';
  }
  function formatDateShort(s) {
    var p = s.split('-');
    return +p[0] + '/' + (+p[1]) + '/' + (+p[2]);
  }

  // ======================================================
  // データ操作
  // ======================================================
  function getCustomer(id) {
    for (var i = 0; i < db.customers.length; i++) if (db.customers[i].id === id) return db.customers[i];
    return null;
  }
  function getRecord(id) {
    for (var i = 0; i < db.records.length; i++) if (db.records[i].id === id) return db.records[i];
    return null;
  }
  // 新しい日付順（同じ日なら後から登録したものが上）
  function recordsOf(customerId) {
    return db.records
      .filter(function (r) { return r.customerId === customerId; })
      .sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return a.createdAt < b.createdAt ? 1 : -1;
      });
  }
  function lastVisit(customerId) {
    var last = '';
    db.records.forEach(function (r) {
      if (r.customerId === customerId && r.date > last) last = r.date;
    });
    return last;
  }

  // 検索用：ひらがな/カタカナ・全角/半角・大文字/小文字・空白の違いを吸収
  function normalizeForSearch(s) {
    s = str(s).normalize ? str(s).normalize('NFKC') : str(s);
    s = s.toLowerCase().replace(/\s+/g, '');
    return s.replace(/[ァ-ヶ]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0x60);
    });
  }

  // よく使うメニュー（使用回数の多い順）
  function frequentMenus(limit) {
    var count = {};
    db.records.forEach(function (r) {
      var m = r.menu.trim();
      if (m) count[m] = (count[m] || 0) + 1;
    });
    return Object.keys(count)
      .sort(function (a, b) { return count[b] - count[a]; })
      .slice(0, limit || 50);
  }

  // ======================================================
  // 画面要素
  // ======================================================
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text; // textContent を使い、入力内容がHTMLとして動かないようにする
    return e;
  }

  var views = { list: $('view-list'), customer: $('view-customer'), settings: $('view-settings') };
  var currentCustomerId = null;

  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  // ======================================================
  // 画面の切り替え（URLの # を使うので、スマホの「戻る」も効きます）
  // ======================================================
  function route() {
    var hash = location.hash || '#/';
    var m;
    closeAllDialogs();

    if ((m = hash.match(/^#\/customer\/(.+)$/))) {
      var id = decodeURIComponent(m[1]);
      if (!getCustomer(id)) { location.replace('#/'); return; }
      currentCustomerId = id;
      show('customer');
      renderCustomer();
    } else if (hash === '#/settings') {
      currentCustomerId = null;
      show('settings');
      renderSettings();
    } else {
      currentCustomerId = null;
      show('list');
      renderList();
    }
  }

  function show(name) {
    Object.keys(views).forEach(function (k) { views[k].hidden = k !== name; });
    $('backBtn').hidden = name === 'list';
    $('settingsBtn').hidden = name === 'settings';
    $('headerTitle').textContent =
      name === 'settings' ? '設定・バックアップ' :
      name === 'customer' ? '施術記録' : 'Fiore Note';
    window.scrollTo(0, 0);
  }

  function goBack() {
    // アプリ内から来た場合は履歴を戻る。直接開いた場合は一覧へ
    if (history.state && history.state.inApp) history.back();
    else location.hash = '#/';
  }
  function navigate(hash) {
    history.pushState({ inApp: true }, '', hash);
    route();
  }

  // ======================================================
  // お客様一覧
  // ======================================================
  function renderList() {
    var q = normalizeForSearch($('searchInput').value);
    var list = $('customerList');
    list.textContent = '';

    var items = db.customers.map(function (c) {
      return { c: c, last: lastVisit(c.id), count: 0 };
    });
    var counts = {};
    db.records.forEach(function (r) { counts[r.customerId] = (counts[r.customerId] || 0) + 1; });
    items.forEach(function (it) { it.count = counts[it.c.id] || 0; });

    if (q) items = items.filter(function (it) { return normalizeForSearch(it.c.name).indexOf(q) !== -1; });

    // 最近来店した順（未来店は登録が新しい順で末尾）
    items.sort(function (a, b) {
      if (a.last !== b.last) return a.last < b.last ? 1 : -1;
      return a.c.createdAt < b.c.createdAt ? 1 : -1;
    });

    items.forEach(function (it) {
      var li = el('li');
      var btn = el('button', 'customer-card');
      btn.type = 'button';
      btn.appendChild(el('span', 'avatar', Array.from(it.c.name)[0] || '?'));
      var body = el('span', 'card-body');
      body.appendChild(el('span', 'card-name', it.c.name));
      body.appendChild(el('span', 'card-sub',
        it.last ? '最終来店 ' + formatDateShort(it.last) + '・' + it.count + '回' : 'まだ記録がありません'));
      btn.appendChild(body);
      btn.appendChild(el('span', 'chev', '›'));
      btn.addEventListener('click', function () { navigate('#/customer/' + encodeURIComponent(it.c.id)); });
      li.appendChild(btn);
      list.appendChild(li);
    });

    var empty = $('listEmpty');
    if (db.customers.length === 0) {
      empty.hidden = false;
      empty.textContent = '';
      empty.appendChild(document.createTextNode('まだお客様が登録されていません。'));
      empty.appendChild(el('br'));
      empty.appendChild(document.createTextNode('下の「＋ お客様を登録」から始めましょう。'));
      $('listCount').textContent = '';
    } else if (items.length === 0) {
      empty.hidden = false;
      empty.textContent = '「' + $('searchInput').value + '」に一致するお客様は見つかりませんでした。';
      $('listCount').textContent = '';
    } else {
      empty.hidden = true;
      $('listCount').textContent = q
        ? items.length + '件 見つかりました'
        : '登録 ' + db.customers.length + '名（最近来店した順）';
    }
  }

  // ======================================================
  // お客様詳細
  // ======================================================
  function renderCustomer() {
    var c = getCustomer(currentCustomerId);
    if (!c) return;
    var recs = recordsOf(c.id);

    $('customerName').textContent = c.name + ' 様';
    $('customerMeta').textContent = recs.length
      ? '来店 ' + recs.length + '回・最終来店 ' + formatDateShort(recs[0].date)
      : '施術記録はまだありません';
    $('customerMemo').hidden = !c.memo;
    $('customerMemo').textContent = c.memo;

    var list = $('recordList');
    list.textContent = '';
    recs.forEach(function (r) {
      var li = el('li', 'record');
      var top = el('div', 'record-top');
      top.appendChild(el('span', 'record-date', formatDate(r.date)));
      var edit = el('button', 'btn btn-sub btn-small', '編集');
      edit.type = 'button';
      edit.setAttribute('aria-label', formatDate(r.date) + 'の記録を編集');
      edit.addEventListener('click', function () { openRecordDialog(r.id); });
      top.appendChild(edit);
      li.appendChild(top);
      if (r.menu) li.appendChild(el('span', 'record-menu', r.menu));
      li.appendChild(r.note
        ? el('p', 'record-note', r.note)
        : el('p', 'record-note empty-note', '（メモなし）'));
      list.appendChild(li);
    });
    $('recordEmpty').hidden = recs.length > 0;
  }

  // ======================================================
  // ダイアログ共通
  // ======================================================
  function openDialog(d) {
    if (typeof d.showModal === 'function') d.showModal();
    else d.setAttribute('open', '');
  }
  function closeDialog(d) {
    if (typeof d.close === 'function' && d.open) d.close();
    else d.removeAttribute('open');
  }
  function closeAllDialogs() {
    closeDialog($('customerDialog'));
    closeDialog($('recordDialog'));
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (b) {
    b.addEventListener('click', function () { closeDialog(b.closest('dialog')); });
  });
  // 背景（暗い部分）をタップしたら閉じる
  Array.prototype.forEach.call(document.querySelectorAll('dialog'), function (d) {
    d.addEventListener('click', function (e) { if (e.target === d) closeDialog(d); });
  });

  // ======================================================
  // お客様の登録・編集・削除
  // ======================================================
  var editingCustomerId = null;

  function openCustomerDialog(id) {
    editingCustomerId = id || null;
    var c = id ? getCustomer(id) : null;
    $('customerDialogTitle').textContent = c ? 'お客様情報を編集' : 'お客様を登録';
    $('cfName').value = c ? c.name : '';
    $('cfMemo').value = c ? c.memo : '';
    $('cfError').hidden = true;
    $('cfDelete').hidden = !c;
    openDialog($('customerDialog'));
    if (!c) $('cfName').focus();
  }

  $('customerForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('cfName').value.trim();
    var memo = $('cfMemo').value.trim();
    if (!name) {
      $('cfError').textContent = 'お名前（またはニックネーム）を入力してください。';
      $('cfError').hidden = false;
      $('cfName').focus();
      return;
    }
    // 同じ名前の確認（同姓同名の方もいるので登録自体は可能）
    var dup = db.customers.some(function (c) {
      return c.id !== editingCustomerId && normalizeForSearch(c.name) === normalizeForSearch(name);
    });
    if (dup && !confirm('「' + name + '」という名前のお客様はすでに登録されています。\nこのまま登録しますか？')) return;

    var now = nowIso();
    if (editingCustomerId) {
      var c = getCustomer(editingCustomerId);
      c.name = name; c.memo = memo; c.updatedAt = now;
      if (!save()) return;
      closeDialog($('customerDialog'));
      renderCustomer();
      toast('お客様情報を更新しました');
    } else {
      var nc = { id: newId(), name: name, memo: memo, createdAt: now, updatedAt: now };
      db.customers.push(nc);
      if (!save()) { db.customers.pop(); return; }
      closeDialog($('customerDialog'));
      $('searchInput').value = '';
      toast('「' + name + '」様を登録しました');
      // 登録したら、そのままお客様の画面へ
      navigate('#/customer/' + encodeURIComponent(nc.id));
    }
  });

  $('cfDelete').addEventListener('click', function () {
    var c = getCustomer(editingCustomerId);
    if (!c) return;
    var n = recordsOf(c.id).length;
    var msg = '「' + c.name + '」様を削除しますか？\n' +
      (n ? 'このお客様の施術記録 ' + n + '件 もすべて削除されます。\n' : '') +
      'この操作は元に戻せません。';
    if (!confirm(msg)) return;
    db.customers = db.customers.filter(function (x) { return x.id !== c.id; });
    db.records = db.records.filter(function (r) { return r.customerId !== c.id; });
    save();
    closeDialog($('customerDialog'));
    toast('削除しました');
    location.replace('#/');
  });

  // ======================================================
  // 施術記録の追加・編集・削除
  // ======================================================
  var editingRecordId = null;

  function openRecordDialog(id) {
    editingRecordId = id || null;
    var r = id ? getRecord(id) : null;
    var c = getCustomer(r ? r.customerId : currentCustomerId);
    if (!c) return;
    $('recordDialogTitle').textContent = r ? '施術記録を編集' : '施術記録を追加';
    $('rfCustomer').textContent = c.name + ' 様';
    $('rfDate').value = r ? r.date : todayStr();
    $('rfMenu').value = r ? r.menu : '';
    $('rfNote').value = r ? r.note : '';
    $('rfError').hidden = true;
    $('rfDelete').hidden = !r;

    // メニュー候補（過去に入力したもの）
    var menus = frequentMenus(50);
    var dl = $('menuOptions');
    dl.textContent = '';
    menus.forEach(function (m) { var o = el('option'); o.value = m; dl.appendChild(o); });

    // ワンタップで入れられる「よく使うメニュー」ボタン
    var chips = $('menuChips');
    chips.textContent = '';
    menus.slice(0, 6).forEach(function (m) {
      var b = el('button', 'chip', m);
      b.type = 'button';
      b.addEventListener('click', function () {
        $('rfMenu').value = m;
        updateChipSelection();
      });
      chips.appendChild(b);
    });
    updateChipSelection();

    openDialog($('recordDialog'));
  }

  function updateChipSelection() {
    var v = $('rfMenu').value;
    Array.prototype.forEach.call($('menuChips').children, function (b) {
      b.classList.toggle('selected', b.textContent === v);
    });
  }
  $('rfMenu').addEventListener('input', updateChipSelection);

  $('recordForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var date = $('rfDate').value;
    var menu = $('rfMenu').value.trim();
    var note = $('rfNote').value.replace(/\s+$/, '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      $('rfError').textContent = '来店日を選んでください。';
      $('rfError').hidden = false;
      return;
    }
    if (!menu && !note.trim()) {
      $('rfError').textContent = '施術メニューか内容・メモのどちらかを入力してください。';
      $('rfError').hidden = false;
      return;
    }
    var now = nowIso();
    if (editingRecordId) {
      var r = getRecord(editingRecordId);
      var backup = { date: r.date, menu: r.menu, note: r.note, updatedAt: r.updatedAt };
      r.date = date; r.menu = menu; r.note = note; r.updatedAt = now;
      if (!save()) { Object.assign(r, backup); return; }
      toast('記録を更新しました');
    } else {
      db.records.push({
        id: newId(), customerId: currentCustomerId,
        date: date, menu: menu, note: note, createdAt: now, updatedAt: now
      });
      if (!save()) { db.records.pop(); return; }
      toast('施術記録を保存しました');
    }
    closeDialog($('recordDialog'));
    renderCustomer();
  });

  $('rfDelete').addEventListener('click', function () {
    var r = getRecord(editingRecordId);
    if (!r) return;
    if (!confirm(formatDate(r.date) + ' の施術記録を削除しますか？\nこの操作は元に戻せません。')) return;
    db.records = db.records.filter(function (x) { return x.id !== r.id; });
    save();
    closeDialog($('recordDialog'));
    renderCustomer();
    toast('記録を削除しました');
  });

  // ======================================================
  // 設定・バックアップ・復元
  // ======================================================
  function renderSettings() {
    $('dataStats').textContent =
      'お客様 ' + db.customers.length + '名／施術記録 ' + db.records.length + '件 が保存されています。';
    var last = '';
    try { last = localStorage.getItem(BACKUP_KEY) || ''; } catch (e) { /* 無視 */ }
    $('lastBackup').textContent = last
      ? '前回のバックアップ：' + new Date(last).toLocaleString('ja-JP')
      : 'まだバックアップしていません。';

    var ps = $('persistStatus');
    ps.textContent = '';
    if (navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then(function (p) {
        ps.textContent = p
          ? '保存領域：消えにくい設定（永続化）が有効です。'
          : '保存領域：通常（ブラウザの判断で消える可能性があります）。';
      }).catch(function () {});
    }
  }

  $('exportBtn').addEventListener('click', function () {
    var data = {
      app: APP_ID,
      version: DATA_VERSION,
      exportedAt: nowIso(),
      customers: db.customers,
      records: db.records
    };
    var json = JSON.stringify(data, null, 2);
    var d = new Date();
    var fname = 'fiore-note-backup-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
      '-' + pad(d.getHours()) + pad(d.getMinutes()) + '.json';
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    try { localStorage.setItem(BACKUP_KEY, nowIso()); } catch (e) { /* 無視 */ }
    renderSettings();
    toast('バックアップファイルを保存しました');
  });

  $('importInput').addEventListener('change', function () {
    var input = this;
    var file = input.files && input.files[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      alert('ファイルが大きすぎます。Fiore Note のバックアップファイルか確認してください。');
      input.value = '';
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      input.value = '';
      var parsed;
      try { parsed = JSON.parse(reader.result); } catch (e) {
        alert('ファイルを読み込めませんでした。\nFiore Note のバックアップファイル（.json）を選んでください。');
        return;
      }
      if (!parsed || parsed.app !== APP_ID) {
        alert('Fiore Note のバックアップファイルではないようです。');
        return;
      }
      var data = normalizeData(parsed);
      if (!data) {
        alert('バックアップファイルの内容が正しくありません。');
        return;
      }
      var when = parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleString('ja-JP') : '不明';
      var msg = 'バックアップから復元します。\n\n' +
        '・作成日時：' + when + '\n' +
        '・お客様 ' + data.customers.length + '名／施術記録 ' + data.records.length + '件\n\n' +
        '現在のデータ（お客様 ' + db.customers.length + '名／施術記録 ' + db.records.length + '件）は' +
        'すべて置き換わります。よろしいですか？';
      if (!confirm(msg)) return;
      var old = db;
      db = data;
      if (!save()) { db = old; return; }
      renderSettings();
      toast('復元しました');
    };
    reader.onerror = function () {
      input.value = '';
      alert('ファイルを読み込めませんでした。');
    };
    reader.readAsText(file);
  });

  $('sampleBtn').addEventListener('click', function () {
    if (!confirm('架空のサンプルデータ（お客様3名・施術記録5件）を追加しますか？\n今のデータは消えません。')) return;
    addSampleData();
    renderSettings();
    toast('サンプルデータを追加しました');
  });

  $('wipeBtn').addEventListener('click', function () {
    if (!confirm('すべてのお客様情報・施術記録を削除します。\n元に戻せません。よろしいですか？')) return;
    if (!confirm('本当に削除しますか？\n（必要ならキャンセルして、先にバックアップを保存してください）')) return;
    db = { customers: [], records: [] };
    save();
    renderSettings();
    toast('すべてのデータを削除しました');
  });

  // 架空のサンプルデータ（実在の人物ではありません）
  function addSampleData() {
    function daysAgo(n) {
      var d = new Date(); d.setDate(d.getDate() - n);
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }
    var now = nowIso();
    var a = { id: newId(), name: 'サンプル 花子', memo: '（架空のお客様）強めの圧が好み', createdAt: now, updatedAt: now };
    var b = { id: newId(), name: 'テスト さくら', memo: '', createdAt: now, updatedAt: now };
    var c = { id: newId(), name: 'みどりさん（架空）', memo: '', createdAt: now, updatedAt: now };
    db.customers.push(a, b, c);
    [
      [a, 60, 'ボディケア60分', '肩甲骨まわりの張りが強い。デスクワークで右肩が上がりがち。\n次回：首の可動域を確認。'],
      [a, 30, 'ボディケア60分', '前回より右肩の張りは軽減。腰に少し重さあり。\n次回：腰まわりも時間をとる。'],
      [a, 3, 'ヘッドスパ30分', '睡眠不足とのこと。頭皮が硬め。'],
      [b, 14, 'フェイシャル', '乾燥が気になる時期。保湿重点で。'],
      [c, 45, 'ボディケア90分', '初回。全身の疲れ。脚のむくみが強い。']
    ].forEach(function (x) {
      db.records.push({ id: newId(), customerId: x[0].id, date: daysAgo(x[1]), menu: x[2], note: x[3], createdAt: now, updatedAt: now });
    });
    save();
  }

  // ======================================================
  // ボタンのイベント
  // ======================================================
  $('backBtn').addEventListener('click', goBack);
  $('settingsBtn').addEventListener('click', function () { navigate('#/settings'); });
  $('addCustomerBtn').addEventListener('click', function () { openCustomerDialog(null); });
  $('editCustomerBtn').addEventListener('click', function () { openCustomerDialog(currentCustomerId); });
  $('addRecordBtn').addEventListener('click', function () { openRecordDialog(null); });
  $('searchInput').addEventListener('input', renderList);
  window.addEventListener('popstate', route);
  window.addEventListener('hashchange', route);

  // 他のタブで変更されたら反映
  window.addEventListener('storage', function (e) {
    if (e.key === STORAGE_KEY) { db = { customers: [], records: [] }; load(); route(); }
  });

  // ======================================================
  // 起動
  // ======================================================
  load();
  // ブラウザに「このデータは消さないで」とお願いする（対応ブラウザのみ）
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(function () {});
  }
  route();
})();
