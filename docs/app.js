/* =====================================================================
   NCO Weekly — app.js
   State: M โหลดจาก GAS API ผ่าน api.js
   ===================================================================== */

const OWNERS={'DSR':'DSR','Castrol':'Castrol','NICE - Poom':'NICE · ภูมิ','NICE - Fern':'NICE · เฟิร์น'};
// owner ที่ไม่อยู่ในรายการ (ข้อมูลเก่า เช่น "ภูมิ") ให้แสดงตามจริง ไม่ขึ้น undefined
const ownLabel=k=>OWNERS[k]||k||'—';
function ownOptions(cur){
  const keys=Object.keys(OWNERS);
  if(cur&&keys.indexOf(cur)===-1) keys.unshift(cur);
  return keys.map(k=>`<option value="${esc(k)}" ${k===cur?'selected':''}>${esc(ownLabel(k))}</option>`).join('');
}

var APP_VERSION = '1.6.1';   // ขยับพร้อม VERSION ใน api/Code.js ทุกครั้ง
var M = null;
var LIVE = false;   // true เมื่อได้ข้อมูลสดในเซสชันนี้แล้ว (ป้องกัน saveAgenda จาก stale cache)
var _hiddenAt = 0;  // timestamp ที่ tab ถูกซ่อน ใช้กับ visibilitychange

let TAB='plan',RUN={idx:-1,sec:0,on:false,tick:null},SEQ=0;
const $=s=>document.querySelector(s);
const esc=s=>(s||'').replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const mins=t=>{const[h,m]=t.split(':').map(Number);return h*60+m;};
const hhmm=v=>pad(Math.floor(v/60)%24)+':'+pad(v%60);
const inSess=id=>M.items.filter(i=>i.s===id);
const planned=id=>inSess(id).reduce((a,i)=>a+i.min,0);
const cap=s=>mins(s.end)-mins(s.start);
const seq=()=>M.sessions.flatMap(s=>inSess(s.id));
const byId=id=>M.items.find(i=>i.id===id);

function startAt(item){
  const s=M.sessions.find(x=>x.id===item.s);
  let m=mins(s.start);
  for(const i of inSess(s.id)){if(i.id===item.id)break;m+=i.min;}
  return hhmm(m);
}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1700);}
function copy(txt){navigator.clipboard?.writeText(txt).then(()=>toast('คัดลอกแล้ว — วางในไลน์กลุ่มได้เลย'),()=>toast('คัดลอกไม่สำเร็จ'));}
const TABS=['plan','run','recap','tasks'];
function go(tab){
  TAB=tab;TABS.forEach((s,n)=>{$('#'+s).hidden=(s!==tab);$('#t'+(n+1)).classList.toggle('on',s===tab);});
  if(tab==='tasks'&&!TASKS)loadTasks();
  render();
}

/* ================= AUTOSAVE ================= */
var _dirtyTimer = null;

function updateSaveStatus(state, ts) {
  var el = document.getElementById('save-status');
  if (!el) return;
  if (state === 'saving') {
    el.className = 'hint'; el.style.color = ''; el.style.cursor = '';
    el.textContent = 'กำลังบันทึก…'; el.onclick = null;
  } else if (state === 'ok') {
    el.className = 'hint'; el.style.color = ''; el.style.cursor = '';
    el.textContent = 'บันทึกแล้ว ' + ts; el.onclick = null;
  } else if (state === 'err') {
    el.className = 'hint'; el.style.color = 'var(--red)'; el.style.cursor = 'pointer';
    el.textContent = 'บันทึกไม่สำเร็จ กดเพื่อลองใหม่';
    el.onclick = function() { saveAgenda(); };
  } else if (state === 'stale') {
    el.className = 'hint'; el.style.color = ''; el.style.cursor = '';
    el.textContent = 'กำลังอัปเดต…'; el.onclick = null;
  } else if (state === 'cached') {
    el.className = 'hint'; el.style.color = 'var(--ink3)'; el.style.cursor = '';
    el.textContent = 'ใช้ข้อมูลล่าสุดเมื่อ ' + ts; el.onclick = null;
  } else if (state === 'clear') {
    el.className = 'hint'; el.style.color = ''; el.style.cursor = '';
    el.textContent = ''; el.onclick = null;
  }
}

function markDirty() {
  if (!LIVE) return;
  clearTimeout(_dirtyTimer);
  _dirtyTimer = setTimeout(saveAgenda, 1200);
}

function saveAgenda() {
  if (!M || !LIVE) return;
  clearTimeout(_dirtyTimer);
  _dirtyTimer = null;
  updateSaveStatus('saving');
  var hadNew = M.items.some(function(i) { return !i.apiId; });
  var seqMap = {};
  M.sessions.forEach(function(s) { seqMap[s.id] = 0; });
  var payload = {
    meeting_id: M.meetingId,
    sessions: M.sessions.map(function(s) {
      return {
        session_id: M.meetingId + '-' + s.id,
        meeting_id: M.meetingId,
        seq: s.seq,
        title: s.title,
        start_time: s.start,
        end_time: s.end
      };
    }),
    items: M.items.map(function(i) {
      seqMap[i.s]++;
      return {
        item_id: i.apiId || '',
        meeting_id: M.meetingId,
        session_id: M.meetingId + '-' + i.s,
        seq: seqMap[i.s],
        topic: i.t,
        owner: i.own,
        planned_min: i.min,
        actual_sec: i.spent || '',
        note: i.note || '',
        status: i.st,
        carry_from: i.carryFrom || ''
      };
    })
  };
  call('saveAgenda', payload).then(function() {
    var now = new Date();
    var ts = pad(now.getHours()) + ':' + pad(now.getMinutes());
    updateSaveStatus('ok', ts);
    if (hadNew) refreshApiIds_();
  }).catch(function() {
    updateSaveStatus('err');
  });
}

function refreshApiIds_() {
  call('getMeeting', { date: M.date }).then(function(data) {
    if (!data || !data.items) return;
    var seqCounter = {};
    M.sessions.forEach(function(s) { seqCounter[s.id] = 0; });
    var localByKey = {};
    M.items.forEach(function(item) {
      seqCounter[item.s]++;
      localByKey[item.s + ':' + seqCounter[item.s]] = item;
    });
    var freshSeq = {};
    data.items.forEach(function(r) {
      var sid = r.session_id.split('-').pop();
      freshSeq[sid] = (freshSeq[sid] || 0) + 1;
      var key = sid + ':' + freshSeq[sid];
      if (localByKey[key] && !localByKey[key].apiId) {
        localByKey[key].apiId = r.item_id;
      }
    });
  });
}

