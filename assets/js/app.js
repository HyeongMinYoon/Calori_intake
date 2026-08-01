/* 이벤트 처리, 부팅, 서비스 워커 등록. */

function addEntry(o){
  (S.data[S.selected] = S.data[S.selected]||[]).push(Object.assign({t:new Date().toTimeString().slice(0,5)}, o));
}

/* ================= 이벤트 ================= */
document.addEventListener('click', function(ev){
  var t = ev.target, id = t.id;

  var tab = t.closest('#chrome .tab');
  if (tab){
    S.view = tab.getAttribute('data-view');
    Array.prototype.forEach.call(document.querySelectorAll('#chrome .tab'), function(b){ b.classList.toggle('on', b===tab); });
    sizeDevice(); return;
  }
  if (t.closest('#cfgBtn')){ S.cfgOpen=!S.cfgOpen; renderCfg(); return; }

  var goal = t.closest('[data-goal]');
  if (goal){ S.profile.goal = goal.getAttribute('data-goal'); saveProfile(); S.recs=null; renderCfg(); renderDay(); renderCal(); renderRec(); return; }

  if (id==='prev'){ S.cursor=new Date(S.cursor.getFullYear(),S.cursor.getMonth()-1,1); loadMonth(); return; }
  if (id==='next'){ S.cursor=new Date(S.cursor.getFullYear(),S.cursor.getMonth()+1,1); loadMonth(); return; }

  var cell = t.closest('.cell[data-date]');
  if (cell){ S.selected=cell.getAttribute('data-date'); S.manual=false; S.error=''; S.recs=null; S.recError='';
    S.pending=null; S.photo=null; S.memo='';
    renderDay(); renderCal(); renderInput(); renderRec(); return; }

  if (id==='expBtn'){ exportData(); return; }
  if (id==='impApply'){ applyImport(); return; }
  if (id==='impCancel'){ S.imp=null; S.backupErr=''; S.backupMsg=''; renderCfg(); return; }

  if (t.closest('#listToggle')){
    S.listOpen = !S.listOpen;
    store.set('intake:listopen', S.listOpen ? '1' : '0');
    renderDay(); return;
  }

  var del = t.getAttribute && t.getAttribute('data-del');
  if (del){
    S.data[S.selected] = (S.data[S.selected]||[]).filter(function(e){ return e.id!==del; });
    if(!S.data[S.selected].length) delete S.data[S.selected];
    persist(); return;
  }

  if (id==='recBtn' || id==='recAgain'){ recommend(); return; }
  var ri = t.getAttribute && t.getAttribute('data-rec');
  if (ri!==null && ri!==undefined && S.recs){
    var p = S.recs[Number(ri)];
    addEntry({id:String(Date.now()), name:p.name, portion:p.desc, kcal:p.kcal, carb:p.carb, protein:p.protein, fat:p.fat});
    S.recs=null; persist(); return;
  }

  if (id==='analyzeBtn'){ analyze(); return; }
  if (id==='manBtn'){ S.manual=!S.manual; renderInput(); return; }
  if (id==='mCancel'){ S.manual=false; renderInput(); return; }
  if (id==='cancelP'){ S.pending=null; renderInput(); return; }

  if (id==='mAdd'){
    var name = document.getElementById('mName').value.trim();
    if(!name){ S.error='음식명을 입력할 것.'; renderInput(); return; }
    var kcal = Math.round(Number(document.getElementById('m_kcal').value)||0);
    // 수치를 비워 두면 이름만으로 추정한다. 직접 넣었으면 그대로 저장 (호출 없음).
    if(kcal<=0){ S.error=''; estimateByName(name); return; }
    addEntry({id:String(Date.now()), name:name, portion:'', kcal:kcal,
      carb:Math.round(Number(document.getElementById('m_carb').value)||0),
      protein:Math.round(Number(document.getElementById('m_protein').value)||0),
      fat:Math.round(Number(document.getElementById('m_fat').value)||0)});
    S.manual=false; S.error=''; persist(); renderInput(); return;
  }

  if (id==='commit'){
    var stamp = new Date().toTimeString().slice(0,5);
    S.data[S.selected] = (S.data[S.selected]||[]).concat(S.pending.items.map(function(it){ return Object.assign({},it,{t:stamp}); }));
    S.pending=null; S.photo=null; S.memo=''; persist(); renderInput(); return;
  }
});

