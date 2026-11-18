import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// 정적 배포와 localhost 모두 같은 앱 경로로 실행합니다.
export default defineConfig({ plugins: [react()], base: './', server: { host: '0.0.0.0' }, build: { target: 'es2022' } });
