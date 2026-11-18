import { cp, mkdir, access, readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const dir = new URL('../public/mediapipe/', import.meta.url);
// 모델과 WASM을 앱과 같은 출처에서 제공합니다. 카메라 영상은 외부로 전송하지 않습니다.
await mkdir(dir, { recursive: true });
await cp(new URL('../node_modules/@mediapipe/tasks-vision/wasm', import.meta.url), new URL('wasm', dir), { recursive: true });
const target = new URL('hand_landmarker.task', dir);
try { await access(target); if ((await stat(target)).size < 1000000) throw Error('incomplete model'); }
catch {
  const url = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
  console.log('공식 MediaPipe 손 모델을 다운로드합니다.');
  const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw Error(`모델 다운로드 실패: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 1000000) throw Error('모델 파일이 너무 작습니다. 다운로드를 다시 시도하세요.');
  await writeFile(target, bytes);
}
const hash = createHash('sha256').update(await readFile(target)).digest('hex');
await writeFile(new URL('model-info.json', dir), JSON.stringify({ source: 'Google MediaPipe hand_landmarker/float16/1', sha256: hash, package: '0.10.32' }, null, 2));
console.log('로컬 모델·WASM 준비 완료');
