/* 기록 내보내기 / 가져오기.
 *
 * 기록은 이 기기에만 있다. 기기를 바꾸거나 브라우저 데이터를 지우면 사라지므로
 * JSON 파일 하나로 빼두고 되돌릴 수 있게 한다.
 *
 * API 키는 일부러 파일에 담지 않는다. 백업 파일은 메일이나 클라우드로 옮겨
 * 다니기 마련이라, 거기에 키가 섞이면 유출 경로가 된다.
 */

var BACKUP_VERSION = 1;

/* 저장된 월 목록. localStorage 는 키를 열거할 수 있고, Claude 앱 안에서 쓰는
 * window.storage 는 열거 API가 없어 오늘을 기준으로 앞뒤를 훑는다. */
async function backupMonths(){
  var keys = [];
  try{
    for (var i=0; i<localStorage.length; i++){
      var k = localStorage.key(i);
      if (/^intake:\d{4}-\d{2}$/.test(k)) keys.push(k.slice(7));
    }
  }catch(e){ /* 접근이 막힌 환경 */ }

  if (!keys.length){
    var base = new Date();
    for (var m=-36; m<=36; m++){
      var mk = mkey(new Date(base.getFullYear(), base.getMonth()+m, 1));
      if (keys.indexOf(mk) >= 0) continue;
      var raw = await store.get('intake:'+mk);
      if (raw) keys.push(mk);
    }
  }
  return keys.sort();
}

function countDays(months){
  var days = 0, items = 0;
  Object.keys(months).forEach(function(mk){
    var obj = months[mk] || {};
    Object.keys(obj).forEach(function(day){
      days++; items += (obj[day] || []).length;
    });
  });
  return {days:days, items:items};
}

/* ================= 내보내기 ================= */
async function exportData(){
  S.backupErr = ''; S.backupMsg = '';
  try{
    var data = {
      app:'intake-log', version:BACKUP_VERSION,
      exportedAt:new Date().toISOString(),
      profile:null, months:{}, weights:{}, tune:0
    };
    var p = await store.get('intake:profile');
    if (p){ try{ data.profile = JSON.parse(p); }catch(e){} }
    var w = await store.get('intake:weight');
    if (w){ try{ data.weights = JSON.parse(w) || {}; }catch(e){} }
    data.tune = Number(await store.get('intake:tune')) || 0;

    var months = await backupMonths();
    for (var i=0; i<months.length; i++){
      var raw = await store.get('intake:'+months[i]);
      if (!raw) continue;
      try{ data.months[months[i]] = JSON.parse(raw); }catch(e){}
    }

    var n = countDays(data.months);
    if (!n.items){ S.backupMsg = '내보낼 기록이 없다.'; renderCfg(); return; }

    var name = 'intake-log-' + iso(new Date()) + '.json';
    var url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type:'application/json'}));
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);

    S.lastExport = Date.now();
    S.snoozeUntil = 0;
    await store.set('intake:lastexport', String(S.lastExport));
    await store.set('intake:snooze', '0');

    var wn = Object.keys(data.weights || {}).length;
    S.backupMsg = n.days+'일 '+n.items+'건'+(wn?' · 체중 '+wn+'일':'')+'을 '+name+' 으로 내보냈다.';
  }catch(e){
    S.backupErr = '내보내기에 실패했다. 저장 공간을 확인할 것.';
  }
  renderCfg(); renderNag();
}

/* ================= 백업 알림 =================
 * 자동 저장은 할 수 없다. 웹 앱은 닫혀 있는 동안 실행되지 않고, 파일을 쓰려면
 * 매번 사용자의 동작이 필요하다. 대신 앱을 열었을 때 때가 됐으면 알린다.
 * 기록이 바뀌지 않았으면 알리지 않는다 — 안 쓴 날까지 보채지 않도록. */
function backupDue(){
  if (!S.backupEvery) return null;                 // 끄기
  var now = Date.now();
  if (S.snoozeUntil && now < S.snoozeUntil) return null;
  if (!S.lastChange) return null;                  // 기록이 아예 없다
  if (S.lastChange <= S.lastExport) return null;   // 마지막 백업 뒤로 바뀐 게 없다
  if (!S.lastExport) return {days:null};           // 한 번도 백업한 적이 없다
  var days = Math.floor((now - S.lastExport) / 86400000);
  if (days < S.backupEvery) return null;
  return {days:days};
}

