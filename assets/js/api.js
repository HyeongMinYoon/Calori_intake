/* Anthropic Messages API 호출 (사진 분석 · 메뉴 추천).
 *
 * 브라우저에서 직접 api.anthropic.com을 호출하므로
 * anthropic-dangerous-direct-browser-access 헤더가 필요하다. API 키는 설정에서
 * 입력받아 이 기기에만 저장되고, 서버를 거치지 않는다.
 */

var API_MODEL = 'claude-sonnet-4-6';

function apiHeaders(){
  var h = {'Content-Type':'application/json'};
  if (S.apiKey){
    h['x-api-key'] = S.apiKey;
    h['anthropic-version'] = '2023-06-01';
    h['anthropic-dangerous-direct-browser-access'] = 'true';
  }
  return h;
}
/* Claude 앱 밖(설치형)에서는 키가 없으면 요청이 성립하지 않는다 */
function needsKey(){ return !S.apiKey && !window.storage; }

async function callAPI(body){
  var resp;
  try { resp = await fetch('https://api.anthropic.com/v1/messages', {method:'POST', headers:apiHeaders(), body:JSON.stringify(body)}); }
  catch(e){ throw new Error('net'); }
  if (!resp.ok){
    var detail = '';
    try { var j = await resp.json(); detail = (j.error && j.error.message) ? j.error.message : ''; } catch(e){}
    throw new Error('http:'+resp.status+(detail?' · '+detail.slice(0,110):''));
  }
  return await resp.json();
}

function apiMsg(e){
  var m = String((e && e.message) || '');
  if (m === 'nokey') return '설치형 앱에서는 설정에서 Anthropic API 키를 넣어야 사진 분석과 추천이 동작한다.';
  if (m === 'net')   return '서버에 연결하지 못했다. 설정에 API 키가 들어가 있는지, 네트워크가 정상인지 확인할 것.';
  if (m.indexOf('http:401')===0 || m.indexOf('http:403')===0) return 'API 키가 잘못됐거나 권한이 없다. 설정에서 키를 다시 확인할 것.';
  if (m.indexOf('http:400')===0) return '요청이 거부됐다. 크레딧 잔액을 확인할 것. ' + m.slice(5);
  if (m.indexOf('http:429')===0) return '요청이 몰렸다. 잠시 후 다시 시도할 것.';
  if (m.indexOf('http:5')===0)   return '서버 오류다. 잠시 후 다시 시도할 것. ' + m.slice(5);
  if (m.indexOf('http:')===0)    return '요청 실패. ' + m.slice(5);
  return '응답을 해석하지 못했다. 다시 시도할 것.';
}

/* 모델이 코드블록으로 감싸 보내는 경우가 있어 바깥 중괄호만 잘라 파싱한다 */
function parseJSON(data){
  var text = (data.content||[]).filter(function(b){return b.type==='text';}).map(function(b){return b.text;}).join('\n');
  var clean = text.replace(/```json|```/g,'').trim();
  return JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}')+1));
}

