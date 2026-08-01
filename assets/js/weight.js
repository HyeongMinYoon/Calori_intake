/* 체중 기록과 목표 튜닝.
 *
 * kcal/kg 계수는 성별·나이·활동량을 모르는 추측이다. 실제 유지 열량은 사람마다
 * 크게 다르므로, 체중 추세라는 측정값으로 그 추측을 보정한다.
 *
 * 원칙:
 *  - 하루 체중은 수분·글리코겐·장 내용물로 ±1~2kg 흔들린다. 7일 이동평균으로만
 *    판단하고, 단일 날짜에는 절대 반응하지 않는다.
 *  - 최소 2주를 모은 뒤 첫 조정, 이후 조정 간격도 최소 1주.
 *  - 조정은 한 번에 작게(5~8%). 크게 흔들면 반응이 조정 탓인지 노이즈인지
 *    구분할 수 없게 된다.
 *  - 단백질과 지방은 체중당 하한선이라 건드리지 않는다. 총 열량만 움직이면
 *    탄수화물이 나머지로 흡수한다.
 */

/* 목적별 주간 목표 변화율 (% / 주) */
var RATE = {
  cut:  {lo:-1.0, hi:-0.5, label:'감량'},
  keep: {lo:-0.2, hi: 0.2, label:'유지'},
  lean: {lo: 0.25, hi: 0.5, label:'린매스업'},
  bulk: {lo: 0.5, hi: 1.0, label:'벌크업'}
};

var TUNE_MIN_DAYS = 14;      // 첫 조정 전에 모아야 할 최소 일수
var TUNE_MIN_GAP  = 7;       // 조정과 조정 사이 최소 간격(일)
var TUNE_STEP     = 0.06;    // 한 번에 움직이는 폭 (총 열량의 6%)
var TUNE_MAX      = 0.25;    // 누적 보정 상한 (±25%)

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

/* ================= 튜닝 제안 ================= */
/* 조건을 못 갖췄으면 왜 아직인지 함께 돌려준다. 화면에서 그대로 보여 준다. */
function tuneSuggestion(){
  var t = weightTrend();
  if (!t) return {ready:false, why:'체중을 기록하면 추세를 계산한다.'};
  if (t.span < TUNE_MIN_DAYS){
    return {ready:false, trend:t,
      why:'추세를 믿으려면 '+TUNE_MIN_DAYS+'일이 필요하다. 지금 '+t.span+'일째.'};
  }
  if (t.rate === null){
    return {ready:false, trend:t, why:'최근 2주 중 기록이 드물다. 주당 3회 이상 재야 비교할 수 있다.'};
  }
  var since = S.tunedAt
    ? Math.floor((Date.now() - S.tunedAt) / 86400000)
    : null;
  if (since !== null && since < TUNE_MIN_GAP){
    return {ready:false, trend:t,
      why:'조정한 지 '+since+'일 됐다. 반응을 보려면 '+TUNE_MIN_GAP+'일은 기다릴 것.'};
  }

  var band = RATE[S.profile.goal];
  if (t.rate >= band.lo && t.rate <= band.hi){
    return {ready:false, trend:t, band:band, onTrack:true,
      why:'목표 속도 안에 있다. 지금 목표를 유지할 것.'};
  }

  /* 여기까지 왔으면 구간 밖이다. 구간보다 아래면 열량을 올리고, 위면 내린다.
   * 감량도 같은 규칙으로 맞는다 — 목표보다 더 빠지고 있으면(rate가 구간 아래)
   * 더 먹어야 하고, 덜 빠지고 있으면(구간 위) 덜 먹어야 한다. */
  var dir = (t.rate < band.lo) ? 1 : -1;

  var next = Math.max(-TUNE_MAX, Math.min(TUNE_MAX, (S.tune || 0) + dir * TUNE_STEP));
  if (Math.abs(next - (S.tune || 0)) < 0.001){
    return {ready:false, trend:t, band:band,
      why:'보정 한계(±'+Math.round(TUNE_MAX*100)+'%)에 닿았다. 활동량이나 목적을 다시 볼 것.'};
  }

  var before = targets().kcal;
  var saved = S.tune; S.tune = next;
  var after = targets().kcal;
  S.tune = saved;

  return {ready:true, trend:t, band:band, tune:next, before:before, after:after,
    dir:dir > 0 ? '올림' : '내림'};
}

async function applyTune(next){
  S.tune = next;
  S.tunedAt = Date.now();
  await store.set('intake:tune', String(S.tune));
  await store.set('intake:tunedat', String(S.tunedAt));
  renderWeight(); renderCfg(); renderDay(); renderCal(); renderRec();
}

async function resetTune(){
  S.tune = 0; S.tunedAt = 0;
  await store.set('intake:tune', '0');
  await store.set('intake:tunedat', '0');
  renderWeight(); renderCfg(); renderDay(); renderCal(); renderRec();
}
