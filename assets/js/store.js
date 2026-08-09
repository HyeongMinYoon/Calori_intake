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
  imp:null, backupMsg:'', backupErr:'',
  // 백업 알림. backupEvery 는 며칠마다 알릴지, 0 이면 끄기.
  // lastChange 가 lastExport 보다 나중일 때만 알린다 — 안 쓴 날엔 조용하도록.
  backupEvery:1, lastExport:0, lastChange:0, snoozeUntil:0,
  // 체중 기록 {날짜: kg} 과 추세로 배운 열량 보정(비율), 마지막 조정 시각
  weights:{}, tune:0, tunedAt:0
};

/* ================= 기본 항목 =================
 * 기록 추가 화면 맨 위에 늘 떠 있는 고정 목록이다. 최근에 먹은 것을 자동으로
 * 올리지 않는다 — 매일 먹는 것만 한 번 눌러 넣는 자리다.
 *
 * 프로틴미숫가루라떼는 매장 표기가 우유 기준(ICE 650ml, 286kcal)이라 우유를
 * 같은 양의 무가당 오트밀크로 바꾼 값을 넣었다. 우유 양은 표기 포화지방
 * 7.38g을 우유 100ml당 2.3g으로 나눠 320ml로 잡았다. 콜레스테롤 45mg으로
 * 역산하면 409ml가 나오지만 유청단백 파우더에도 콜레스테롤이 있어 우유 몫이
 * 과대평가된다.
 *
 * 탄수는 표기 47.7g이 아니라 실질 28g에서 출발했다. 표기대로 곱하면 364kcal
 * 인데 표기 열량은 286kcal이라 78kcal이 뜬다 — 제로슈가 대체당과 식이섬유는
 * 표기 탄수에 들어가지만 열량을 거의 내지 않는다. 표기값을 그대로 세면 탄수
 * 달성률만 부풀고 kcal과 앞뒤가 맞지 않는다. */
var PRESETS = [
  {name:'바나나', portion:'1개 약 100g(가식부)',
   kcal:90, carb:23, protein:1, fat:0},
  {name:'프로틴미숫가루라떼(오트)', portion:'ICE 650ml · 우유→오트밀크 변경',
   kcal:225, carb:35, protein:8, fat:6}
];

/* 신장 기준 참고 체중 (BMI 22) */
function refWeight(h){ return Math.round(22 * Math.pow(h/100, 2)); }

/* 목표 산출.
 * S.tune 은 체중 추세로 배운 보정값이다. 계수는 성별·활동량을 모르는 추측이라
 * 개인차를 담지 못하므로, 총 열량만 보정하고 단백질·지방은 체중당 값을 유지한다.
 * 탄수화물이 나머지로 계산되므로 보정분을 자동으로 흡수한다. */
function targets(){
  var g = GOALS[S.profile.goal], w = S.profile.w;
  var kcal = Math.round(w * g.kcal * (1 + (S.tune || 0)) / 10) * 10;
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
  renderDay(); renderCal(); renderRec(); renderNag();
}
async function persist(){
  var ok = await store.set('intake:'+mkey(S.cursor), JSON.stringify(S.data));
  if(!ok){ S.error='저장에 실패했다. 브라우저 저장 공간을 확인할 것.'; renderInput(); }
  // 백업 알림은 마지막 내보내기 이후 기록이 바뀌었을 때만 뜬다
  S.lastChange = Date.now();
  await store.set('intake:lastchange', String(S.lastChange));
  renderDay(); renderCal(); renderRec(); renderNag();
}
async function saveProfile(){ await store.set('intake:profile', JSON.stringify(S.profile)); }
