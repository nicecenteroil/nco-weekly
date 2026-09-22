// =====================================================================
// GAS PROJECT : nco-weekly-api
// SPREADSHEET : NCO Weekly Meeting DB  (id อยู่ใน Script Property SHEET_ID)
// DEPLOY      : Web App / Execute as Me / Access Anyone
// CONSUMER    : https://weekly.nicecenter.co.th
// REPO        : github.com/nicecenteroil/nco-weekly  (โฟลเดอร์ api/)
// =====================================================================

// ---------------------------------------------------------------
// setupSheets() — สร้างชีตทั้ง 5 พร้อม header ถ้ายังไม่มี
// ---------------------------------------------------------------
function setupSheets() {
  var sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!sheetId) throw new Error('ยังไม่ได้ตั้ง Script Property SHEET_ID');
  var ss = SpreadsheetApp.openById(sheetId);

  var schemas = [
    { name: 'MEETINGS',
      headers: ['meeting_id','date','week_no','theme','status','created_at','updated_at'] },
    { name: 'SESSIONS',
      headers: ['session_id','meeting_id','seq','title','start_time','end_time'] },
    { name: 'AGENDA_ITEMS',
      headers: ['item_id','meeting_id','session_id','seq','topic','owner','planned_min','actual_sec','note','status','carry_from','updated_at'] },
    { name: 'ACTIONS',
      headers: ['action_id','meeting_id','item_id','action','assignee','due_date','done','closed_at'] },
    { name: 'PARKING',
      headers: ['park_id','meeting_id','text','created_at'] }
  ];

  schemas.forEach(function(schema) {
    var sheet = ss.getSheetByName(schema.name);
    if (sheet) {
      console.log('SKIP (already exists): ' + schema.name + ' (' + schema.headers.length + ' columns)');
      return;
    }
    sheet = ss.insertSheet(schema.name);
    sheet.getRange(1, 1, 1, schema.headers.length).setValues([schema.headers]);
    console.log('CREATED: ' + schema.name + ' (' + schema.headers.length + ' columns)');
  });
}

// ---------------------------------------------------------------
// Version
// ---------------------------------------------------------------
var VERSION = '1.3.1';

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function sh_(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function readAll_(name) {
  return sh_(name).getDataRange().getValues();
}

function rowsToObjects_(values) {
  if (values.length < 2) return [];
  var headers = values[0];
  return values.slice(1).map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) { obj[h] = row[i]; });
    return obj;
  });
}

function objectsToRows_(objs, headers) {
  return objs.map(function(obj) {
    return headers.map(function(h) { return obj[h] !== undefined ? obj[h] : ''; });
  });
}

var TEXT_COLS_ = {
  'MEETINGS':     ['date', 'created_at', 'updated_at'],
  'SESSIONS':     ['start_time', 'end_time'],
  'AGENDA_ITEMS': ['updated_at'],
  'ACTIONS':      ['due_date', 'closed_at'],
  'PARKING':      ['created_at']
};

function appendRows_(sheetName, objs) {
  if (!objs || objs.length === 0) return;
  var sheet    = sh_(sheetName);
  var headers  = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var rows     = objectsToRows_(objs, headers);
  var textIdxs = (TEXT_COLS_[sheetName] || [])
    .map(function(col) { return headers.indexOf(col); })
    .filter(function(i) { return i !== -1; });
  if (textIdxs.length > 0) {
    rows = rows.map(function(row) {
      var r = row.slice();
      textIdxs.forEach(function(i) {
        if (r[i] !== '' && r[i] !== null && r[i] !== undefined) r[i] = "'" + r[i];
      });
      return r;
    });
  }
  var startRow = sheet.getLastRow() + 1;
  var range    = sheet.getRange(startRow, 1, rows.length, headers.length);
  range.setNumberFormat('@');
  range.setValues(rows);
}

function now_() {
  return Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
}

function toDateStr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Bangkok', 'yyyy-MM-dd');
  return String(v);
}

function uid_(prefix) {
  var rand = Math.floor(Math.random() * 900) + 100;
  return prefix + '-' + Date.now() + '-' + rand;
}

function deleteRowsByMeeting_(sheetName, mid) {
  var sheet = sh_(sheetName);
  var data  = sheet.getDataRange().getValues();
  var midIdx = data[0].indexOf('meeting_id');
  for (var i = data.length - 1; i >= 1; i--) {
    if (data[i][midIdx] === mid) sheet.deleteRow(i + 1);
  }
}

