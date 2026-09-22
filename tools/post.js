'use strict';
// =====================================================================
// nco-weekly — tools/post.js
// ยิง action ไป GAS Web App สำหรับ smoke test
//
// ใช้:  $env:NCO_TOKEN = "<token>"
//       node tools\post.js ping
//       node tools\post.js getMeeting "{\"date\":\"2026-09-19\"}"
//
// กลไก: GAS ตอบ 302 ไป googleusercontent.com/macros/echo ซึ่งเป็นที่พัก
//       ผลลัพธ์ที่คำนวณเสร็จแล้ว ไม่ใช่ endpoint ที่รับ input
//       hop แรกเป็น POST พร้อม body / hop ถัดไปเป็น GET เปล่า ๆ
//       ถ้าส่ง POST ซ้ำที่ hop 2 จะได้ 405
// =====================================================================

const https = require('https');
const { URL } = require('url');

const WEBAPP_URL = process.env.NCO_URL ||
  'https://script.google.com/macros/s/AKfycbxmhjKopZvo384w_sncaoinKPkGrNVd_m6BBI9ugpo8pE0o37Qw1ocp75GTq6irT0_9RQ/exec';

const token = process.env.NCO_TOKEN;
if (!token) {
  process.stderr.write('ERROR: ตั้ง NCO_TOKEN ก่อนรัน  →  $env:NCO_TOKEN = "<token>"\n');
  process.exit(1);
}

const action = process.argv[2];
if (!action) {
  process.stderr.write('ERROR: node tools\\post.js <action> [payloadJSON]\n');
  process.exit(1);
}

let payload = {};
if (process.argv[3]) {
  try {
    payload = JSON.parse(process.argv[3]);
  } catch (e) {
    process.stderr.write('ERROR: payload JSON ไม่ถูกต้อง: ' + e.message + '\n');
    process.exit(1);
  }
}

const body = Buffer.from(JSON.stringify({ token, action, payload }), 'utf8');
const MAX_HOPS = 6;

function hop(urlStr, n, method) {
  if (n > MAX_HOPS) {
    process.stderr.write('ERROR: redirect เกิน ' + MAX_HOPS + ' ครั้ง\n');
    process.exit(1);
  }

  const u = new URL(urlStr);
  const isPost = method === 'POST';

  const opts = {
    hostname: u.hostname,
    path: u.pathname + u.search,
    method: method,
    headers: isPost
      ? { 'Content-Type': 'text/plain;charset=utf-8', 'Content-Length': body.length }
      : { 'Accept': '*/*' }
  };

  const req = https.request(opts, (res) => {
    const loc = res.headers.location || '';
    process.stderr.write('hop ' + n + ': ' + method + ' ' + u.hostname +
                         ' → ' + res.statusCode + (loc ? ' → ' + loc : '') + '\n');

    // 302/303 จาก GAS = ผลลัพธ์พร้อมแล้ว ไปรับด้วย GET
    // 307/308 = ให้ทำซ้ำด้วย method เดิม
    if (res.statusCode >= 300 && res.statusCode < 400 && loc) {
      res.resume();
      const nextMethod = (res.statusCode === 307 || res.statusCode === 308) ? method : 'GET';
      hop(new URL(loc, urlStr).toString(), n + 1, nextMethod);
      return;
    }

    let data = '';
    res.setEncoding('utf8');
    res.on('data', (c) => { data += c; });
    res.on('end', () => {
      process.stdout.write(data + '\n');
      if (res.statusCode !== 200) process.exitCode = 1;
    });
  });

  req.on('error', (e) => {
    process.stderr.write('ERROR: ' + e.message + '\n');
    process.exit(1);
  });

  if (isPost) req.write(body);
  req.end();
}

hop(WEBAPP_URL, 1, 'POST');