document.addEventListener('change', function(ev){
  if (ev.target.id==='impFile' && ev.target.files && ev.target.files[0]){
    var bf = ev.target.files[0];
    ev.target.value='';
    readBackup(bf);
    return;
  }
  if (ev.target.id==='file' && ev.target.files && ev.target.files[0]){
    var f = ev.target.files[0];
    ev.target.value='';
    var r = new FileReader();
    r.onload = function(){
      var img = new Image();
      img.onload = function(){
        // 폰 카메라 원본은 수 MB라 전송 전에 축소한다
        var max = 1024, w = img.width, h = img.height;
        var s = Math.min(1, max/Math.max(w,h));
        var cv = document.createElement('canvas');
        cv.width = Math.round(w*s); cv.height = Math.round(h*s);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        var url;
        try { url = cv.toDataURL('image/jpeg', 0.82); } catch(e) { url = r.result; }
        S.photo = {b64:url.split(',')[1], type:'image/jpeg', preview:url};
        S.pending=null; S.error=''; renderInput();
      };
      img.onerror = function(){
        S.error = '이 형식의 사진은 읽지 못했다. JPG 또는 PNG로 다시 시도할 것.';
        renderInput();
      };
      img.src = r.result;
    };
    r.onerror = function(){ S.error='사진을 읽지 못했다. 다른 사진을 고를 것.'; renderInput(); };
    r.readAsDataURL(f);
  }
});

document.addEventListener('input', function(ev){
  var el = ev.target;
  var pf = el.getAttribute('data-pf');
  if (pf){
    var v = Number(el.value)||0;
    S.profile[pf] = pf==='h' ? Math.min(230, Math.max(120, v)) : Math.min(250, Math.max(30, v));
    saveProfile(); renderDay(); renderCal(); renderRec();
    var box = document.getElementById('cfg');
    var T = targets();
    var nums = box.querySelectorAll('.disp');
    ['kcal','carb','protein','fat'].forEach(function(k,i){ if(nums[i]) nums[i].textContent = T[k]; });
    return;
  }
  if (el.id==='memo'){ S.memo = el.value; return; }
  if (el.id==='apiKey'){ S.apiKey = el.value.trim(); store.set('intake:apikey', S.apiKey); return; }
  var pi = el.getAttribute('data-pi');
  if (pi!==null && S.pending){
    var k = el.getAttribute('data-pk');
    S.pending.items[Number(pi)][k] = (k==='name') ? el.value : Math.max(0, Number(el.value)||0);
  }
});

window.addEventListener('resize', sizeDevice);

/* ================= 서비스 워커 ================= */
/* 오프라인 실행과 홈 화면 설치를 담당한다. 새 버전이 배포되면 배너를 띄우고,
 * 사용자가 누를 때만 교체한다 — 기록 입력 중에 화면이 갈아엎히지 않도록. */
function registerSW(){
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then(function(reg){
    function watch(worker){
      if (!worker) return;
      worker.addEventListener('statechange', function(){
        if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate(worker);
      });
    }
    if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
    watch(reg.installing);
    reg.addEventListener('updatefound', function(){ watch(reg.installing); });

    /* 홈 화면 앱을 백그라운드에서 다시 불러오면 페이지가 새로 로드되지 않는다.
     * 그러면 새 버전 확인도 일어나지 않아 옛 버전에 머문다 — iOS에서 특히 그렇다.
     * 앱이 앞으로 나올 때마다 직접 확인하되, 과하게 부르지 않도록 간격을 둔다. */
    var lastCheck = 0;
    var check = function(){
      if (document.visibilityState !== 'visible') return;
      var now = Date.now();
      if (now - lastCheck < 60000) return;
      lastCheck = now;
      reg.update().catch(function(){ /* 오프라인이면 다음 기회에 */ });
    };
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    check();
  }).catch(function(){ /* 오프라인 첫 실행 등 — 앱 동작에는 지장이 없다 */ });

  var reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', function(){
    if (reloading) return;
    reloading = true;
    location.reload();
  });
}

function showUpdate(worker){
  var bar = document.getElementById('update');
  if (!bar){
    bar = document.createElement('div');
    bar.id = 'update';
    bar.innerHTML = '<span>새 버전이 있다.</span><button type="button">새로고침</button>';
    document.body.appendChild(bar);
  }
  bar.classList.add('on');
  bar.querySelector('button').onclick = function(){
    bar.classList.remove('on');
    worker.postMessage('SKIP_WAITING');
  };
}

/* ================= 시작 ================= */
(async function boot(){
  var p = await store.get('intake:profile');
  if (p){ try{ S.profile = Object.assign(S.profile, JSON.parse(p)); }catch(e){} }
  else { S.profile.w = refWeight(S.profile.h); }
  var k = await store.get('intake:apikey');
  if (k) S.apiKey = k;
  var lo = await store.get('intake:listopen');
  if (lo === '1') S.listOpen = true;
  sizeDevice();
  await loadMonth();
  renderInput(); renderCfg(); renderRec();
  registerSW();
})();
