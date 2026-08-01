/* 화면 렌더링. 각 카드는 상태를 읽어 innerHTML을 통째로 다시 그린다. */

/* ================= 기기 프레임 ================= */
/* 홈 화면에 설치해 실행하면 미리보기 프레임을 벗고 전체 화면을 쓴다 */
var installed = window.matchMedia('(display-mode: standalone)').matches
  || window.matchMedia('(display-mode: fullscreen)').matches
  || window.navigator.standalone === true;

function sizeDevice(){
  if (installed){ document.body.classList.add('installed'); return; }
  var d = DEVICES[S.view];
  var avail = document.getElementById('shell').clientWidth - 24;
  var w = Math.min(d.w, avail);
  var h = Math.min(d.h * (w/d.w), Math.max(420, window.innerHeight - 92));
  var dev = document.getElementById('device');
  dev.style.width = w+'px'; dev.style.height = h+'px';
  document.getElementById('dims').textContent = d.label;
}

/* ================= 선택일 패널 ================= */
function renderDay(){
  var T = targets(), t = sum(S.data[S.selected]);
  var d = new Date(S.selected+'T00:00:00');
  var pct = Math.min(100, t.kcal/T.kcal*100);
  var kc = {carb:t.carb*4, protein:t.protein*4, fat:t.fat*9};
  var tot = kc.carb+kc.protein+kc.fat || 1;

  var macro = ['carb','protein','fat'].map(function(k,i){
    var label = ['탄수화물','단백질','지방'][i], v = t[k], tg = T[k];
    return '<div style="margin-bottom:9px">'
      + '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px">'
      + '<span style="color:var(--mid)"><span style="display:inline-block;width:8px;height:8px;background:'+CH[k]+';margin-right:6px"></span>'+label+'</span>'
      + '<span><strong>'+v+'</strong><span style="color:var(--mid)"> / '+tg+' g</span></span></div>'
      + '<div style="height:4px;background:#E2E8ED"><div style="height:100%;width:'+Math.min(100,v/tg*100)+'%;background:'+CH[k]+'"></div></div></div>';
  }).join('');

  var entries = S.data[S.selected] || [];
  var rows = entries.map(function(e){
    return '<div class="row">'
      + '<span style="color:var(--mid);width:34px;flex-shrink:0">'+esc(e.t)+'</span>'
      + '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(e.name)
      + (e.portion?'<span style="color:var(--mid)"> · '+esc(e.portion)+'</span>':'')+'</span>'
      + '<span style="color:var(--c1)">'+e.carb+'</span><span style="color:var(--c2)">'+e.protein+'</span><span style="color:var(--c3)">'+e.fat+'</span>'
      + '<strong style="width:42px;text-align:right">'+e.kcal+'</strong>'
      + '<button class="x" data-del="'+esc(e.id)+'" aria-label="항목 삭제">×</button></div>';
  }).join('');

  /* 항목이 쌓이면 카드가 한없이 길어지므로 접어 두고, 접힌 상태에서는
     건수와 음식명만 한 줄로 보여 준다. */
  var list;
  if (!entries.length){
    list = '<div style="font-size:12px;color:var(--mid);padding:10px 0">기록이 없다. 아래에서 사진을 올리면 항목이 채워진다.</div>';
  } else {
    list = '<button class="listtoggle" id="listToggle" aria-expanded="'+(S.listOpen?'true':'false')+'">'
      + '<span class="chev'+(S.listOpen?' open':'')+'" aria-hidden="true">▶</span>'
      + '<span>먹은 음식 <strong>'+entries.length+'</strong>건</span>'
      + '<span class="cnt">'+(S.listOpen?'접기':'펼치기')+'</span></button>'
      + (S.listOpen
          ? rows
          : '<div class="listnames">'+entries.map(function(e){ return esc(e.name); }).join(', ')+'</div>');
  }

  document.getElementById('day').innerHTML =
    '<div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:13px">'
    + '<div><div class="eyebrow">'+(S.selected===iso(new Date())?'오늘':'선택한 날')+' · '+GOALS[S.profile.goal].label+'</div>'
    + '<div class="disp" style="font-size:17px;font-weight:600">'+(d.getMonth()+1)+'월 '+d.getDate()+'일 ('+DOW[d.getDay()]+')</div></div>'
    + '<div style="text-align:right"><span class="disp" style="font-size:36px;font-weight:700;letter-spacing:-.03em;line-height:1">'+t.kcal+'</span>'
    + '<span style="font-size:12px;color:var(--mid);margin-left:4px">kcal</span></div></div>'
    + '<div style="position:relative;height:28px;border:1px solid var(--rule);background:var(--soft)">'
    + '<div style="position:absolute;inset:0;display:flex">'
    + '<div style="flex:1;border-right:1px dashed var(--grid)"></div><div style="flex:1;border-right:1px dashed var(--grid)"></div>'
    + '<div style="flex:1;border-right:1px dashed var(--grid)"></div><div style="flex:1"></div></div>'
    + '<div style="position:absolute;left:0;top:0;bottom:0;display:flex;width:'+pct+'%">'
    + '<div style="width:'+(kc.carb/tot*100)+'%;background:var(--c1)"></div>'
    + '<div style="width:'+(kc.protein/tot*100)+'%;background:var(--c2)"></div>'
    + '<div style="width:'+(kc.fat/tot*100)+'%;background:var(--c3)"></div></div>'
    + (t.kcal>T.kcal?'<div style="position:absolute;right:-1px;top:-4px;bottom:-4px;width:3px;background:var(--c3)"></div>':'')
    + '</div>'
    + '<div style="display:flex;justify-content:space-between;margin-top:4px;font-size:10px;color:var(--mid)">'
    + '<span>0</span><span>'+Math.round(T.kcal/2)+'</span><span>'+T.kcal+' kcal 목표</span></div>'
    + '<div style="margin-top:16px">'+macro+'</div>'
    + '<div style="margin-top:12px;border-top:1px solid var(--grid);padding-top:4px">'+list+'</div>';
}