function updateMeetingTimestamp_(mid, ts) {
  var sheet  = sh_('MEETINGS');
  var data   = sheet.getDataRange().getValues();
  var h      = data[0];
  var idIdx  = h.indexOf('meeting_id');
  var updIdx = h.indexOf('updated_at');
  for (var i = 1; i < data.length; i++) {
    if (data[i][idIdx] === mid) {
      data[i][updIdx] = ts;
      sheet.getRange(i + 1, 1, 1, h.length).setValues([data[i]]);
      break;
    }
  }
}

// อัปเดต status + updated_at ของ meeting (เฉพาะ 2 cell ไม่แตะ cell อื่น)
function updateMeetingStatus_(mid, status, ts) {
  var sheet  = sh_('MEETINGS');
  var data   = sheet.getDataRange().getValues();
  var h      = data[0];
  var idIdx  = h.indexOf('meeting_id');
  var stIdx  = h.indexOf('status');
  var updIdx = h.indexOf('updated_at');
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idIdx]) === mid) {
      sheet.getRange(i + 1, stIdx  + 1, 1, 1).setValue(status);
      sheet.getRange(i + 1, updIdx + 1, 1, 1).setValues([["'" + ts]]);
      break;
    }
  }
}

// ดึง sessions/items/parking/openActions ของ meeting นั้น — ใช้ร่วมกับ getMeeting และ getUpcoming
function buildMeetingPayload_(meeting) {
  var mid         = meeting.meeting_id;
  var sessions    = rowsToObjects_(readAll_('SESSIONS')).filter(function(r)     { return r.meeting_id === mid; });
  var items       = rowsToObjects_(readAll_('AGENDA_ITEMS')).filter(function(r) { return r.meeting_id === mid; });
  var parking     = rowsToObjects_(readAll_('PARKING')).filter(function(r)      { return r.meeting_id === mid; });
  var openActions = rowsToObjects_(readAll_('ACTIONS')).filter(function(r) {
    return r.meeting_id !== mid && String(r.done) !== 'TRUE';
  });
  return { ok: true, data: { meeting: meeting, sessions: sessions, items: items, parking: parking, openActions: openActions } };
}

// ---------------------------------------------------------------
// doPost + router
// ---------------------------------------------------------------

function doPost(e) {
  try {
    var req     = JSON.parse(e.postData.contents);
    var action  = req.action;
    var payload = req.payload || {};
    if (action !== 'ping') {
      var expected = PropertiesService.getScriptProperties().getProperty('APP_TOKEN');
      if (!req.token || req.token !== expected) {
        return out_({ ok: false, error: 'token ไม่ถูกต้อง' });
      }
    }
    switch (action) {
      case 'ping':               return out_(handlePing_());
      case 'getMeeting':         return out_(handleGetMeeting_(payload));
      case 'getUpcoming':        return out_(handleGetUpcoming_(payload));
      case 'createMeeting':      return out_(handleCreateMeeting_(payload));
      case 'rescheduleMeeting':  return out_(handleRescheduleMeeting_(payload));
      case 'saveAgenda':         return out_(handleSaveAgenda_(payload));
      case 'closeItem':          return out_(handleCloseItem_(payload));
      case 'addParking':         return out_(handleAddParking_(payload));
      case 'closeAction':        return out_(handleCloseAction_(payload));
      default:                   return out_({ ok: false, error: 'ไม่รู้จัก action: ' + action });
    }
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  }
}

