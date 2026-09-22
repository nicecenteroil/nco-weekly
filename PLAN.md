# PLAN.md — nco-weekly (weekly.nicecenter.co.th)

> ไฟล์นี้คือแผนงานทั้งหมด CC ต้องอ่านไฟล์นี้ให้ครบทุกครั้งที่เปิดเซสชันใหม่ ก่อนลงมือรอบใด ๆ

---

## สถานะปัจจุบัน

| รอบ | สถานะ |
|---|---|
| ROUND 0 — survey | ✅ เสร็จแล้ว 16 ก.ย. 2026 |
| ROUND 1 — GAS scaffold | ✅ เสร็จแล้ว |
| ROUND 2 — API handlers | ✅ เสร็จแล้ว T1-T11 ผ่านครบ |
| ROUND 3 — Frontend | ✅ เสร็จแล้ว T1-T15 ผ่านครบ |
| ROUND 4 — Deploy | ⬜ |

### สิ่งที่ทำเสร็จแล้วใน ROUND 3

- `api.js` call() อ่าน response เป็น text ก่อน แล้ว JSON.parse ใน try — ถ้า parse ไม่ได้ throw Error ที่มี `badResponse = true` ("ระบบตอบกลับผิดรูปแบบ")
- `createAndLoad()` และ `nextWeek()` ใน app.js — ถ้าเจอ badResponse ให้เรียก `getUpcoming` ก่อน ถ้าเจอประชุมวันที่นั้นแสดงว่าสร้างสำเร็จ โหลดเงียบ ๆ โดยไม่แสดง error
- **Note:** createMeeting เคยตอบ HTML แม้ทำงานสำเร็จ — หน้าเว็บรับมือด้วยการเช็ค getUpcoming ซ้ำ

### สิ่งที่ทำเสร็จแล้วใน ROUND 2

- `appendRows_` ทำ `setNumberFormat('@')` + เติม apostrophe นำหน้าค่า text columns ก่อน `setValues()`
- `toDateStr_()` normalize Date object → string ฝั่งอ่าน รับแถวเก่าที่เขียนก่อนมีการแก้ไข
- `cleanupTestData` รับ array ของ meeting_id แล้ว
- ชุดทดสอบ T1–T11 อยู่ใน `TESTS.md` — อ่านก่อนรันทุกครั้ง
- วิธีทดสอบใช้ `node tools\post.js` เท่านั้น ห้ามใช้ curl (411 ตอน redirect)
- deployment URL ปัจจุบัน (ใช้จริง): `AKfycbxmhjKopZvo384w_sncaoinKPkGrNVd_m6BBI9ugpo8pE0o37Qw1ocp75GTq6irT0_9RQ`