/* ================= 추천 ================= */
function renderRec(){
  var r = remaining();
  var chip = function(v,unit,color){
    var neg = v < 0;
    return '<div style="flex:1;text-align:center;padding:7px 2px;border:1px solid '+(neg?'var(--c3)':'var(--grid)')+'">'
      + '<div class="disp" style="font-size:17px;font-weight:700;color:'+(neg?'var(--c3)':color)+'">'+(neg?'+'+Math.abs(v):v)+'</div>'
      + '<div style="font-size:9px;color:var(--mid);margin-top:1px">'+unit+'</div></div>';
  };

  var body;
  if (S.recs && S.recs.length){
    body = S.recs.map(function(p,i){
      return '<div class="pick">'
        + '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">'
        + '<strong style="font-size:13px">'+esc(p.name)+'</strong>'
        + '<span class="disp" style="font-size:15px;font-weight:700">'+p.kcal+'<span style="font-size:9px;color:var(--mid)"> kcal</span></span></div>'
        + (p.desc?'<div style="font-size:10px;color:var(--mid);margin-top:3px;line-height:1.5">'+esc(p.desc)+'</div>':'')
        + '<div style="display:flex;gap:10px;font-size:11px;margin-top:6px">'
        + '<span style="color:var(--c1)">탄 '+p.carb+'</span><span style="color:var(--c2)">단 '+p.protein+'</span><span style="color:var(--c3)">지 '+p.fat+'</span>'
        + '<button class="btn" data-rec="'+i+'" style="margin-left:auto;padding:5px 10px;min-height:30px;font-size:11px">기록에 추가</button></div>'
        + (p.fit?'<div style="font-size:10px;color:var(--mid);margin-top:5px">↳ '+esc(p.fit)+'</div>':'')
        + '</div>';
    }).join('')
    + '<button class="btn" id="recAgain" style="width:100%;margin-top:10px">다시 추천받기</button>';
  } else {
    var done = r.kcal <= 0;
    body = '<button class="btn solid'+(S.recBusy?' scan':'')+'" id="recBtn" style="width:100%;margin-top:11px"'+(S.recBusy||done?' disabled':'')+'>'
      + (S.recBusy?'메뉴 고르는 중':'남은 양에 맞는 메뉴 추천') + '</button>'
      + (done?'<div style="font-size:11px;color:var(--mid);margin-top:8px">오늘 목표 열량을 이미 채웠다.</div>':'');
  }

  document.getElementById('rec').innerHTML =
    '<div class="eyebrow" style="margin-bottom:9px">남은 양 · 다음 끼니</div>'
    + '<div style="display:flex;gap:6px">'
    + chip(r.kcal,'kcal','var(--ink)') + chip(r.carb,'탄수 g','var(--c1)')
    + chip(r.protein,'단백 g','var(--c2)') + chip(r.fat,'지방 g','var(--c3)') + '</div>'
    + body
    + (S.recError?'<div style="font-size:11px;color:var(--c3);margin-top:9px;line-height:1.5">'+esc(S.recError)+'</div>':'');
}

