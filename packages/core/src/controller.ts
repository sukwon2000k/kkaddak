/** 화면과 독립적인 판정 코어. 모든 명령은 웹 어댑터로만 전달하며 OS 입력을 만들지 않습니다. */
export type Point = { x:number; y:number; z?:number };
export type Hand = { side:'Left'|'Right'; score:number; points:Point[] };
export type Pose = 'palm'|'fist'|'point'|'hook'|'pinch'|'victory'|'scroll'|'other';
export type Binding = 'move'|'stop'|'prepare'|'drag';
export type Command = 'click'|'double'|'right'|'dragStart'|'dragEnd'|'zoomIn'|'zoomOut'|'desktop'|'scroll'|'shortcut';
export type InputEvent = { command:Command; x:number; y:number; at:number; cancelled?:boolean; value?:number; functionId?:string };
export type ExtraBinding = { functionId:string; gesture:'hook'|'victory'; side:Hand['side']; scope:'sandbox'; mode:'active' };
export type Settings = { side:Hand['side']; flipLabels:boolean; smoothing:number; sensitivity:number; menuHold:number; selectHold:number; motion:boolean; desktopCandidate:boolean; scrollSpeed:number; bindings:Record<Binding,Pose> };
export const DEFAULTS:Settings = {side:'Right',flipLabels:false,smoothing:.38,sensitivity:1.35,menuHold:350,selectHold:300,motion:true,desktopCandidate:false,scrollSpeed:400,bindings:{move:'palm',stop:'fist',prepare:'point',drag:'pinch'}};
export const POSE_NAMES:Record<Pose,string> = {palm:'손바닥 펴기',fist:'주먹 쥐기',point:'검지만 펴기',hook:'검지 반쯤 구부리기',pinch:'엄지·검지 집게',victory:'검지·중지 V',scroll:'두 손가락 가로 스크롤',other:'구분 중'};
export const BINDING_NAMES:Record<Binding,string> = {move:'커서 이동',stop:'커서 정지',prepare:'메뉴 진입',drag:'드래그'};
export type State = {mode:string;pointer:Point;pose:Pose;progress:number;selection:'click'|'double'|'right'|'cancel'|null;active:boolean;paused:boolean;hands:number;listening:boolean;tracking:boolean;phase:string;menuReady:boolean;menuOffset:Point};
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (x: number, min = 0, max = 1) => Math.min(max, Math.max(min, x));
/** 세 관절 사이 각도를 계산합니다. 회전에 강하도록 화면의 단순 y 비교를 사용하지 않습니다. */
function angle(a: Point, b: Point, c: Point) {
  const u = { x: a.x - b.x, y: a.y - b.y }, v = { x: c.x - b.x, y: c.y - b.y };
  return Math.acos(clamp((u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y) || 1), -1, 1)) * 180 / Math.PI;
}
/** 관절 21개를 손 크기로 정규화해 후보 자세를 구분합니다. 임계값은 실사용 검증 전입니다. */
export function poseOf(p: Point[], wasPinching = false): Pose {
  if (p.length !== 21 || p.some(q => !Number.isFinite(q.x) || !Number.isFinite(q.y))) return 'other';
  const scale = Math.max(.025, dist(p[0], p[9]));
  if (isScrollPose(p)) return 'scroll';
  const straight = [5, 9, 13, 17].map(i => angle(p[i], p[i + 1], p[i + 3]) > 155 && dist(p[i + 3], p[0]) > dist(p[i + 1], p[0]) * 1.08);
  const othersClosed = !straight[1] && !straight[2] && !straight[3];
  const indexAngle = angle(p[5], p[6], p[8]);
  // 주먹에서는 엄지·검지 끝이 화면에서 겹칠 수 있습니다. 거리만으로 집기를 판정하지 않습니다.
  const reach=dist(p[5],p[8])/Math.max(.015,dist(p[5],p[6]));
  const tipOut=dist(p[8],p[0])/Math.max(.025,dist(p[6],p[0]));
  const thumbOut=dist(p[2],p[4])/scale;
  const tightFist=othersClosed&&!straight[0]&&reach<.95&&tipOut<.85;
  if(tightFist)return 'fist';
  const pinch=dist(p[4],p[8])/scale<(wasPinching?.34:.22)
    && reach>(wasPinching?.80:.95) && tipOut>(wasPinching?.80:.88)
    && thumbOut>(wasPinching?.32:.38);
  if(pinch)return 'pinch';
  if (straight.every(Boolean)) return 'palm';
  if (straight[0] && straight[1] && !straight[2] && !straight[3]) return 'victory';
  if (straight[0] && othersClosed) return 'point';
  if (othersClosed && indexAngle > 65 && indexAngle <= 155 && dist(p[8], p[0]) > dist(p[6], p[0]) * .85) return 'hook';
  if (othersClosed && !straight[0]) return 'fist';
  return 'other';
}
/** 사용자 좌우 판정만 처리합니다. 좌표를 뒤집거나 비선택 손으로 제어권을 넘기지 않습니다. */
export function normalizeHandSides(hands:Hand[],flipLabels=false):Hand[]{return hands.filter(h=>h.side==='Left'||h.side==='Right').map(h=>({...h,side:flipLabels?(h.side==='Right'?'Left':'Right'):h.side}));}
/** 0.3의 기본 반전 오류를 한 번 바로잡습니다. 새 저장소에 저장된 이후 사용자 보정은 유지합니다. */
export function migrateHandednessSettings(previous:Settings):Settings{return {...structuredClone(previous),flipLabels:false};}
/** 메뉴 전용 선택 벡터. 카메라 미러링에 맞춘 손바닥 중심 이동이며 실제 클릭 좌표와 독립적입니다. */
export function menuMovement(center:Point,origin:Point,scale:number):Point{return{x:-(center.x-origin.x)/Math.max(.025,scale),y:(center.y-origin.y)/Math.max(.025,scale)};}
/** 작은 떨림·대각선은 선택하지 않습니다. 이미 선택한 방향에는 더 작은 이탈 임계값을 사용합니다. */
export function menuChoice(offset:Point,previous:State['selection']):State['selection']{
 const x=offset.x,y=offset.y,ax=Math.abs(x),ay=Math.abs(y);
 if(Math.min(ax,ay)>Math.max(ax,ay)*.8)return null;
 const candidate:State['selection']=ax>ay?x>0?'double':'right':y<0?'click':'cancel';
 return Math.max(ax,ay)>=(candidate===previous?.16:.24)?candidate:null;
}
/** 붙인 검지·중지가 펴지고 나머지는 접혔는지 구분합니다. 방향과 상관없이 가로 자세는 중립으로 유지합니다. */
export function isScrollPose(p:Point[]):boolean {
 if(p.length!==21)return false;
 const scale=Math.max(.025,dist(p[0],p[9]));
 const fingers=[5,9].every(i=>angle(p[i],p[i+1],p[i+3])>150&&dist(p[i],p[i+3])>scale*.7);
 const closed=[13,17].every(i=>angle(p[i],p[i+1],p[i+3])<150);
 return fingers&&closed&&dist(p[8],p[12])/scale<.30;
}
/** 화면 좌표는 아래가 +y입니다. 위=-1, 아래=+1, 수평·불명확=0으로 반환합니다. */
export function scrollDirectionOf(p:Point[]): -1|0|1 {
 if(!isScrollPose(p))return 0;
 const x=((p[8].x-p[5].x)+(p[12].x-p[9].x))/2;
 const y=((p[8].y-p[5].y)+(p[12].y-p[9].y))/2;
 if(Math.abs(y)/Math.max(.001,Math.hypot(x,y))<.75)return 0;
 return y>0?1:-1;
}
/** 기존 스크롤 이동량·복귀 설정은 제거하고 속도 중간값을 적용합니다. 다른 유효한 설정은 보존합니다. */
export function migrateScrollSettings(previous:unknown):Settings|null {
 if(!previous||typeof previous!=='object'||Array.isArray(previous))return null;
 const {scrollStep,scrollDirection,...rest}=previous as Record<string,unknown>;
 const next={...rest,scrollSpeed:typeof rest.scrollSpeed==='number'?rest.scrollSpeed:400} as Settings;
 return validateSettings(next)?null:next;
}
/** 기본 조작은 충돌 없는 고정 경로로 유지합니다. 추가 동작은 별도 연결 화면에서 배정합니다. */
export function validateSettings(s:Settings):string|null {
 if(!s||!['Left','Right'].includes(s.side)||typeof s.flipLabels!=='boolean'||typeof s.motion!=='boolean'||typeof s.desktopCandidate!=='boolean')return '설정 형식이 올바르지 않아요.';
 for(const [v,min,max] of [[s.smoothing,.1,.85],[s.sensitivity,.8,2],[s.menuHold,250,1800],[s.selectHold,250,1200],[s.scrollSpeed,100,1200]])if(!Number.isFinite(v)||v<min||v>max)return '설정 값이 허용 범위를 벗어났어요.';
 for(const k of Object.keys(DEFAULTS.bindings) as Binding[])if(s.bindings?.[k]!==DEFAULTS.bindings[k])return '기본 이동·정지·메뉴·드래그 경로는 이 버전에서 보호합니다. 추가 동작은 기능 연결을 사용해주세요.';
 return null;
}
/** 시간 기반 제어 상태 머신. 해제 > 진행 중 메뉴/드래그 > 양손 > 추가/한손 명령 순서를 유지합니다. */
export class Controller {
 settings:Settings;
 extras:ExtraBinding[]=[];
 state:State={mode:'제어 대기',pointer:{x:.5,y:.5},pose:'other',progress:0,selection:null,active:false,paused:false,hands:0,listening:false,tracking:false,phase:'off',menuReady:false,menuOffset:{x:0,y:0}};
 private phase:'normal'|'opening'|'menu'|'cooldown'|'scroll'='normal';
 private drag=false; private armed=false; private needsNeutral=false; private fistReady=false; private fistAt:number|null=null;
 private since=0; private lastPose:Pose='other'; private lastTime=-1; private lastResult=-1;
 private startSince:number|null=null; private releaseSince:number|null=null; private menuSince=0;
 private menuOrigin:Point|null=null; private menuScale=.2; private openingGoodAt:number|null=null; private openingGapAt:number|null=null; private openingHeld=0;
 private chosen:State['selection']=null; private choiceSince=0; private lastCenter:Point|null=null;
 private motionStart:{x:number;y:number;gap:number;at:number}|null=null;
 private lastZoomGap=0; private desktopLatched=false;
 private scrollSign:-1|0|1=0; private scrollSince:number|null=null; private lastScroll:number|null=null;
 private extraLatched=false;
 constructor(settings:Settings,private emit:(e:InputEvent)=>void){const error=validateSettings(settings);if(error)throw Error(error);this.settings=structuredClone(settings);}
 /** 감지만 켭니다. 실제 제어는 선택 손바닥을 3초 유지한 뒤 시작합니다. */
 start(){this.stop();this.state.listening=true;this.state.mode='시작 준비 · 선택한 손바닥 3초';this.state.phase='start';}
 /** 강제 중지는 즉시 해제합니다. 3초는 의도적인 제스처 시작/해제에만 적용합니다. */
 stop(at=performance.now()){this.release(at,true);this.reset();this.state.active=false;this.state.listening=false;this.state.tracking=false;this.state.mode='제어 해제';this.state.phase='off';this.needsNeutral=false;this.startSince=null;this.releaseSince=null;}
 /** 추론이 멎어도 눌린 가상 버튼을 남기지 않습니다. UI의 감시 타이머에서 호출합니다. */
 watchdog(at:number){if(this.state.listening&&this.lastResult>=0&&at-this.lastResult>900){this.stop(at);this.state.mode='인식 응답 지연 · 감지를 다시 켜주세요';}}
 private fire(command:Command,at:number,value?:number,functionId?:string,cancelled=false){this.emit({command,at,...this.state.pointer,value,functionId,cancelled});}
 private release(at:number,cancelled=false){if(this.drag)this.fire('dragEnd',at,undefined,undefined,cancelled);this.drag=false;}
 private reset(){this.state.menuReady=false;this.menuOrigin=null;this.state.menuOffset={x:0,y:0};this.fistAt=null;this.openingGoodAt=null;this.openingGapAt=null;this.openingHeld=0;this.phase='normal';this.armed=false;this.fistReady=false;this.state.progress=0;this.state.selection=null;this.chosen=null;this.lastPose='other';this.lastCenter=null;this.motionStart=null;this.scrollSign=0;this.scrollSince=null;this.lastScroll=null;this.extraLatched=false;this.desktopLatched=false;}
 private lost(at:number){this.release(at,true);this.reset();this.startSince=null;this.releaseSince=null;this.state.tracking=false;this.state.mode=this.state.active?'추적 불안정 · 손바닥으로 재개':'손을 찾는 중 · 손바닥 3초';this.state.phase='lost';}
 /** 재개 첫 프레임은 기준점만 잡아 커서 점프를 줄입니다. 이후 손의 상대 이동을 화면에 반영합니다. */
 private pointer(p:Point){if(this.lastCenter){const k=this.settings.smoothing*this.settings.sensitivity;this.state.pointer={x:clamp(this.state.pointer.x-(p.x-this.lastCenter.x)*k*3),y:clamp(this.state.pointer.y+(p.y-this.lastCenter.y)*k*3)};}this.lastCenter={...p};}
 /** 양손은 메뉴/드래그가 끝난 뒤에만 처리합니다. 상하 동작은 명시적으로 켠 후보 시험에서만 토글합니다. */
 private motion(hands:Hand[],at:number):boolean {
  if(!this.settings.motion||hands.length!==2||!hands.every(h=>poseOf(h.points)==='palm')){this.motionStart=null;this.desktopLatched=false;return false;}
  const a=hands[0].points[9],b=hands[1].points[9],gap=dist(a,b),center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  if(!this.motionStart){this.motionStart={...center,gap,at};this.lastZoomGap=gap;}
  this.lastCenter=null;this.fistReady=false;this.state.mode='양손 확대·축소 시험';this.state.phase='motion';
  if(at-this.motionStart.at<300)return true;
  const dy=center.y-this.motionStart.y,d=gap-this.motionStart.gap;
  if(this.settings.desktopCandidate&&Math.abs(dy)>.18&&Math.abs(d)<.14&&!this.desktopLatched){this.fire('desktop',at);this.desktopLatched=true;this.state.mode='Win + D 후보 · 가상 토글';}
  else if(Math.abs(dy)<.12&&Math.abs(gap-this.lastZoomGap)>.045){this.fire(gap>this.lastZoomGap?'zoomIn':'zoomOut',at,Math.abs(gap-this.lastZoomGap));this.lastZoomGap=gap;}
  return true;
 }
 /** 한 프레임을 처리하고 화면 상태를 반환합니다. 좌우 분류가 모호한 중복 손은 실행하지 않습니다. */
 push(raw:Hand[],at:number):State {
  if(at<=this.lastTime)return this.state;
  if(this.lastResult>=0&&at-this.lastResult>900&&this.state.listening)this.lost(at);
  this.lastTime=at;this.lastResult=at;this.state.progress=0;
  const hands=raw.filter(h=>h.score>=.6&&h.points.length===21&&h.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
  this.state.hands=hands.length;
  if(!this.state.listening)return this.state;
  const selected=hands.filter(h=>h.side===this.settings.side);
  if(selected.length!==1||new Set(hands.map(h=>h.side)).size!==hands.length){this.lost(at);return this.state;}
  const hand=selected[0],center=hand.points[9],pose=poseOf(hand.points,this.drag);
  this.state.pose=pose;this.state.tracking=true;
  if(pose!==this.lastPose){this.since=at;this.lastPose=pose;}
  const held=at-this.since;
  // 해제된 자세를 계속 유지해 재시작하지 않도록 중립 복귀를 요구합니다.
  if(!this.state.active){
   if(this.needsNeutral){this.state.mode='해제 완료 · 손 모양을 풀어주세요';this.state.phase='off';if(pose!=='palm'&&!(hands.length===2&&hands.every(h=>poseOf(h.points)==='fist')))this.needsNeutral=false;return this.state;}
   this.state.phase='start';this.state.mode='시작 준비 · 선택한 손바닥 3초';
   if(pose!=='palm'){this.startSince=null;return this.state;}
   if(this.startSince===null)this.startSince=at;
   this.state.progress=clamp((at-this.startSince)/3000);
   if(at-this.startSince>=3000){this.state.active=true;this.armed=true;this.startSince=null;this.state.progress=0;this.lastCenter={...center};this.state.mode='커서 이동';this.state.phase='normal';}
   return this.state;
  }
  const twoFists=hands.length===2&&hands.every(h=>poseOf(h.points)==='fist');
  if(twoFists){
   this.release(at,true);this.phase='normal';this.fistReady=false;this.motionStart=null;this.scrollSign=0;this.scrollSince=null;this.lastScroll=null;this.state.selection=null;
   if(this.releaseSince===null)this.releaseSince=at;
   this.state.progress=clamp((at-this.releaseSince)/3000);this.state.mode='해제 준비 · 양손 주먹 3초';this.state.phase='release';
   if(at-this.releaseSince>=3000){this.reset();this.state.active=false;this.needsNeutral=true;this.releaseSince=null;this.state.mode='제어 해제 · 새 자세로 다시 시작';this.state.phase='off';}
   return this.state;
  }
  if(this.releaseSince!==null){this.releaseSince=null;this.armed=false;this.lastCenter=null;}
  if(!this.armed){this.state.mode='손바닥으로 재개';this.state.phase='resume';if(pose==='palm'&&held>=450){this.armed=true;this.lastCenter={...center};}return this.state;}
  // 진행 중인 드래그와 메뉴는 양손 행동보다 우선합니다.
  if(this.drag){this.state.phase='drag';if(pose==='pinch'){this.pointer(center);this.state.mode='드래그 · 벌려서 놓기';}else{this.release(at);this.phase='cooldown';this.lastCenter=null;this.state.mode='놓기 완료';}return this.state;}
  if(this.phase==='menu'){
   this.state.phase='menu';this.lastCenter=null;
   if(pose==='fist'||pose==='palm'){this.phase=pose==='palm'?'normal':'cooldown';this.fistReady=false;this.state.selection=null;this.state.mode=pose==='palm'?'메뉴 취소 · 이동 복귀':'메뉴 취소';return this.state;}
   if(at-this.menuSince>10000){this.phase='cooldown';this.state.selection=null;this.state.mode='메뉴 시간 초과 · 취소';return this.state;}
   if(pose!=='point'){this.chosen=null;this.state.selection=null;this.state.menuReady=false;this.state.mode='메뉴 · 검지를 편 채 손을 이동하세요';return this.state;}
   const offset=menuMovement(center,this.menuOrigin??center,this.menuScale);
   this.state.menuOffset={x:clamp(offset.x,-.7,.7),y:clamp(offset.y,-.7,.7)};
   // 진입 위치를 유지하는 동안은 어느 항목도 선택하지 않습니다. 손가락 각도는 사용하지 않습니다.
   const choice=at-this.menuSince<180?null:menuChoice(offset,this.chosen);
   if(!choice){this.chosen=null;this.state.selection=null;this.state.menuReady=false;this.state.progress=0;this.state.mode='메뉴 열림 · 손을 위/좌/우로 조금 이동하세요';return this.state;}
   this.state.menuReady=true;
   if(choice!==this.chosen){this.chosen=choice;this.choiceSince=at;}
   this.state.selection=choice;this.state.progress=clamp((at-this.choiceSince)/this.settings.selectHold);this.state.mode='메뉴 · 방향 유지로 선택';
   if(at-this.choiceSince>=this.settings.selectHold){if(choice!=='cancel')this.fire(choice,at);this.phase='cooldown';this.state.phase='cooldown';this.state.menuReady=false;this.state.progress=0;this.state.selection=null;this.state.mode=choice==='cancel'?'메뉴 취소':'클릭 완료';}
   return this.state;
  }
  if(this.phase==='opening'){
   this.state.phase='opening';this.lastCenter=null;
   // 검지를 펴는 과정의 짧은 반 구부림/미분류는 진행률을 지우지 않고 잠시 보류합니다.
   if(pose==='hook'||pose==='other'){
    if(this.openingGapAt===null)this.openingGapAt=at;
    this.openingGoodAt=null;
    if(at-this.openingGapAt<=220){this.state.progress=clamp(this.openingHeld/this.settings.menuHold);this.state.mode='검지를 펴는 중 · 메뉴 준비 유지';return this.state;}
    this.phase='cooldown';this.fistReady=false;this.state.mode='메뉴 준비 취소 · 주먹으로 다시 준비';return this.state;
   }
   if(pose!=='point'){this.phase='normal';this.fistReady=pose==='fist';this.fistAt=pose==='fist'?at:null;this.state.mode='메뉴 진입 취소';return this.state;}
   // 누락 구간은 유지 시간에 더하지 않습니다. 유효한 검지 프레임 사이의 경과 시간만 누적합니다.
   if(this.openingGoodAt!==null)this.openingHeld+=Math.min(200,at-this.openingGoodAt);
   this.openingGoodAt=at;this.openingGapAt=null;
   this.state.progress=clamp(this.openingHeld/this.settings.menuHold);this.state.mode='클릭 목록 여는 중';
   if(this.openingHeld>=this.settings.menuHold){
    this.phase='menu';this.chosen=null;this.state.menuReady=false;this.menuOrigin={...center};this.menuScale=Math.max(.025,dist(hand.points[0],center));this.state.menuOffset={x:0,y:0};this.menuSince=at;
    this.state.progress=0;this.state.phase='menu';this.state.mode='메뉴 열림 · 손을 위/좌/우로 조금 이동하세요';
   }
   return this.state;
  }
  if(this.phase==='cooldown'){this.state.phase='cooldown';this.state.mode='중립 자세로 복귀';if((pose==='palm'||pose==='fist')&&held>=220){this.phase='normal';this.extraLatched=false;this.fistReady=pose==='fist';this.fistAt=pose==='fist'?at:null;this.lastCenter=null;}return this.state;}
  // 스크롤 중 두 번째 손이 나타나도 커서를 양손 행동으로 전환하지 않습니다.
  if(this.phase==='scroll'||pose==='scroll'){
   this.lastCenter=null;this.fistReady=false;this.state.phase='scroll';
   if(pose!=='scroll'){this.phase='normal';this.scrollSign=0;this.scrollSince=null;this.lastScroll=null;this.state.mode=pose==='palm'?'스크롤 종료 · 이동 복귀':'스크롤 종료';return this.state;}
   const sign=scrollDirectionOf(hand.points);
   // 수평 자세·방향 전환 중에는 입력을 중단합니다. 새 방향은 250ms 연속 확인한 뒤 반복합니다.
   if(sign===0){this.scrollSign=0;this.scrollSince=null;this.lastScroll=null;this.state.mode='스크롤 중립 · 손끝을 위/아래로 향해주세요';return this.state;}
   if(sign!==this.scrollSign||this.scrollSince===null){this.scrollSign=sign;this.scrollSince=at;this.lastScroll=null;}
   const hold=at-this.scrollSince;
   this.state.mode=hold<250?'스크롤 방향 확인 중':sign>0?'아래로 연속 스크롤':'위로 연속 스크롤';
   if(hold<250){this.state.progress=clamp(hold/250);return this.state;}
   if(this.lastScroll===null){this.lastScroll=at;return this.state;}
   // 경과 시간×px/s로 계산해 카메라 FPS와 속도를 분리합니다. 긴 공백은 큰 점프가 되지 않도록 제한합니다.
   const dt=Math.min(100,Math.max(0,at-this.lastScroll));this.lastScroll=at;
   if(dt>0)this.fire('scroll',at,sign*this.settings.scrollSpeed*dt/1000);
   return this.state;
  }
  if(this.motion(hands,at))return this.state;
  this.state.phase='normal';
  // 주먹→반 구부림→검지의 자연스러운 전환을 기다립니다. 이 구간에는 여분 구부림 기능도 실행하지 않습니다.
  if(this.fistReady&&(pose==='hook'||pose==='other')){
   this.lastCenter=null;
   if(this.fistAt!==null&&at-this.fistAt<=1500){this.state.mode='검지를 펴는 중 · 주먹 준비 유지';return this.state;}
   this.fistReady=false;this.fistAt=null;this.phase='cooldown';this.state.mode='메뉴 준비 시간 초과 · 주먹으로 다시 준비';return this.state;
  }
  const extra=this.extras.find(e=>e.side===hand.side&&e.gesture===pose&&e.scope==='sandbox'&&e.mode==='active');
  if(extra){this.lastCenter=null;this.fistReady=false;this.state.mode='추가 기능 준비 · 웹 모의 실행';this.state.progress=clamp(held/650);if(held>=650&&!this.extraLatched){this.fire('shortcut',at,undefined,extra.functionId);this.extraLatched=true;this.phase='cooldown';}return this.state;}
  if(pose==='palm'){this.pointer(center);this.fistReady=false;this.state.mode='커서 이동';}
  else if(pose==='fist'){this.lastCenter=null;this.fistReady=true;this.fistAt=at;this.state.mode='커서 정지';}
  else if(pose==='point'&&this.fistReady){this.phase='opening';this.menuSince=at;this.openingHeld=0;this.openingGoodAt=at;this.openingGapAt=null;this.fistReady=false;this.lastCenter=null;this.state.mode='클릭 목록 여는 중';this.state.phase='opening';}
  else if(pose==='pinch'&&held>=200){this.drag=true;this.fistReady=false;this.lastCenter={...center};this.state.mode='드래그 · 벌려서 놓기';this.state.phase='drag';this.fire('dragStart',at);}
  else{this.lastCenter=null;this.fistReady=false;this.state.mode='동작 구분 중';}
  return this.state;
 }
}