/* ================= 사진 분석 ================= */
async function analyze(){
  if (!S.photo) return;
  if (needsKey()){ S.error = apiMsg(new Error('nokey')); renderInput(); return; }
  S.error=''; S.busy=true; S.pending=null; renderInput();
  try{
    var b64 = S.photo.b64, mtype = S.photo.type;
    var memo = (S.memo||'').trim();
    var prompt = '이 사진 속 음식을 항목별로 식별하고 실제 섭취량 기준 열량과 탄단지를 추정하라. '
      + '한국 음식이면 한국 표준 1인분 기준으로 추정한다. '
      + (memo ? '사용자가 남긴 메모: "'+memo+'". 이 메모는 사진보다 우선한다. '
              + '남긴 양, 브랜드, 조리 방식, 소스 사용량이 적혀 있으면 그에 맞춰 수치를 조정하고 portion에 반영한다. '
              + '브랜드나 체인점이 지정됐다면 해당 브랜드의 실제 메뉴 영양 정보에 최대한 맞춘다. ' : '')
      + '오직 아래 JSON만 출력한다. 마크다운 백틱, 설명, 서두 없이 JSON 객체 하나만 출력한다.\n'
      + '{"items":[{"name":"음식명(한국어)","portion":"추정량 예: 1공기 210g","kcal":0,"carb":0,"protein":0,"fat":0}],"note":"추정 근거 한 문장"}\n'
      + 'kcal은 정수, carb/protein/fat은 그램 단위 정수. 음식이 아니면 items를 빈 배열로 두고 note에 이유를 적는다.';
    var data = await callAPI({
      model:API_MODEL, max_tokens:1000,
      messages:[{role:'user', content:[
        {type:'image', source:{type:'base64', media_type:mtype, data:b64}},
        {type:'text', text:prompt}
      ]}]
    });
    var parsed = parseJSON(data);
    var items = (parsed.items||[]).map(function(it,i){
      return {id:Date.now()+'-'+i, name:String(it.name||'미상'), portion:String(it.portion||''),
        kcal:Math.max(0,Math.round(Number(it.kcal)||0)), carb:Math.max(0,Math.round(Number(it.carb)||0)),
        protein:Math.max(0,Math.round(Number(it.protein)||0)), fat:Math.max(0,Math.round(Number(it.fat)||0))};
    });
    if(!items.length) S.error = parsed.note || '사진에서 음식을 찾지 못했다. 다른 사진을 올리거나 직접 입력할 것.';
    else S.pending = {items:items, note:parsed.note||'', memo:memo, preview:S.photo.preview};
  }catch(e){
    S.error = apiMsg(e);
  }
  S.busy=false; renderInput();
}

/* ================= 추천 ================= */
async function recommend(){
  if (needsKey()){ S.recError = apiMsg(new Error('nokey')); renderRec(); return; }
  S.recBusy = true; S.recError = ''; S.recs = null; renderRec();
  var r = remaining(), now = new Date();
  var prompt = '하루 섭취 목표에서 남은 여유분이 아래와 같다.\n'
    + '남은 열량 '+r.kcal+' kcal, 탄수화물 '+r.carb+' g, 단백질 '+r.protein+' g, 지방 '+r.fat+' g. 현재 시각 '+pad(now.getHours())+'시.\n'
    + '오늘 이미 먹은 것: ' + ((S.data[S.selected]||[]).map(function(e){return e.name;}).join(', ') || '없음') + '.\n'
    + '한국에서 편의점, 배달, 구내식당, 간단한 자취 조리로 실제 구할 수 있는 메뉴 3가지를 추천하라. '
    + '남은 양을 크게 초과하지 않으면서 부족한 영양소를 우선 채우는 조합을 고른다. 시각이 늦으면 가벼운 간식 쪽으로 조정한다.\n'
    + '오직 아래 JSON만 출력한다. 마크다운 백틱이나 설명 없이 JSON 객체 하나만 출력한다.\n'
    + '{"picks":[{"name":"메뉴명","desc":"구성과 양 한 줄","kcal":0,"carb":0,"protein":0,"fat":0,"fit":"남은 양에 맞는 이유 한 줄"}]}\n'
    + '수치는 모두 정수, 그램 단위.';
  try{
    var data = await callAPI({
      model:API_MODEL, max_tokens:1000,
      messages:[{role:'user', content:prompt}]
    });
    var parsed = parseJSON(data);
    S.recs = (parsed.picks||[]).map(function(p){
      return {
        name:String(p.name||'메뉴'), desc:String(p.desc||''), fit:String(p.fit||''),
        kcal:Math.max(0,Math.round(Number(p.kcal)||0)), carb:Math.max(0,Math.round(Number(p.carb)||0)),
        protein:Math.max(0,Math.round(Number(p.protein)||0)), fat:Math.max(0,Math.round(Number(p.fat)||0))
      };
    });
    if(!S.recs.length) S.recError = '추천을 만들지 못했다. 다시 시도할 것.';
  }catch(e){
    S.recError = apiMsg(e);
  }
  S.recBusy = false; renderRec();
}
