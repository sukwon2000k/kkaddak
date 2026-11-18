import test from 'node:test';
import assert from 'node:assert/strict';
import {Controller,DEFAULTS,poseOf,isScrollPose,validateSettings,type Hand,type Pose,type Point,type InputEvent,type ExtraBinding,normalizeHandSides,migrateHandednessSettings,scrollDirectionOf,migrateScrollSettings} from '../src/controller.ts';
import {FUNCTIONS,bindingConflict,readBindings} from '../src/catalog.ts';
/** 합성 관절은 상태·시간·충돌 로직 전용이며 실제 인식 정확도를 나타내지 않습니다. */
function hand(pose: Pose, side: 'Left'|'Right' = 'Right'): Hand {
  const p: Point[] = Array.from({ length: 21 }, () => ({ x:.5, y:.7 }));
  p[0]={x:.5,y:.9}; p[1]={x:.4,y:.83};p[2]={x:.3,y:.75};p[3]={x:.22,y:.68};p[4]={x:.17,y:.60};
  for(const [j,x,y] of [[5,.38,.63],[9,.50,.61],[13,.61,.64],[17,.72,.69]]) {
    p[j]={x,y};p[j+1]={x,y:y-.15};p[j+2]={x:x+.04,y:y-.03};p[j+3]={x:x+.01,y:y+.09};
    if(pose==='palm'||(pose==='point'&&j===5)||(pose==='victory'&&(j===5||j===9))) {p[j+2]={x,y:y-.27};p[j+3]={x,y:y-.40};}
  }
  if(pose==='hook')p[8]={x:.52,y:.5};
  if(pose==='pinch'){p[8]={x:.24,y:.53};p[4]={x:.23,y:.53};}
  return {side,score:.99,points:p};
}