/* ================= PLAN ================= */
function planView(){
  return `
  <h2>วาระ ${M.dateLabel}</h2>
  <p class="sub">Week ${M.week} · ${esc(M.theme)}</p>

  ${M.isPast ? '<div class="acts" style="margin-bottom:16px"><button id="next-week-btn" class="btn o" onclick="nextWeek()">สร้างวาระเสาร์หน้า</button></div>' : ''}

  ${M.sessions.map(sessionCard).join('')}

  <div class="acts" style="margin-top:16px">
    <button class="btn o" onclick="share()">สร้างข้อความแจ้งทีม</button>
    <button class="btn ghost" onclick="go('run')">เริ่มประชุม</button>
  </div>

  <h2>ค้างจากสัปดาห์ที่แล้ว</h2>
  <p class="sub">งานที่ยังไม่ปิด ดันขึ้นวาระได้ในคลิกเดียว</p>
  <div class="card" style="padding:4px 14px 12px">
    ${M.lastActions.length ? M.lastActions.map((a,n)=>`
      <div class="person">
        <div class="avatar">${esc(a.who.slice(0,2))}</div>
        <div style="flex:1">
          <div style="${a.done?'text-decoration:line-through;color:var(--ink3)':''}">${esc(a.act)}</div>
          <div class="sub" style="margin:2px 0 0">${esc(a.who)} · ${a.done?'ปิดแล้ว':'<b style="color:var(--amber)">ยังไม่ปิด</b>'}</div>
        </div>
        ${a.done?'':`<button class="btn ghost sm" onclick="pull(${n})">ขึ้นวาระ</button>`}
      </div>`).join('') : '<p class="sub" style="padding:8px 0">ไม่มีงานค้างจากสัปดาห์ที่แล้ว</p>'}
  </div>`;
}

function sessionCard(s){
  const list=inSess(s.id);
  return `
  <div class="card sess">
    <div class="shead">
      <div class="stitle">${esc(s.title)}</div>
      <div class="stime">${s.start}–${s.end}</div>
    </div>
    <div class="gauge" id="g-${s.id}">${gaugeBars(s)}</div>
    <div class="gmeta" id="gm-${s.id}">${gaugeText(s)}</div>
    <div class="rows">${list.length?list.map(itemRow).join(''):'<div class="row"><div></div><div class="hint" style="padding:8px 9px">ยังไม่มีหัวข้อในช่วงนี้</div></div>'}</div>
    <div class="quick">
      <input type="text" id="q-${s.id}" placeholder="พิมพ์หัวข้อที่แจ้งเพิ่มเข้ามา แล้วกด Enter"
             onkeydown="if(event.key==='Enter')quickAdd('${s.id}')">
      <button class="btn ghost sm" onclick="quickAdd('${s.id}')">เพิ่ม</button>
    </div>
  </div>`;
}

function gaugeBars(s){
  const c=cap(s),list=inSess(s.id),p=planned(s.id),base=Math.max(c,p)||1;
  return list.map(i=>`<i style="width:${i.min/base*100}%;background:${i.carry?'#E9C46A':'var(--o)'};opacity:${i.carry?1:.72}"></i>`).join('');
}
function gaugeText(s){
  const c=cap(s),p=planned(s.id),d=c-p,n=inSess(s.id).length;
  return `<span>${n} หัวข้อ · วางไว้ <b>${p}</b> นาที จากช่วงเวลา ${c} นาที</span>`+
    (d>=0?`<span>เหลือว่าง <b>${d}</b> นาที</span>`
         :`<span class="over">เกินเวลา <b>${-d}</b> นาที — ตัดหัวข้อหรือย้ายไปสัปดาห์หน้า</span>`);
}
function paint(){
  M.sessions.forEach(s=>{
    const g=document.getElementById('g-'+s.id); if(g)g.innerHTML=gaugeBars(s);
    const m=document.getElementById('gm-'+s.id); if(m)m.innerHTML=gaugeText(s);
  });
  document.querySelectorAll('[data-at]').forEach(el=>{const i=byId(+el.dataset.at);if(i)el.textContent=startAt(i);});
}

function itemRow(i){
  const other=i.s==='am'?'บ่าย':'เช้า';
  return `
  <div class="row">
    <div class="at" data-at="${i.id}">${startAt(i)}</div>
    <div>
      <input class="t-in" value="${esc(i.t)}" aria-label="ชื่อหัวข้อ" oninput="byId(${i.id}).t=this.value;markDirty()">
      <div class="ctl">
        <select onchange="byId(${i.id}).own=this.value;markDirty()">
          ${ownOptions(i.own)}
        </select>
        <input type="number" min="5" step="5" value="${i.min}" onchange="byId(${i.id}).min=Math.max(5,+this.value||5);paint();markDirty()">
        <span class="unit">นาที</span>
        ${i.carry?'<span class="chip carry">ยกมา</span>':''}
        <button class="icon" title="เลื่อนขึ้น" onclick="move(${i.id},-1)">↑</button>
        <button class="icon" title="เลื่อนลง" onclick="move(${i.id},1)">↓</button>
        <button class="icon" title="ย้ายไปช่วง${other}" onclick="swap(${i.id})">⇄</button>
        <button class="icon" title="ลบหัวข้อ" onclick="del(${i.id})">×</button>
      </div>
      <input class="n-in" value="${esc(i.note)}" placeholder="โน้ตสั้น ๆ (ไม่ใส่ก็ได้)" oninput="byId(${i.id}).note=this.value;markDirty()">
      ${prevBlock(i)}
    </div>
  </div>`;
}

// บริบทจากครั้งก่อน ของหัวข้อที่ยกมา — โน้ตเดิม + งานที่ยังค้าง
function prevBlock(i){
  if(!i.prevNote&&!(i.prevActs&&i.prevActs.length))return '';
  return `<div class="prev">
    <div class="prev-h">ครั้งก่อน</div>
    ${i.prevNote?`<div class="prev-n">${esc(i.prevNote)}</div>`:''}
    ${(i.prevActs||[]).map(a=>`<div class="prev-a">→ ${esc(a.action)}${a.assignee?` <span class="who">${esc(a.assignee)}</span>`:''}</div>`).join('')}
  </div>`;
}

function quickAdd(sid){
  const el=document.getElementById('q-'+sid),t=el.value.trim(); if(!t)return;
  M.items.push({id:++SEQ,s:sid,t,own:'NICE - Poom',min:15,carry:false,carryFrom:'',note:'',act:'',who:'',st:'todo',apiId:'',spent:0});
  markDirty();
  render(); document.getElementById('q-'+sid).focus(); toast('เพิ่มแล้ว ตั้งไว้ 15 นาที ปรับได้');
}
function pull(n){
  const a=M.lastActions[n];
  M.items.push({id:++SEQ,s:'pm',t:'[ติดตาม] '+a.act+(a.who?' ('+a.who+')':''),own:'NICE - Poom',min:5,carry:true,carryFrom:a.id||'',note:'',act:'',who:'',acts:[],prevNote:'',prevActs:[],st:'todo',apiId:'',spent:0});
  M.lastActions.splice(n,1);
  markDirty();
  render(); toast('ดันขึ้นวาระช่วงบ่ายแล้ว');
}
function del(id){M.items=M.items.filter(x=>x.id!==id);markDirty();render();}
function swap(id){const i=byId(id);i.s=(i.s==='am'?'pm':'am');markDirty();render();toast('ย้ายช่วงแล้ว');}
function move(id,d){
  const i=byId(id),list=inSess(i.s),k=list.indexOf(i),j=k+d;
  if(j<0||j>=list.length)return;
  const a=M.items.indexOf(list[k]),b=M.items.indexOf(list[j]);
  [M.items[a],M.items[b]]=[M.items[b],M.items[a]];
  markDirty();
  render();
}

