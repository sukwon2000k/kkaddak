import { build } from 'vite';
import { fileURLToPath } from 'node:url';
// MediaPipe 0.10의 WASM 로더는 importScripts를 사용합니다.
// 모듈 Worker 대신 의존성을 하나의 IIFE로 묶어 classic Worker에서 실행합니다.
await build({
  configFile: false,
  publicDir: false,
  build: {
    target: 'es2022',
    lib: { entry: fileURLToPath(new URL('../apps/web/src/vision.worker.ts', import.meta.url)), name: 'KKADDAKVision', formats: ['iife'], fileName: () => 'vision-worker.js' },
    outDir: fileURLToPath(new URL('../public/mediapipe', import.meta.url)),
    emptyOutDir: false,
    copyPublicDir: false,
  },
});
