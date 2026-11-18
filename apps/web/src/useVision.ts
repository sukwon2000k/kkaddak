import { useCallback, useEffect, useRef, useState } from 'react';
import type { HandLandmarker } from '@mediapipe/tasks-vision';
import type { Hand } from '../../../packages/core/src/controller';
const LINKS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
type Status = 'off' | 'loading' | 'ready' | 'error';
/** 카메라 수명·추론을 관리합니다. 기본은 Worker, 그래픽 제약이 있으면 호환 모드로 전환합니다. */
export function useVision(onHands: (hands: Hand[], at: number) => void, onStop: () => void) {
  const video = useRef<HTMLVideoElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const callback = useRef(onHands), stopCallback = useRef(onStop);
  callback.current = onHands; stopCallback.current = onStop;
  const generation = useRef(0), worker = useRef<Worker | null>(null), stream = useRef<MediaStream | null>(null), raf = useRef(0), mainModel = useRef<HandLandmarker | null>(null);
  const [status, setStatus] = useState<Status>('off'), [error, setError] = useState(''), [backend, setBackend] = useState('Worker');
  const [stats, setStats] = useState({ fps: 0, inference: 0, samples: 0 });
  const disconnect = useCallback(() => {
    generation.current++; cancelAnimationFrame(raf.current); worker.current?.terminate(); worker.current = null;
    mainModel.current?.close(); mainModel.current = null;
    stream.current?.getTracks().forEach(t => { t.onended = null; t.stop(); }); stream.current = null;
    if (video.current) video.current.srcObject = null;
    const c = canvas.current; if (c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
    setStatus('off'); setStats({ fps: 0, inference: 0, samples: 0 }); stopCallback.current();
  }, []);
  const connect = useCallback(async () => {
    disconnect(); const id = generation.current; setStatus('loading'); setError(''); setBackend('Worker');
    let local: MediaStream | null = null;
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw Error('카메라는 localhost 또는 HTTPS 주소에서 사용할 수 있어요.');
      local = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false });
      if (generation.current !== id) { local.getTracks().forEach(t => t.stop()); return; }
      stream.current = local;
      if (!video.current) throw Error('카메라 화면을 준비하지 못했어요.');
      video.current.srcObject = local; await video.current.play();
      if (generation.current !== id) return;
      const base = new URL(import.meta.env.BASE_URL, location.href), wasm = new URL('mediapipe/wasm', base).href, modelUrl = new URL('mediapipe/hand_landmarker.task', base).href;
      const w = new Worker(new URL('mediapipe/vision-worker.js', base)); worker.current = w;
      let busy = false, lastFrame = -1, lastVideoTime = -1, counter = 0, windowAt = performance.now(), samples = 0, usingMain = false, fallbackStarted = false;
      /** 실제 결과만 코어·오버레이·통계로 전달합니다. 직접 조작 결과와 섞지 않습니다. */
      function accept(data: { hands: Hand[]; at: number; duration: number }) {
        if (generation.current !== id) return;
        busy = false; samples++; counter++;
        callback.current(data.hands, data.at);
        const c = canvas.current, v = video.current;
        if (c && v) {
          c.width = 640; c.height = Math.round(640 * v.videoHeight / v.videoWidth);
          const ctx = c.getContext('2d');
          if (ctx) for (const hand of data.hands) {
            const color = hand.side === 'Right' ? '#7de4b1' : '#93b8ff'; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 3;
            for (const [a,b] of LINKS) { const p = hand.points[a], q = hand.points[b]; ctx.beginPath(); ctx.moveTo(p.x*c.width,p.y*c.height); ctx.lineTo(q.x*c.width,q.y*c.height); ctx.stroke(); }
            for (const p of hand.points) { ctx.beginPath(); ctx.arc(p.x*c.width,p.y*c.height,4,0,Math.PI*2); ctx.fill(); }
          }
        }
        const now = performance.now();
        if (now-windowAt > 650) { setStats({ fps: Math.round(counter*1000/(now-windowAt)), inference: Math.round(data.duration), samples }); counter = 0; windowAt = now; }
      }
      const fail = (message: string) => {
        if (generation.current !== id) return;
        disconnect(); setStatus('error'); setError(message);
      };
      const loop = async (at: number) => {
        if (generation.current !== id) return;
        raf.current = requestAnimationFrame(loop);
        const v = video.current;
        if (!v || v.readyState < 2 || busy || at-lastFrame < (usingMain?70:42) || v.currentTime===lastVideoTime) return;
        busy = true; lastFrame = at; lastVideoTime = v.currentTime;
        try {
          if (usingMain && mainModel.current) {
            const start = performance.now(), r = mainModel.current.detectForVideo(v, at);
            accept({ at, duration: performance.now()-start, hands: r.landmarks.map((points,i)=>({ points, side: r.handedness[i][0].categoryName as Hand['side'], score:r.handedness[i][0].score })) });
          } else {
            const frame = await createImageBitmap(v, { resizeWidth: 640, resizeHeight: Math.round(640*v.videoHeight/v.videoWidth) });
            if (generation.current !== id) { frame.close(); return; }
            w.postMessage({ type: 'frame', frame, at }, [frame]);
          }
        } catch (e) {
          if (!usingMain) { cancelAnimationFrame(raf.current); busy = false; void fallback(); }
          else fail(`호환 모드 추론을 실행하지 못했어요. 브라우저 그래픽 가속 설정을 확인해주세요. ${String(e)}`);
        }
      };
      /** Worker WebGL을 지원하지 않는 기기는 문서 Canvas에서 실행합니다. 이 경우 처리량을 낮춥니다. */
      async function fallback() {
        if (fallbackStarted || generation.current!==id) return;
        fallbackStarted = true; cancelAnimationFrame(raf.current); w.terminate(); worker.current = null; setBackend('호환 모드');
        try {
          const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
          const c = document.createElement('canvas'); c.width=640;c.height=480;
          if (!c.getContext('webgl2')) throw Error('이 브라우저에서 WebGL2를 사용할 수 없어요. Chrome/Edge의 그래픽 가속 설정을 확인해주세요.');
          const files = await FilesetResolver.forVisionTasks(wasm);
          const m = await HandLandmarker.createFromOptions(files,{canvas:c,baseOptions:{modelAssetPath:modelUrl,delegate:'CPU'},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.6,minHandPresenceConfidence:.6,minTrackingConfidence:.6});
          if (generation.current!==id) {m.close();return;}
          mainModel.current=m;usingMain=true;busy=false;setStatus('ready');raf.current=requestAnimationFrame(loop);
        } catch(e) { fail(`손 인식 호환 모드를 준비하지 못했어요. ${String(e)}`); }
      }
      w.onerror = () => { void fallback(); };
      w.onmessage = ({ data }) => {
        if (generation.current!==id) return;
        if (data.type==='error') { void fallback(); return; }
        if (data.type==='ready') { setStatus('ready');raf.current=requestAnimationFrame(loop);return; }
        if (data.type==='result') accept(data);
      };
      w.postMessage({ type:'init',wasm,model:modelUrl });
      local.getVideoTracks()[0].onended = () => fail('카메라 연결이 끊겼어요. 다시 연결해주세요.');
    } catch (e) {
      local?.getTracks().forEach(t => t.stop());
      if (generation.current!==id) return;
      disconnect(); setStatus('error');
      const name = e instanceof DOMException ? e.name : '';
      setError(name==='NotAllowedError'?'카메라 권한이 거부됐어요. 주소창의 사이트 권한에서 카메라를 허용한 뒤 다시 연결해주세요.':name==='NotFoundError'?'사용할 카메라를 찾지 못했어요. 웹캠 연결을 확인해주세요.':name==='NotReadableError'?'다른 프로그램이 카메라를 사용 중일 수 있어요. 카메라를 사용하는 앱을 닫고 다시 연결해주세요.':String(e));
    }
  }, [disconnect]);
  useEffect(() => () => { generation.current++; cancelAnimationFrame(raf.current); worker.current?.terminate(); mainModel.current?.close(); mainModel.current=null;stream.current?.getTracks().forEach(t => {t.onended=null;t.stop();}); }, []);
  return { video, canvas, status, error, stats, backend, connect, disconnect };
}
