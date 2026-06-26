/**
 * 1-qubit quantum simulator UI backed by WebAssembly state evolution.
 */

let wasmApi = null;

/**
 * Load and instantiate the qubit WASM module.
 */
async function loadWasm() {
  const url = new URL('../wasm/qubit.wasm', import.meta.url);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('Qubit WASM unavailable');
  const { instance } = await WebAssembly.instantiate(await resp.arrayBuffer(), {
    env: {
      sin: Math.sin,
      cos: Math.cos,
    },
  });
  const e = instance.exports;
  const mem = new Float64Array(e.memory.buffer, 0, 4);
  e.reset();
  return { e, mem };
}

/**
 * Format complex number for display.
 * @param {number} re
 * @param {number} im
 */
function fmtC(re, im) {
  const eps = 1e-6;
  if (Math.abs(im) < eps) return fmt(re);
  if (Math.abs(re) < eps) return `${fmt(im)}i`;
  const sign = im >= 0 ? '+' : '-';
  return `${fmt(re)}${sign}${fmt(Math.abs(im))}i`;
}

function fmt(x) {
  if (Math.abs(x) < 1e-9) return '0';
  if (Math.abs(x - 1) < 1e-6) return '1';
  if (Math.abs(x + 1) < 1e-6) return '-1';
  return x.toFixed(4).replace(/\.?0+$/, '');
}

/**
 * Create qubit simulator panel.
 * @returns {Promise<{panel: HTMLElement, destroy: () => void}>}
 */
export async function createQubitSimulator() {
  const panel = document.createElement('div');
  panel.className = 'qubit-panel';
  panel.innerHTML = `
    <div class="qubit-state" aria-live="polite">
      <div class="qubit-ket">|ψ⟩ = <span class="qubit-alpha">1</span>|0⟩ + <span class="qubit-beta">0</span>|1⟩</div>
      <div class="qubit-probs">P(0)=<span class="qubit-p0">100%</span>  P(1)=<span class="qubit-p1">0%</span></div>
      <div class="qubit-bloch">⟨X⟩=<span class="qubit-bx">0</span> ⟨Y⟩=<span class="qubit-by">0</span> ⟨Z⟩=<span class="qubit-bz">1</span></div>
    </div>
    <canvas class="qubit-sphere" width="144" height="144" aria-label="Bloch sphere"></canvas>
    <div class="qubit-gates" role="toolbar" aria-label="Quantum gates">
      <button type="button" data-gate="h" title="Hadamard">H</button>
      <button type="button" data-gate="x" title="Pauli X">X</button>
      <button type="button" data-gate="y" title="Pauli Y">Y</button>
      <button type="button" data-gate="z" title="Pauli Z">Z</button>
      <button type="button" data-gate="rx" title="Rotate X (π/2)">Rx</button>
      <button type="button" data-gate="ry" title="Rotate Y (π/2)">Ry</button>
      <button type="button" data-gate="rz" title="Rotate Z (π/2)">Rz</button>
      <button type="button" data-gate="m" title="Measure">M</button>
      <button type="button" data-gate="reset" title="Reset to |0⟩">|0⟩</button>
    </div>
    <div class="qubit-meas qubit-meas-hidden">last: <span class="qubit-last">—</span></div>
  `;

  const alphaEl = panel.querySelector('.qubit-alpha');
  const betaEl = panel.querySelector('.qubit-beta');
  const p0El = panel.querySelector('.qubit-p0');
  const p1El = panel.querySelector('.qubit-p1');
  const bxEl = panel.querySelector('.qubit-bx');
  const byEl = panel.querySelector('.qubit-by');
  const bzEl = panel.querySelector('.qubit-bz');
  const lastEl = panel.querySelector('.qubit-last');
  const measRow = panel.querySelector('.qubit-meas');
  const canvas = panel.querySelector('.qubit-sphere');
  const ctx = canvas.getContext('2d');

  let err = false;
  try {
    wasmApi = await loadWasm();
  } catch {
    err = true;
    panel.querySelector('.qubit-ket').textContent = 'WASM unavailable.';
  }

  function drawBloch(bx, by, bz) {
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const r = w * 0.38;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#335533';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx, cy + r);
    ctx.moveTo(cx - r, cy);
    ctx.lineTo(cx + r, cy);
    ctx.stroke();
    const px = cx + by * r;
    const py = cy - bz * r;
    ctx.fillStyle = '#33ff66';
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#33ff66';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(px, py);
    ctx.stroke();
  }

  function refresh() {
    if (!wasmApi) return;
    const { e, mem } = wasmApi;
    e.sync_state();
    const [ar, ai, br, bi] = mem;
    alphaEl.textContent = fmtC(ar, ai);
    betaEl.textContent = fmtC(br, bi);
    const p0 = e.prob0();
    const p1 = 1 - p0;
    p0El.textContent = `${(p0 * 100).toFixed(1)}%`;
    p1El.textContent = `${(p1 * 100).toFixed(1)}%`;
    const bx = e.bloch_x();
    const by = e.bloch_y();
    const bz = e.bloch_z();
    bxEl.textContent = fmt(bx);
    byEl.textContent = fmt(by);
    bzEl.textContent = fmt(bz);
    drawBloch(bx, by, bz);
  }

  const HALF_PI = Math.PI / 2;

  panel.querySelector('.qubit-gates').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-gate]');
    if (!btn || !wasmApi) return;
    const g = btn.dataset.gate;
    const { e } = wasmApi;
    switch (g) {
      case 'h':
        e.apply_h();
        break;
      case 'x':
        e.apply_x();
        break;
      case 'y':
        e.apply_y();
        break;
      case 'z':
        e.apply_z();
        break;
      case 'rx':
        e.apply_rx(HALF_PI);
        break;
      case 'ry':
        e.apply_ry(HALF_PI);
        break;
      case 'rz':
        e.apply_rz(HALF_PI);
        break;
      case 'm': {
        const r = e.measure();
        lastEl.textContent = `|${r}⟩`;
        measRow.classList.remove('qubit-meas-hidden');
        break;
      }
      case 'reset':
        e.reset();
        measRow.classList.add('qubit-meas-hidden');
        break;
      default:
        break;
    }
    refresh();
  });

  if (!err) refresh();

  return {
    panel,
    destroy: () => {
      wasmApi = null;
    },
  };
}

/**
 * Mount qubit window on the desktop (bottom-left).
 * @param {import('./window-manager.js').WindowManager} wm
 */
export async function initQubitWindow(wm) {
  const dockH = document.getElementById('hash-dock')?.offsetHeight || 140;
  let panel;
  try {
    ({ panel } = await createQubitSimulator());
  } catch {
    const fallback = document.createElement('div');
    fallback.className = 'qubit-panel qubit-error';
    fallback.textContent = 'WASM unavailable.';
    panel = fallback;
  }

  const win = wm.createWindow({
    id: 'qubit-sim',
    title: '1-Qubit',
    icon: '℧',
    content: panel,
    x: 8,
    y: Math.max(8, window.innerHeight - dockH - 200),
    width: 248,
    height: 208,
    minWidth: 220,
    minHeight: 190,
    resizable: true,
    maximizable: false,
    className: 'win-qubit',
  });

  window.addEventListener('resize', () => {
    const el = document.getElementById('win-qubit-sim');
    const dh = document.getElementById('hash-dock')?.offsetHeight || 140;
    if (el && !el.classList.contains('win-maximized')) {
      el.style.left = '8px';
      el.style.top = `${Math.max(8, window.innerHeight - dh - el.offsetHeight - 4)}px`;
    }
  });

  return win;
}
