import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const port = 5173;
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.wasm':'application/wasm', '.task':'application/octet-stream', '.svg':'image/svg+xml', '.png':'image/png' };
// localhost에만 바인딩해 빌드 결과를 제공합니다. npm 설치 없이 Node.js만 있으면 실행됩니다.
const server = http.createServer(async (req,res) => {
  try {
    const pathname=decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
    const path=resolve(root, '.'+(pathname==='/'?'/index.html':pathname));
    if (!path.startsWith(root+sep)) { res.writeHead(403);res.end('Forbidden');return; }
    const info=await stat(path);
    if(!info.isFile())throw Error('not a file');
    res.writeHead(200,{'Content-Type':mime[extname(path)] || 'application/octet-stream','Content-Length':info.size,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    if(req.method==='HEAD')res.end();else createReadStream(path).pipe(res);
  } catch {res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('파일을 찾지 못했어요. dist 폴더를 함께 압축 해제했는지 확인해주세요.');}
});
server.on('error',e=>{console.error('실행하지 못했어요. 다른 까딱 서버를 종료한 후 다시 실행해주세요.',e.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>{
  const url=`http://127.0.0.1:${port}/`;
  console.log(`\n까딱 실행 중: ${url}\n종료: Ctrl+C\n`);
  if(process.argv.includes('--open')) {
    const args=process.platform==='win32'?['cmd',['/c','start','',url]]:process.platform==='darwin'?['open',[url]]:['xdg-open',[url]];
    const child=spawn(args[0],args[1],{stdio:'ignore'});child.on('error',()=>console.log('브라우저에서 위 주소를 열어주세요.'));child.unref();
  }
});
