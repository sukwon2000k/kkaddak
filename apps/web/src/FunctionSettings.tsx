import {useEffect,useRef,useState} from 'react';
import {FUNCTIONS,SPARES,bindingConflict,readBindings} from '../../../packages/core/src/catalog';
import {poseOf,type ExtraBinding,type Hand} from '../../../packages/core/src/controller';
const KEY='kkaddak.extra-bindings.v1';
/** 추가 연결은 유효한 항목만 복구합니다. 기본 기능과 보류 후보는 저장할 수 없습니다. */
export function loadExtraBindings():ExtraBinding[]{try{return readBindings(JSON.parse(localStorage.getItem(KEY)||'[]'));}catch{return[];}}
type Props={bindings:ExtraBinding[];onChange:(b:ExtraBinding[])=>void;observation:{hands:Hand[];at:number};live:boolean;connect:()=>void;practiceAllowed:boolean};
/** 기능 목록·여분 제스처·무명령 연습을 분리합니다. 이 화면에서 OS 명령은 실행하지 않습니다. */
export function FunctionSettings({bindings,onChange,observation,live,connect,practiceAllowed}:Props){
 const [tab,setTab]=useState('functions'),[query,setQuery]=useState(''),[group,setGroup]=useState('전체');
 const [chosen,setChosen]=useState(''),[gesture,setGesture]=useState<'hook'|'victory'>('victory'),[side,setSide]=useState<Hand['side']>('Right');
 const [practicing,setPracticing]=useState(false),[progress,setProgress]=useState(0),[passed,setPassed]=useState(false),[message,setMessage]=useState('');
 const since=useRef<number|null>(null),lastFrame=useRef(0);
 const dialogRef=useRef<HTMLElement>(null);
 // 대화상자의 키보드 이동은 내부로 제한하고 Esc로 연습을 취소합니다.
 useEffect(()=>{if(!chosen)return;const before=document.activeElement as HTMLElement|null;const old=document.body.style.overflow;document.body.style.overflow='hidden';dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus();const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setChosen('');setPracticing(false);}if(e.key==='Tab'){const items=Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),select,input')??[]);const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};window.addEventListener('keydown',key);return()=>{window.removeEventListener('keydown',key);document.body.style.overflow=old;before?.focus();};},[chosen]);
 const selected=FUNCTIONS.find(f=>f.id===chosen);
 const candidate:ExtraBinding={functionId:chosen,gesture,side,scope:'sandbox',mode:'active'};
 const conflict=chosen?bindingConflict(candidate,bindings):null;
 // 650ms 연속 관절 결과로 후보 자세를 확인합니다. 명령 실행과 별개의 연습입니다.
 useEffect(()=>{
  if(!practicing||!live||!practiceAllowed){since.current=null;return;}
  const hs=observation.hands.filter(h=>h.score>=.6);
  const hand=hs.filter(h=>h.side===side);
  const ok=hand.length===1&&new Set(hs.map(h=>h.side)).size===hs.length&&poseOf(hand[0].points)===gesture;
  if(!ok){since.current=null;setProgress(0);return;}
  if(observation.at-lastFrame.current>350)since.current=null;lastFrame.current=observation.at;
  if(since.current===null)since.current=observation.at;
  const v=Math.min(1,(observation.at-since.current)/650);setProgress(v);
  if(v===1){setPassed(true);setPracticing(false);setMessage('연습 인식을 확인했어요. 실사용 정확도 검증 완료를 의미하지는 않아요.');}
 },[observation,practicing,live,side,gesture,practiceAllowed]);
 useEffect(()=>{setPassed(false);setProgress(0);setPracticing(false);since.current=null;setMessage('');},[chosen,gesture,side]);
 useEffect(()=>{if(!practiceAllowed||!live){setPracticing(false);since.current=null;setProgress(0);}},[practiceAllowed,live]);
 /** 저장 전 충돌을 다시 검사하고 localStorage에 기록한 뒤에만 화면 연결을 갱신합니다. */
 function persist(next:ExtraBinding[]){try{localStorage.setItem(KEY,JSON.stringify(next));onChange(next);setMessage('저장했어요. 웹에서는 기능 이름을 표시하는 모의 실행만 합니다.');return true;}catch{setMessage('저장 공간 오류로 저장하지 못했어요.');return false;}}
 function save(){const error=bindingConflict(candidate,bindings);if(error){setMessage(error);return;}if(!passed){setMessage('실제 명령 없는 카메라 연습을 먼저 완료해주세요.');return;}if(persist([...bindings.filter(b=>b.functionId!==chosen),candidate]))setChosen('');}
 const groups=['전체',...new Set(FUNCTIONS.map(f=>f.group))];
 const list=FUNCTIONS.filter(f=>(group==='전체'||f.group===group)&&`${f.name} ${f.shortcut} ${f.target}`.toLowerCase().includes(query.toLowerCase()));
 return <section className="function-settings">
  <div className="section-title"><div><h2>기능과 제스처는 따로, 연결은 내 손으로.</h2><p>추가 단축키 {FUNCTIONS.filter(f=>f.status==='available').length}개 · 기본 자동 배정 없음 · 실제 Windows 명령 실행 안 함</p></div><span className="soft-tag">설정 중에는 제어 중지</span></div>
  <div className="catalog-tabs" role="tablist" aria-label="설정 목록"><button role="tab" aria-selected={tab==='functions'} onClick={()=>setTab('functions')}>기능 목록</button><button role="tab" aria-selected={tab==='gestures'} onClick={()=>setTab('gestures')}>제스처 모음집</button></div>
  {tab==='functions'?<>
   <div className="catalog-tools"><input aria-label="기능 검색" placeholder="기능 이름, 단축키, 적용 대상 검색" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="기능 분류" value={group} onChange={e=>setGroup(e.target.value)}>{groups.map(g=><option key={g}>{g}</option>)}</select><span>{list.length}개 기능</span></div>
   <div className="catalog-table"><table><thead><tr><th>기능·분류</th><th>단축키·명령</th><th>적용 대상·사용 조건</th><th>제스처 연결</th></tr></thead><tbody>{list.map(f=>{const b=bindings.find(b=>b.functionId===f.id);return <tr key={f.id}><td><b>{f.name}</b><small>{f.group}</small></td><td><kbd>{f.shortcut}</kbd></td><td>{f.target}<small>{f.condition}</small></td><td>{f.status==='held'?<span className="held-badge">보류 · 연결 불가</span>:f.status==='basic'?<span className="soft-tag">기본 조작</span>:<><span className={b?'binding-badge':'unassigned'}>{b?`${b.side==='Right'?'오른손':'왼손'} · ${SPARES.find(g=>g.id===b.gesture)?.name}`:'제스처 미지정'}</span><button className="text-button" onClick={()=>{setChosen(f.id);if(b){setGesture(b.gesture);setSide(b.side);}setMessage('');}}> {b?'연결 변경':'연결하기'}</button>{b&&<button className="text-button unlink" onClick={()=>persist(bindings.filter(x=>x.functionId!==f.id))}>연결 해제</button>}</>}</td></tr>;})}</tbody></table>{!list.length&&<p className="catalog-empty">검색 결과가 없어요.</p>}</div>
   <div className="catalog-notice">단축키는 설명 정보예요. 같은 조합도 앱·포커스에 따라 의미가 달라요. 설치형 OS 실행은 아직 연결하지 않았어요.</div>
   <button className="button secondary" disabled={!bindings.length} onClick={()=>persist([])}>추가 연결 기본값 복원 · 전부 미지정</button>
  </>:<div className="gesture-library">
   <div className="catalog-notice">그림은 PDF v2의 AI 일러스트예요. 실제 촬영 사진·학습 데이터·정확도 검증 자료가 아니에요.</div>
   <div className="gesture-library-grid">{[
    ['palm','손바닥 · 이동/시작','선택한 손 / 시작 3초 / 이동 중에는 즉시 반영 / 주먹으로 정지'],
    ['fist','주먹 · 정지/해제','선택 손 주먹은 정지 / 양손 주먹 3초는 해제 기본안 / 해제 준비 즉시 버튼 놓음'],
    ['point','검지 · 메뉴 진입','주먹 → 반 구부림 전환 허용 → 검지 유지 / 메뉴에서 손 전체 이동 / 클릭 커서 고정 / 손바닥·주먹 취소'],
    ['pinch','집기 · 드래그','선택 손 / 집기 유지 이동 / 엄지·검지 벌리면 놓기 / 추적 상실 시 취소'],
    ['release','벌리기 · 놓기','손 전체를 펼칠 필요 없음 / 집게 거리 히스테리시스 적용 / 실기기 임계값 시험 필요'],
    ['scroll-flat','붙인 두 손가락 · 방향 스크롤','손끝 아래→아래 / 손끝 위→위 / 방향 유지=연속 / 수평·자세 풀기=정지 / 속도 조절 가능']
   ].map(([img,name,text])=><article className="gesture-reference" key={img}><img className={img==='scroll-flat'?'direction-reference':''} src={`${import.meta.env.BASE_URL}gestures/${img}.png`} alt={`${name} 설명용 AI 일러스트`}/><h3>{name}</h3><p>{text}</p><small>기본 설계 · 실기기 인식 검증 필요</small></article>)}</div>
   <h3>여분 제스처 · 미검증 후보</h3><div className="spare-grid">{SPARES.map(g=><article key={g.id}><b>{g.name}</b><p>시작: 해당 자세 / 유지: 650ms 시험값 / 종료: 중립 복귀 / 사용 손: 선택 손</p><p>{g.warning}</p><small>연결된 기능: {bindings.filter(b=>b.gesture===g.id).map(b=>FUNCTIONS.find(f=>f.id===b.functionId)?.name).join(', ')||'없음 · 미사용'}</small></article>)}</div>
   <div className="catalog-notice">양손 내리기·올리기: Win + D 시험 후보 / 양손 검지 X·모두 종료: 보류 / 보조 손 Ctrl·Shift, 꾸미기·놀이·발표·사진 모드는 추후 아이디어예요.</div>
  </div>}
  {message&&<p className="catalog-message" role="status">{message}</p>}
  {selected&&<div className="modal-backdrop"><section className="binding-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="binding-title"><button className="icon-button modal-close" aria-label="기능 연결 닫기" onClick={()=>{setChosen('');setPracticing(false);}}>×</button><span className="soft-tag">실제 명령 없는 연결 연습</span><h2 id="binding-title">{selected.name} 연결하기</h2><p><kbd>{selected.shortcut}</kbd> · {selected.target}</p><p>{selected.condition}</p><ol className="binding-flow"><li>기능 선택</li><li>여분 제스처</li><li>인식 연습</li><li>충돌 검사·저장</li></ol><label>여분 제스처<select aria-label="연결할 여분 제스처" value={gesture} onChange={e=>setGesture(e.target.value as typeof gesture)}>{SPARES.map(g=><option key={g.id} value={g.id}>{g.name} · 미검증 후보</option>)}</select></label><label>사용 손<select aria-label="연결에 사용할 손" value={side} onChange={e=>setSide(e.target.value as Hand['side'])}><option value="Right">오른손</option><option value="Left">왼손</option></select></label><p className="similar-warning">혼동 주의: {SPARES.find(g=>g.id===gesture)?.warning} 자동 검출만으로 안전을 보장하지 않아요.</p><p>조건: 웹 연습 영역 / 제어 실행 중 / 선택한 손. 실제 앱 포커스를 감지하는 기능은 아직 없어요.</p>
   {!live?<button className="button primary" onClick={connect}>연습용 카메라 연결</button>:<button className="button secondary" onClick={()=>{setPracticing(true);setPassed(false);setProgress(0);since.current=null;setMessage('');}}>명령 없이 연습 시작</button>}
   <progress aria-label="제스처 연습 진행률" max="1" value={progress}/><p>{passed?'연습 인식 확인':practicing?`${side==='Right'?'오른손':'왼손'} 자세를 0.65초 유지해주세요. 명령은 실행하지 않아요.`:'카메라 연습을 완료해야 저장할 수 있어요.'}</p>
   {conflict&&<div className="error-box" role="alert">{conflict}</div>}{message&&<p role="status">{message}</p>}
   <button className="button primary" disabled={!passed||!!conflict} onClick={save}>충돌 검사 후 저장</button><button className="button secondary" onClick={()=>{setChosen('');setPracticing(false);}}>취소</button>
  </section></div>}
 </section>;
}