function out_(r) {
  return ContentService.createTextOutput(JSON.stringify(r)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------

function handlePing_() {
  return { ok: true, data: { version: VERSION } };
}

function handleGetMeeting_(payload) {
  var date     = payload.date;
  var meetings = rowsToObjects_(readAll_('MEETINGS'));
  var meeting  = null;
  for (var i = 0; i < meetings.length; i++) {
    if (toDateStr_(meetings[i].date) === date) { meeting = meetings[i]; break; }
  }
  if (!meeting) {
    return { ok: true, data: { meeting: null, sessions: [], items: [], parking: [], openActions: [] } };
  }
  meeting.date = toDateStr_(meeting.date);
  return buildMeetingPayload_(meeting);
}

// คืน meeting ที่ใกล้ที่สุดซึ่ง date >= today และ status != done
function handleGetUpcoming_(payload) {
  var today    = payload.today;
  var meetings = rowsToObjects_(readAll_('MEETINGS'));
  var upcoming = meetings
    .filter(function(m) { return toDateStr_(m.date) >= today && String(m.status) !== 'done'; })
    .sort(function(a, b) {
      var da = toDateStr_(a.date), db = toDateStr_(b.date);
      return da < db ? -1 : da > db ? 1 : 0;
    });
  if (!upcoming.length) {
    return { ok: true, data: { meeting: null, sessions: [], items: [], parking: [], openActions: [] } };
  }
  var meeting = upcoming[0];
  meeting.date = toDateStr_(meeting.date);
  return buildMeetingPayload_(meeting);
}

function handleCreateMeeting_(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var date   = payload.date;
    var weekNo = payload.week_no;
    var theme  = payload.theme || '';
    var ts     = now_();

    var meetings = rowsToObjects_(readAll_('MEETINGS'));

    // ตรวจซ้ำด้วย date (ไม่ใช่ meeting_id เพราะ id อาจถูกเลื่อนวันไปแล้ว)
    for (var i = 0; i < meetings.length; i++) {
      if (toDateStr_(meetings[i].date) === date) {
        return { ok: false, error: 'ประชุมวันที่ ' + date + ' มีอยู่แล้ว' };
      }
    }

    // gen id และเติม suffix ถ้า id ชนกับของเดิม (เกิดจากเลื่อนวัน)
    var mid = 'M-' + date.replace(/-/g, '');
    var existingIds = meetings.map(function(m) { return m.meeting_id; });
    if (existingIds.indexOf(mid) !== -1) {
      var suffixes = ['-b', '-c', '-d', '-e'];
      for (var k = 0; k < suffixes.length; k++) {
        if (existingIds.indexOf(mid + suffixes[k]) === -1) { mid = mid + suffixes[k]; break; }
      }
    }

    // ปิดเฉพาะประชุมที่เกิดขึ้นแล้ว (date <= วันนี้) และยังไม่ done
    var todayBkk = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
    meetings.forEach(function(m) {
      if (toDateStr_(m.date) <= todayBkk && String(m.status) !== 'done') {
        updateMeetingStatus_(m.meeting_id, 'done', ts);
      }
    });

    appendRows_('MEETINGS', [{
      meeting_id: mid, date: date, week_no: weekNo, theme: theme,
      status: 'planning', created_at: ts, updated_at: ts
    }]);

    appendRows_('SESSIONS', [
      { session_id: mid + '-am', meeting_id: mid, seq: 1,
        title: 'ช่วงเช้า — เคลียร์เอกสาร / Collection', start_time: '09:30', end_time: '12:00' },
      { session_id: mid + '-pm', meeting_id: mid, seq: 2,
        title: 'ช่วงบ่าย — ประชุมทีม', start_time: '13:30', end_time: '16:00' }
    ]);

    var sorted     = meetings.slice().sort(function(a, b) { return a.date < b.date ? 1 : -1; });
    var prevMid    = sorted.length > 0 ? sorted[0].meeting_id : null;
    var pmSid      = mid + '-pm';
    var seq        = 1;
    var allActions = rowsToObjects_(readAll_('ACTIONS'));
    var newItems   = [];

    if (prevMid) {
      rowsToObjects_(readAll_('AGENDA_ITEMS'))
        .filter(function(r) { return r.meeting_id === prevMid && r.status === 'moved'; })
        .forEach(function(orig) {
          newItems.push({
            item_id: uid_('I'), meeting_id: mid, session_id: pmSid, seq: seq++,
            topic: orig.topic, owner: orig.owner, planned_min: orig.planned_min,
            actual_sec: '', note: '', status: 'todo', carry_from: orig.item_id, updated_at: ts
          });
        });
    }

    allActions.filter(function(r) { return String(r.done) !== 'TRUE'; })
      .forEach(function(a) {
        newItems.push({
          item_id: uid_('I'), meeting_id: mid, session_id: pmSid, seq: seq++,
          topic: '[ติดตาม] ' + a.action, owner: a.assignee, planned_min: 5,
          actual_sec: '', note: '', status: 'todo', carry_from: a.action_id, updated_at: ts
        });
      });

    appendRows_('AGENDA_ITEMS', newItems);

    console.log('createMeeting: ' + mid + ' date=' + date + ' carried=' + (seq - 1));
    return { ok: true, data: { meeting_id: mid } };
  } finally {
    SpreadsheetApp.flush();
    lock.releaseLock();
  }
}

// แก้เฉพาะ date และ updated_at — ไม่เปลี่ยน meeting_id ไม่แตะชีตอื่น
function handleRescheduleMeeting_(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var mid     = payload.meeting_id;
    var newDate = payload.new_date;
    var ts      = now_();
    var sheet   = sh_('MEETINGS');
    var data    = sheet.getDataRange().getValues();
    var h       = data[0];
    var idIdx   = h.indexOf('meeting_id');
    var dtIdx   = h.indexOf('date');
    var updIdx  = h.indexOf('updated_at');

    // ตรวจชนกับประชุมอื่น
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idIdx]) !== mid && toDateStr_(data[i][dtIdx]) === newDate) {
        return { ok: false, error: 'วันที่ ' + newDate + ' มีประชุมอยู่แล้ว' };
      }
    }
    // อัปเดตเฉพาะ 2 คอลัมน์ เติม apostrophe นำหน้าค่าตามข้อจำกัดข้อ 7
    for (var j = 1; j < data.length; j++) {
      if (String(data[j][idIdx]) === mid) {
        sheet.getRange(j + 1, dtIdx  + 1, 1, 1).setValues([["'" + newDate]]);
        sheet.getRange(j + 1, updIdx + 1, 1, 1).setValues([["'" + ts]]);
        console.log('rescheduleMeeting: ' + mid + ' → ' + newDate);
        return { ok: true, data: { meeting_id: mid, new_date: newDate } };
      }
    }
    return { ok: false, error: 'ไม่พบประชุม ' + mid };
  } finally {
    SpreadsheetApp.flush();
    lock.releaseLock();
  }
}