**ผลจาก ROUND 0 ที่ต้องจำ**
- `E:\Projects\nco-weekly\` มีอยู่แล้ว ยังไม่ได้ `git init`
- ในโฟลเดอร์มี `PLAN.md` (ไฟล์นี้) กับ `weekly-meeting-prototype.html` แล้ว
- **clasp = 3.3.0** ไม่ใช่ 2.x — syntax ต่างจากที่เจอในบล็อกเก่าทั่วไป ห้ามสมมติ
- **`gh` CLI ไม่มีบนเครื่อง** — repo สร้างด้วยมือจากหน้าเว็บ ใช้ `git remote add` เอา
- Poom รัน `npx clasp login` เลือกบัญชีที่เป็นเจ้าของสเปรดชีตเรียบร้อยแล้ว

---

## บริบทโปรเจกต์

สร้างระบบใหม่ **`nco-weekly`** — เว็บแอปจัดการประชุมทีม DSR ประจำวันเสาร์ของ Nice Center Oil
ระบบนี้ **แยกขาดจาก `nco-dsr-ecosystem`** ห้ามแตะ repo นั้นหรือไฟล์ใด ๆ ใน `E:\Projects\nco-dsr-ecosystem\` ตลอดทุกรอบ

**ค่าคงที่ของโปรเจกต์**
```
SHEET_ID   = 1YoMIfGVgm5BTQvPAY2VcniG9Gpmzy2rj9YMnIt5LSGQ
SHEET_NAME = NCO Weekly Meeting DB
SCRIPT_ID  = 1KYQNTgsjFbTbo5a_L9osDrlSCZ6owFB1wiPBcGBEX0J7Invq-PiVXdkk
TYPE       = container-bound ผูกกับ SHEET_ID
GAS_TITLE  = nco-weekly-api
WEBAPP_URL = https://script.google.com/macros/s/AKfycbxXy0ILbWKSyOWq317gFmD8--D0XenyX94m9Ym5L83vEkUH2brupn2_PqSkU2OMFG0F4Q/exec
REPO       = https://github.com/nicecenteroil/nco-weekly   (public, สร้างด้วยมือแล้ว)
DOMAIN     = weekly.nicecenter.co.th
LOCAL      = E:\Projects\nco-weekly\
```

**สถาปัตยกรรม**

| ชั้น | เทคโนโลยี | ที่อยู่ |
|---|---|---|
| Frontend | static HTML/CSS/JS ไม่มี build step | GitHub Pages → `weekly.nicecenter.co.th` |
| API | Google Apps Script Web App (`doPost` อย่างเดียว) | GAS project `nco-weekly-api` |
| Database | Google Sheets | สเปรดชีต `SHEET_ID` ข้างบน |

**ข้อจำกัดที่ต้องรู้ก่อนเขียนโค้ด**

1. เรียก GAS จากเบราว์เซอร์ต้องใช้ `fetch(url, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify(payload)})` — ถ้าใส่ `application/json` จะเกิด CORS preflight แล้ว GAS ตอบ OPTIONS ไม่ได้ ใช้ไม่ได้ทันที
2. GAS deploy แบบ **Execute as: Me / Who has access: Anyone** เท่านั้น ถึงจะเรียกจากโดเมนนอกได้
3. ทุก write ต้องผ่าน `LockService.getScriptLock()` กันชนกันตอนสองเครื่องแก้พร้อมกัน
4. repo เป็น public → **ห้ามฝัง secret ใด ๆ ในโค้ด frontend** สิทธิ์เข้าใช้คุมด้วย passcode ที่เก็บใน Script Properties ฝั่ง GAS
5. **clasp 3.x**: เมื่อใช้ `--rootDir` ไฟล์ `.clasp.json` จะถูกสร้างที่ **current working directory** แล้วเก็บ relative path ของ rootDir ไว้ข้างใน ไม่ได้สร้างในโฟลเดอร์ปลายทาง — ต่างจาก 2.x
6. **smoke test ใช้ `node tools\post.js` ไม่ใช้ curl** — curl บน Windows ตอบ 411 Length Required ระหว่าง redirect ของ GAS (GAS ตอบ 302 ไป googleusercontent แล้ว curl ยิงต่อโดยไม่ส่ง Content-Length) ต้อง follow redirect เองและส่ง body ซ้ำ ใช้ `tools\post.js` ที่เตรียมไว้แล้ว ห้ามเสียเวลาลอง curl ซ้ำ
   **hop 2 ของ post.js ต้องเป็น GET เสมอ** — `googleusercontent.com/macros/echo?...` คือที่พักผลลัพธ์ที่คำนวณเสร็จแล้ว ไม่ใช่ endpoint รับ input ถ้า hop 2 เป็น 302 กลับไปที่ exec อีกครั้ง แปลว่า execution ล้มเหลว (script error หรือ token ผิด) ไม่ใช่ปัญหา post.js
7. **ค่า text ในชีต (date, เวลา, timestamp) ต้องเติม apostrophe นำหน้าตอนเขียน** — `setNumberFormat('@')` อย่างเดียวไม่พอ เพราะ GAS จะตั้ง format ใหม่ทับตอน `setValues()` ถ้าค่าหน้าตาเหมือนวัน/เวลา (เช่น `2026-09-19`, `09:30`) — วิธีที่ใช้คือ `appendRows_` ในโค้ดเติม `'` นำหน้าค่าใน `TEXT_COLS_` ก่อนส่งให้ `setValues`
8. **หลัง `clasp push` ทุกครั้งต้อง deploy new version** — ถ้าไม่ deploy โค้ดเก่ายังรันอยู่ อาการจะเหมือนแก้ไม่ติด ขั้นตอน: Apps Script Editor → Deploy → Manage deployments → New version; `clasp run` ไม่สามารถใช้ trigger cleanupTestData ได้บนเครื่องนี้ (ต้องให้ Poom รันจาก editor เอง)