/** 긴 유지 동작에서도 실제 영상처럼 연속 프레임을 공급합니다. */
function feed(c:Controller,hs:Hand[],from:number,to:number,step=100){for(let t=from;t<=to;t+=step)c.push(hs,t);}
function boot(side:Hand['side']='Right'){const events:InputEvent[]=[];const c=new Controller({...structuredClone(DEFAULTS),side},e=>events.push(e));c.start();feed(c,[hand('palm',side)],0,3000);assert.equal(c.state.active,true);return{c,events};}
/** 붙인 두 손가락의 방향을 회전한 합성 관절입니다. 실제 카메라 성능 측정 자료는 아닙니다. */
function scrollHand(direction:'up'|'down'|'horizontal'='up'):Hand{
 const h=hand('fist');h.points[0]={x:.5,y:.67};
 for(const [root,x] of [[5,.48],[9,.52]]){h.points[root]={x,y:.5};h.points[root+1]={x,y:.4};h.points[root+2]={x,y:.28};h.points[root+3]={x,y:.15};}
 const r=direction==='up'?0:direction==='down'?Math.PI:Math.PI/2,w=h.points[0];
 h.points=h.points.map(p=>{const x=p.x-w.x,y=p.y-w.y;return{x:w.x+x*Math.cos(r)-y*Math.sin(r),y:w.y+x*Math.sin(r)+y*Math.cos(r)};});return h;
}
test('기본 자세·붙인 두 손가락을 구분하고 집기를 크기 정규화한다',()=>{for(const p of ['palm','fist','point','hook','pinch','victory'] as Pose[])assert.equal(poseOf(hand(p).points),p);assert.equal(poseOf(scrollHand().points),'scroll');assert.equal(poseOf(hand('pinch').points.map(p=>({x:p.x*.5,y:p.y*.5}))),'pinch');});
test('선택한 손바닥 3초 전에는 시작하지 않는다',()=>{const c=new Controller(DEFAULTS,()=>{});c.start();feed(c,[hand('palm')],0,2900);assert.equal(c.state.active,false);c.push([hand('palm')],3000);assert.equal(c.state.active,true);});
test('비선택 손은 시작·커서 제어권을 얻지 못한다',()=>{const c=new Controller(DEFAULTS,()=>{});c.start();feed(c,[hand('palm','Left')],0,3500);assert.equal(c.state.active,false);const {c:d}=boot();const before={...d.state.pointer};d.push([hand('palm','Left')],3100);assert.deepEqual(d.state.pointer,before);assert.equal(d.state.tracking,false);});
test('검지만 보여서는 메뉴를 열 수 없고 앞선 주먹이 필요하다',()=>{const {c,events}=boot();feed(c,[hand('point')],3100,3800);assert.notEqual(c.state.phase,'menu');assert.equal(events.length,0);});
test('주먹→검지 유지로 메뉴를 열고 커서를 고정한다',()=>{const {c}=boot();c.push([hand('fist')],3100);c.push([hand('point')],3200);const before={...c.state.pointer};feed(c,[hand('point')],3300,3600);assert.equal(c.state.phase,'menu');assert.deepEqual(c.state.pointer,before);});
/** 검지 관절을 함께 회전해 실제 손끝 기울임에 가까운 합성 자세를 만듭니다. */
function tiltedIndex(degrees:number):Hand{const h=hand('point'),base=h.points[5],r=degrees*Math.PI/180;for(const i of [6,7,8]){const p=h.points[i],x=p.x-base.x,y=p.y-base.y;h.points[i]={x:base.x+x*Math.cos(r)-y*Math.sin(r),y:base.y+x*Math.sin(r)+y*Math.cos(r)};}return h;}
function openMenu(c:Controller){c.push([hand('fist')],3100);feed(c,[hand('point')],3200,3600);}
function movedPoint(dx=0,dy=0,side:Hand['side']='Right'):Hand{const h=hand('point',side);return{...h,points:h.points.map(p=>({...p,x:p.x+dx,y:p.y+dy}))};}
function armMenu(c:Controller){c.push([movedPoint(0,-.1)],3800);c.push([movedPoint(0,-.1)],3900);assert.equal(c.state.menuReady,true);}
test('새 선택 동작 뒤 방향 유지로 클릭을 한번 실행한다',()=>{const {c,events}=boot();openMenu(c);armMenu(c);feed(c,[movedPoint(0,-.1)],4000,4700);assert.deepEqual(events.map(e=>e.command),['click']);});
test('메뉴 진입 중 짧은 반 구부림은 게이지를 보류하고 이어간다',()=>{const {c}=boot();c.push([hand('fist')],3100);c.push([hand('point')],3200);c.push([hand('point')],3300);const before=c.state.progress;c.push([hand('hook')],3350);assert.equal(c.state.progress,before);c.push([hand('point')],3450);assert.equal(c.state.progress,before);feed(c,[hand('point')],3550,3750);assert.equal(c.state.phase,'menu');});
test('메뉴에서 손바닥으로 취소하고 이동으로 복귀한다',()=>{const {c,events}=boot();c.push([hand('fist')],3100);feed(c,[hand('point')],3200,3600);c.push([hand('palm')],3700);assert.match(c.state.mode,/메뉴 취소/);c.push([hand('palm')],3800);assert.equal(c.state.mode,'커서 이동');assert.equal(events.length,0);});
test('메뉴 중 다른 손의 등장으로 양손 모드가 끼어들지 않는다',()=>{const {c}=boot();c.push([hand('fist')],3100);feed(c,[hand('point')],3200,3600);c.push([hand('point'),hand('palm','Left')],3700);assert.equal(c.state.phase,'menu');});
test('드래그 중 양손 행동이 끼어들지 않고 벌리면 놓는다',()=>{const {c,events}=boot();c.push([hand('pinch')],3100);c.push([hand('pinch')],3300);c.push([hand('pinch'),hand('palm','Left')],3400);assert.deepEqual(events.map(e=>e.command),['dragStart']);c.push([hand('fist')],3500);assert.deepEqual(events.map(e=>e.command),['dragStart','dragEnd']);});
test('해제 준비 즉시 드래그를 놓고 양손 주먹 3초 후 전체 해제한다',()=>{const {c,events}=boot();c.push([hand('pinch')],3100);c.push([hand('pinch')],3300);const two=[hand('fist'),hand('fist','Left')];c.push(two,3400);assert.equal(events[1].command,'dragEnd');assert.equal(events[1].cancelled,true);feed(c,two,3500,6300);assert.equal(c.state.active,true);c.push(two,6400);assert.equal(c.state.active,false);feed(c,two,6500,7100);assert.equal(c.state.active,false);});
test('추적 상실 시 한번만 해제하고 집게 자동 재개를 막는다',()=>{const {c,events}=boot();c.push([hand('pinch')],3100);c.push([hand('pinch')],3300);c.push([],3400);c.push([],3500);feed(c,[hand('pinch')],3600,4200);assert.deepEqual(events.map(e=>e.command),['dragStart','dragEnd']);assert.match(c.state.mode,/재개/);});
test('결과가 끊긴 시간 초과에도 드래그가 남지 않는다',()=>{const {c,events}=boot();c.push([hand('pinch')],3100);c.push([hand('pinch')],3300);c.watchdog(4300);assert.equal(c.state.listening,false);assert.equal(events.at(-1)?.command,'dragEnd');});
test('중복 좌우 손 라벨은 실행을 보류한다',()=>{const {c,events}=boot();c.push([hand('pinch'),hand('pinch')],3100);assert.equal(c.state.tracking,false);assert.equal(events.length,0);});
test('역순 결과는 상태를 변경하지 않는다',()=>{const {c}=boot();const before=structuredClone(c.state);c.push([hand('fist')],2500);assert.deepEqual(c.state,before);});
test('붙인 두 손가락이 아래를 향하면 양의 스크롤을 연속 출력한다',()=>{const {c,events}=boot();feed(c,[scrollHand('down')],3100,4200,50);const es=events.filter(e=>e.command==='scroll');assert.ok(es.length>5);assert.ok(es.every(e=>e.value!>0));});
test('붙인 두 손가락이 위를 향하면 음의 스크롤을 연속 출력한다',()=>{const {c,events}=boot();feed(c,[scrollHand('up')],3100,4200,50);assert.ok(events.length>5);assert.ok(events.every(e=>e.command==='scroll'&&e.value!<0));});
test('손을 흔들지 않고 같은 자세를 유지해도 연속 스크롤한다',()=>{const {c,events}=boot(),h=scrollHand('down');feed(c,[h],3100,4300,50);assert.ok(events.filter(e=>e.command==='scroll').length>10);});
test('수평으로 향하면 두 손가락을 유지해도 스크롤이 멈춘다',()=>{const {c,events}=boot();feed(c,[scrollHand('down')],3100,3900,50);const before=events.length;feed(c,[scrollHand('horizontal')],4000,4800,50);assert.equal(events.length,before);assert.equal(scrollDirectionOf(scrollHand('horizontal').points),0);});
test('손가락이 벌어진 V는 방향 스크롤로 판정하지 않는다',()=>{assert.equal(isScrollPose(hand('victory').points),false);assert.equal(scrollDirectionOf(hand('victory').points),0);});
test('방향이 잠깐 바뀌어도 250ms 확인 전 반대 입력을 보내지 않는다',()=>{const {c,events}=boot();feed(c,[scrollHand('up')],3100,4000,50);const before=events.length;feed(c,[scrollHand('down')],4100,4300,50);assert.equal(events.length,before);feed(c,[scrollHand('down')],4350,4500,50);assert.ok(events.at(-1)!.value!>0);});
test('속도는 설정값에 비례하고 프레임률에 좌우되지 않는다',()=>{const totals:number[]=[];for(const [speed,step] of [[400,50],[400,100],[800,50]]){const {c,events}=boot();c.settings.scrollSpeed=speed;feed(c,[scrollHand('down')],3100,4400,step);events.length=0;feed(c,[scrollHand('down')],4500,5400,step);totals.push(events.reduce((n,e)=>n+(e.value??0),0));}assert.deepEqual(totals,[400,400,800]);});
test('주먹·손바닥·추적 상실·강제 해제는 연속 스크롤을 중단한다',()=>{for(const mode of ['fist','palm','lost','stop']){const {c,events}=boot();feed(c,[scrollHand('down')],3100,4000,50);const before=events.length;if(mode==='stop')c.stop(4050);feed(c,mode==='lost'?[]:[hand(mode==='palm'?'palm':'fist')],4100,4600,50);assert.equal(events.length,before);}});
test('예전 스크롤 설정을 중간 속도로 옮기고 다른 설정은 보존한다',()=>{const {scrollSpeed,...rest}=structuredClone(DEFAULTS);const old={...rest,smoothing:.6,flipLabels:true,scrollStep:.1,scrollDirection:'up'};const next=migrateScrollSettings(old)!;assert.equal(next.scrollSpeed,400);assert.equal(next.smoothing,.6);assert.equal(next.flipLabels,true);assert.equal('scrollStep' in next,false);assert.equal('scrollDirection' in next,false);assert.ok(validateSettings({...next,scrollSpeed:0}));assert.ok(validateSettings({...next,scrollSpeed:Infinity}));});
test('Win+D 상하 후보는 기본 꺼짐이며 켜도 동일 토글 명령을 쓴다',()=>{for(const enabled of [false,true]){const {c,events}=boot();c.settings.desktopCandidate=enabled;const pair=(dy:number)=>[hand('palm'),hand('palm','Left')].map((h,i)=>({...h,points:h.points.map(p=>({...p,x:p.x+(i?.05:-.05),y:p.y+dy}))}));c.push(pair(0),3100);c.push(pair(.2),3500);assert.equal(events.filter(e=>e.command==='desktop').length,enabled?1:0);}});
test('기본 경로 변경·손상된 설정은 거절한다',()=>{assert.equal(validateSettings(DEFAULTS),null);assert.ok(validateSettings({...DEFAULTS,menuHold:NaN}));assert.ok(validateSettings({...DEFAULTS,bindings:{...DEFAULTS.bindings,move:'fist'}}));});
test('동일 손·상태·웹 영역 조건 충돌에는 기존 기능을 표시한다',()=>{const a:ExtraBinding={functionId:'copy',gesture:'victory',side:'Right',scope:'sandbox',mode:'active'};assert.match(bindingConflict({...a,functionId:'paste'},[a])!,/복사.*충돌|충돌.*오른손/);assert.equal(bindingConflict({...a,functionId:'paste',side:'Left'},[a]),null);});
test('보류 종료 기능은 연결 저장 불가, 카탈로그는 단축키와 조건을 보유한다',()=>{assert.ok(bindingConflict({functionId:'close-all',gesture:'victory',side:'Right',scope:'sandbox',mode:'active'},[]));assert.ok(FUNCTIONS.length>60);assert.ok(FUNCTIONS.every(f=>f.shortcut&&f.target&&f.condition));assert.deepEqual(readBindings([{functionId:'close-all',gesture:'victory',side:'Right',scope:'sandbox',mode:'active'}]),[]);});
test('사용자 연결은 웹 shortcut 이벤트만 한번 내보낸다',()=>{const {c,events}=boot();c.extras=[{functionId:'copy',gesture:'victory',side:'Right',scope:'sandbox',mode:'active'}];feed(c,[hand('victory')],3100,4200);assert.deepEqual(events.map(e=>[e.command,e.functionId]),[['shortcut','copy']]);});
test('긴 추론 공백을 손바닥 3초 유지로 계산하지 않는다',()=>{const c=new Controller(DEFAULTS,()=>{});c.start();c.push([hand('palm')],0);c.push([hand('palm')],3100);assert.equal(c.state.active,false);assert.equal(c.state.progress,0);});
test('양손 해제 후 중립·새 손바닥 3초로만 다시 시작한다',()=>{const {c}=boot();const two=[hand('fist'),hand('fist','Left')];feed(c,two,3100,6100);assert.equal(c.state.active,false);feed(c,two,6200,6800);assert.equal(c.state.active,false);c.push([hand('fist')],6900);feed(c,[hand('palm')],7000,9900);assert.equal(c.state.active,false);c.push([hand('palm')],10000);assert.equal(c.state.active,true);});
test('손 이동 방향이 바뀌면 선택 게이지를 처음부터 채운다',()=>{const {c,events}=boot();openMenu(c);c.push([movedPoint(0,-.1)],3900);c.push([movedPoint(.1,0)],4100);assert.equal(events.length,0);assert.equal(c.state.progress,0);c.push([movedPoint(.1,0)],4400);assert.equal(events.at(-1)?.command,'right');});
test('손을 왼쪽으로 이동하면 우클릭을 한번 실행한다',()=>{const {c,events}=boot();openMenu(c);feed(c,[movedPoint(.1,0)],3900,4700);assert.deepEqual(events.map(e=>e.command),['right']);});
test('메뉴는 선택하지 않으면 열린 후 10초가 지나 취소한다',()=>{const {c,events}=boot();openMenu(c);feed(c,[hand('hook')],3700,13600);assert.equal(events.length,0);assert.equal(c.state.phase,'menu');c.push([hand('hook')],13700);assert.match(c.state.mode,/시간 초과/);});
test('메뉴를 연 검지 자세만 계속 유지하면 클릭·선택이 발생하지 않는다',()=>{const {c,events}=boot();openMenu(c);feed(c,[hand('point')],3700,7000);assert.equal(c.state.menuReady,false);assert.equal(c.state.selection,null);assert.equal(c.state.progress,0);assert.equal(events.length,0);});
test('검지 각도만 크게 꺾어도 손 위치가 같으면 선택하지 않는다',()=>{const {c,events}=boot();openMenu(c);feed(c,[tiltedIndex(70)],3700,5000);assert.equal(c.state.menuReady,false);assert.equal(events.length,0);});
test('손을 잠깐 움직였다 중앙으로 복귀하면 클릭하지 않는다',()=>{const {c,events}=boot();openMenu(c);c.push([movedPoint(0,-.1)],3900);c.push([hand('point')],3950);feed(c,[hand('point')],4000,4500);assert.equal(c.state.menuReady,false);assert.equal(c.state.progress,0);assert.equal(events.length,0);});
test('엄지·검지가 겹친 주먹을 집게로 판정하지 않는다',()=>{for(const epsilon of [0,.01,.025]){const h=hand('fist');h.points[4]={x:h.points[8].x+epsilon,y:h.points[8].y};assert.equal(poseOf(h.points),'fist');assert.equal(poseOf(h.points,true),'fist');}});
test('겹친 주먹을 오래 유지해도 드래그가 시작되지 않는다',()=>{const {c,events}=boot(),h=hand('fist');h.points[4]={...h.points[8]};feed(c,[h],3100,4500);assert.equal(c.state.mode,'커서 정지');assert.equal(events.filter(e=>e.command==='dragStart').length,0);});
test('집기 합성 관절은 회전·크기 변화 후에도 판정한다',()=>{const h=hand('pinch');for(const scale of [.5,1,1.5]){const r=.3;const p=h.points.map(p=>({x:(p.x*Math.cos(r)-p.y*Math.sin(r))*scale,y:(p.x*Math.sin(r)+p.y*Math.cos(r))*scale}));assert.equal(poseOf(p),'pinch');}});
test('화면 미러링과 독립적으로 기본 오른손·왼손 라벨을 유지한다',()=>{const hs=[hand('palm'),hand('palm','Left')];assert.equal(DEFAULTS.flipLabels,false);assert.deepEqual(normalizeHandSides(hs).map(h=>h.side),['Right','Left']);assert.deepEqual(normalizeHandSides(hs,true).map(h=>h.side),['Left','Right']);assert.deepEqual(normalizeHandSides(hs)[0].points,hs[0].points);});
test('구버전 좌우 반전만 교정하고 선택 손·감도·시간은 보존한다',()=>{const old={...structuredClone(DEFAULTS),flipLabels:true,side:'Left' as const,sensitivity:1.8,menuHold:700};const next=migrateHandednessSettings(old);assert.equal(next.flipLabels,false);assert.equal(next.side,'Left');assert.equal(next.sensitivity,1.8);assert.equal(next.menuHold,700);assert.equal(old.flipLabels,true);});