/* ================= 입력 ================= */
function renderInput(){
  var future = new Date(S.selected+'T00:00:00') > new Date(today.getFullYear(),today.getMonth(),today.getDate());
  var html = '<div class="eyebrow" style="margin-bottom:10px">기록 추가</div>';

  if (S.pending){
    html += '<div class="lab" style="margin-bottom:6px">3단계 · 값 확인 후 저장</div>';
    html += (S.pending.preview?'<img src="'+S.pending.preview+'" alt="업로드한 음식 사진" style="width:100%;height:120px;object-fit:cover;border:1px solid var(--rule);margin-bottom:10px">':'');
    if (S.pending.memo) html += '<div style="font-size:11px;color:var(--mid);background:var(--soft);border-left:2px solid var(--rule);padding:7px 9px;margin-bottom:10px;line-height:1.5">메모 반영: '+esc(S.pending.memo)+'</div>';
    html += S.pending.items.map(function(it,i){
      var f=['kcal','carb','protein','fat'], l=['kcal','탄','단','지'];
      return '<div style="border-top:1px solid var(--grid);padding-top:8px;margin-bottom:10px">'
        + '<input class="in" data-pi="'+i+'" data-pk="name" value="'+esc(it.name)+'" style="font-weight:600">'
        + (it.portion?'<div style="font-size:10px;color:var(--mid);margin:4px 0 6px">'+esc(it.portion)+'</div>':'<div style="height:6px"></div>')
        + '<div class="g4">'+f.map(function(k,j){
            return '<label><div class="lab">'+l[j]+'</div><input class="in" type="number" inputmode="numeric" data-pi="'+i+'" data-pk="'+k+'" value="'+it[k]+'"></label>';
          }).join('')+'</div></div>';
    }).join('');
    if (S.pending.note) html += '<div style="font-size:10px;color:var(--mid);margin:6px 0 10px;line-height:1.5">'+esc(S.pending.note)+'</div>';
    html += '<div style="display:flex;gap:8px"><button class="btn solid" id="commit" style="flex:1">기록 저장</button><button class="btn" id="cancelP">메모 수정</button></div>';
  } else if (S.photo){
    html += '<div class="lab" style="margin-bottom:6px">2단계 · 메모를 쓴 뒤 분석</div>'
      + '<img src="'+S.photo.preview+'" alt="선택한 음식 사진" style="width:100%;height:130px;object-fit:cover;border:1px solid var(--rule);margin-bottom:10px">'
      + '<div class="lab" style="margin-bottom:5px">사진에 안 보이는 정보 (선택) · 사진보다 우선해서 반영된다</div>'
      + '<textarea class="ta" id="memo" rows="2" placeholder="예: 밥은 반공기 남겼음 / 한솥 김치찌개 메뉴 / 소스 따로 빼고 절반만 사용">'+esc(S.memo)+'</textarea>'
      + '<div style="display:flex;gap:8px;margin-top:10px">'
      + '<button class="btn solid'+(S.busy?' scan':'')+'" id="analyzeBtn" style="flex:1"'+(S.busy?' disabled':'')+'>'+(S.busy?'분석 중':'분석하기')+'</button>'
      + '<label class="btn'+(S.busy?' off':'')+'" for="file" style="padding:11px 14px;min-height:44px">사진 변경</label></div>'
      + '<input type="file" id="file" accept="image/*" class="filein">';
  } else {
    html += '<div class="lab" style="margin-bottom:6px">1단계 · 사진 선택</div>'
      + '<label class="btn solid'+(future?' off':'')+'" for="file" style="width:100%;padding:20px 10px;font-size:13px">음식 사진 올리기</label>'
      + '<input type="file" id="file" accept="image/*" class="filein">'
      + '<div style="font-size:10px;color:var(--mid);margin-top:8px;line-height:1.5">사진을 고르면 메모를 쓸 수 있고, 분석 결과를 확인한 뒤 저장한다.</div>'
      + (needsKey()?'<div style="font-size:11px;color:var(--c3);margin-top:8px;line-height:1.5">설정에서 API 키를 넣어야 사진 분석이 동작한다. 키 없이도 직접 입력은 가능하다.</div>':'')
      + (future?'<div style="font-size:11px;color:var(--c3);margin-top:8px">미래 날짜에는 기록할 수 없다.</div>':'')
      + '<button class="btn" id="manBtn" style="width:100%;margin-top:10px"'+(future?' disabled':'')+'>직접 입력</button>';
    if (S.manual){
      var f2=['kcal','carb','protein','fat'], l2=['kcal','탄','단','지'];
      html += '<div style="border-top:1px solid var(--grid);margin-top:12px;padding-top:10px">'
        + '<input class="in" id="mName" placeholder="음식명" style="margin-bottom:8px">'
        + '<div class="g4">'+f2.map(function(k,j){
            return '<label><div class="lab">'+l2[j]+'</div><input class="in" type="number" inputmode="numeric" id="m_'+k+'"></label>';
          }).join('')+'</div>'
        + '<div style="display:flex;gap:8px;margin-top:10px"><button class="btn solid" id="mAdd" style="flex:1">추가</button><button class="btn" id="mCancel">취소</button></div></div>';
    }
  }
  if (S.error) html += '<div style="font-size:11px;color:var(--c3);margin-top:10px;line-height:1.5">'+esc(S.error)+'</div>';
  document.getElementById('input').innerHTML = html;
}

