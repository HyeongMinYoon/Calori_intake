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
  weights:{}, tune:0, tunedAt:0,
  // 자주 먹는 것. 편집 모드면 각 항목에 지우기 버튼이 붙는다.
  favs:[], favEdit:false
};

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

/* ================= 자주 먹는 것 =================
 * 기록할 때마다 음식을 이름으로 기억해 두고, 다음에는 눌러서 바로 넣는다.
 * 사진이나 추정을 다시 거치지 않으므로 API 호출도 비용도 없다. */
var FAV_SHOW = 8;   // 화면에 보여 줄 개수
var FAV_KEEP = 40;  // 저장해 둘 개수

async function loadFavs(){
  var raw = await store.get('intake:favs');
  try{ S.favs = raw ? JSON.parse(raw) : []; }catch(e){ S.favs = []; }
  if (!Array.isArray(S.favs)) S.favs = [];
}

/* 이름을 열쇠로 삼고 마지막에 먹은 수치를 남긴다. 같은 음식을 다른 양으로
 * 먹었다면 최근 것이 이긴다 — '지난번과 같이'가 대개 원하는 동작이다. */
async function noteFav(e){
  if (!e || !e.name) return;
  if (!Array.isArray(S.favs)) S.favs = [];
  var key = String(e.name).trim();
  if (!key) return;

  var hit = null;
  for (var i = 0; i < S.favs.length; i++){
    if (S.favs[i].name === key){ hit = S.favs[i]; break; }
  }
  if (!hit){ hit = {name:key, n:0}; S.favs.push(hit); }

  hit.portion = e.portion || '';
  hit.kcal    = e.kcal    || 0;
  hit.carb    = e.carb    || 0;
  hit.protein = e.protein || 0;
  hit.fat     = e.fat     || 0;
  hit.n    = (hit.n || 0) + 1;
  hit.last = Date.now();

  // 자주 먹은 순, 같으면 최근 순. 한 번뿐인 항목은 자연히 뒤로 밀린다.
  S.favs.sort(function(a,b){ return (b.n - a.n) || (b.last - a.last); });
  if (S.favs.length > FAV_KEEP) S.favs.length = FAV_KEEP;
  await store.set('intake:favs', JSON.stringify(S.favs));
}

async function forgetFav(name){
  S.favs = (S.favs || []).filter(function(f){ return f.name !== name; });
  await store.set('intake:favs', JSON.stringify(S.favs));
  renderInput();
}
