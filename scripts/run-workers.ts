/**
 * Runs every background worker in one terminal, with each line of output labelled:
 *
 *   bun run workers
 *
 * Ctrl+C stops them all (each one shuts down cleanly: the simulator takes its buses off the map).
 */
export {};

const WORKERS = [
  { label: 'simulator', script: 'scripts/bus-simulator-worker.ts' },
  { label: 'expiry   ', script: 'scripts/expire-tickets-worker.ts' },
] as const;

async function relay(stream: ReadableStream<Uint8Array>, label: string, out: (line: string) => void) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? '';
    for (const line of lines) if (line.trim() && !line.startsWith('$ ')) out(`[${label}] ${line.replace(/^\[(simulator|expiry)\]\s*/, '')}`);
  }
}

const children = WORKERS.map(({ label, script }) => {
  const child = Bun.spawn(['bun', 'run', script], { stdout: 'pipe', stderr: 'pipe', env: process.env });
  void relay(child.stdout, label, (l) => console.log(l));
  void relay(child.stderr, label, (l) => console.error(l));
  return { label, child };
});

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  console.log('[workers] stopping…');
  // A Ctrl+C reaches the children too, so they usually exit by themselves; this is the backstop.
  const force = setTimeout(() => children.forEach(({ child }) => child.kill()), 8000);
  await Promise.all(children.map(({ child }) => child.exited));
  clearTimeout(force);
  process.exit(0);
}
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());

// If one worker dies on its own, say so and stop the rest instead of limping along.
await Promise.race(children.map(async ({ label, child }) => ({ label, code: await child.exited }))).then(({ label, code }) => {
  if (!stopping) {
    console.error(`[workers] ${label.trim()} exited unexpectedly (code ${code})`);
    void stop();
  }
});
await new Promise(() => {});
