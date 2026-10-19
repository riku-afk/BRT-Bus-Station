import { spawn } from 'node:child_process';
const S = process.argv[2];
const base = 'http://localhost:3200';
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',
  ['--headless=new', '--disable-gpu', '--remote-debugging-port=9361', `--user-data-dir=${S}/chrome-profile19`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch('http://127.0.0.1:9361/json')).json(); if (targets.length) break; } catch {} await sleep(250); }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = (m) => { const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  if (msg.method === 'Runtime.exceptionThrown') errors.push('EXC ' + (msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text));
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push('console.error ' + msg.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300)); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); return r.result?.exceptionDetails ? 'EVAL-ERROR ' + (r.result.exceptionDetails.exception?.description ?? '').slice(0, 200) : r.result?.result?.value; };
const goto = async (path, wait = 2500) => { await send('Page.navigate', { url: base + path }); await sleep(wait); };
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); await Bun.write(`${S}/${name}.png`, Buffer.from(r.result.data, 'base64')); };
const text = (sel = 'body') => evaluate(`document.querySelector(${JSON.stringify(sel)})?.innerText.split(String.fromCharCode(10)).join(' | ') ?? 'NONE'`);
const marker = (n) => evaluate(`(() => { const m = [...document.querySelectorAll('.leaflet-container .brt-marker')].find((e) => e.childNodes[0].textContent.trim() === '${n}'); if (!m) return 'no marker ${n}'; m.click(); return 'tapped'; })()`);

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await goto('/login');
await evaluate(`(() => { const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  set(document.getElementById('email'), 'passenger1@brt.test'); set(document.getElementById('password'), 'Demo1234!'); document.querySelector('form button[type=submit]').click(); })()`);
await sleep(3000);
await goto('/', 5000);
console.log(await marker('3'), await marker('9'));
await sleep(1500);
console.log('FARE', await text('main'));
console.log('BUY', await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Buy ticket') && !x.disabled); if (!b) return 'no buy'; b.click(); return 'clicked'; })()`));
await sleep(6000);
console.log('URL', await evaluate('location.pathname'));
console.log('PAGE', (await text('main')).slice(0, 500));
console.log('QR IMG', JSON.stringify(await evaluate(`(() => { const i = document.querySelector('[data-testid=pay-qr]'); return i ? { w: i.naturalWidth, h: i.naturalHeight, complete: i.complete, src: i.getAttribute('src') } : null; })()`)));
await shot('pisopay-1-qr');
const ref = (await text('[data-testid=pay-with-qr]')).match(/PPFAKE\d+/)?.[0];
console.log('REF', ref);
// The passenger "pays" on PisoPay's side: only the fake gateway changes; this app learns of it by asking.
console.log('FAKE PAY', await (await fetch(`http://localhost:3300/fake/pay?ref=${ref}`, { method: 'POST' })).text());
let paid = false;
for (let i = 0; i < 12 && !paid; i++) { await sleep(1500); paid = await evaluate(`document.body.innerText.includes('Payment received')`); }
console.log('PAID SHOWN', paid);
await sleep(1500);
await shot('pisopay-2-paid');
console.log('AFTER', (await text('main')).slice(0, 300));
console.log('ERRORS', JSON.stringify(errors));
chrome.kill(); process.exit(0);
