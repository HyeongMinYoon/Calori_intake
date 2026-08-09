/* 체중 기록과 추세.
 *
 * 목표를 자동으로 고쳐 주지는 않는다. 재는 것과 보여 주는 것까지만 한다 —
 * 목표를 바꿀지는 사람이 판단할 몫이다.
 *
 * 원칙:
 *  - 하루 체중은 수분·글리코겐·장 내용물로 ±1~2kg 흔들린다. 7일 이동평균으로만
 *    판단하고, 단일 날짜에는 절대 반응하지 않는다.
 *  - 주당 변화율을 목적별 목표 구간과 나란히 보여 준다. 구간 안이면 지금 목표가
 *    맞는 것이고, 몇 주씩 벗어나 있으면 계수를 다시 볼 때다.
 */

/* 목적별 주간 목표 변화율 (% / 주) */
var RATE = {
  cut:  {lo:-1.0, hi:-0.5, label:'감량'},
  keep: {lo:-0.2, hi: 0.2, label:'유지'},
  lean: {lo: 0.25, hi: 0.5, label:'린매스업'},
  bulk: {lo: 0.5, hi: 1.0, label:'벌크업'}
};

/* ================= 저장 ================= */
/* 체중은 월 단위 키에 {날짜: kg} 로 둔다. 음식 기록과 구조를 섞지 않는다. */
async function loadWeights(){
  var raw = await store.get('intake:weight');
  try{ S.weights = raw ? JSON.parse(raw) : {}; }catch(e){ S.weights = {}; }
}

async function saveWeight(day, kg){
  if (!S.weights) S.weights = {};
  if (kg > 0) S.weights[day] = Math.round(kg * 10) / 10;
  else delete S.weights[day];
  await store.set('intake:weight', JSON.stringify(S.weights));
  await syncProfileWeight();
  S.lastChange = Date.now();
  await store.set('intake:lastchange', String(S.lastChange));
  renderWeight(); renderDay(); renderCal(); renderRec(); renderNag();
}

/* ================= 추세 ================= */
/* 기준일로부터 뒤로 7일 안의 기록 평균. 매일 재지 않아도 되도록 빈 날은 건너뛴다. */
function avg7(endDay){
  if (!S.weights) return null;
  var end = new Date(endDay + 'T00:00:00');
  var sum = 0, n = 0;
  for (var i = 0; i < 7; i++){
    var d = new Date(end.getFullYear(), end.getMonth(), end.getDate() - i);
    var v = S.weights[iso(d)];
    if (v > 0){ sum += v; n++; }
  }
  return n ? {kg: sum / n, n: n} : null;
}

function weightDays(){
  return Object.keys(S.weights || {}).filter(function(d){ return S.weights[d] > 0; }).sort();
}

/* 최근 7일 평균과 그 이전 7일 평균을 비교해 주당 변화율(%)을 낸다. */
function weightTrend(){
  var days = weightDays();
  if (!days.length) return null;
  var last = days[days.length - 1];
  var now = avg7(last);
  if (!now) return null;

  var prevEnd = new Date(last + 'T00:00:00');
  prevEnd = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), prevEnd.getDate() - 7);
  var prev = avg7(iso(prevEnd));

  var span = Math.round(
    (new Date(last + 'T00:00:00') - new Date(days[0] + 'T00:00:00')) / 86400000) + 1;

  var out = {avg: now.kg, samples: now.n, days: days.length, span: span, last: last, rate: null};
  // 두 구간 모두 표본이 충분할 때만 변화율을 낸다
  if (prev && now.n >= 3 && prev.n >= 3){
    out.rate = ((now.kg - prev.kg) / prev.kg) * 100;
    out.prev = prev.kg;
  }
  return out;
}

/* 목표는 체중에 비례한다. 손으로 적은 값보다 이동평균이 정확하므로 프로필을
 * 그쪽으로 맞춰 둔다. 0.1kg 미만 차이는 무시해 쓸데없는 저장을 피한다. */
async function syncProfileWeight(){
  var t = weightTrend();
  if (!t) return;
  var kg = Math.round(t.avg * 10) / 10;
  if (Math.abs(kg - S.profile.w) < 0.1) return;
  S.profile.w = kg;
  await saveProfile();
  renderCfg();
}

