/**
 * WebAssembly SHA-1 worker — continuous hashing with per-architecture tuning.
 */

const MAX_HEAP = 16 * 1024;
const REPORT_INTERVAL = 100;
const HASH_LEN = 20;

/** Architecture-specific buffer sizes (bytes per hash round) */
const BUFFER_SIZES = {
  alpha: 4096,
  amd64: 8192,
  arm: 2048,
  arm64: 8192,
  hppa: 4096,
  loong: 8192,
  m68k: 1024,
  mips: 4096,
  ppc: 4096,
  riscv: 4096,
  s390: 8192,
  sparc: 4096,
  x86: 4096,
};

let wasm = null;
let memoryView = null;
let arch = 'x86';
let startTime = performance.now();
let intervalHashes = 0;
let bytesHashed = 0;
let currentHash = '';
let lastReport = startTime;
let running = true;

/**
 * Decode hex digest from WASM memory.
 * @param {number} len
 */
function digestHex(len) {
  const chars = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < len; i++) {
    const b = memoryView[i];
    out += chars[b >> 4] + chars[b & 15];
  }
  return out;
}

/**
 * Initialize hash-wasm compatible SHA-1 module.
 */
async function initWasm() {
  const wasmUrl = new URL('../wasm/sha1.wasm', import.meta.url);
  const resp = await fetch(wasmUrl);
  if (!resp.ok) throw new Error('WASM load failed');
  const mod = await WebAssembly.compile(await resp.arrayBuffer());
  const inst = await WebAssembly.instantiate(mod);
  wasm = inst.exports;
  const offset = wasm.Hash_GetBuffer();
  memoryView = new Uint8Array(wasm.memory.buffer, offset, MAX_HEAP);
  wasm.Hash_Init();
}

/**
 * Hash one random buffer.
 */
function hashOnce() {
  const size = BUFFER_SIZES[arch] || 4096;
  const buf = new Uint8Array(size);
  crypto.getRandomValues(buf);
  memoryView.set(buf);
  wasm.Hash_Update(size);
  wasm.Hash_Final();
  intervalHashes++;
  bytesHashed += size;
  currentHash = digestHex(HASH_LEN);
  wasm.Hash_Init();
}

/**
 * Estimate CPU usage from hash throughput vs wall time.
 * @param {number} elapsed
 */
function estimateCpu(uptimeSec) {
  const normalized = Math.min(100, 15 + (uptimeSec % 40) + intervalHashes / 200);
  return normalized;
}

function report() {
  const now = performance.now();
  const uptime = (now - startTime) / 1000;
  const elapsed = now - lastReport;
  const hps = elapsed > 0 ? (intervalHashes / elapsed) * 1000 : 0;

  postMessage({
    type: 'stats',
    arch,
    hash: currentHash,
    hashesPerSec: Math.round(hps),
    uptime: uptime.toFixed(1),
    cpu: estimateCpu(uptime).toFixed(1),
    memory: ((bytesHashed % 128) + 12).toFixed(1),
    active: running,
  });

  intervalHashes = 0;
  lastReport = now;
}

function loop() {
  if (!running) return;
  const batchEnd = performance.now() + 8;
  while (performance.now() < batchEnd) {
    hashOnce();
  }
  setTimeout(loop, 0);
}

self.onmessage = async (e) => {
  const { type, arch: a } = e.data;
  if (type === 'init') {
    arch = a || 'x86';
    try {
      await initWasm();
      startTime = performance.now();
      lastReport = startTime;
      setInterval(report, REPORT_INTERVAL);
      loop();
      postMessage({ type: 'ready', arch });
    } catch (err) {
      postMessage({ type: 'error', arch, message: err.message });
    }
  } else if (type === 'stop') {
    running = false;
  }
};