function share(){
  const txt=`📌 ประชุมทีม DSR — ${M.dateLabel}
หัวข้อหลัก: ${M.theme}

`+M.sessions.map(s=>`▪️ ${s.title}  (${s.start}–${hhmm(mins(s.start)+planned(s.id))})
`+inSess(s.id).map(i=>`  ${startAt(i)}  ${i.t} — ${ownLabel(i.own)} (${i.min}น.)`).join('\n')).join('\n\n')+`

ใครมีเรื่องแจ้งเพิ่ม ตอบในไลน์ก่อนศุกร์ 17:00 เดี๋ยวแทรกเข้าวาระให้`;
  copy(txt);
}

/* ================= RUN ================= */
function runView(){
  const S=seq();
  if(!S.length)return '<h2>ยังไม่มีหัวข้อ</h2><p class="sub">กลับไปเพิ่มในหน้าวางแผนก่อน</p>';
  if(RUN.idx<0){
    const f=S[0],s=M.sessions.find(x=>x.id===f.s);
    return `
    <h2>เริ่มงานวันเสาร์</h2>
    <p class="sub">${M.dateLabel} · ${S.length} หัวข้อ · ${M.sessions.map(x=>x.start+'–'+x.end).join(' และ ')}</p>
    <div class="stage">
      <div class="kicker">${esc(s.title)} · หัวข้อแรก</div>
      <h3>${esc(f.t)}</h3>
      <div class="ctl" style="padding-left:0"><span class="chip">${esc(ownLabel(f.own))}</span><span class="chip">${f.min} นาที</span></div>
      <div class="acts"><button class="btn o" onclick="startMeeting()">เริ่มจับเวลา</button></div>
      <p class="hint" style="margin-top:12px">ระหว่างประชุม แก้ชื่อหัวข้อ แทรกหัวข้อ หรือขยายเวลาได้ตลอด</p>
    </div>
    ${queueView()}`;
  }
  const i=S[RUN.idx],over=RUN.sec>i.min*60,s=M.sessions.find(x=>x.id===i.s);
  const behind=doneMin()*60-elapsed();
  const dn=S.filter(x=>x.st!=='todo').length;

  return `
  <h2>${esc(s.title)}</h2>
  <p class="sub">หัวข้อ ${RUN.idx+1}/${S.length} · ปิดไปแล้ว ${dn}</p>

  <div class="stage">
    <div class="kicker">${esc(ownLabel(i.own))} · ตั้งไว้ ${i.min} นาที</div>
    <h3><input value="${esc(i.t)}" aria-label="ชื่อหัวข้อ" oninput="byId(${i.id}).t=this.value;markDirty()"></h3>
    ${prevBlock(i)}
    <div class="clock">
      <div class="timer ${over?'over':''}">${pad(Math.floor(RUN.sec/60))}:${pad(RUN.sec%60)}</div>
      <div class="of">/ ${pad(i.min)}:00</div>
      <span class="pace ${behind>-60?'ok':'late'}">${Math.abs(behind)<60?'ตรงตามแผน':behind>0?'เร็วกว่าแผน '+Math.round(behind/60)+' นาที':'ช้ากว่าแผน '+Math.round(-behind/60)+' นาที'}</span>
      <button class="btn ghost sm" onclick="toggle()">${RUN.on?'พัก':'เดินต่อ'}</button>
      <button class="btn ghost sm" onclick="bump(${i.id})">+5 นาที</button>
      <button class="btn ghost sm proj-btn" onclick="toggleProj()">${PROJ?'ตัวหนังสือปกติ':'โหมดฉายจอ'}</button>
    </div>

    <label for="nn">บันทึกที่คุยกัน</label>
    <textarea id="nn" oninput="byId(${i.id}).note=this.value;markDirty()" placeholder="สรุปสั้น ๆ ว่าตกลงอะไร">${esc(i.note)}</textarea>
    <div class="two">
      <div><label for="na">Next action</label>
        <input class="f-in" id="na" value="${esc(i.act)}" oninput="byId(${i.id}).act=this.value;saveRun_()" placeholder="สิ่งที่ต้องไปทำต่อ"></div>
      <div><label for="nw">ใครทำ</label>
        <input class="f-in" id="nw" value="${esc(i.who)}" oninput="byId(${i.id}).who=this.value;saveRun_()" placeholder="ชื่อ"></div>
    </div>

    <div class="acts">
      <button class="btn" onclick="close_('done')">ปิดหัวข้อ ไปต่อ</button>
      <button class="btn ghost" onclick="close_('moved')">ยกไปสัปดาห์หน้า</button>
      <button class="btn ghost" onclick="insert()">+ แทรกหัวข้อ</button>
      <button class="btn ghost" onclick="parkAdd()">+ Parking lot</button>
    </div>
  </div>

  ${M.park.length?`<div class="card park" style="padding:10px 14px;margin-top:12px">
    <div class="sub" style="margin:0 0 2px">Parking lot — เรื่องนอกวาระ ไว้คุยท้ายประชุม</div>
    <ul style="margin:0;padding:0">${M.park.map(p=>`<li>${esc(p)}</li>`).join('')}</ul></div>`:''}

  ${queueView()}`;
}

function queueView(){
  const S=seq(),cur=RUN.idx>=0?S[RUN.idx]:null;
  return '<h2>ลำดับทั้งวัน</h2><div class="queue">'+M.sessions.map(s=>
    `<div class="qsess">${esc(s.title)} · ${s.start}–${s.end}</div>`+
    inSess(s.id).map(i=>`<div class="qrow ${i.st} ${cur&&cur.id===i.id?'now':''}"><div class="at">${startAt(i)}</div><span>${esc(i.t)}</span></div>`).join('')
  ).join('')+'</div>';
}

function doneMin(){return seq().filter(i=>i.st!=='todo').reduce((a,i)=>a+i.min,0);}
function elapsed(){let s=RUN.sec;seq().forEach(i=>{if(i.st!=='todo')s+=i.spent||i.min*60;});return s;}
function startMeeting(){RUN.idx=0;RUN.sec=0;toggle();}
function toggle(){
  RUN.on=!RUN.on; clearInterval(RUN.tick);
  if(RUN.on)startTick_();
  saveRun_();
  render();
}
function startTick_(){
  clearInterval(RUN.tick);
  RUN.tick=setInterval(()=>{RUN.sec++;paintTimer();if(RUN.sec%5===0)saveRun_();},1000);
}