/* ================= 캘린더 ================= */
function renderCal(){
  var T = targets();
  var y = S.cursor.getFullYear(), m = S.cursor.getMonth();
  var first = new Date(y,m,1).getDay(), days = new Date(y,m+1,0).getDate();
  var logged = Object.keys(S.data).filter(function(k){ return (S.data[k]||[]).length; });
  var avg = logged.length ? Math.round(logged.reduce(function(a,k){return a+sum(S.data[k]).kcal;},0)/logged.length) : 0;
  var todayStr = iso(new Date());

  var cells = '';
  DOW.forEach(function(d,i){ cells += '<div class="dow"'+(i===0?' style="color:var(--c3)"':'')+'>'+d+'</div>'; });
  for(var i=0;i<first;i++) cells += '<div class="cell pad"></div>';
  for(var dd=1; dd<=days; dd++){
    var date = y+'-'+pad(m+1)+'-'+pad(dd);
    var t = sum(S.data[date]), has = t.kcal>0;
    var pct = Math.min(100, t.kcal/T.kcal*100);
    var k1=t.carb*4, k2=t.protein*4, k3=t.fat*9, tot=k1+k2+k3||1;
    cells += '<div class="cell'+(date===S.selected?' sel':'')+(date===todayStr?' today':'')+'" data-date="'+date+'">'
      + '<div style="display:flex;justify-content:space-between;align-items:baseline">'
      + '<span style="font-size:10px;color:var(--mid)">'+dd+'</span>'
      + (has?'<span style="font-size:11px;font-weight:600">'+t.kcal+'</span>':'')+'</div>'
      + '<div class="bar" style="'+(has?'':'background:transparent')+'">'
      + (has?'<div style="display:flex;width:'+pct+'%">'
          + '<div style="width:'+(k1/tot*100)+'%;background:var(--c1)"></div>'
          + '<div style="width:'+(k2/tot*100)+'%;background:var(--c2)"></div>'
          + '<div style="width:'+(k3/tot*100)+'%;background:var(--c3)"></div></div>':'')
      + (has && t.kcal>T.kcal?'<div style="position:absolute;right:0;top:-2px;bottom:-2px;width:2px;background:var(--c3)"></div>':'')
      + '</div></div>';
  }

  document.getElementById('cal').innerHTML =
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:11px">'
    + '<div><div class="eyebrow">월간 추이 · 막대 = 목표 대비</div>'
    + '<div class="disp" style="font-size:17px;font-weight:600">'+y+'년 '+(m+1)+'월</div></div>'
    + '<div style="display:flex;align-items:center;gap:9px">'
    + '<div style="font-size:10px;color:var(--mid);text-align:right;line-height:1.4">기록 '+logged.length+'일<br>평균 <strong style="color:var(--ink)">'+avg+'</strong></div>'
    + '<button class="btn" id="prev" style="padding:8px 10px;min-height:38px" aria-label="이전 달">←</button>'
    + '<button class="btn" id="next" style="padding:8px 10px;min-height:38px" aria-label="다음 달">→</button></div></div>'
    + '<div class="cal">'+cells+'</div>'
    + '<div style="display:flex;gap:13px;margin-top:9px;font-size:10px;color:var(--mid)">'
    + '<span><span style="display:inline-block;width:8px;height:8px;background:var(--c1);margin-right:5px"></span>탄수화물</span>'
    + '<span><span style="display:inline-block;width:8px;height:8px;background:var(--c2);margin-right:5px"></span>단백질</span>'
    + '<span><span style="display:inline-block;width:8px;height:8px;background:var(--c3);margin-right:5px"></span>지방</span></div>';
}