function handleSaveAgenda_(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var mid      = payload.meeting_id;
    var sessions = payload.sessions || [];
    var items    = payload.items    || [];
    var ts       = now_();

    deleteRowsByMeeting_('SESSIONS', mid);
    if (sessions.length > 0) appendRows_('SESSIONS', sessions);

    deleteRowsByMeeting_('AGENDA_ITEMS', mid);
    if (items.length > 0) {
      items.forEach(function(item) {
        if (!item.item_id) item.item_id = uid_('I');
        item.updated_at = ts;
      });
      appendRows_('AGENDA_ITEMS', items);
    }

    updateMeetingTimestamp_(mid, ts);
    console.log('saveAgenda: ' + mid + ' sessions=' + sessions.length + ' items=' + items.length);
    return { ok: true, data: { meeting_id: mid } };
  } finally {
    SpreadsheetApp.flush();
    lock.releaseLock();
  }
}

function handleCloseItem_(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var ts     = now_();
    var iSheet = sh_('AGENDA_ITEMS');
    var iData  = iSheet.getDataRange().getValues();
    var h      = iData[0];
    var idIdx  = h.indexOf('item_id');
    var stIdx  = h.indexOf('status');
    var asIdx  = h.indexOf('actual_sec');
    var ntIdx  = h.indexOf('note');
    var upIdx  = h.indexOf('updated_at');

    for (var i = 1; i < iData.length; i++) {
      if (iData[i][idIdx] === payload.item_id) {
        if (payload.status     !== undefined) iData[i][stIdx] = payload.status;
        if (payload.actual_sec !== undefined) iData[i][asIdx] = payload.actual_sec;
        if (payload.note       !== undefined) iData[i][ntIdx] = payload.note;
        iData[i][upIdx] = ts;
        iSheet.getRange(i + 1, 1, 1, h.length).setValues([iData[i]]);
        break;
      }
    }

    if (payload.action) {
      appendRows_('ACTIONS', [{
        action_id: uid_('A'), meeting_id: payload.meeting_id, item_id: payload.item_id,
        action: payload.action, assignee: payload.assignee || '',
        due_date: payload.due_date || '', done: 'FALSE', closed_at: ''
      }]);
    }

    // ถ้าไม่เหลือ todo ในประชุมนี้ → ตั้ง meeting status เป็น done
    var remaining = rowsToObjects_(readAll_('AGENDA_ITEMS')).filter(function(r) {
      return r.meeting_id === payload.meeting_id && r.status === 'todo';
    });
    if (remaining.length === 0) {
      updateMeetingStatus_(payload.meeting_id, 'done', ts);
    }

    return { ok: true, data: { item_id: payload.item_id } };
  } finally {
    SpreadsheetApp.flush();
    lock.releaseLock();
  }
}

