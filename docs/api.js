function getToken() { return localStorage.getItem('nco_weekly_token'); }
function setToken(t) { localStorage.setItem('nco_weekly_token', t); }

function call(action, payload) {
  return fetch(CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token: getToken(), action: action, payload: payload || {} })
  })
  .then(function(r) { return r.text(); })
  .then(function(text) {
    var j;
    try { j = JSON.parse(text); }
    catch (e) {
      var err = new Error('ระบบตอบกลับผิดรูปแบบ');
      err.badResponse = true;
      throw err;
    }
    if (!j.ok) throw new Error(j.error);
    return j.data;
  });
}
