import type { ExtraBinding, Hand } from './controller';
/** 단축키 카탈로그는 설명 데이터입니다. 키 입력 코드나 OS 실행 코드를 포함하지 않습니다. */
export type FunctionDef={id:string;name:string;shortcut:string;target:string;condition:string;group:string;status:'available'|'basic'|'held'};
const rows:Record<string,string[] >={
 '기본 조작':[
 'pointer|커서 이동|포인터 이동|웹 가상 커서|선택한 손바닥',
 'stop|커서 정지|포인터 고정|웹 가상 커서|선택한 손 주먹',
 'click|일반 클릭|왼쪽 클릭|웹 버튼|클릭 메뉴에서 선택',
 'double|더블클릭|왼쪽 더블클릭|웹 버튼|클릭 메뉴에서 선택',
 'right|우클릭|오른쪽 클릭|웹 메뉴|클릭 메뉴에서 선택',
 'drag|드래그|누름·이동·놓기|웹 물체|엄지·검지 집기 / 벌리기',
 'scroll|스크롤|세로 휠|웹 스크롤 영역|검지·중지 붙여 펴기 / 손끝 아래=아래 스크롤, 위=위 스크롤'],
 'Windows·창':[
 'desktop|바탕화면 표시·복귀|Win + D|Windows|같은 키의 토글. 외부 창 변경 후 복귀 보장 안 됨',
 'switch|창 전환|Alt + Tab|Windows|열린 앱 필요',
 'taskview|열린 창 전체 보기|Win + Tab|Windows 작업 보기|열린 창·데스크톱',
 'maximize|창 최대화|Win + ↑|활성 창|최대화 가능한 창',
 'snap-left|창 왼쪽 배치|Win + ←|활성 창|스냅 지원',
 'snap-right|창 오른쪽 배치|Win + →|활성 창|스냅 지원',
 'home|현재 창만 남기기·복귀|Win + Home|활성 창 외 최소화|토글 / 외부 상태 변경 주의',
 'monitor-left|왼쪽 모니터로 창 이동|Win + Shift + ←|Windows|다중 모니터',
 'monitor-right|오른쪽 모니터로 창 이동|Win + Shift + →|Windows|다중 모니터',
 'desktop-prev|이전 가상 데스크톱|Win + Ctrl + ←|Windows|기존 가상 데스크톱',
 'desktop-next|다음 가상 데스크톱|Win + Ctrl + →|Windows|기존 가상 데스크톱',
 'pinned|고정 앱 실행·전환|Win + 숫자|작업표시줄|고정 앱 순서 기준 / 숫자는 설치형에서 지정',
 'new-window|같은 앱 새 창|Shift + 작업표시줄 클릭|작업표시줄|앱의 다중 실행 지원',
 'close-window|현재 창 닫기|Alt + F4|활성 창|저장 확인창은 사용자가 처리',
 'peek|바탕화면 잠깐 보기|Win + , 유지|Windows|놓으면 복귀 / Win + D와 별개',
 'capture|화면 캡처|Win + Shift + S|Windows|영역 선택 화면 열기',
 'display|화면 복제·확장 선택|Win + P|Windows|디스플레이 모드 선택',
 'cast|무선 화면 연결|Win + K|Windows|지원 디스플레이 필요',
 'explorer|파일 탐색기 열기|Win + E|Windows|파일 탐색기',
 'lock|화면 잠금|Win + L|Windows|복귀 시 인증 필요',
 'emoji|이모지 선택창|Win + .|입력 중인 앱|입력 위치·앱에 따라 다름'],
 '브라우저':[
 'back|뒤로|Alt + ←|Chrome|이전 방문 기록',
 'forward|앞으로|Alt + →|Chrome|다음 방문 기록',
 'tab-next|다음 탭|Ctrl + Tab|Chrome|열린 탭',
 'tab-prev|이전 탭|Ctrl + Shift + Tab|Chrome|열린 탭',
 'close-tab|현재 탭 닫기|Ctrl + W|Chrome|마지막 탭이면 창 닫힘 가능',
 'restore-tab|닫은 탭 복원|Ctrl + Shift + T|Chrome|복원 가능한 기록',
 'middle-link|링크 새 탭으로 열기|링크 위 휠 클릭|Chrome|링크 위 포인터 / 중간 버튼',
 'new-tab|새 탭 열기|Ctrl + T|Chrome|브라우저 포커스',
 'reload|새로고침|Ctrl + R|Chrome|입력 내용이 사라질 수 있음',
 'find|페이지 내 찾기|Ctrl + F|Chrome|페이지 포커스',
 'find-next|다음 검색 결과|Ctrl + G|Chrome 찾기|찾기 실행 중',
 'find-prev|이전 검색 결과|Ctrl + Shift + G|Chrome 찾기|찾기 실행 중',
 'page-start|페이지 처음|Ctrl + Home|Chrome|본문 포커스',
 'page-end|페이지 끝|Ctrl + End|Chrome|본문 포커스',
 'page-up|한 화면 위|Page Up|Chrome|본문 포커스',
 'page-down|한 화면 아래|Page Down|Chrome|본문 포커스',
 'horizontal|가로 스크롤|Shift + 휠|스크롤 영역|가로 스크롤 가능한 영역',
 'zoom-in|확대|Ctrl + +|Chrome|브라우저 배율 / 양손 매핑 미정',
 'zoom-out|축소|Ctrl + -|Chrome|브라우저 배율 / 양손 매핑 미정',
 'zoom-reset|배율 초기화|Ctrl + 0|Chrome|기본 배율로 복귀',
 'downloads|다운로드 목록|Ctrl + J|Chrome|브라우저 포커스',
 'bookmark|현재 페이지 북마크|Ctrl + D|Chrome|현재 페이지',
 'bookmark-all|모든 탭 북마크 저장|Ctrl + Shift + D|Chrome|폴더에 저장 / 모든 탭 종료 아님',
 'detach-tab|탭을 별도 창으로 분리|탭을 창 밖으로 드래그|Chrome|브라우저 탭 영역'],
 '편집·파일':[
 'copy|복사|Ctrl + C|텍스트·파일|선택한 대상',
 'cut|잘라내기|Ctrl + X|편집 가능한 대상|선택한 대상',
 'paste|붙여넣기|Ctrl + V|편집 가능한 대상|클립보드·대상 지원',
 'undo|실행 취소|Ctrl + Z|편집 앱|앱·작업 지원 확인',
 'redo|다시 실행|Ctrl + Y|편집 앱|앱별 단축키 차이 있음',
 'select-all|전체 선택|Ctrl + A|현재 영역|포커스 위치에 따라 다름',
 'select-one|여러 항목 개별 선택|Ctrl + 클릭|파일 탐색기|선택 항목',
 'select-range|범위 선택|Shift + 클릭|파일 탐색기|시작·끝 항목',
 'preview|파일 미리보기|Alt + P|파일 탐색기|형식·미리보기 지원',
 'drag-copy|복제하며 드래그|Ctrl + 파일 드래그|파일 탐색기|놓을 때 복사 / 완료·상실 시 보조키 해제',
 'drag-move|이동하며 드래그|Shift + 파일 드래그|파일 탐색기|놓을 때 이동 / 완료·상실 시 보조키 해제',
 'drag-link|바로가기 만들기|Alt + 파일 드래그|파일 탐색기|원본 바로가기 / 완료·상실 시 보조키 해제',
 'icon-size|아이콘 크기 변경|Ctrl + 휠|파일 탐색기|보기 크기',
 'parent|상위 폴더 이동|Alt + ↑|파일 탐색기|상위 폴더 존재',
 'new-folder|새 폴더 만들기|Ctrl + Shift + N|파일 탐색기|쓰기 가능 위치 / Chrome에서는 시크릿 창',
 'rename|이름 변경|F2|파일 탐색기|선택한 파일·폴더'],
 '미디어·접근성':[
 'play|재생·일시정지|Media Play/Pause|플레이어|미디어 세션 지원',
 'volume-up|음량 높이기|Volume Up|Windows|시스템 음량',
 'volume-down|음량 낮추기|Volume Down|Windows|시스템 음량',
 'mute|음소거|Volume Mute|Windows|회의 마이크 음소거와 다름',
 'brightness|화면 밝기 조절|공통 단축키 없음|기기·모니터|설치형 API 별도 검증 필요',
 'record|녹화 시작·종료|Win + Alt + R|Game Bar|지원 앱·게임 / 모든 대상 보장 안 됨',
 'record-mic|녹화 마이크 켜기·끄기|Win + Alt + M|Game Bar|녹화용 마이크',
 'record-last|최근 30초 저장|Win + Alt + G|Game Bar|배경 녹화 설정 필요',
 'clipboard|클립보드 기록|Win + V|Windows|기록 기능 활성화 필요',
 'voice|음성 입력|Win + H|입력창|마이크·인터넷 필요',
 'osk|화상 키보드|Win + Ctrl + O|Windows|화상 키보드',
 'captions|실시간 자막|Win + Ctrl + L|Windows 11|언어 파일 필요 / 모든 언어 번역 아님',
 'magnifier|돋보기 켜기·확대|Win + +|Windows 접근성|돋보기 지원',
 'magnifier-exit|돋보기 종료|Win + Esc|Windows 접근성|돋보기 상태 확인'],
 '보류 후보':['close-all|모든 창·페이지 종료|미정|범위 미정|양손 검지 X 포함 보류 / 기본 배정·실행 금지']
};
export const FUNCTIONS:FunctionDef[]=Object.entries(rows).flatMap(([group,list])=>list.map(row=>{const [id,name,shortcut,target,condition]=row.split('|');return{id,name,shortcut,target,condition,group,status:group==='보류 후보'?'held':group==='기본 조작'?'basic':'available'};}));
export const SPARES=[{id:'victory' as const,name:'검지·중지 V',warning:'방향 스크롤의 붙인 두 손가락과 혼동하는지 비교해야 해요.'},{id:'hook' as const,name:'검지 반쯤 구부리기',warning:'주먹·검지 펴기·집게와 혼동 가능성이 있어요. 주먹에서 검지를 펴는 전환 중에는 기본 메뉴 준비가 우선하며 추가 기능은 실행하지 않아요.'}];
/** 저장 시에도 재검사합니다. 다른 앱 대상이라도 웹에서는 같은 영역이므로 충돌을 허용하지 않습니다. */
export function bindingConflict(next:ExtraBinding,existing:ExtraBinding[]):string|null {
 const f=FUNCTIONS.find(f=>f.id===next.functionId);
 if(!f||f.status!=='available')return '기본 조작 또는 보류 기능에는 추가 연결을 저장할 수 없어요.';
 if(!SPARES.some(g=>g.id===next.gesture)||!['Left','Right'].includes(next.side)||next.scope!=='sandbox'||next.mode!=='active')return '지원하지 않는 제스처·손·실행 조건이에요.';
 const conflict=existing.find(b=>b.functionId!==next.functionId&&b.gesture===next.gesture&&b.side===next.side&&b.scope===next.scope&&b.mode===next.mode);
 return conflict?`기존 기능 ‘${FUNCTIONS.find(f=>f.id===conflict.functionId)?.name??conflict.functionId}’과 충돌: ${next.side==='Right'?'오른손':'왼손'} / 웹 연습 영역 / 제어 실행 중 / ${SPARES.find(g=>g.id===next.gesture)?.name}. 저장하지 않았어요.`:null;
}
/** 로컬 데이터도 신뢰하지 않고 형식·충돌·기능 존재 여부를 검사합니다. */
export function readBindings(raw:unknown):ExtraBinding[]{if(!Array.isArray(raw))return[];const valid:ExtraBinding[]=[];for(const b of raw){if(b&&typeof b==='object'&&!bindingConflict(b,valid)&&!valid.some(v=>v.functionId===b.functionId))valid.push(b);}return valid;}