---

## โครงโฟลเดอร์เป้าหมาย

```
E:\Projects\nco-weekly\
├─ .clasp.json                    ← clasp สร้างที่ root (พฤติกรรม v3)
├─ .gitignore
├─ PLAN.md
├─ README.md
├─ weekly-meeting-prototype.html  ← ต้นแบบ UI ที่อนุมัติแล้ว ห้ามแก้
├─ api\                           ← ซอร์ส GAS เท่านั้น
│  ├─ appsscript.json
│  └─ Code.js
└─ docs\                          ← static site ที่จะขึ้น GitHub Pages (ชื่อ docs เพื่อใช้กับ Pages)
   ├─ index.html
   ├─ app.css
   ├─ app.js
   ├─ api.js
   ├─ config.js
   └─ CNAME
```

---

## Schema — สเปรดชีต `NCO Weekly Meeting DB`

สร้าง 5 ชีต หัวคอลัมน์ตรงตามนี้เป๊ะ แถว 1 คือ header เสมอ

**`MEETINGS`**
```
meeting_id | date | week_no | theme | status | created_at | updated_at
```
- `meeting_id` = `M-YYYYMMDD` (เช่น `M-20260919`)
- `date` = `YYYY-MM-DD` เก็บเป็น **text** ไม่ใช่ date object กัน timezone เพี้ยน
- `status` = `planning` | `running` | `done`

**`SESSIONS`**
```
session_id | meeting_id | seq | title | start_time | end_time
```
- `session_id` = `<meeting_id>-am` / `<meeting_id>-pm`
- `start_time` / `end_time` = `HH:mm` เป็น text
- ค่า default ตอนสร้างประชุมใหม่:
  - `am` · `ช่วงเช้า — เคลียร์เอกสาร / Collection` · 09:30–12:00
  - `pm` · `ช่วงบ่าย — ประชุมทีม` · 13:30–16:00

**`AGENDA_ITEMS`**
```
item_id | meeting_id | session_id | seq | topic | owner | planned_min | actual_sec | note | status | carry_from | updated_at
```
- `item_id` = `I-<timestamp>-<3 หลักสุ่ม>`
- `owner` ∈ `DSR` | `Castrol` | `NICE - Poom` | `NICE - Fern`
- `status` = `todo` | `done` | `moved`
- `carry_from` = `item_id` เดิมที่ยกมา ว่างถ้าเป็นหัวข้อใหม่

**`ACTIONS`**
```
action_id | meeting_id | item_id | action | assignee | due_date | done | closed_at
```
- `done` = `TRUE` / `FALSE` เป็น string

**`PARKING`**
```
park_id | meeting_id | text | created_at
```

---

## API contract

`doPost(e)` → `JSON.parse(e.postData.contents)` → `{ token, action, payload }`

ตอบกลับด้วย `ContentService.createTextOutput(JSON.stringify(r)).setMimeType(ContentService.MimeType.JSON)` เสมอ
รูปแบบผลลัพธ์: `{ ok:true, data:{...} }` หรือ `{ ok:false, error:'<ข้อความไทย>' }`

ตรวจ `token` เทียบ `PropertiesService.getScriptProperties().getProperty('APP_TOKEN')` ทุก action ยกเว้น `ping`