test('주먹→반 구부림→검지로 자연스럽게 펴도 메뉴에 진입한다',()=>{const {c,events}=boot();c.push([hand('fist')],3100);feed(c,[hand('hook')],3200,4000);feed(c,[hand('point')],4100,4500);assert.equal(c.state.phase,'menu');assert.equal(events.length,0);});
test('준비 주먹 없이 반 구부림→검지만으로는 메뉴를 열지 않는다',()=>{const {c}=boot();feed(c,[hand('hook')],3100,3500);feed(c,[hand('point')],3600,4200);assert.notEqual(c.state.phase,'menu');});
test('주먹 전환 대기를 영구 유지하지 않고 시간 초과 시 취소한다',()=>{const {c}=boot();c.push([hand('fist')],3100);feed(c,[hand('hook')],3200,4900);feed(c,[hand('point')],5000,5700);assert.notEqual(c.state.phase,'menu');});
test('반 구부림 후보가 배정돼 있어도 주먹에서 펴는 중에는 추가 기능을 실행하지 않는다',()=>{const {c,events}=boot();c.extras=[{functionId:'copy',gesture:'hook',side:'Right',scope:'sandbox',mode:'active'}];c.push([hand('fist')],3100);feed(c,[hand('hook')],3200,4000);feed(c,[hand('point')],4100,4500);assert.equal(c.state.phase,'menu');assert.equal(events.length,0);});
test('유효 검지 시간만 누적하고 오래 구부린 상태는 진입 취소한다',()=>{const {c,events}=boot();c.push([hand('fist')],3100);c.push([hand('point')],3200);feed(c,[hand('hook')],3300,3700);feed(c,[hand('point')],3800,4500);assert.notEqual(c.state.phase,'menu');assert.equal(events.length,0);});
test('양손 모드 각각에서 검지를 꺾지 않고 손 이동으로 클릭·더블·우클릭·취소한다',()=>{for(const side of ['Right','Left'] as const){for(const [dx,dy,command] of [[0,-.1,'click'],[-.1,0,'double'],[.1,0,'right'],[0,.1,'cancel']] as const){const {c,events}=boot(side);c.push([hand('fist',side)],3100);feed(c,[hand('point',side)],3200,3600);const target={...c.state.pointer};feed(c,[movedPoint(dx,dy,side)],3900,4700);assert.deepEqual(events.map(e=>e.command),command==='cancel'?[]:[command]);assert.deepEqual(c.state.pointer,target);for(const e of events)assert.deepEqual({x:e.x,y:e.y},target);}}});
test('메뉴에서 손의 작은 떨림은 항목을 선택하지 않는다',()=>{const {c,events}=boot();openMenu(c);feed(c,[movedPoint(.015,-.015)],3900,4700);assert.equal(c.state.selection,null);assert.equal(events.length,0);});
test('모호한 대각선 이동은 항목을 강제로 고르지 않는다',()=>{const {c,events}=boot();openMenu(c);feed(c,[movedPoint(.1,.1)],3900,4700);assert.equal(c.state.selection,null);assert.equal(events.length,0);});
