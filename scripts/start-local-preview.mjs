import { spawn } from 'node:child_process';
import { mkdirSync,openSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..');
const folder=resolve(root,'handoff/dual-frontend-qa');mkdirSync(folder,{recursive:true});
try { const response=await fetch('http://127.0.0.1:3722');if(response.ok)throw new Error('端口 3722 已被占用，请先确认已有进程。'); } catch(error) {if(error.message.includes('3722'))throw error;}
const log=openSync(resolve(folder,'preview.log'),'a');
const child=spawn(process.execPath,[resolve(root,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3722'],{cwd:root,detached:true,windowsHide:true,stdio:['ignore',log,log],env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'}});
child.unref();writeFileSync(resolve(folder,'preview.pid'),String(child.pid));console.log('Preview: http://127.0.0.1:3722, PID '+child.pid);