| action | payload | คืนอะไร |
|---|---|---|
| `ping` | — | `{version}` ไว้ smoke test ไม่ต้องใช้ token |
| `getMeeting` | `{date}` | `{meeting, sessions[], items[], parking[], openActions[]}` — `openActions` คือ ACTIONS ของ**ประชุมก่อนหน้า**ที่ `done=FALSE` |
| `createMeeting` | `{date, week_no, theme}` | สร้าง MEETINGS + SESSIONS ค่า default + **ยกของเก่ามาอัตโนมัติ**: ทุก item ที่ `status='moved'` และทุก ACTION ที่ `done=FALSE` จากประชุมครั้งล่าสุด กลายเป็น AGENDA_ITEMS ใหม่ใน session `pm` โดยตั้ง `carry_from` ไว้ |
| `saveAgenda` | `{meeting_id, sessions[], items[]}` | เขียนทับทั้งชุดของ meeting นี้ (ลบแถวเดิมของ meeting_id แล้วเขียนใหม่) ใช้กับ autosave |
| `closeItem` | `{meeting_id, item_id, status, actual_sec, note, action, assignee}` | อัปเดต 1 แถวใน AGENDA_ITEMS และถ้ามี `action` ให้ insert ลง ACTIONS |
| `addParking` | `{meeting_id, text}` | insert PARKING |
| `closeAction` | `{action_id}` | เซ็ต `done=TRUE`, `closed_at=now` |

**หมายเหตุการ implement:** `saveAgenda` ใช้วิธีลบ-แล้วเขียนใหม่ ไม่ใช่ diff เพราะวาระต่อประชุมมีไม่เกิน ~30 แถว ทำ diff ไม่คุ้มความซับซ้อนและพังง่ายกว่า

---

## ROUND 0 — SURVEY ✅ เสร็จแล้ว

ข้ามไปได้เลย ผลลัพธ์อยู่ในหัวข้อ "สถานะปัจจุบัน" ด้านบน

---

## ROUND 1 — GAS scaffold

**1.1 เช็ค syntax ของ clasp ก่อนทำอะไรทั้งสิ้น**
```
npx clasp --help
npx clasp create-script --help
```
รายงานรายชื่อคำสั่งที่มีจริงให้ Poom ดู **แล้วรอยืนยันก่อนรัน create** — v3 เปลี่ยนชื่อคำสั่งบางตัว ถ้าคำสั่งที่เขียนใน PLAN นี้ไม่ตรงกับ `--help` ให้ยึด `--help` เป็นหลักและแจ้งความต่าง ห้ามเดา ห้ามลองสุ่ม flag

**1.2 สร้างโฟลเดอร์ `api\` และ `docs\`** (ยังว่าง)

**1.3 เขียน `api\appsscript.json`**
```json
{
  "timeZone": "Asia/Bangkok",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": { "executeAs": "USER_DEPLOYING", "access": "ANYONE_ANONYMOUS" }
}
```

**1.4 เขียน `api\Code.js`** — ขึ้นต้นด้วยบล็อกระบุโปรเจกต์ ใช้ `//` เท่านั้น ห้ามใช้ `/* */` ซ้อนกัน
```js
// =====================================================================
// GAS PROJECT : nco-weekly-api
// SPREADSHEET : NCO Weekly Meeting DB  (id อยู่ใน Script Property SHEET_ID)
// DEPLOY      : Web App / Execute as Me / Access Anyone
// CONSUMER    : https://weekly.nicecenter.co.th
// REPO        : github.com/nicecenteroil/nco-weekly  (โฟลเดอร์ api/)
// =====================================================================
```

รอบนี้เขียน **`setupSheets()` อย่างเดียว** — สร้างชีตทั้ง 5 พร้อม header ตาม schema ข้างบน ถ้าชีตไหนมีอยู่แล้วให้ข้าม **ห้ามเขียนทับ** จบด้วย `console.log` ชื่อชีตกับจำนวนคอลัมน์ที่สร้าง