function handleAddParking_(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var ts  = now_();
    var pid = uid_('P');
    appendRows_('PARKING', [{
      park_id: pid, meeting_id: payload.meeting_id, text: payload.text, created_at: ts
    }]);
    console.log('addParking: ' + pid);
    return { ok: true, data: { park_id: pid } };
  } finally {
    SpreadsheetApp.flush();
    lock.releaseLock();
  }
}

function handleCloseAction_(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var ts     = now_();
    var aSheet = sh_('ACTIONS');
    var aData  = aSheet.getDataRange().getValues();
    var h      = aData[0];
    var idIdx  = h.indexOf('action_id');
    var dnIdx  = h.indexOf('done');
    var clIdx  = h.indexOf('closed_at');

    for (var i = 1; i < aData.length; i++) {
      if (aData[i][idIdx] === payload.action_id) {
        aData[i][dnIdx] = 'TRUE';
        aData[i][clIdx] = ts;
        aSheet.getRange(i + 1, 1, 1, h.length).setValues([aData[i]]);
        break;
      }
    }

    return { ok: true, data: { action_id: payload.action_id } };
  } finally {
    SpreadsheetApp.flush();
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------
// setTextFormat() — ตั้ง NumberFormat '@' ให้คอลัมน์วันเวลา
//   รันครั้งเดียวหลัง setupSheets() หรือเมื่อพบปัญหา date auto-convert
// ---------------------------------------------------------------
function setTextFormat() {
  var config = [
    { sheet: 'MEETINGS',     cols: ['date', 'created_at', 'updated_at'] },
    { sheet: 'SESSIONS',     cols: ['start_time', 'end_time'] },
    { sheet: 'AGENDA_ITEMS', cols: ['updated_at'] },
    { sheet: 'ACTIONS',      cols: ['due_date', 'closed_at'] },
    { sheet: 'PARKING',      cols: ['created_at'] }
  ];

  config.forEach(function(cfg) {
    var sheet   = sh_(cfg.sheet);
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var maxRows = sheet.getMaxRows();
    var applied = [];

    cfg.cols.forEach(function(colName) {
      var idx = headers.indexOf(colName);
      if (idx === -1) return;
      var colNum = idx + 1;
      if (maxRows > 1) {
        sheet.getRange(2, colNum, maxRows - 1, 1).setNumberFormat('@');
      }
      applied.push(colName + '(col ' + colNum + ')');
    });

    console.log('setTextFormat ' + cfg.sheet + ': ' + applied.join(', '));
  });
}

// ---------------------------------------------------------------
// cleanupTestData() — ลบแถวทดสอบออกจากทุกชีต (filter ด้วย meeting_id)
//   Poom รันเองจาก editor
// ---------------------------------------------------------------
function cleanupTestData(mids) {
  if (!mids) mids = ['M-20260919'];
  mids.forEach(function(mid) {
    ['MEETINGS', 'SESSIONS', 'AGENDA_ITEMS', 'ACTIONS', 'PARKING'].forEach(function(sheetName) {
      deleteRowsByMeeting_(sheetName, mid);
      console.log('cleanupTestData: cleared ' + sheetName + ' for ' + mid);
    });
  });
}

// ---------------------------------------------------------------
// wipeAllSheets() — ล้างข้อมูลทั้งหมดออกจากทุกชีต เหลือแค่ header
//   ใช้เมื่อ cleanupTestData ล้างไม่หมด เช่น ID ในชีตไม่ตรงกับลิสต์
//   Poom รันเองจาก editor
// ---------------------------------------------------------------
function wipeAllSheets() {
  ['MEETINGS', 'SESSIONS', 'AGENDA_ITEMS', 'ACTIONS', 'PARKING'].forEach(function(sheetName) {
    var sheet = sh_(sheetName);
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.deleteRows(2, lastRow - 1);
      console.log('wipeAllSheets: cleared ' + (lastRow - 1) + ' rows from ' + sheetName);
    } else {
      console.log('wipeAllSheets: ' + sheetName + ' already empty');
    }
  });
}
