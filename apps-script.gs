/* أقساطي 💸 — كود الشيت (Google Apps Script)
   1) اعمل Google Sheet جديد ← Extensions ← Apps Script ← امسح اللي موجود والصق ده ← Save
   2) Deploy ← New deployment ← Web app ← Execute as: Me · Who has access: Anyone ← Deploy
   3) انسخ الرابط اللي آخره /exec وحطه في التطبيق ← ⚙️ الإعدادات
   4) عشان قراية الإيصالات: Services (الخدمات) ➕ ← Drive API ← Add */

const TOKEN = 'ihab-aqsati';   // لو غيّرتها هنا غيّرها في التطبيق كمان

const TX = 'الأقساط', MET = 'طرق الدفع', SUM = 'ملخص شهري';
const TX_HEAD = ['ID', 'التاريخ', 'العميل', 'المبلغ', 'طريقة الدفع', 'ملاحظة', 'اتسجل في', 'method_id', 'الصور', 'photos'];
const FOLDER = 'أقساطي - صور التحويلات';

function doGet() { setup_(); folder_(); return out_({ ok: true, msg: 'أقساطي شغال ✅' }); }

function doPost(e) {
  let b; try { b = JSON.parse(e.postData.contents); } catch (x) { return out_({ ok: false, error: 'bad json' }); }
  if (b.token !== TOKEN) return out_({ ok: false, error: 'wrong token' });
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    setup_();
    switch (b.action) {
      case 'ping': return out_({ ok: true });
      case 'save': if (!findRow_(b.tx.id)) sh_(TX).appendRow(row_(b.tx)); return out_({ ok: true });
      case 'update': { const r = findRow_(b.tx.id); if (r) sh_(TX).getRange(r, 1, 1, TX_HEAD.length).setValues([row_(b.tx)]); else sh_(TX).appendRow(row_(b.tx)); return out_({ ok: true }); }
      case 'delete': {
        const r = findRow_(b.id);
        if (r) { try { JSON.parse(sh_(TX).getRange(r, 10).getValue() || '[]').forEach(p => { if (p.fid) DriveApp.getFileById(p.fid).setTrashed(true); }); } catch (x) {} sh_(TX).deleteRow(r); }
        return out_({ ok: true });
      }
      case 'upload': {   // الصورة بجودتها الكاملة → فولدر في درايف
        const blob = Utilities.newBlob(Utilities.base64Decode(b.data), b.type || 'image/jpeg', b.name || ('photo_' + Date.now() + '.jpg'));
        const f = folder_().createFile(blob);
        return out_({ ok: true, fid: f.getId() });
      }
      case 'ocr': {   // قراية الإيصال بـ OCR بتاع جوجل (عربي + إنجليزي)
        const blob = Utilities.newBlob(Utilities.base64Decode(b.data), b.type || 'image/jpeg', 'ocr.jpg');
        let id;
        if (Drive.Files.create) id = Drive.Files.create({ name: 'aqsati_ocr_tmp', mimeType: MimeType.GOOGLE_DOCS }, blob, { ocrLanguage: 'ar' }).id;
        else id = Drive.Files.insert({ title: 'aqsati_ocr_tmp', mimeType: MimeType.GOOGLE_DOCS }, blob, { ocr: true, ocrLanguage: 'ar' }).id;
        let text = '';
        try { text = DocumentApp.openById(id).getBody().getText(); }
        finally { try { DriveApp.getFileById(id).setTrashed(true); } catch (x) {} }
        return out_({ ok: true, text });
      }
      case 'getPhoto': {
        const blob = DriveApp.getFileById(b.fid).getBlob();
        return out_({ ok: true, type: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) });
      }
      case 'setMethods': {
        const s = sh_(MET); if (s.getLastRow() > 1) s.getRange(2, 1, s.getLastRow() - 1, 4).clearContent();
        const rows = (b.methods || []).map(m => [m.id, m.name, m.emoji, m.color]);
        if (rows.length) s.getRange(2, 1, rows.length, 4).setValues(rows);
        return out_({ ok: true });
      }
      case 'getAll': {
        const tx = sh_(TX).getDataRange().getDisplayValues().slice(1).filter(r => r[0]).map(r => ({
          id: r[0], date: r[1], name: r[2], amount: +String(r[3]).replace(/,/g, ''), mname: r[4], note: r[5], created: r[6], method: r[7], photos: json_(r[9]) }));
        const methods = sh_(MET).getDataRange().getDisplayValues().slice(1).filter(r => r[0]).map(r => ({ id: r[0], name: r[1], emoji: r[2], color: r[3] }));
        return out_({ ok: true, tx, methods });
      }
    }
    return out_({ ok: false, error: 'unknown action' });
  } catch (err) { return out_({ ok: false, error: String(err) }); }
  finally { lock.releaseLock(); }
}

function row_(t) {
  return ["'" + t.id, "'" + t.date, "'" + t.name, +t.amount, "'" + (t.mname || t.method), "'" + (t.note || ''),
    "'" + Utilities.formatDate(new Date(t.created || Date.now()), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'), "'" + t.method,
    "'" + (t.photos || []).filter(p => p.fid).map(p => 'https://drive.google.com/file/d/' + p.fid + '/view').join('\n'),
    "'" + JSON.stringify((t.photos || []).filter(p => p.fid))];
}
function json_(v) { try { return JSON.parse(v || '[]'); } catch (x) { return []; } }
function folder_() {
  const it = DriveApp.getFoldersByName(FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER);
}
function findRow_(id) { const f = sh_(TX).getRange('A:A').createTextFinder(String(id)).matchEntireCell(true).findNext(); return f ? f.getRow() : 0; }
function sh_(n) { return SpreadsheetApp.getActive().getSheetByName(n); }
function setup_() {
  const ss = SpreadsheetApp.getActive();
  [[TX, TX_HEAD], [MET, ['id', 'الاسم', 'الأيقونة', 'اللون']]].forEach(([n, h]) => {
    let s = ss.getSheetByName(n); if (s) return;
    s = ss.insertSheet(n); s.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#0c1c12').setFontColor('#a3e635');
    s.setFrozenRows(1); s.setRightToLeft(true);
    if (n === TX) { s.hideColumns(8); s.hideColumns(10); }
    if (n === MET) s.getRange(2, 1, 3, 4).setValues([['cash', 'كاش', '💵', '#4ade80'], ['vf', 'فودافون كاش', '🔴', '#ef4444'], ['insta', 'إنستاباي', '🟣', '#a855f7']]);
  });
  const t = ss.getSheetByName(TX);   // الشيت القديم: ضيف عواميد الصور
  if (t.getRange(1, 9).getValue() !== 'الصور') { t.getRange(1, 9, 1, 2).setValues([['الصور', 'photos']]).setFontWeight('bold').setBackground('#0c1c12').setFontColor('#a3e635'); t.hideColumns(10); }
  if (!ss.getSheetByName(SUM)) {   // ملخص: إجمالي كل شهر حسب طريقة الدفع
    const s = ss.insertSheet(SUM); s.setRightToLeft(true);
    s.getRange('A1').setFormula("=IFERROR(QUERY({ARRAYFORMULA(LEFT(الأقساط!B2:B,7)),الأقساط!D2:D,الأقساط!E2:E},\"select Col1, sum(Col2) where Col2 > 0 group by Col1 pivot Col3 order by Col1 desc label Col1 'الشهر'\",0),\"لسه مفيش أقساط\")");
    s.getRange(1, 1, 1, 10).setFontWeight('bold');
  }
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