**1.5 รัน create** (ใช้ syntax ที่ยืนยันจาก 1.1 แล้ว) จาก `E:\Projects\nco-weekly\` โดยตั้ง title = `nco-weekly-api`, type = standalone, rootDir = `./api`
เสร็จแล้ว **หยุด — ห้าม push**

**Poom ทำเอง:** ใส่ `SHEET_ID` + `APP_TOKEN` ลง Script Properties แล้วรัน `setupSheets()` จาก editor เพื่อกด consent (ต้องรันจาก editor เท่านั้นถึงจะเด้งหน้า authorize)

**HALT** — รายงาน: script id, ตำแหน่งจริงของ `.clasp.json`, และ full content ของ `Code.js`

---

## ROUND 2 — GAS API handlers

เพิ่มใน `api\Code.js` โดย **ไม่แตะ `setupSheets()`**:

- `doPost(e)` + router
- helper: `sh_(name)`, `readAll_(name)`, `rowsToObjects_(values)`, `objectsToRows_(objs, headers)`, `now_()`, `uid_(prefix)`
- ทุก action ตาม contract ด้านบน
- ทุก action ที่เขียน ครอบด้วย `lock.waitLock(10000)` และ `try/finally { lock.releaseLock() }`
- ใช้ `console.log` ไม่ใช่ `Logger.log`
- error ทุกตัว catch แล้วคืน `{ok:false, error:String(err)}` ห้าม throw ออกไปดิบ ๆ

เสร็จแล้ว push ได้เลย **รอบนี้รอบเดียวที่อนุญาต ไม่ต้องถามซ้ำ**
```
npx clasp push
```
แล้วบอก Poom ให้ deploy เอง จากนั้นทดสอบ (ต้องตั้ง `NCO_TOKEN` ก่อน):
```
set NCO_TOKEN=<token>
node tools\post.js ping
node tools\post.js getMeeting "{\"date\":\"2026-09-19\"}"
node tools\post.js getMeeting "{\"token\":\"wrong\"}"
```

**HALT** — รายงาน raw output ของ `node tools\post.js` และ diff ของ `Code.js`

---

## ROUND 3 — Frontend

ต้นแบบคือ `weekly-meeting-prototype.html` ที่ root — เป็น UI ที่อนุมัติแล้ว
**ห้ามออกแบบใหม่ ห้ามเปลี่ยนสี ฟอนต์ layout หรือข้อความไทย** หน้าที่ในรอบนี้คือแยกไฟล์และต่อ API เท่านั้น

แตกเป็น:
- `docs\index.html` — โครง + `<header>` + `<nav>` + 3 `<section>`
- `docs\app.css` — ยกบล็อก `<style>` มาทั้งก้อน ไม่แก้
- `docs\app.js` — ยก `<script>` มา แต่เปลี่ยน state เป็นข้อมูลจริง
- `docs\api.js` — ชั้นเรียก GAS
- `docs\config.js` — `{ API_URL: '...' }` ไฟล์เดียวที่ต้องแก้เวลา redeploy

**`api.js`**
```js
async function call(action, payload){
  const r = await fetch(CONFIG.API_URL, {
    method:'POST',
    headers:{'Content-Type':'text/plain;charset=utf-8'},
    body: JSON.stringify({ token: getToken(), action, payload })
  });
  const j = await r.json();
  if(!j.ok) throw new Error(j.error);
  return j.data;
}
```
`getToken()` อ่านจาก `localStorage.getItem('nco_weekly_token')` ถ้าไม่มีให้ขึ้นหน้าใส่ passcode ก่อนใช้งาน

**สิ่งที่ต้องเปลี่ยนใน `app.js`**
1. ลบ object `M` ที่ hardcode ทิ้ง โหลดจาก `call('getMeeting',{date})` ตอน boot แทน — วันที่ default = วันเสาร์ถัดไปนับจากวันนี้
2. **Autosave**: ทุกครั้งที่แก้ `topic` / `owner` / `planned_min` / `note` / ลำดับ / เพิ่ม / ลบ — debounce 1200ms แล้วยิง `saveAgenda` ครั้งเดียว แสดงสถานะเล็ก ๆ ที่ header: `กำลังบันทึก…` → `บันทึกแล้ว HH:mm` → ถ้าพลาด `บันทึกไม่สำเร็จ — กดเพื่อลองใหม่`
3. `close_()` ยิง `closeItem` ทันที ไม่ debounce
4. `parkAdd()` ยิง `addParking`
5. ปุ่ม "ขึ้นวาระ" ในบล็อกงานค้าง → เพิ่ม item ใหม่ + autosave
6. timer ระหว่างประชุมเก็บใน memory อย่างเดียว ส่งขึ้นชีตตอน `closeItem` เป็น `actual_sec` — **ห้ามยิงทุกวินาที**
7. ถ้า `getMeeting` คืน meeting เป็น null → แสดงปุ่ม "สร้างวาระของวันเสาร์นี้" ที่เรียก `createMeeting`

**ห้ามใช้ framework ห้ามใช้ bundler** — plain JS ไฟล์เดียวต่อหน้าที่ เหมือนที่ทำใน nco-tools

**HALT** — รายงานผลเปิดไฟล์ในเบราว์เซอร์: โหลดวาระได้ไหม แก้แล้วชีตเปลี่ยนไหม แนบ diff ครบทุกไฟล์

---

## ROUND 4 — Deploy

**หมายเหตุ: `gh` CLI ไม่มีบนเครื่อง repo สร้างด้วยมือไปแล้ว** — ใช้ `git remote add` เท่านั้น

1. `docs\CNAME` มีบรรทัดเดียว: `weekly.nicecenter.co.th`
2. `.gitignore` ต้องมีอย่างน้อย:
```
node_modules/
.clasprc.json
*.log
```
   **`.clasp.json` เก็บไว้ใน repo ได้** ข้างในไม่มี secret
3. ```
git init
git branch -M main
git add .
git commit -m "init: nco-weekly meeting app"
git remote add origin https://github.com/nicecenteroil/nco-weekly.git
git push -u origin main
```
4. บอก Poom ให้เปิด GitHub Pages: Settings → Pages → branch `main`, folder `/web`
5. บอกว่าต้องไปตั้ง DNS record อะไรที่ผู้ดูแลโดเมน `nicecenter.co.th` (ชนิด record, ชื่อ, ค่า)

**HALT** — รายงาน URL ที่ได้ และ raw output ของ `git log --oneline`

---

## กติกาตลอดงาน

- **ก่อน `clasp push` ทุกครั้ง ต้องขยับ `VERSION` ใน `Code.js`** — เพื่อให้ `ping` แยกออกได้ว่า GAS รันโค้ดเวอร์ชันไหน
- **หลัง Poom deploy new version ทุกครั้ง ต้องรัน `node tools\post.js ping` ยืนยันเลข VERSION ก่อนรันเทสทุกตัว** — ถ้า VERSION ไม่ตรงแสดงว่า deploy ยังไม่สมบูรณ์ ห้ามรันเทสต่อ
- ทุกรอบจบด้วย **HALT** รอ Poom สั่งต่อเสมอ ห้ามทำรอบถัดไปเอง
- รายงาน **raw output ห้ามสรุปเอง** — ถ้าโดนตัดกลางบรรทัด ให้บอกแล้วแปะซ้ำเฉพาะส่วนนั้นจาก editor ไม่ใช่จาก terminal
- แก้ไฟล์ที่มีอยู่แล้วใช้ `str_replace` พร้อม old string ที่ `view` มาก่อนทุกครั้ง
- หลังแก้ไฟล์ทุกครั้ง เช็คคอมเมนต์สมดุล: `grep -c '/\*' Code.js` ต้องเท่ากับ `grep -c '\*/' Code.js`
- แก้ทีละเรื่อง ห้ามมัดรวมหลาย bug ใน commit เดียว
- ห้าม `clasp push` เองทุกรอบ ยกเว้น ROUND 2 ที่อนุญาตไว้ชัดเจนแล้ว
- ห้ามแตะ `E:\Projects\nco-dsr-ecosystem\` ทุกกรณี
- คำสั่ง clasp ทุกตัว ถ้าไม่แน่ใจ syntax ให้ `--help` ก่อน ห้ามเดา