/* ---------- ตัวจับเวลาไม่หายเมื่อรีเฟรช ----------
   เก็บหัวข้อที่กำลังคุย วินาทีที่ใช้ สถานะเดิน/พัก และ next action ที่พิมพ์ค้างไว้ ลง localStorage
   เปิดหน้าใหม่ในประชุมเดิม → กลับมาที่หัวข้อเดิม เวลาเดินต่อจากเดิม (นับช่วงที่หน้าปิดไปด้วย ถ้ากำลังเดินอยู่) */
var RUN_KEY='nco_weekly_run';
function saveRun_(){
  try{
    if(!M||RUN.idx<0){localStorage.removeItem(RUN_KEY);return;}
    const i=seq()[RUN.idx]; if(!i)return;
    localStorage.setItem(RUN_KEY,JSON.stringify({mid:M.meetingId,item:i.apiId,sec:RUN.sec,on:RUN.on,ts:Date.now(),act:i.act||'',who:i.who||''}));
  }catch(e){}
}
function clearRun_(){try{localStorage.removeItem(RUN_KEY);}catch(e){}}
function restoreRun_(){
  if(!M)return false;
  let r=null; try{r=JSON.parse(localStorage.getItem(RUN_KEY)||'null');}catch(e){}
  if(!r||r.mid!==M.meetingId||!r.item)return false;
  if(RUN.idx>=0){ // state ถูกโหลดใหม่ระหว่างพัก — คืน next action ที่พิมพ์ค้างไว้ให้หัวข้อเดิม
    const cur=seq()[RUN.idx]; if(cur&&cur.apiId===r.item){cur.act=r.act||'';cur.who=r.who||'';}
    return false;
  }
  if(Date.now()-r.ts>12*3600*1000){clearRun_();return false;}
  const S=seq(), k=S.findIndex(x=>x.apiId===r.item);
  if(k<0||S[k].st!=='todo'){clearRun_();return false;}
  RUN.idx=k;
  RUN.sec=r.sec+(r.on?Math.floor((Date.now()-r.ts)/1000):0);
  S[k].act=r.act||''; S[k].who=r.who||'';
  RUN.on=!!r.on; if(RUN.on)startTick_();
  TAB='run'; TABS.forEach((s,n)=>{$('#'+s).hidden=(s!=='run');$('#t'+(n+1)).classList.toggle('on',s==='run');});
  toast('กลับมาที่หัวข้อเดิม — เวลาเดินต่อจากเดิม');
  return true;
}

/* ---------- โหมดฉายจอ ---------- */
var PROJ=false; try{PROJ=localStorage.getItem('nco_weekly_proj')==='1';}catch(e){}
function toggleProj(){PROJ=!PROJ;try{localStorage.setItem('nco_weekly_proj',PROJ?'1':'0');}catch(e){}render();}
function paintTimer(){
  const el=document.querySelector('.timer'); if(!el)return;
  el.textContent=pad(Math.floor(RUN.sec/60))+':'+pad(RUN.sec%60);
  el.classList.toggle('over',RUN.sec>seq()[RUN.idx].min*60);
}
function bump(id){byId(id).min+=5;markDirty();render();toast('ขยายหัวข้อนี้อีก 5 นาที');}
function insert(){
  const t=prompt('หัวข้อที่แทรกเข้ามา:'); if(!t)return;
  const cur=seq()[RUN.idx],at=M.items.indexOf(cur);
  M.items.splice(at+1,0,{id:++SEQ,s:cur.s,t,own:'NICE - Poom',min:10,carry:false,carryFrom:'',note:'',act:'',who:'',st:'todo',apiId:'',spent:0});
  markDirty();
  render(); toast('แทรกเป็นหัวข้อถัดไปแล้ว');
}
function parkAdd(){
  const v=prompt('เรื่องนอกวาระที่โผล่ขึ้นมา:');
  if(!v) return;
  call('addParking',{meeting_id:M.meetingId,text:v})
    .then(function(){M.park.push(v);render();})
    .catch(function(){toast('บันทึก Parking lot ไม่สำเร็จ');});
}
function close_(st){
  const S=seq(),i=S[RUN.idx];
  if(!i.apiId){
    alert('หัวข้อนี้ยังไม่ได้บันทึก — รอสักครู่แล้วลองอีกครั้ง');
    return;
  }
  const capturedSec=RUN.sec;
  updateSaveStatus('saving');
  call('closeItem',{
    meeting_id:M.meetingId,
    item_id:i.apiId,
    status:st,
    actual_sec:capturedSec,
    note:i.note,
    action:i.act||'',
    assignee:i.who||''
  }).then(function(){
    i.st=st; i.spent=capturedSec;
    if(i.act){ i.acts=(i.acts||[]).concat([{action:i.act,assignee:i.who}]); i.act=''; i.who=''; }
    var now=new Date();
    updateSaveStatus('ok',pad(now.getHours())+':'+pad(now.getMinutes()));
    TASKS=null;
    if(RUN.idx<S.length-1){RUN.idx++;RUN.sec=0;saveRun_();render();}
    else{clearInterval(RUN.tick);RUN.on=false;RUN.idx=-1;clearRun_();toast('จบแล้ว — ไปหน้าสรุป');go('recap');}
  }).catch(function(err){
    updateSaveStatus('err');
    alert('บันทึกไม่สำเร็จ: '+(String(err)||'').slice(0,80)+'\nกรุณาลองอีกครั้ง');
  });
}

/* ================= RECAP ================= */
// สรุปแสดงทุกหัวข้อที่คุยแล้ว (ปิดแล้ว + ต่อสัปดาห์หน้า) พร้อมโน้ตและงานที่ต้องทำต่อ
// R = ประชุมที่เลือกดูจากประวัติ (ไม่แตะ M) — null แปลว่าดูประชุมปัจจุบัน
var R = null, MEETING_LIST = null;
const ST_LABEL={done:'ปิดแล้ว',moved:'ต่อสัปดาห์หน้า',todo:'ยังไม่ได้คุย'};

function recapData(){ return R||M; }
function talked(D){ return D.items.filter(i=>i.st==='done'||i.st==='moved'); }
function itemActs(i){
  const a=(i.acts||[]).slice();
  if(i.act&&!a.some(x=>x.action===i.act)) a.push({action:i.act,assignee:i.who});
  return a;
}
function fmtMin(sec){ const m=Math.round((sec||0)/60); return m?m+' นาที':'<1 นาที'; }

