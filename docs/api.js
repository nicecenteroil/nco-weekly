function getToken() { return localStorage.getItem('nco_weekly_token'); }
function setToken(t) { localStorage.setItem('nco_weekly_token', t); }

function call(action, payload) {
  return fetch(CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token: getToken(), action: action, payload: payload || {} })
  })
  .then(function(r) {
    return r.text();
  }, function(cause) {
    console.error('[api] fetch failed:', cause);
    var err = new Error('เชื่อมต่อระบบไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต');
    err.cause = cause;
    throw err;
  })
  .then(function(text) {
    var j;
    try { j = JSON.parse(text); }
    catch (e) {
      console.error('[api] bad JSON from GAS:', text.slice(0, 200));
      var err = new Error('ระบบตอบกลับผิดรูปแบบ');
      err.badResponse = true;
      err.cause = e;
      throw err;
    }
    if (!j.ok) {
      var err = new Error(j.error);
      if (j.authFailed || j.error === 'token ไม่ถูกต้อง') err.authFailed = true;
      console.error('[api] error from GAS:', j.error);
      throw err;
    }
    return j.data;
  });
}

/* เรียกซ้ำ 1 ครั้งหลัง 1500ms เฉพาะคำสั่งอ่าน (getUpcoming, getMeeting)
   ห้ามใช้กับคำสั่งเขียน — ยิงซ้ำจะได้ข้อมูลซ้อน */
function callRead_(action, payload) {
  return call(action, payload).catch(function(err) {
    if (err.authFailed) throw err;
    return new Promise(function(res) { setTimeout(res, 1500); })
      .then(function() { return call(action, payload); });
  });
}
