import { useEffect, useRef, useState } from 'react';
import { Hand as HandIcon, MousePointer2, Camera, Settings2, BookOpen, List, Play, Square, ArrowUpRight, ArrowRight, ScanLine, ShieldCheck, RotateCcw, Download, X, ChevronDown, Check, Move, Maximize2, Minimize2, CircleHelp, Grip, Sparkles, Crosshair, Pause, VideoOff, ChevronRight, ArrowDown, CheckCircle2, Wand2, SlidersHorizontal, CheckCheck, Zap, FileText } from 'lucide-react';
import { Controller, DEFAULTS, validateSettings, POSE_NAMES, BINDING_NAMES, type Settings, type Binding, type Pose, type Point, type InputEvent, type State, poseOf, normalizeHandSides, migrateHandednessSettings, migrateScrollSettings } from '../../../packages/core/src/controller';
import { useVision } from './useVision';
import { FunctionSettings, loadExtraBindings } from './FunctionSettings';
import { FUNCTIONS, readBindings } from '../../../packages/core/src/catalog';
import type { Hand, ExtraBinding } from '../../../packages/core/src/controller';
const STORAGE = 'kkaddak.settings.v3.2';
const commandNames = { click: '일반 클릭', double: '더블클릭', right: '우클릭', dragStart: '드래그 시작', dragEnd: '드래그 놓기', zoomIn: '확대', zoomOut: '축소', desktop: '바탕화면 표시·복귀 후보', scroll: '스크롤', shortcut: '추가 기능' };
type Log = { time: string; action: string; result: string; source: string; at?: number; x?: number; y?: number };
function loadSettings(): Settings {
  try { const v = JSON.parse(localStorage.getItem(STORAGE) || 'null'); if(v&&!validateSettings(v))return v;
    const recent=migrateScrollSettings(JSON.parse(localStorage.getItem('kkaddak.settings.v3.1')||'null'));
    if(recent)return recent;
    const previous=migrateScrollSettings(JSON.parse(localStorage.getItem('kkaddak.settings.v3')||'null'));
    if(previous)return migrateHandednessSettings(previous);
    // 구버전의 메뉴·해제 동작은 새 기준과 다릅니다. 손 선택·커서 감도만 유효한 범위에서 옮깁니다.
    const old=JSON.parse(localStorage.getItem('kkaddak.settings.v1')||'null');
    const next={...structuredClone(DEFAULTS),...(old?{side:old.side,smoothing:old.smoothing,sensitivity:old.sensitivity}:{})};
    return !validateSettings(next)?next:structuredClone(DEFAULTS); }
  catch { return structuredClone(DEFAULTS); }
}
/** 파일 다운로드는 사용자 기기에서만 생성합니다. 실행 로그에 영상·계정 정보는 포함하지 않습니다. */
function saveFile(name: string, data: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([data], { type })), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const guide = [
  ['01', '손바닥으로 이동', '손가락을 펴고 카메라에 손바닥을 보여주세요. 손을 움직이면 테스트 커서가 따라와요.', '🖐️'],
  ['02', '주먹으로 정지', '커서를 원하는 곳에 두고 주먹을 쥐세요. 그 자리에서 커서가 멈춰요.', '✊'],
  ['03', '검지로 클릭 준비', '주먹으로 정지한 뒤 검지만 펴서 유지하세요. 기본 350ms 동안 시계방향 게이지가 차면 메뉴가 열려요.', '☝️'],
  ['04', '방향으로 클릭 선택', '검지 각도를 꺾을 필요 없어요. 검지를 편 채 손 전체를 위로 조금 옮기면 클릭, 오른쪽은 더블클릭, 왼쪽은 우클릭이에요. 주먹·손바닥은 취소예요.', '↖'],
  ['05', '집어서 드래그', '엄지와 검지를 붙이고 손을 움직이세요. 원하는 위치에서 손가락을 벌리면 놓여요.', '🤏'],
  ['06', '두 손가락 방향 스크롤', '검지·중지를 붙여 펴고 유지하세요. 손끝이 아래면 아래로, 위면 위로 계속 스크롤해요. 수평으로 돌리거나 자세를 풀면 멈춰요.', '↕'],
  ['07', '양손 행동', '두 손바닥을 준비하고 벌리거나 모아 가상 창을 확대·축소해요. 상하 Win+D 동작은 별도로 켜는 후보예요.', '↔'],
];
/** 웹 테스트 어댑터와 UI입니다. 입력 대상은 stage 내부로 제한됩니다. */
export default function App() {
  const [focusMode, setFocusMode] = useState(false);
  const [extras,setExtras]=useState<ExtraBinding[]>(loadExtraBindings);
  const [observation,setObservation]=useState<{hands:Hand[];at:number}>({hands:[],at:0});
  const navRef=useRef('lab');
  const [shortcutPreview,setShortcutPreview]=useState('추가 기능을 연결하면 이름과 명령이 이곳에 표시돼요.');
  const [desktopDirty,setDesktopDirty]=useState(false);
  const scrollArea=useRef<HTMLDivElement>(null);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const dispatch = useRef<(e: InputEvent) => void>(() => {}), engine = useRef<Controller | null>(null);
  if (!engine.current) engine.current = new Controller(settings, e => dispatch.current(e));
  engine.current.extras=extras;
  const [view, setView] = useState<State>({ ...engine.current.state });
  const [selectedHandVisible, setSelectedHandVisible] = useState(false);
  const [nav, setNav] = useState('lab'), [test, setTest] = useState('click'), [help, setHelp] = useState(false);
  const [warning, setWarning] = useState(''), [notice, setNotice] = useState('카메라를 연결하고 손바닥을 보여주세요.'), [logs, setLogs] = useState<Log[]>([]);
  const [counts, setCounts] = useState({ click: 0, double: 0, right: 0, drop: 0, manual: 0 });
  const [card, setCard] = useState<Point>({ x: .13, y: .37 }), [dragging, setDragging] = useState(false), [context, setContext] = useState(false), [scale, setScale] = useState(1), [minimized, setMinimized] = useState(false), [finished, setFinished] = useState(false);
  const stage = useRef<HTMLDivElement>(null), dragElement = useRef<HTMLDivElement>(null), zone = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ offset: Point; source: string } | null>(null), pointer = useRef<Point>({ x: .5, y: .5 }), lastUI = useRef(0), mounted = useRef(true);
  const addLog = (action: string, result: string, source = '손 인식', e?: InputEvent) => {
    const item: Log = { time: new Date().toISOString(), action, result, source, ...(e ? { at: e.at, x: +e.x.toFixed(4), y: +e.y.toFixed(4) } : {}) };
    setLogs(v => [item, ...v].slice(0, 200)); setNotice(`${action} · ${result}`);
  };
  const stop = () => {
    engine.current!.stop(); if(dragRef.current)endDrag(true); if (mounted.current) setView({ ...engine.current!.state, pointer: { ...engine.current!.state.pointer } });
  };
  const vision = useVision((raw, at) => {
    const s = settingsRef.current;
    const hands = normalizeHandSides(raw,s.flipLabels);
    const selected = hands.find(h => h.side === s.side && h.score >= .6);
    if(navRef.current!=='lab')engine.current!.stop();
    const result = engine.current!.push(hands, at);
    if (!result.active) result.pose = selected ? poseOf(selected.points) : 'other';
    pointer.current = { ...result.pointer };
    if (dragRef.current?.source === '손 인식') moveCard(result.pointer);
    if (performance.now() - lastUI.current > 55) { setObservation({hands,at});setSelectedHandVisible(Boolean(selected)); setView({ ...result, pointer: { ...result.pointer } }); lastUI.current = performance.now(); }
  }, stop);
  // 카메라가 연결되면 실험실에서만 시작 제스처를 기다립니다. 설정의 연습은 제어를 켜지 않습니다.
  useEffect(()=>{if(vision.status==='ready'&&navRef.current==='lab'){engine.current!.start();setView({...engine.current!.state});}},[vision.status]);
  useEffect(()=>{const timer=setInterval(()=>{const before=engine.current!.state.mode;engine.current!.watchdog(performance.now());if(before!==engine.current!.state.mode)setView({...engine.current!.state});},150);return()=>clearInterval(timer);},[]);
  useEffect(()=>{if(view.active)setFocusMode(true);},[view.active]);
  useEffect(() => {
    mounted.current = true;
    const hidden = () => { if (document.hidden) { stop(); setNotice('탭을 벗어나 제어를 중지했어요. 돌아온 뒤 시작을 눌러주세요.'); } };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { stop(); setHelp(false); setContext(false); setNotice('Esc로 제어를 중지했어요.'); } };
    document.addEventListener('visibilitychange', hidden); window.addEventListener('keydown', key);
    return () => { mounted.current = false; engine.current!.stop(); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('keydown', key); };
  }, []);
  function rectPoint(p: Point) { const r = stage.current!.getBoundingClientRect(); return { x: r.left + p.x*r.width, y: r.top + p.y*r.height }; }
  function inside(el: Element | null, p: Point) { if (!el || !stage.current) return false; const r = el.getBoundingClientRect(), q = rectPoint(p); return q.x >= r.left && q.x <= r.right && q.y >= r.top && q.y <= r.bottom; }
  function beginDrag(p: Point, source: string) {
    if (!inside(dragElement.current, p)) return false;
    setFinished(false); setContext(false); dragRef.current = { offset: { x: p.x-card.x, y: p.y-card.y }, source }; setDragging(true); return true;
  }
  function moveCard(p: Point) { if (dragRef.current) setCard({ x: Math.max(.02, Math.min(.70, p.x-dragRef.current.offset.x)), y: Math.max(.08, Math.min(.72, p.y-dragRef.current.offset.y)) }); }
  function endDrag(cancelled = false) {
    if (!dragRef.current) return '이동 중인 카드 없음';
    const source = dragRef.current.source; dragRef.current = null; setDragging(false);
    const a = dragElement.current?.getBoundingClientRect(), b = zone.current?.getBoundingClientRect();
    const ok = !cancelled && a && b && a.left+a.width/2 >= b.left && a.left+a.width/2 <= b.right && a.top+a.height/2 >= b.top && a.top+a.height/2 <= b.bottom;
    if (ok) { setFinished(true); setCounts(v => ({ ...v, [source === '손 인식' ? 'drop' : 'manual']: v[source === '손 인식' ? 'drop' : 'manual']+1 })); }
    return cancelled ? '취소 · 입력 해제' : ok ? '목표 영역에 놓기 성공' : '목표 영역 밖에 놓음';
  }
  dispatch.current = e => {
    if (e.command === 'dragStart') { addLog(commandNames[e.command], beginDrag(e, '손 인식') ? '카드 잡기' : '카드를 가리킨 뒤 집어주세요', '손 인식', e); return; }
    if (e.command === 'dragEnd') { addLog(commandNames[e.command], endDrag(e.cancelled), '손 인식', e); return; }
    if(e.command==='scroll'){
      const el=scrollArea.current;if(el){el.scrollTop+=e.value??0;addLog('스크롤',`${(e.value??0)>0?'아래 내용':'위쪽 내용'} · 웹 영역`,'손 인식',e);}else addLog('스크롤','스크롤 테스트 탭에서 확인해주세요.','손 인식',e);return;
    }
    if(e.command==='shortcut'){
      const f=FUNCTIONS.find(f=>f.id===e.functionId);if(f){setShortcutPreview(`${f.name} · ${f.shortcut} · ${f.target}`);addLog(f.name,'웹 모의 실행 · 실제 단축키 전송 없음','손 인식',e);}return;
    }
    if(['zoomIn','zoomOut','desktop'].includes(e.command)){
      if(e.command==='zoomIn')setScale(v=>Math.min(1.5,v+(e.value??.05)));
      if(e.command==='zoomOut')setScale(v=>Math.max(.65,v-(e.value??.05)));
      if(e.command==='desktop'){setMinimized(v=>!v);setDesktopDirty(false);}
      addLog(commandNames[e.command],'웹 가상 창에만 적용','손 인식',e);return;
    }
    const hit = stage.current?.querySelector(`[data-action="${e.command}"]`);
    if (!inside(hit ?? null, e)) { addLog(commandNames[e.command], '대상 밖 · 해당 타일에 커서를 올려주세요', '손 인식', e); return; }
    setCounts(v => ({ ...v, [e.command]: v[e.command as 'click' | 'double' | 'right']+1 }));
    if (e.command === 'right') setContext(true);
    addLog(commandNames[e.command], '성공', '손 인식', e);
  };
  function updateSettings(next: Settings) {
    const error = validateSettings(next); if (error) { setWarning(error); return; }
    stop(); setSettings(next); engine.current!.settings = structuredClone(next); setWarning('');
    try { localStorage.setItem(STORAGE, JSON.stringify(next)); setNotice('설정을 저장했어요. 제어 시작을 다시 눌러주세요.'); }
    catch { setWarning('설정은 적용했지만 브라우저 저장 공간에 저장하지 못했어요.'); }
  }
  // 화면을 바꿀 때 제어를 해제하고 새 화면의 첫 안내부터 보여줍니다.
  function openNav(n: string) { stop();navRef.current=n; setNav(n); setContext(false); window.scrollTo({ top: 0, behavior: 'instant' }); }
  function resetTests() { stop(); setCounts({ click:0,double:0,right:0,drop:0,manual:0 }); setCard({ x:.13,y:.37 }); setScale(1); setMinimized(false); setFinished(false); setContext(false); setNotice('테스트 결과를 초기화했어요.'); }
  const running = view.active, menu = view.phase==='menu';
  const live = vision.status === 'ready', ready = live && running && view.tracking && selectedHandVisible && !['release','resume','lost'].includes(view.phase);
  /** 첫 연결과 재개가 같은 버튼에서 이어지도록 다음 행동을 한 곳으로 모읍니다. */
  function primaryAction() {
    if (running||view.listening) { stop(); setNotice('제어를 멈췄어요. 시작 버튼으로 다시 시작할 수 있어요.'); }
    else if (!live) { void vision.connect(); }
    else { setFocusMode(true); window.scrollTo({top:0,behavior:'instant'}); engine.current!.start(); setView({ ...engine.current!.state }); setNotice('선택한 손바닥을 3초 유지하면 제어가 시작돼요.'); }
  }
  const loading = vision.status === 'loading';
  const primaryLabel = running||view.listening ? '즉시 제어 중지' : loading ? '연결하는 중…' : !live ? (vision.status === 'error' ? '다시 연결하기' : '카메라 연결하기') : '시작 제스처 감지 켜기';
  const nextHint = !live ? '먼저 카메라를 연결해주세요.' : !selectedHandVisible ? `${settings.side === 'Right' ? '오른손' : '왼손'} 전체가 카메라 안에 보이게 해주세요.` : !running ? (view.listening?'선택한 손바닥을 3초 유지하세요.':'시작 제스처 감지를 켜고 손바닥을 3초 유지하세요.') : test === 'click' ? '타일 위로 이동 → 주먹 → 검지 유지 → 손 전체를 메뉴 방향으로 조금 이동' : test === 'drag' ? '카드 위로 이동 → 엄지·검지 집기 → 옮긴 뒤 벌려 놓기' : test==='scroll'?'붙인 두 손가락을 아래로 유지 → 아래로 / 위로 유지 → 위로 / 수평 → 정지': '두 손바닥을 잠시 보여주고, 벌리거나 위아래로 움직여보세요.';
  return <div className={`app ${ready ? 'input-ready' : ''} ${focusMode && nav==='lab' ? 'focus-mode' : ''}`}>
    <header className="topbar">
      <a className="brand" href="#" onClick={e=>{e.preventDefault();openNav('lab');}} aria-label="까딱 홈"><span className="brand-mark"><HandIcon size={26} strokeWidth={2.2}/><i/></span><span>까딱<b>KKADDAK</b></span></a>
      <nav className="main-nav" aria-label="메인 메뉴">{[['lab','실험실',MousePointer2],['guide','사용 가이드',BookOpen],['settings','내 설정',SlidersHorizontal],['logs','실행 기록',List]].map(([id,label,Icon])=><button key={String(id)} className={nav===id?'active':''} onClick={()=>openNav(String(id))}><Icon size={17}/><span>{String(label)}</span>{id==='logs'&&logs.length>0&&<b className="nav-count">{logs.length}</b>}</button>)}</nav>
      <div className="topbar-status">{nav==='lab'&&<button className={`focus-toggle ${focusMode?'on':''}`} aria-pressed={focusMode} onClick={()=>{setFocusMode(v=>!v);window.scrollTo({top:0,behavior:'instant'});}}><Maximize2 size={16}/><span>{focusMode?'전체 안내':'집중 모드'}</span></button>}<span className={`connection ${live?'connected':''}`}><i/>{live?'카메라 켜짐':loading?'연결 중':'카메라 꺼짐'}</span>{(live||loading)&&<button className="icon-button camera-off" onClick={()=>{vision.disconnect();setSelectedHandVisible(false);}} aria-label="카메라 끄기"><VideoOff size={18}/></button>}<button className="icon-button help-button" aria-label="도움말" onClick={()=>{stop();setHelp(true);}}><CircleHelp size={20}/></button></div>
    </header>
    <main>
      <section className="hero">
        <div className="hero-copy"><div className="eyebrow"><span className="tiny-star">✳</span> YOUR HANDS. YOUR CONTROL.</div><h1>{nav==='lab'?<>마우스 대신,<br/><span>가볍게 까딱.</span></>:nav==='guide'?<>보고 따라 하면,<br/><span>어느새 익숙하게.</span></>:nav==='settings'?<>내 손의 리듬에<br/><span>딱 맞게.</span></>:<>움직임은 작게,<br/><span>기록은 확실하게.</span></>}</h1><p>{nav==='lab'?'손을 펴고, 가리키고, 집어보세요.\n카메라 하나로 시작하는 새로운 조작 방식.':nav==='guide'?'손 모양부터 움직임까지.\n테스트에 필요한 동작만 쉽게 정리했어요.':nav==='settings'?'반응 속도부터 자주 쓰는 동작까지.\n편한 쪽으로 조절하고, 바로 시험해보세요.':'어떤 동작이 어떻게 실행됐는지,\n직접 확인하고 다음 테스트에 활용하세요.'}</p></div>
        {nav==='lab'?<div className="hero-aside"><span className="version-tag">WEB LAB <b>03</b></span><div className="hero-hand" aria-hidden="true"><HandIcon size={86} strokeWidth={1.6}/><span className="orb orb-one"/><span className="orb orb-two"/><MousePointer2 className="hero-cursor" size={38} fill="#252344"/><span className="hand-label-art">까딱!</span></div><button className="guide-link" onClick={()=>{stop();setHelp(true);}}>처음이라면 사용법부터 <ArrowUpRight size={17}/></button></div>:<div className="page-symbol" aria-hidden="true">{nav==='guide'?<BookOpen size={69} strokeWidth={1.3}/>:nav==='settings'?<SlidersHorizontal size={69} strokeWidth={1.3}/>:<List size={69} strokeWidth={1.3}/>}</div>}
      </section>
      <div className="lab-shell" hidden={nav!=='lab'}>
        <section className="setup-steps" aria-label="시작 순서">
          {[{n:'01',title:'카메라 연결',sub:live?'연결 완료 · 영상은 내 기기에만':loading?'모델과 카메라를 준비하는 중':'내 손을 볼 준비',done:live,current:!live},{n:'02',title:'손 확인',sub:live&&selectedHandVisible?`${settings.side==='Right'?'오른손':'왼손'} 확인 완료`: '왼손·오른손을 고르고 손을 보여주세요',done:live&&selectedHandVisible,current:live&&!selectedHandVisible},{n:'03',title:'조작 테스트',sub:running?'지금 손으로 제어하고 있어요':'선택한 손바닥을 3초 유지해요',done:running,current:live&&selectedHandVisible}].map((s,i)=><div className={`setup-step ${s.done?'done':''} ${s.current?'current':''}`} key={s.n}><span className="step-dot">{s.done?<Check size={18}/>:s.n}</span><div><b>{s.title}</b><p>{s.sub}</p></div>{i<2&&<ChevronRight className="step-arrow" size={20}/>}</div>)}
        </section>
        <section className={`control-bar ${running?'is-running':''}`}>
          <div className="control-state"><span className="control-indicator"><MousePointer2 size={21}/></span><div><span className="field-eyebrow">{view.listening?'현재 모드':'다음 단계'}</span><b role="status">{view.listening?view.mode:nextHint}</b>{view.listening&&<div className="control-progress"><progress value={view.progress} max="1"/><small>{view.phase==='start'||view.phase==='release'?'3초 유지 · ':'메뉴/동작 시험 · '}{Math.round(view.progress*100)}%</small></div>}</div></div>
          <div className="control-actions"><div className="hand-select" aria-label="제어 손 선택"><button aria-pressed={settings.side==='Left'} className={settings.side==='Left'?'selected':''} onClick={()=>updateSettings({...settings,side:'Left'})}>왼손</button><button aria-pressed={settings.side==='Right'} className={settings.side==='Right'?'selected':''} onClick={()=>updateSettings({...settings,side:'Right'})}>오른손</button></div><button className={`button ${running?'danger':'primary'} main-action`} disabled={loading} onClick={primaryAction}>{running?<Square size={16}/>:!live?<Camera size={18}/>:<Play size={17} fill="currentColor"/>}{primaryLabel}</button></div>
        </section>
        <div className="lab-grid">
          <section className="camera-panel panel">
            <div className="panel-header"><h2><Camera size={18}/> 카메라</h2><span className="panel-meta">{live?'LIVE':'PREVIEW'}</span></div>
            <div className={`camera-frame ${live?'live':''}`}><video ref={vision.video} autoPlay muted playsInline/><canvas ref={vision.canvas}/>{!live&&<div className="camera-placeholder"><div className="scan-hand"><HandIcon size={69} strokeWidth={1.1}/><span className="scan-corner tl"/><span className="scan-corner tr"/><span className="scan-corner bl"/><span className="scan-corner br"/><i className="scan-dot"/></div><b>{loading?'손을 만날 준비 중…':'카메라에 손을 보여주세요'}</b><p>{loading?'모델을 불러오고 있어요. 잠시만 기다려주세요.':'손 전체가 보이는 밝은 곳에서 시작하면 좋아요.'}</p><button className="camera-connect" disabled={loading} onClick={vision.connect}><Camera size={16}/>{loading?'연결하는 중…':vision.status==='error'?'다시 연결':'카메라 연결'}</button></div>}{live&&<><span className="live-chip"><i/> LIVE</span><span className="hand-chip">{settings.side==='Right'?'오른손':'왼손'} 모드</span></>}</div>
            {vision.error&&<div className="error-box" role="alert"><b>연결을 확인해주세요</b><p>{vision.error}</p><button onClick={vision.connect}>다시 시도 <ArrowRight size={14}/></button></div>}
            <div className="camera-info"><div><span className={`detection-dot ${live&&selectedHandVisible?'detected':''}`}/><b>{live&&selectedHandVisible?'선택한 손을 찾았어요':live?'선택한 손을 찾고 있어요':'아직 연결되지 않았어요'}</b></div><span>{live?POSE_NAMES[view.pose]:'연결 대기'}</span></div>
            <div className="hand-diagnostics">선택: {settings.side==='Right'?'오른손':'왼손'} · 감지: {live?(observation.hands.filter(h=>h.score>=.6).map(h=>h.side==='Right'?'오른손':'왼손').join(', ')||'없음'):'카메라 대기'}</div><div className="privacy-note"><ShieldCheck size={17}/><span>카메라 영상은 <b>내 기기 안에서만</b> 처리돼요.</span></div>
            <details className="technical"><summary>인식 상태 자세히 보기 <ChevronDown size={14}/></summary><div className="metric-row"><span>유효 추론<b>{live?vision.stats.fps:'—'} <small>FPS</small></b></span><span>최근 추론 시간<b>{live?vision.stats.inference:'—'} <small>ms</small></b></span><span>처리 방식<b>{live?vision.backend:'대기'}</b></span></div><p>좌우가 반대로 잡히면 내 설정에서 ‘좌우 판정 반전’을 바꿔주세요.</p></details>
          </section>
          <section className="test-panel panel">
            <div className="panel-header"><h2><Crosshair size={18}/> 테스트 플레이그라운드</h2><button className="text-button" onClick={resetTests}><RotateCcw size={14}/> 결과 초기화</button></div>
            <div className="test-tabs" role="tablist" aria-label="테스트 종류">{[['click','클릭',MousePointer2],['drag','드래그',Move],['scroll','스크롤',ArrowDown],['motion','양손 행동',Maximize2]].map(([id,label,Icon])=><button key={String(id)} role="tab" id={`tab-${id}`} aria-controls="test-stage" aria-selected={test===id} className={test===id?'active':''} onClick={()=>{stop();setTest(String(id));setContext(false);}}><Icon size={16}/>{String(label)}</button>)}</div>
            <div className="test-intro"><div><span className="field-eyebrow">{test==='click'?'POINT & SELECT':test==='drag'?'PINCH & DROP':test==='scroll'?'POINT & HOLD TO SCROLL':'TWO HANDS'}</span><h3>{test==='click'?'원하는 타일을 골라보세요':test==='drag'?'카드를 집어서 옮겨보세요':test==='scroll'?'손끝 방향을 유지해 스크롤해요':'두 손으로 화면을 바꿔보세요'}</h3></div><span className="test-index">{test==='click'?'01':test==='drag'?'02':test==='scroll'?'03':'04'} <small>/ 04</small></span></div>
            <div className={`stage stage-${test}`} ref={stage} id="test-stage" role="tabpanel" aria-labelledby={`tab-${test}`} onContextMenu={e=>e.preventDefault()}>
              <div className="stage-grid"/>
              {test==='click'?<><div className="target-tiles">{[['click','일반 클릭','손을 위로 이동','↑',MousePointer2],['double','더블클릭','손을 오른쪽으로 이동','→',MousePointer2],['right','우클릭','손을 왼쪽으로 이동','←',List]].map(([id,label,sub,arrow,Icon])=><button key={String(id)} data-action={id} className={`target-tile target-${id}`} onClick={()=>{setCounts(v=>({...v,manual:v.manual+1}));addLog(String(label),'직접 조작 · 손 인식 횟수와 분리','직접 조작');if(id==='right')setContext(true);}}><span className="target-topline"><span>{String(arrow)}</span><span>{counts[id as 'click'|'double'|'right']}회</span></span><span className="target-icon"><Icon size={34} strokeWidth={1.6}/>{id==='double'&&<i>2</i>}</span><b>{String(label)}</b><small>{String(sub)}</small></button>)}</div><div className="click-instruction"><span className="instruction-number">TIP</span><p>커서를 타일에 올리고 <b>주먹 → 검지만 펴고 유지.</b><br/>메뉴가 열리면 검지를 편 채 손 전체를 위·좌·우로 조금 옮겨 유지해요. 클릭할 커서는 고정돼요.</p></div></>:test==='drag'?<><div className="drag-track" aria-hidden="true"><span/> <ArrowRight size={22}/> <span/></div><div className={`drop-zone ${finished?'complete':''}`} ref={zone}>{finished?<CheckCircle2 size={39} strokeWidth={1.4}/>:<Grip size={39} strokeWidth={1.4}/>}<b>{finished?'딱, 잘 놓았어요!':'이곳에 놓아주세요'}</b><span>{finished?'목표 영역에 카드 놓기 성공':'손가락을 벌리면 카드가 놓여요'}</span></div><div className={`drag-card ${dragging?'dragging':''}`} ref={dragElement} style={{left:`${card.x*100}%`,top:`${card.y*100}%`}} onPointerDown={e=>{if(running)return;const r=stage.current!.getBoundingClientRect();const p={x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};if(beginDrag(p,'직접 조작'))e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(dragRef.current?.source!=='직접 조작')return;const r=stage.current!.getBoundingClientRect();moveCard({x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height});}} onPointerUp={()=>{if(dragRef.current?.source==='직접 조작')addLog('카드 놓기',endDrag(),'직접 조작');}} onPointerCancel={()=>endDrag(true)}><div className="drag-card-header"><span>MOVE ME</span><Grip size={15}/></div><div className="file-art"><FileText size={32} strokeWidth={1.4}/></div><b>나를 옮겨봐요</b><span>집고, 옮기고, 놓기</span></div><div className="drag-instruction"><span>🤏 <b>집기</b></span><ArrowRight size={15}/><span>↔ <b>옮기기</b></span><ArrowRight size={15}/><span>🖐 <b>놓기</b></span></div></>:test==='scroll'?<div className="scroll-demo"><div className="scroll-instructions scroll-pointing"><span className="scroll-direction-demo"><img className="point-up" src={`${import.meta.env.BASE_URL}gestures/scroll-flat.png`} alt="붙인 두 손가락을 위로 향한 설명용 AI 그림"/><b>↑ 위로 스크롤</b></span><span className="scroll-direction-demo"><img className="point-down" src={`${import.meta.env.BASE_URL}gestures/scroll-flat.png`} alt="붙인 두 손가락을 아래로 향한 설명용 AI 그림"/><b>↓ 아래로 스크롤</b></span><span>방향 유지 → 연속 스크롤<br/>수평·자세 풀기 → 정지<br/>속도 {settings.scrollSpeed}px/s · 설정에서 조절</span></div><div className="scroll-content" ref={scrollArea} tabIndex={0} aria-label="스크롤 연습 문서">{Array.from({length:12},(_,i)=><article key={i}><small>SCROLL LAB · {String(i+1).padStart(2,'0')}</small><h3>{['붙인 두 손가락, 방향만 유지.','아래쪽 내용이 나타났어요.','위·아래 방향과 정지를 시험해보세요.'][i%3]}</h3><p>검지·중지를 붙여 펴고 손끝이 아래를 향하면 아래로, 위를 향하면 위로 계속 스크롤해요. 손을 위아래로 흔들 필요가 없어요. 방향을 바꾸거나 자세를 풀면 기존 입력이 멈춰요. 속도는 기본 설정에서 조절하세요.</p></article>)}</div><small>AI 설명용 그림 회전 표시 · 방향 판정은 실기기 시험 대상</small></div>:<div className="motion-space"><div className={`mock-window ${minimized?'minimized':''}`} style={{transform:`scale(${scale})`}}><div className="window-bar"><i/><i/><i/><span>나만의 작은 창</span><Maximize2 size={12}/></div><div className="window-content"><span className="window-eyebrow">MAKE ROOM FOR PLAY</span><div className="sun-art"><span>✳</span><i/><b/></div><strong>조금 더 크게,<br/>조금 더 자유롭게.</strong></div></div>{minimized&&<button className="restore-window" onClick={()=>{setMinimized(false);setDesktopDirty(true);addLog('외부 창 변경 모사','직접 복원 · 토글 상태 주의','직접 조작');}}><Maximize2 size={22}/>내려둔 창 복원하기</button>}<div className="motion-legend"><span><Maximize2 size={14}/> {Math.round(scale*100)}%</span><span>{minimized?'창 내려짐':'창 열림'}</span></div><div className="desktop-controls"><label><input type="checkbox" checked={settings.desktopCandidate} onChange={e=>updateSettings({...settings,desktopCandidate:e.target.checked})}/> 양손 상하 → Win + D 후보 시험 (기본 꺼짐)</label><button onClick={()=>{setMinimized(v=>!v);setDesktopDirty(true);addLog('외부 창 변경 모사','수동 상태 변경','직접 조작');}}>외부 창 변경 모사</button><p>{desktopDirty?'외부 상태가 바뀌었어요. 다음 토글의 복귀 결과를 보장하지 않아요.':'같은 Win + D를 반복하는 가상 토글 시험이에요.'}</p></div></div>}
              {context&&<div className="context-menu"><b><List size={17}/> 우클릭 메뉴</b><span>메뉴 열기 테스트 성공</span><button onClick={()=>setContext(false)}>메뉴 닫기 <X size={14}/></button></div>}
              {view.listening&&<div className={`virtual-pointer ${dragging?'pinching':''}`} style={{left:`${view.pointer.x*100}%`,top:`${view.pointer.y*100}%`}}><MousePointer2 size={28} fill={dragging?'#ef795d':'#6153e8'}/>{view.progress>0&&<svg className="progress-ring" viewBox="0 0 50 50"><circle cx="25" cy="25" r="21"/><circle cx="25" cy="25" r="21" style={{strokeDasharray:132,strokeDashoffset:132*(1-view.progress)}}/></svg>}</div>}
              {running&&menu&&<div className="radial-menu" style={{left:`${Math.max(20,Math.min(80,view.pointer.x*100))}%`,top:`${Math.max(28,Math.min(72,view.pointer.y*100))}%`}}><div className={`radial-item up ${view.selection==='click'?'chosen':''}`}>클릭 ↑</div><div className={`radial-item right ${view.selection==='double'?'chosen':''}`}>더블클릭 →</div><div className={`radial-item left ${view.selection==='right'?'chosen':''}`}>← 우클릭</div><div className={`radial-item down ${view.selection==='cancel'?'chosen':''}`}>취소 ↓</div><span className="menu-stick-label">{view.menuReady?'유지해서 선택':'손을 조금 이동'}</span><i className="menu-stick" style={{transform:`translate(${view.menuOffset.x*47}px,${view.menuOffset.y*47}px)`}}/></div>}
            </div>
            <div className="shortcut-preview" role="status">{shortcutPreview}</div><div className="test-results"><span><CheckCircle2 size={15}/> 손 인식 성공</span><b>클릭 {counts.click+counts.double+counts.right}<small>회</small></b><b>놓기 {counts.drop}<small>회</small></b><span className="manual-count">직접 조작 {counts.manual}회</span></div>
          </section>
        </div>
        <section className="live-feedback" aria-live="polite"><span className="feedback-icon"><Zap size={18}/></span><div><span>지금 이렇게 해보세요</span><p>{running?nextHint:notice}</p></div><button onClick={()=>openNav('logs')}>실행 기록 <ArrowRight size={15}/></button></section>
        <div className="lab-bottom"><div><span className="prototype-label">WEB TEST</span><p>지금은 <b>이 화면 안에서만</b> 조작해요. 실제 컴퓨터 제어는 설치형에서 연결할 예정이에요.</p></div><button className="text-button" onClick={()=>openNav('guide')}>전체 제스처 알아보기 <ArrowUpRight size={16}/></button></div>
      </div>
      {nav==='guide'&&<section className="guide-page"><div className="section-title"><h2>하나씩 따라 해볼까요?</h2><span className="soft-tag">PDF v2 · AI 설명용 그림 · 실기기 검증 필요</span></div><div className="guide-grid">{guide.map(([n,title,text,emoji])=><article className={`guide-card guide-${n}`} key={n}><div className="guide-card-top"><span>STEP {n}</span><img className={n==='06'?'guide-photo direction-reference':'guide-photo'} src={`${import.meta.env.BASE_URL}gestures/${({'01':'palm','02':'fist','03':'point','04':'point','05':'pinch','06':'scroll-flat','07':'palm'} as Record<string,string>)[n]}.png`} alt={`${title} 설명용 AI 일러스트`}/></div><h3>{title}</h3><p>{text}</p><small>자세 설명용 AI 일러스트 · 검증 데이터 아님</small></article>)}</div><div className="guide-stop"><span className="stop-key">Esc</span><div><b>멈추고 싶을 때는, 언제든.</b><p>제어 중지 버튼 또는 Esc로 멈춰요. 선택 손바닥 3초로 시작, 양손 주먹 3초로 전체 해제해요. 손 모양은 시험 기본안이에요.</p></div></div><div className="page-actions"><p>제스처를 바꿨다면 내 설정의 배정을 확인해주세요.</p><button className="button primary" onClick={()=>openNav('lab')}>직접 시험해보기 <ArrowRight size={17}/></button></div></section>}
      {nav==='settings'&&<section className="settings-page">
        <div className="catalog-notice">기본 조작·시간은 아래에서, 아직 동작이 없는 단축키는 기능 목록에서 확인해요. 기능 설정 중에는 실제 명령을 실행하지 않아요.</div>
        <details className="basic-settings panel"><summary>기본 조작 설정 · 손 선택 / 반응 / 메뉴 / 스크롤</summary><div className="basic-settings-grid">
          <label>제어 손<select value={settings.side} onChange={e=>updateSettings({...settings,side:e.target.value as Hand['side']})}><option value="Right">오른손</option><option value="Left">왼손</option></select></label>
          <label>커서 반응 {settings.smoothing.toFixed(2)}<input aria-label="커서 반응" type="range" min="0.1" max="0.85" step="0.01" value={settings.smoothing} onChange={e=>updateSettings({...settings,smoothing:+e.target.value})}/></label>
          <label>이동 범위 배율 {settings.sensitivity.toFixed(2)}×<input aria-label="이동 범위 배율" type="range" min="0.8" max="2" step="0.05" value={settings.sensitivity} onChange={e=>updateSettings({...settings,sensitivity:+e.target.value})}/></label>
          <label>메뉴 진입 유지 시간<select aria-label="메뉴 진입 유지 시간" value={settings.menuHold} onChange={e=>updateSettings({...settings,menuHold:+e.target.value})}>{[250,350,500,700,1000,1400].map(n=><option key={n} value={n}>{n}ms · 시험값</option>)}</select></label>
          <label>메뉴 항목 유지 시간<select aria-label="메뉴 항목 유지 시간" value={settings.selectHold} onChange={e=>updateSettings({...settings,selectHold:+e.target.value})}>{[300,450,650].map(n=><option key={n} value={n}>{n}ms · 시험값</option>)}</select></label>
          <label>스크롤 속도 · {settings.scrollSpeed===400?'보통':settings.scrollSpeed<400?'느리게':'빠르게'} ({settings.scrollSpeed}px/s)<input aria-label="스크롤 속도" type="range" min="100" max="1200" step="50" value={settings.scrollSpeed} onChange={e=>updateSettings({...settings,scrollSpeed:+e.target.value})}/><small>느리게 100 ← 기본 400 → 빠르게 1200</small></label>
          <label className="check-setting"><input type="checkbox" checked={settings.flipLabels} onChange={e=>updateSettings({...settings,flipLabels:e.target.checked})}/> 좌우 손 판정 반전</label>
          <label className="check-setting"><input type="checkbox" checked={settings.motion} onChange={e=>updateSettings({...settings,motion:e.target.checked})}/> 양손 확대·축소 시험</label>
        </div><p>시작·해제 유지 시간은 각각 3초 고정. 메뉴 시간과 별개예요. 기본 조작은 이동·취소·해제 경로를 보호하기 위해 고정하고, 추가 동작은 아래에서 연결해요.</p><div className="settings-buttons"><button className="button secondary" onClick={()=>updateSettings(structuredClone(DEFAULTS))}>기본 조작 설정 복원</button><button className="button primary" onClick={()=>saveFile('kkaddak-settings-v4.json',JSON.stringify({schema:4,settings,bindings:extras},null,2))}>설정 내보내기</button><label className="button secondary">설정 가져오기<input type="file" accept="application/json,.json" onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{if(f.size>100000)throw Error();const d=JSON.parse(await f.text());const imported=migrateScrollSettings(d.settings);if(![3,4].includes(d.schema)||!imported)throw Error();const parsed=readBindings(d.bindings);if(!Array.isArray(d.bindings)||parsed.length!==d.bindings.length)throw Error();stop();localStorage.setItem('kkaddak.extra-bindings.v1',JSON.stringify(parsed));updateSettings(imported);setExtras(parsed);}catch{setWarning('올바른 설정 파일이 아니거나 충돌하는 연결이 있어요.');}e.target.value='';}}/></label></div>{warning&&<div role="alert" className="error-box">{warning}</div>}</details>
        <FunctionSettings bindings={extras} onChange={setExtras} observation={observation} live={live} connect={()=>void vision.connect()} practiceAllowed={nav==='settings'}/>
      </section>}
      {nav==='logs'&&<section className="panel logs-panel"><div className="panel-header"><h2>이번 세션의 기록 <span className="count-badge">{logs.length}</span></h2><div className="log-actions"><button className="text-button" onClick={()=>setLogs([])} disabled={!logs.length}>비우기</button><button className="button secondary" disabled={!logs.length} onClick={()=>{const csv=['시간,동작,결과,입력 출처',...logs.map(l=>[l.time,l.action,l.result,l.source].map(x=>'"'+x.replaceAll('"','""')+'"').join(','))].join('\n');saveFile('kkaddak-session.csv','\uFEFF'+csv,'text/csv;charset=utf-8');}}>CSV</button><button className="button primary" disabled={!logs.length} onClick={()=>saveFile('kkaddak-session.json',JSON.stringify({app:'KKADDAK 0.3.3',exportedAt:new Date().toISOString(),userAgent:navigator.userAgent,settings,camera:vision.stats,counts,logs},null,2))}><Download size={15}/> JSON 내보내기</button></div></div>{!logs.length?<div className="empty-state"><span><List size={38} strokeWidth={1.4}/></span><h3>첫 움직임을 기다리고 있어요</h3><p>테스트에서 명령을 실행하면 이곳에 남아요.<br/>손 인식과 직접 조작은 따로 구분해요.</p><button className="button primary" onClick={()=>openNav('lab')}>테스트 시작하러 가기 <ArrowRight size={16}/></button></div>:<div className="log-table-wrap"><table><thead><tr><th>실행 시간</th><th>명령</th><th>결과</th><th>입력 방식</th></tr></thead><tbody>{logs.map((l,i)=><tr key={i}><td>{new Date(l.time).toLocaleTimeString('ko-KR')}</td><td><b>{l.action}</b></td><td>{l.result}</td><td><span className={`source-tag ${l.source==='손 인식'?'hand-source':''}`}>{l.source}</span></td></tr>)}</tbody></table></div>}<div className="log-footnote"><ShieldCheck size={15}/> 영상은 저장하지 않아요. 기록은 이번 탭에 최대 200개까지 남고, 새로고침하면 사라져요.</div></section>}
      <footer><span className="footer-brand">까딱 <b>KKADDAK</b><i>작은 움직임, 새로운 입력.</i></span><span>WEB LAB v0.3.3 <span className="footer-dot">·</span> 내 기기에서만 인식</span></footer>
    </main>
    {warning&&nav!=='settings'&&<div className="toast" role="alert">{warning}<button onClick={()=>setWarning('')} aria-label="경고 닫기"><X size={16}/></button></div>}
    {help&&<div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)setHelp(false);}}><section className="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title"><button className="icon-button modal-close" onClick={()=>setHelp(false)} aria-label="도움말 닫기"><X size={21}/></button><span className="modal-tag">LET'S GET STARTED</span><h2 id="help-title">처음이라면,<br/>이렇게 시작해요.</h2><div className="help-steps"><div><span>1</span><p><b>연결하고</b>카메라 연결을 누르고 권한을 허용해요.</p></div><div><span>2</span><p><b>손을 보여주고</b>왼손·오른손을 고른 뒤 손 전체를 보여줘요.</p></div><div><span>3</span><p><b>시작하고</b>선택한 손바닥을 3초 유지해 시작해요.</p></div><div><span>4</span><p><b>가볍게 까딱</b>클릭·드래그·방향 스크롤·양손 행동을 시험해요.</p></div></div><div className="help-hint"><span>Esc</span> 언제든 제어를 중지할 수 있어요.</div><button className="button primary" onClick={()=>{setHelp(false);openNav('guide');}}>제스처를 먼저 볼게요 <ArrowRight size={17}/></button><button className="modal-skip" onClick={()=>setHelp(false)}>바로 시작할게요</button></section></div>}
  </div>;
}