function minutesText(D){
  D=D||recapData();
  const T=talked(D), todo=D.items.filter(i=>i.st==='todo');
  let n=0;
  const body=D.sessions.map(s=>{
    const list=T.filter(i=>i.s===s.id);
    if(!list.length) return '';
    return `▪️ ${s.title}\n`+list.map(i=>{
      n++;
      let t=`${n}. ${i.t}${i.st==='moved'?' (ต่อสัปดาห์หน้า)':''}`;
      if(i.note) t+='\n'+i.note.trim().split('\n').filter(x=>x.trim()).map(x=>'   '+x.trim()).join('\n');
      itemActs(i).forEach(a=>{ t+=`\n   ➜ ${a.action}${a.assignee?' — '+a.assignee:''}`; });
      return t;
    }).join('\n\n');
  }).filter(Boolean).join('\n\n');

  const allActs=[]; T.forEach(i=>itemActs(i).forEach(a=>allActs.push(a)));
  const by={}; allActs.forEach(a=>{const w=a.assignee||'ยังไม่ระบุคน';(by[w]=by[w]||[]).push(a.action);});

  return `📝 สรุปประชุมทีม DSR — ${D.dateLabel}\n\n`+(body||'— ยังไม่มีหัวข้อที่คุย —')+
    (Object.keys(by).length?'\n\n✅ งานที่ต้องทำต่อ\n'+Object.entries(by).map(([w,l])=>`${w}\n`+l.map(x=>'  • '+x).join('\n')).join('\n'):'')+
    (todo.length?'\n\n⏳ ยังไม่ได้คุย\n'+todo.map(i=>'• '+i.t).join('\n'):'')+
    (D.park.length?'\n\n🅿️ เก็บไว้คุยรอบหน้า\n'+D.park.map(p=>'• '+p).join('\n'):'');
}

function historyPicker(D){
  if(!MEETING_LIST) return `<button class="btn ghost sm" onclick="loadHistoryList()">ดูสรุปครั้งอื่น</button>`;
  return `<select class="hist" onchange="pickHistory(this.value)">
    ${MEETING_LIST.map(m=>`<option value="${m.date}" ${m.date===D.date?'selected':''}>${esc(formatDateLabel(m.date))} · ${m.talked}/${m.total} หัวข้อ${M&&m.meeting_id===M.meetingId?' (ปัจจุบัน)':''}</option>`).join('')}
  </select>`;
}

function recapView(){
  const D=recapData();
  const T=talked(D), todo=D.items.filter(i=>i.st==='todo');
  const head=`<div class="rhead"><h2 style="margin:0">สรุปการประชุม</h2>${historyPicker(D)}</div>
    <p class="sub">${esc(D.dateLabel)} · Week ${D.week}</p>`;

  if(!T.length){
    // ประชุมปัจจุบันยังไม่ได้เริ่ม → เปิดสรุปครั้งล่าสุดที่มีการคุยให้อัตโนมัติ
    if(!R && !recapView._tried){ recapView._tried=true; autoLastRecap(); }
    return head+'<div class="card" style="padding:18px"><b>ยังไม่มีหัวข้อที่คุยในประชุมนี้</b><p class="sub" style="margin:4px 0 0">สรุปจะขึ้นหลังกด ปิดหัวข้อ หรือ ยกไปสัปดาห์หน้า ในหน้า "ประชุม" — หรือเลือกดูสรุปครั้งก่อนจากเมนูด้านบน</p></div>';
  }

  const spent=D.items.reduce((a,i)=>a+(i.spent||0),0);
  const nDone=T.filter(i=>i.st==='done').length, nMoved=T.length-nDone;
  const allActs=[]; T.forEach(i=>itemActs(i).forEach(a=>allActs.push(Object.assign({topic:i.t},a))));
  const by={}; allActs.forEach(a=>{const w=a.assignee||'ยังไม่ระบุคน';(by[w]=by[w]||[]).push(a);});

  let n=0;
  const topics=D.sessions.map(s=>{
    const list=T.filter(i=>i.s===s.id);
    if(!list.length) return '';
    return `<div class="qsess">${esc(s.title)}</div>`+list.map(i=>{
      n++;
      const acts=itemActs(i);
      return `<div class="rt">
        <div class="rt-n">${n}</div>
        <div class="rt-b">
          <div class="rt-t">${esc(i.t)}</div>
          <div class="rt-m"><span class="chip st-${i.st}">${ST_LABEL[i.st]}</span><span>${esc(ownLabel(i.own))}</span><span>${fmtMin(i.spent)}</span></div>
          ${i.note?`<div class="rt-note">${esc(i.note.trim())}</div>`:''}
          ${acts.map(a=>`<div class="prev-a">→ ${esc(a.action)}${a.assignee?` <span class="who">${esc(a.assignee)}</span>`:''}</div>`).join('')}
        </div>
      </div>`;
    }).join('');
  }).join('');

  return head+`
  <div class="card stats">
    <div><div class="big">${T.length}</div><div class="sub">หัวข้อที่คุย</div></div>
    <div><div class="big">${nDone}</div><div class="sub">ปิดแล้ว</div></div>
    <div><div class="big">${nMoved}</div><div class="sub">ต่อสัปดาห์หน้า</div></div>
    <div><div class="big">${allActs.length}</div><div class="sub">งานที่ต้องทำต่อ</div></div>
    <div><div class="big">${Math.round(spent/60)}</div><div class="sub">นาทีที่ใช้จริง</div></div>
  </div>

  <h2>หัวข้อที่คุย</h2>
  <div class="card" style="padding:4px 14px 10px">${topics}</div>

  ${Object.keys(by).length?`<h2>งานที่ต้องทำต่อ แยกตามคน</h2>
  <p class="sub">ที่ยังไม่ปิด จะติดไปกับหัวข้อในวาระสัปดาห์หน้า</p>
  <div class="card" style="padding:4px 14px 12px">
    ${Object.entries(by).map(([w,l])=>`
      <div class="person"><div class="avatar">${esc(w.slice(0,2))}</div>
        <div style="flex:1"><div style="font-weight:600">${esc(w)}</div>
        ${l.map(a=>`<div style="font-size:14px">• ${esc(a.action)} <span class="hint">— ${esc(a.topic)}</span></div>`).join('')}</div></div>`).join('')}
  </div>`:''}

  ${todo.length?`<h2>ยังไม่ได้คุย</h2><div class="card park" style="padding:6px 14px"><ul style="margin:0;padding:0">${todo.map(i=>`<li>${esc(i.t)}</li>`).join('')}</ul></div>`:''}
  ${D.park.length?`<h2>Parking lot</h2><div class="card park" style="padding:6px 14px"><ul style="margin:0;padding:0">${D.park.map(p=>`<li>${esc(p)}</li>`).join('')}</ul></div>`:''}

  <h2>ข้อความส่งเข้าไลน์กลุ่ม</h2>
  <p class="sub">กดคัดลอกแล้ววางได้เลย</p>
  <pre class="out">${esc(minutesText(D))}</pre>
  <div class="acts" style="margin-top:12px">
    <button class="btn o" onclick="copy(minutesText())">คัดลอกสรุป</button>
    ${!R?'<button class="btn ghost" onclick="nextWeek()">สร้างวาระสัปดาห์หน้า</button>':''}
  </div>`;
}

