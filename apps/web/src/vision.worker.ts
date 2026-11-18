/// <reference lib="webworker" />
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
let model: HandLandmarker | null = null;
/** 추론을 Worker에서 실행해 화면·정지 버튼이 영상 판정에 막히지 않게 합니다. */
self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      const files = await FilesetResolver.forVisionTasks(data.wasm);
      const canvas = new OffscreenCanvas(640, 480);
      if (!canvas.getContext('webgl2')) throw Error('이 브라우저에서 Worker의 WebGL2를 사용할 수 없어요. Chrome/Edge의 그래픽 가속 설정을 확인해주세요.');
      model = await HandLandmarker.createFromOptions(files, { canvas, baseOptions: { modelAssetPath: data.model, delegate: 'CPU' }, runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: .6, minTrackingConfidence: .6, minHandPresenceConfidence: .6 });
      self.postMessage({ type: 'ready' });
    } catch (e) { self.postMessage({ type: 'error', message: `손 모델을 열지 못했어요. npm run assets 실행과 모델 파일을 확인해주세요. ${String(e)}` }); }
  }
  if (data.type === 'frame') {
    const frame = data.frame as ImageBitmap;
    try {
      const start = performance.now();
      const r = model!.detectForVideo(frame, data.at);
      self.postMessage({ type: 'result', at: data.at, duration: performance.now() - start, hands: r.landmarks.map((points, i) => ({ points, side: r.handedness[i]?.[0]?.categoryName, score: r.handedness[i]?.[0]?.score ?? 0 })) });
    } catch (e) { self.postMessage({ type: 'error', message: `손 추론 중 오류가 발생했어요. 카메라를 다시 연결해주세요. ${String(e)}` }); }
    finally { frame.close(); }
  }
};
