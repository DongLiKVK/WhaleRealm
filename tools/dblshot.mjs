import { spawn } from 'node:child_process';
import fs from 'node:fs';
/* 双击特效出图工具（两种口径）
   1) 默认：在 whale 卡页面内合成一次 dblclick（卡内局部坐标 px/py），拍下特效落点。
   2) HOST=1：在宿主页面用真实 Input 事件双击页面坐标 px/py —— 跨 iframe 命中也算，
      用来验证「深潜计划 hero / 首页头图」里双击的落点就是鼠标那一点。 */
const CAND = ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'];
const chrome = CAND.find(p => fs.existsSync(p));
const url = process.argv[2];
const out = process.argv[3];
const px = Number(process.argv[4] || 60), py = Number(process.argv[5] || 50);
const W = Number(process.env.W || 900), H = Number(process.env.H || 520);
const HOST = !!process.env.HOST;
const port = 9415 + (HOST ? 1 : 0);
const proc = spawn(chrome, ['--headless=new','--remote-debugging-port='+port,'--disable-gpu','--hide-scrollbars','--no-first-run','--window-size='+W+','+H,'--user-data-dir='+process.env.TEMP+'/cdp-dbl-'+Date.now(),'about:blank'], { stdio:'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pend = new Map();
async function connect(){
  for(let i=0;i<40;i++){
    try{
      const r = await fetch('http://127.0.0.1:'+port+'/json/list');
      const list = await r.json(); const t = list.find(x=>x.type==='page');
      if(t&&t.webSocketDebuggerUrl){ ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
        ws.onmessage = e=>{ const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);} }; return; }
    }catch(e){}
    await sleep(250);
  }
  throw new Error('no cdp');
}
const send = (m,p) => { const i=++id; return new Promise(res=>{ pend.set(i,res); ws.send(JSON.stringify({id:i,method:m,params:p||{}})); }); };
await connect();
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride',{width:W,height:H,deviceScaleFactor:1,mobile:false});
await send('Page.navigate',{url});
await sleep(7000);
if(HOST){
  const base = { x: px, y: py, button: 'left' };
  await send('Input.dispatchMouseEvent', Object.assign({type:'mouseMoved'}, base));
  await send('Input.dispatchMouseEvent', Object.assign({type:'mousePressed', clickCount:1}, base));
  await send('Input.dispatchMouseEvent', Object.assign({type:'mouseReleased', clickCount:1}, base));
  await sleep(40);
  await send('Input.dispatchMouseEvent', Object.assign({type:'mousePressed', clickCount:2}, base));
  await send('Input.dispatchMouseEvent', Object.assign({type:'mouseReleased', clickCount:2}, base));
}else{
  const expr = "(function(){var c=document.querySelector('.card');var r=c.getBoundingClientRect();var x=r.left+"+px+",y=r.top+"+py+";c.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,clientX:x,clientY:y}));return 'ok';})()";
  await send('Runtime.evaluate',{expression:expr,returnByValue:true});
}
await sleep(280);
const shot = await send('Page.captureScreenshot',{format:'png'});
fs.writeFileSync(out, Buffer.from(shot.result.data,'base64'));
console.log('saved', out, HOST ? '(host input)' : '(in-card)');
ws.close(); proc.kill(); process.exit(0);