function loadHistoryList(){
  return callRead_('listMeetings',{}).then(function(d){
    MEETING_LIST=d.meetings||[];
    if(TAB==='recap') render();
    return MEETING_LIST;
  }).catch(function(){ toast('โหลดรายการประชุมไม่สำเร็จ'); return []; });
}
function pickHistory(date){
  if(M&&date===M.date){ R=null; render(); return; }
  $('#recap').innerHTML='<p class="sub" style="padding:40px 0">กำลังโหลดสรุป…</p>';
  callRead_('getMeeting',{date:date}).then(function(data){
    if(!data.meeting){ toast('ไม่พบประชุมนี้'); R=null; render(); return; }
    R=buildState(data,date);
    render();
  }).catch(function(err){ toast('โหลดไม่สำเร็จ: '+String(err).slice(0,60)); R=null; render(); });
}
function autoLastRecap(){
  loadHistoryList().then(function(list){
    const last=list.find(m=>m.talked>0&&(!M||m.meeting_id!==M.meetingId));
    if(last) pickHistory(last.date);
  });
}

// เสาร์ถัดไปหลังวันที่ของประชุมปัจจุบัน (ไม่ใช่ +7 วันตรง ๆ)
function nextSaturdayAfter(dateStr) {
  var parts = dateStr.split('-');
  var d = new Date(+parts[0], +parts[1]-1, +parts[2]);
  d.setDate(d.getDate() + 1);
  while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function nextWeek(){
  if(!M) return;
  const nextDate = nextSaturdayAfter(M.date);
  const nextWeekNo = M.week + 1;
  call('createMeeting',{date:nextDate,week_no:nextWeekNo,theme:''})
    .then(function(){go('plan');loadMeeting(nextDate);})
    .catch(function(err){
      if (err.badResponse) {
        call('getUpcoming', { today: nextDate })
          .then(function(data) {
            if (data.meeting && data.meeting.date === nextDate) {
              go('plan'); loadMeeting(nextDate);
            } else {
              toast('สร้างไม่สำเร็จ: '+(String(err)||'').slice(0,60));
            }
          })
          .catch(function() {
            toast('สร้างไม่สำเร็จ: '+(String(err)||'').slice(0,60));
          });
      } else {
        toast('สร้างไม่สำเร็จ: '+(String(err)||'').slice(0,60));
      }
    });
}

/* ================= TASKS (งานค้างทุกสัปดาห์) ================= */
var TASKS = null, TASK_FILTER = '';
function loadTasks(){
  $('#tasks').innerHTML='<p class="sub" style="padding:40px 0">กำลังโหลดงานค้าง…</p>';
  callRead_('listActions',{}).then(function(d){ TASKS=d; if(TAB==='tasks')render(); })
    .catch(function(err){ $('#tasks').innerHTML='<div class="card" style="padding:18px;margin-top:24px"><b style="color:var(--red)">โหลดงานค้างไม่สำเร็จ</b><p class="sub">'+esc(String(err))+'</p><button class="btn ghost sm" onclick="loadTasks()">ลองใหม่</button></div>'; });
}
function daysSince(d){
  if(!d)return '';
  const p=d.split('-'), t=new Date(+p[0],+p[1]-1,+p[2]);
  const n=Math.floor((Date.now()-t)/86400000);
  return n<=0?'สัปดาห์นี้':n<7?n+' วันก่อน':Math.floor(n/7)+' สัปดาห์ก่อน';
}
function tasksView(){
  if(!TASKS) return '<p class="sub" style="padding:40px 0">กำลังโหลดงานค้าง…</p>';
  const open=TASKS.open, people={};
  open.forEach(a=>{const w=a.assignee||'ยังไม่ระบุคน';people[w]=(people[w]||0)+1;});
  const list=TASK_FILTER?open.filter(a=>(a.assignee||'ยังไม่ระบุคน')===TASK_FILTER):open;
  const by={}; list.forEach(a=>{const w=a.assignee||'ยังไม่ระบุคน';(by[w]=by[w]||[]).push(a);});
  return `
  <div class="rhead"><h2 style="margin:0">งานค้างทุกสัปดาห์</h2>
    <button class="btn ghost sm" onclick="loadTasks()">รีเฟรช</button></div>
  <p class="sub">ติ๊กเมื่อทำเสร็จ งานที่ติ๊กแล้วจะไม่เด้งขึ้นวาระสัปดาห์หน้า</p>
  <div class="filters">
    <button class="fchip ${!TASK_FILTER?'on':''}" onclick="TASK_FILTER='';render()">ทั้งหมด <b>${open.length}</b></button>
    ${Object.entries(people).map(([w,n])=>`<button class="fchip ${TASK_FILTER===w?'on':''}" data-w="${esc(w)}" onclick="TASK_FILTER=this.dataset.w;render()">${esc(w)} <b>${n}</b></button>`).join('')}
  </div>
  ${list.length?Object.entries(by).map(([w,l])=>`
    <div class="card tgroup">
      <div class="tg-h">${esc(w)} <span class="hint">${l.length} งาน</span></div>
      ${l.map(a=>`<label class="task">
        <input type="checkbox" onchange="tickTask('${a.action_id}',this)">
        <span class="tk-b"><span class="tk-a">${esc(a.action)}</span>
        <span class="tk-m">${a.topic?esc(a.topic)+' · ':''}${esc(daysSince(a.meeting_date))}</span></span>
      </label>`).join('')}
    </div>`).join('')
  :'<div class="card" style="padding:18px"><b>ไม่มีงานค้าง</b><p class="sub" style="margin:4px 0 0">ทุกงานปิดครบแล้ว</p></div>'}

  ${TASKS.closed.length?`<h2>ปิดไปใน 14 วันล่าสุด</h2>
  <div class="card tgroup">
    ${TASKS.closed.map(a=>`<div class="task done">
      <span class="tk-b"><span class="tk-a">${esc(a.action)}</span>
      <span class="tk-m">${esc(a.assignee||'ยังไม่ระบุคน')}${a.topic?' · '+esc(a.topic):''}</span></span>
      <button class="btn ghost sm" onclick="reopenTask('${a.action_id}')">เปิดคืน</button>
    </div>`).join('')}
  </div>`:''}`;
}
function tickTask(id,el){
  el.disabled=true; el.closest('.task').classList.add('closing');
  call('closeAction',{action_id:id}).then(function(){
    const k=TASKS.open.findIndex(a=>a.action_id===id);
    if(k>=0){const a=TASKS.open.splice(k,1)[0];a.closed_at=todayStr();TASKS.closed.unshift(a);}
    if(TASK_FILTER&&!TASKS.open.some(a=>(a.assignee||'ยังไม่ระบุคน')===TASK_FILTER))TASK_FILTER='';
    toast('ปิดงานแล้ว'); render();
  }).catch(function(){ el.disabled=false; el.checked=false; el.closest('.task').classList.remove('closing'); toast('ปิดงานไม่สำเร็จ ลองใหม่อีกครั้ง'); });
}
function reopenTask(id){
  call('reopenAction',{action_id:id}).then(function(){
    const k=TASKS.closed.findIndex(a=>a.action_id===id);
    if(k>=0){const a=TASKS.closed.splice(k,1)[0];a.closed_at='';TASKS.open.push(a);}
    toast('เปิดงานคืนแล้ว'); render();
  }).catch(function(){ toast('เปิดคืนไม่สำเร็จ'); });
}

/* ================= RESCHEDULE ================= */
function editDate() {
  var el = $('#hmeta');
  el.innerHTML = '<input type="date" id="date-pick" value="' + M.date +
    '" style="font-size:13px;padding:2px 6px;border:1px solid var(--line);border-radius:6px;background:#fff" ' +
    'onchange="applyReschedule(this.value)" onblur="if(!_rescheduling)render()">';
  document.getElementById('date-pick').focus();
}

var _rescheduling = false;
function applyReschedule(newDate) {
  if (!newDate || newDate === M.date) { render(); return; }
  _rescheduling = true;
  call('rescheduleMeeting', { meeting_id: M.meetingId, new_date: newDate })
    .then(function() {
      _rescheduling = false;
      go('plan');
      loadMeeting(newDate);
    })
    .catch(function(err) {
      _rescheduling = false;
      toast('เลื่อนวันไม่สำเร็จ: ' + (String(err)||'').slice(0,60));
      render();
    });
}

/* ================= CACHE (stale-while-revalidate) ================= */
var _CACHE_KEY = 'nco_weekly_cache';
var _CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

function _saveCache(data) {
  try {
    localStorage.setItem(_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: data }));
  } catch (e) {}
}

