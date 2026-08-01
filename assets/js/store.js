/* 상태와 저장소.
 *
 * 화면 로직(render.js)과 API 호출(api.js)이 여기서 정의한 전역을 그대로 쓴다.
 * 모듈이 아니라 순서대로 로드되는 일반 스크립트다 — index.html의 script 순서를
 * 바꾸면 깨진다.
 */

/* ================= 상수 ================= */
var CH = {carb:'var(--c1)', protein:'var(--c2)', fat:'var(--c3)'};
var DOW = ['일','월','화','수','목','금','토'];

/* 목적별 계수: kcal/kg, 단백질 g/kg, 지방 g/kg */
var GOALS = {
  cut:  {label:'감량',    kcal:28, p:2.0, f:0.8, sub:'유지 대비 적자, 단백질 최대'},
  keep: {label:'유지',    kcal:33, p:1.6, f:1.0, sub:'현 체중 유지, 균형 배분'},
  lean: {label:'린매스업', kcal:38, p:1.8, f:1.0, sub:'완만한 증량, 지방 억제'},
  bulk: {label:'벌크업',  kcal:43, p:1.8, f:1.1, sub:'적극적 증량, 탄수 확대'}
};

var DEVICES = {
  cover:{w:412, h:961, label:'커버 1080×2520 · 21:9'},
  main: {w:910, h:820, label:'메인 2184×1968 · 1.11:1'}
};

/* ================= 상태 ================= */
var pad = function(n){ return String(n).padStart(2,'0'); };
var iso = function(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); };
var mkey = function(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1); };
var esc = function(s){ return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); };

var today = new Date();
var S = {
  view:'cover',
  cursor:new Date(today.getFullYear(), today.getMonth(), 1),
  selected:iso(today),
  data:{},
  profile:{h:171, w:64, goal:'keep'},
  apiKey:'',
  pending:null, photo:null, manual:false, busy:false, error:'', memo:'',
  recs:null, recBusy:false, recError:'',
  cfgOpen:false,
  // 먹은 음식 목록은 기본으로 접어 둔다. 항목이 쌓여도 카드가 길어지지 않게.
  listOpen:false,
  // 백업: imp 는 가져오기 파일을 읽고 반영을 기다리는 중인 요약
  imp:null, backupMsg:'', backupErr:''
};

/* 신장 기준 참고 체중 (BMI 22) */
function refWeight(h){ return Math.round(22 * Math.pow(h/100, 2)); }

/* 목표 산출 */
function targets(){
  var g = GOALS[S.profile.goal], w = S.profile.w;
  var kcal = Math.round(w * g.kcal / 10) * 10;
  var protein = Math.round(w * g.p);
  var fat = Math.round(w * g.f);
  var carb = Math.max(0, Math.round((kcal - protein*4 - fat*9) / 4));
  return {kcal:kcal, carb:carb, protein:protein, fat:fat};
}

var sum = function(list){
  return (list||[]).reduce(function(a,e){
    return {kcal:a.kcal+e.kcal, carb:a.carb+e.carb, protein:a.protein+e.protein, fat:a.fat+e.fat};
  },{kcal:0,carb:0,protein:0,fat:0});
};

function remaining(){
  var T = targets(), t = sum(S.data[S.selected]);
  return {kcal:T.kcal-t.kcal, carb:T.carb-t.carb, protein:T.protein-t.protein, fat:T.fat-t.fat};
}

/* ================= 저장소 ================= */
var store = {
  get: async function(k){
    if (window.storage){ try{ var r = await window.storage.get(k); return r ? r.value : null; }catch(e){ return null; } }
    try{ return localStorage.getItem(k); }catch(e){ return null; }
  },
  set: async function(k,v){
    if (window.storage){ try{ await window.storage.set(k,v); return true; }catch(e){ return false; } }
    try{ localStorage.setItem(k,v); return true; }catch(e){ return false; }
  }
};

async function loadMonth(){
  var raw = await store.get('intake:'+mkey(S.cursor));
  try{ S.data = raw ? JSON.parse(raw) : {}; }catch(e){ S.data = {}; }
  renderDay(); renderCal(); renderRec();
}
async function persist(){
  var ok = await store.set('intake:'+mkey(S.cursor), JSON.stringify(S.data));
  if(!ok){ S.error='저장에 실패했다. 브라우저 저장 공간을 확인할 것.'; renderInput(); }
  renderDay(); renderCal(); renderRec();
}
async function saveProfile(){ await store.set('intake:profile', JSON.stringify(S.profile)); }