/* ================= 설정 ================= */
function renderCfg(){
  var el = document.getElementById('cfg');
  el.className = 'card' + (S.cfgOpen?'':' hide');
  var T = targets(), ref = refWeight(S.profile.h);
  el.innerHTML =
    '<div class="eyebrow" style="margin-bottom:9px">신체 정보</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
    + '<label><div class="lab">키 cm</div><input class="in" type="number" inputmode="numeric" data-pf="h" value="'+S.profile.h+'"></label>'
    + '<label><div class="lab">체중 kg</div><input class="in" type="number" inputmode="numeric" data-pf="w" value="'+S.profile.w+'"></label></div>'
    + '<div style="font-size:10px;color:var(--mid);margin-top:6px">키 '+S.profile.h+'cm의 BMI 22 기준 체중은 '+ref+'kg다. 실제 체중을 넣으면 목표가 그에 맞춰 다시 계산된다.</div>'

    + '<div class="eyebrow" style="margin:15px 0 8px">목적</div>'
    + '<div class="goals">' + Object.keys(GOALS).map(function(k){
        var g = GOALS[k];
        return '<button class="goal'+(S.profile.goal===k?' on':'')+'" data-goal="'+k+'">'
          + '<span class="gt">'+g.label+'</span><span class="gs">'+g.sub+'</span></button>';
      }).join('') + '</div>'

    + '<div style="border-top:1px solid var(--grid);margin-top:14px;padding-top:11px">'
    + '<div class="eyebrow" style="margin-bottom:7px">산출된 하루 목표</div>'
    + '<div style="display:flex;gap:6px">'
    + ['kcal','carb','protein','fat'].map(function(k,i){
        var l = ['kcal','탄수 g','단백 g','지방 g'][i];
        var c = ['var(--ink)','var(--c1)','var(--c2)','var(--c3)'][i];
        return '<div style="flex:1;text-align:center;padding:7px 2px;border:1px solid var(--grid)">'
          + '<div class="disp" style="font-size:17px;font-weight:700;color:'+c+'">'+T[k]+'</div>'
          + '<div style="font-size:9px;color:var(--mid);margin-top:1px">'+l+'</div></div>';
      }).join('') + '</div>'
    + '<div style="font-size:10px;color:var(--mid);margin-top:7px;line-height:1.5">'
    + '체중 1kg당 '+GOALS[S.profile.goal].kcal+' kcal, 단백질 '+GOALS[S.profile.goal].p+' g, 지방 '+GOALS[S.profile.goal].f+' g로 잡고 나머지를 탄수화물에 배분한 값이다. 일반적인 참고 기준이며 개인 상태에 따라 달라진다.</div></div>'

    + '<div style="border-top:1px solid var(--grid);margin-top:14px;padding-top:11px">'
    + '<div class="eyebrow" style="margin-bottom:6px">Anthropic API 키</div>'
    + '<input class="in" id="apiKey" type="password" placeholder="sk-ant-..." value="'+esc(S.apiKey)+'" autocomplete="off">'
    + '<div style="font-size:10px;color:var(--mid);margin-top:6px;line-height:1.5">Claude 앱 안에서 볼 때는 비워두면 된다. 홈 화면 앱으로 설치해 쓸 때만 사진 분석과 추천에 키가 필요하다. 키는 이 기기에만 저장된다.</div></div>';
}