function _loadCache() {
  try {
    var raw = localStorage.getItem(_CACHE_KEY);
    if (!raw) return null;
    var c = JSON.parse(raw);
    if (!c || !c.ts || !c.data || !c.data.meeting) return null;
    if (Date.now() - c.ts > _CACHE_TTL) { localStorage.removeItem(_CACHE_KEY); return null; }
    return c;
  } catch (e) { return null; }
}

function _cacheMeta(ts) {
  var d = new Date(ts);
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
}

/* ================= boot + data mapping ================= */
function todayStr() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function nextSaturday() {
  var d = new Date();
  var diff = (6 - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function formatDateLabel(dateStr) {
  var days = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัส','ศุกร์','เสาร์'];
  var months = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  var parts = dateStr.split('-');
  var d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
  return days[d.getDay()] + 'ที่ ' + d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
}

function isoWeek(dateStr) {
  var parts = dateStr.split('-');
  var d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
  var jan4 = new Date(d.getFullYear(), 0, 4);
  var start = new Date(jan4.getTime() - ((jan4.getDay() + 6) % 7) * 86400000);
  return Math.floor((d - start) / (7 * 86400000)) + 1;
}

function mapData(data, date) {
  M = buildState(data, date);
  SEQ = M.items.length;
  R = null; recapView._tried = false;
  restoreRun_();
}

// แปลง payload จาก API เป็น state ของหน้าเว็บ — ไม่แตะตัวแปร global
function buildState(data, date) {
  var meeting = data.meeting;
  var actsByItem = {};
  (data.actions || []).forEach(function(a) {
    (actsByItem[a.item_id] = actsByItem[a.item_id] || []).push({ action: a.action, assignee: a.assignee });
  });
  var S = {
    meetingId: meeting.meeting_id,
    date: date,
    dateLabel: formatDateLabel(date),
    week: +meeting.week_no || 0,
    theme: meeting.theme || '',
    isPast: !!data.isPast,
    sessions: data.sessions.slice().sort(function(a, b) { return (+a.seq || 0) - (+b.seq || 0); }).map(function(r) {
      return {
        id: r.session_id.split('-').pop(),
        seq: +r.seq || 1,
        title: r.title,
        start: r.start_time,
        end: r.end_time
      };
    }),
    items: [],
    park: data.parking.map(function(r) { return r.text; }),
    lastActions: data.openActions.map(function(r) {
      return { id: r.action_id, act: r.action, who: r.assignee, done: r.done === 'TRUE' };
    })
  };
  // เรียงตาม session แล้วตาม seq — ชีตเรียงตามเวลาที่เขียน ไม่ใช่ลำดับวาระ
  var sessOrder = {};
  S.sessions.forEach(function(s, k) { sessOrder[s.id] = k; });
  var rows = data.items.slice().sort(function(a, b) {
    var sa = sessOrder[String(a.session_id).split('-').pop()] || 0;
    var sb = sessOrder[String(b.session_id).split('-').pop()] || 0;
    return sa - sb || (+a.seq || 0) - (+b.seq || 0);
  });
  S.items = rows.map(function(r, idx) {
    return {
      id: idx + 1,
      apiId: r.item_id || '',
      carryFrom: r.carry_from || '',
      s: String(r.session_id).split('-').pop(),
      t: r.topic,
      own: r.owner,
      min: +(r.planned_min) || 15,
      carry: !!r.carry_from,
      note: r.note || '',
      act: '', who: '',
      acts: actsByItem[r.item_id] || [],
      prevNote: r.prev_note || '',
      prevActs: r.prev_actions || [],
      spent: +(r.actual_sec) || 0,
      st: r.status
    };
  });
  return S;
}

function showLogin() {
  $('#hmeta').textContent = '';
  $('#plan').innerHTML =
    '<div class="card" style="max-width:360px;margin:60px auto;padding:24px">' +
    '<div class="brand" style="margin-bottom:16px">NCO <span>Weekly</span></div>' +
    '<label for="pc">Passcode</label>' +
    '<input class="f-in" id="pc" type="password" placeholder="กรอก passcode" style="margin:6px 0 14px" onkeydown="if(event.key===\'Enter\')login()">' +
    '<button class="btn o" onclick="login()" style="width:100%">เข้าใช้งาน</button>' +
    '<div id="lerr" class="hint" style="margin-top:8px;color:var(--red)"></div>' +
    '</div>';
}

function login() {
  var t = document.getElementById('pc').value.trim();
  if (!t) return;
  setToken(t);
  boot();
}

function showCreatePrompt() {
  var defaultDate = nextSaturday();
  $('#hmeta').textContent = '';
  $('#plan').innerHTML =
    '<div class="card" style="max-width:400px;margin:60px auto;padding:24px">' +
    '<h2 style="margin-top:0">ยังไม่มีวาระที่จะมาถึง</h2>' +
    '<p class="sub" style="margin-bottom:12px">เลือกวันที่ต้องการสร้างวาระ</p>' +
    '<input type="date" id="new-date" class="f-in" value="' + defaultDate + '" style="margin-bottom:14px">' +
    '<button class="btn o" onclick="createAndLoadFromInput()" style="width:100%">สร้างวาระ</button>' +
    '<div id="cerr" class="hint" style="margin-top:8px;color:var(--red)"></div>' +
    '</div>';
}

function createAndLoad(date) {
  call('createMeeting', { date: date, week_no: isoWeek(date), theme: '' })
    .then(function() { loadMeeting(date); })
    .catch(function(err) {
      if (err.badResponse) {
        call('getUpcoming', { today: date })
          .then(function(data) {
            if (data.meeting && data.meeting.date === date) {
              loadMeeting(date);
            } else {
              var el = document.getElementById('cerr');
              if (el) el.textContent = String(err);
              else $('#plan').innerHTML += '<p class="hint" style="color:var(--red);padding:10px 0">' + esc(String(err)) + '</p>';
            }
          })
          .catch(function() {
            var el = document.getElementById('cerr');
            if (el) el.textContent = String(err);
            else $('#plan').innerHTML += '<p class="hint" style="color:var(--red);padding:10px 0">' + esc(String(err)) + '</p>';
          });
      } else {
        var el = document.getElementById('cerr');
        if (el) el.textContent = String(err);
        else $('#plan').innerHTML += '<p class="hint" style="color:var(--red);padding:10px 0">' + esc(String(err)) + '</p>';
      }
    });
}

function createAndLoadFromInput() {
  var date = (document.getElementById('new-date') || {}).value;
  if (!date) return;
  createAndLoad(date);
}

function showError(msg) {
  $('#hmeta').textContent = '';
  $('#plan').innerHTML =
    '<div class="card" style="padding:20px;margin-top:24px">' +
    '<div style="font-weight:600;color:var(--red);margin-bottom:6px">เกิดข้อผิดพลาด</div>' +
    '<div class="sub">' + esc(msg) + '</div>' +
    '<button class="btn ghost" style="margin-top:14px" onclick="boot()">ลองใหม่</button>' +
    '</div>';
}

function loadMeeting(date) {
  $('#plan').innerHTML = '<p class="sub" style="padding:40px 0">กำลังโหลด…</p>';
  callRead_('getMeeting', { date: date })
    .then(function(data) {
      if (!data.meeting) { showCreatePrompt(); return; }
      LIVE = true;
      mapData(data, date);
      _saveCache(data);
      render();
    })
    .catch(function(err) {
      if (err.authFailed) {
        localStorage.removeItem('nco_weekly_token');
        showLogin();
        var el = document.getElementById('lerr');
        if (el) el.textContent = 'Passcode ไม่ถูกต้อง';
      } else {
        showError(String(err));
      }
    });
}

function boot() {
  if (!getToken()) { showLogin(); return; }
  LIVE = false;
  var _cached = _loadCache();
  if (_cached) {
    mapData(_cached.data, _cached.data.meeting.date);
    render();
    updateSaveStatus('stale');
    callRead_('getUpcoming', { today: todayStr() })
      .then(function(data) {
        LIVE = true;
        if (!data.meeting) { showCreatePrompt(); return; }
        _saveCache(data);
        if (!RUN.on) { mapData(data, data.meeting.date); render(); }
        updateSaveStatus('clear');
      })
      .catch(function(err) {
        if (err.authFailed) {
          localStorage.removeItem('nco_weekly_token');
          showLogin();
          var el = document.getElementById('lerr');
          if (el) el.textContent = 'Passcode ไม่ถูกต้อง';
        } else {
          updateSaveStatus('cached', _cacheMeta(_cached.ts));
        }
      });
  } else {
    $('#plan').innerHTML = '<p class="sub" style="padding:40px 0">กำลังโหลด…</p>';
    callRead_('getUpcoming', { today: todayStr() })
      .then(function(data) {
        LIVE = true;
        if (!data.meeting) { showCreatePrompt(); return; }
        mapData(data, data.meeting.date);
        _saveCache(data);
        render();
      })
      .catch(function(err) {
        if (err.authFailed) {
          localStorage.removeItem('nco_weekly_token');
          showLogin();
          var el = document.getElementById('lerr');
          if (el) el.textContent = 'Passcode ไม่ถูกต้อง';
        } else {
          showError(String(err));
        }
      });
  }
}

// ป้ายเวอร์ชันมุมล่าง — ถ้า API คนละเวอร์ชันกับหน้าเว็บ แปลว่ายังไม่ได้ deploy GAS ตัวใหม่
function paintVersion(){
  var el=document.getElementById('ver'); if(!el)return;
  var api=window.API_VERSION;
  var bad=api&&api!==APP_VERSION;
  el.textContent='v'+APP_VERSION+(bad?' · API '+(api==='old'?'ตัวเก่า':api)+' ยังไม่ได้ deploy':'');
  el.classList.toggle('warn',!!bad);
  el.title=api?('หน้าเว็บ '+APP_VERSION+' · API '+api):'หน้าเว็บ '+APP_VERSION;
}

function render(){
  if (!M) return;
  var pastBadge = M.isPast ? ' <span style="color:var(--amber)">· ประชุมที่ผ่านมา</span>' : '';
  $('#hmeta').innerHTML = '<span style="cursor:pointer;text-decoration:underline dotted" onclick="editDate()" title="กดเพื่อเลื่อนวันประชุม">' +
    esc(M.dateLabel) + ' · Week ' + M.week + '</span>' + pastBadge;
  if(TAB==='plan') $('#plan').innerHTML=planView();
  if(TAB==='run')  $('#run').innerHTML=runView();
  if(TAB==='recap')$('#recap').innerHTML=recapView();
  if(TAB==='tasks')$('#tasks').innerHTML=tasksView();
  document.body.classList.toggle('stage-mode',TAB==='run'&&PROJ);
  applyEditLock_();
}

/* ================= EDIT LOCK ================= */
// ปิดช่องแก้ไขทั้งหมดใน plan ขณะที่ยังไม่ได้ข้อมูลสด ยกเว้นปุ่ม next-week-btn
function applyEditLock_() {
  var locked = !LIVE;
  document.querySelectorAll('#plan input, #plan select, #plan textarea, #plan button').forEach(function(el) {
    if (el.id === 'next-week-btn') return;
    el.disabled = locked;
  });
}

/* ================= VISIBILITY REVALIDATE ================= */
document.addEventListener('visibilitychange', function() {
  if (document.hidden) {
    _hiddenAt = Date.now();
  } else {
    var elapsed = Date.now() - _hiddenAt;
    _hiddenAt = 0;
    // ยิง silent revalidate เมื่อกลับมาที่ tab หลัง 60 วินาที
    // ข้าม: กำลังจับเวลาอยู่, มีงานรอบันทึกอยู่, ยังไม่ได้ login
    if (elapsed > 60000 && !RUN.on && !_dirtyTimer && M) {
      updateSaveStatus('stale');
      callRead_('getUpcoming', { today: todayStr() })
        .then(function(data) {
          if (!data.meeting) { updateSaveStatus('clear'); return; }
          LIVE = true;
          _saveCache(data);
          if (!RUN.on) { mapData(data, data.meeting.date); render(); }
          updateSaveStatus('clear');
        })
        .catch(function() { updateSaveStatus('clear'); });
    }
  }
});

paintVersion();
boot();