async function snoozeBackup(){
  S.snoozeUntil = Date.now() + 86400000;           // 하루 미룸
  await store.set('intake:snooze', String(S.snoozeUntil));
  renderNag();
}

async function setBackupEvery(days){
  S.backupEvery = days;
  await store.set('intake:backupevery', String(days));
  renderCfg(); renderNag();
}

/* ================= 가져오기 ================= */
/* 파일을 읽어 요약만 보여 준다. 실제 반영은 확인을 누른 뒤에 한다. */
function readBackup(file){
  var r = new FileReader();
  r.onload = function(){
    var data;
    try{ data = JSON.parse(r.result); }
    catch(e){ S.imp = null; S.backupMsg=''; S.backupErr = '읽을 수 없는 파일이다. 내보내기로 만든 JSON 파일을 고를 것.'; renderCfg(); return; }

    if (!data || data.app !== 'intake-log' || !data.months || typeof data.months !== 'object'){
      S.imp = null; S.backupMsg='';
      S.backupErr = '이 앱에서 내보낸 파일이 아니다.';
      renderCfg(); return;
    }

    var months = Object.keys(data.months).sort();
    var n = countDays(data.months);
    S.backupErr = ''; S.backupMsg = '';
    S.imp = {data:data, months:months, days:n.days, items:n.items};
    renderCfg();
  };
  r.onerror = function(){
    S.imp = null; S.backupMsg='';
    S.backupErr = '파일을 읽지 못했다.';
    renderCfg();
  };
  r.readAsText(file);
}

/* 병합해서 반영한다. 기존 기록은 지우지 않고, 같은 id 가 없는 것만 더한다.
 * 새 기기에 통째로 복원하는 경우에는 대상이 비어 있으니 결과가 같다. */
async function applyImport(){
  if (!S.imp) return;
  var data = S.imp.data, added = 0, skipped = 0, addedW = 0;
  try{
    var months = Object.keys(data.months);
    for (var i=0; i<months.length; i++){
      var mk = months[i];
      if (!/^\d{4}-\d{2}$/.test(mk)) continue;
      var incoming = data.months[mk] || {};

      var raw = await store.get('intake:'+mk);
      var cur = {};
      if (raw){ try{ cur = JSON.parse(raw); }catch(e){ cur = {}; } }

      Object.keys(incoming).forEach(function(day){
        var have = cur[day] || [];
        var seen = {};
        have.forEach(function(e){ if (e && e.id != null) seen[e.id] = 1; });
        (incoming[day] || []).forEach(function(e){
          if (!e || e.id == null) return;
          if (seen[e.id]){ skipped++; return; }
          have.push(e); seen[e.id] = 1; added++;
        });
        have.sort(function(a,b){ return String(a.t||'').localeCompare(String(b.t||'')); });
        cur[day] = have;
      });

      await store.set('intake:'+mk, JSON.stringify(cur));
    }

    // 체중은 날짜별 단일 값이라 기존에 없는 날짜만 채운다
    if (data.weights && typeof data.weights === 'object'){
      if (!S.weights) S.weights = {};
      Object.keys(data.weights).forEach(function(d){
        if (!(S.weights[d] > 0) && data.weights[d] > 0){ S.weights[d] = data.weights[d]; addedW++; }
      });
      await store.set('intake:weight', JSON.stringify(S.weights));
    }
    if (typeof data.tune === 'number' && data.tune){
      S.tune = data.tune;
      await store.set('intake:tune', String(S.tune));
    }
    if (data.profile){
      S.profile = Object.assign(S.profile, data.profile);
      await saveProfile();
    }

    S.imp = null;
    var parts = [];
    if (added)  parts.push('기록 '+added+'건');
    if (addedW) parts.push('체중 '+addedW+'일');
    S.backupMsg = parts.length
      ? (parts.join(', ')+'을 반영했다.' + (skipped ? ' 이미 있던 '+skipped+'건은 그대로 두었다.' : ''))
      : '새로 반영할 것이 없었다. 이미 모두 들어 있다.';
    await loadMonth();
    renderWeight();
  }catch(e){
    S.backupErr = '가져오기에 실패했다. 저장 공간을 확인할 것.';
  }
  renderCfg();
}
