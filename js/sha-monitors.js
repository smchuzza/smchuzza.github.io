/**
 * SHA-1 diagnostic monitor windows — one independent worker per architecture.
 */

/** All supported target architectures */
export const ARCHITECTURES = [
  { id: 'alpha', label: 'Alpha', icon: 'α' },
  { id: 'amd64', label: 'amd64', icon: '64' },
  { id: 'arm', label: 'arm', icon: 'ⓐ' },
  { id: 'arm64', label: 'arm64', icon: 'Ⓐ' },
  { id: 'hppa', label: 'hppa', icon: 'ⓗ' },
  { id: 'loong', label: 'loong', icon: '龙' },
  { id: 'm68k', label: 'm68k', icon: '68' },
  { id: 'mips', label: 'mips', icon: 'ⓜ' },
  { id: 'ppc', label: 'ppc', icon: 'ⓟ' },
  { id: 'riscv', label: 'riscv', icon: 'ⓡ' },
  { id: 's390', label: 's390', icon: 'ⓩ' },
  { id: 'sparc', label: 'sparc', icon: '☀' },
  { id: 'x86', label: 'x86', icon: '86' },
];

/**
 * Build monitor panel DOM for one architecture.
 * @param {string} archId
 */
function createMonitorPanel(archId) {
  const arch = ARCHITECTURES.find((a) => a.id === archId);
  const panel = document.createElement('div');
  panel.className = 'sha-panel';
  panel.dataset.arch = archId;
  panel.innerHTML = `
    <div class="sha-row"><span class="sha-key">Arch</span><span class="sha-val sha-arch">${arch?.label ?? archId}</span></div>
    <div class="sha-row"><span class="sha-key">Hash</span><span class="sha-val sha-hash mono">—</span></div>
    <div class="sha-row"><span class="sha-key">H/s</span><span class="sha-val sha-hps">0</span></div>
    <div class="sha-row"><span class="sha-key">Uptime</span><span class="sha-val sha-uptime">0.0s</span></div>
    <div class="sha-row"><span class="sha-key">CPU</span><span class="sha-val sha-cpu">0%</span></div>
    <div class="sha-row"><span class="sha-key">Mem</span><span class="sha-val sha-mem">0 MB</span></div>
    <div class="sha-activity" aria-hidden="true"><span class="sha-dot"></span><span class="sha-dot"></span><span class="sha-dot"></span></div>
  `;
  return panel;
}

/**
 * Spawn workers and create docked monitor windows.
 * @param {import('./window-manager.js').WindowManager} wm
 * @param {HTMLElement} dock
 */
export function initShaMonitors(wm, dock) {
  /** @type {Worker[]} */
  const workers = [];

  for (const arch of ARCHITECTURES) {
    const panel = createMonitorPanel(arch.id);
    const content = document.createElement('div');
    content.className = 'sha-content';
    content.appendChild(panel);

    const cols = ARCHITECTURES.length;
    const idx = ARCHITECTURES.indexOf(arch);
    const colWidth = 100 / cols;

    wm.createWindow({
      id: `sha-${arch.id}`,
      title: `${arch.label} SHA-1`,
      icon: arch.icon,
      content,
      x: idx * colWidth * (window.innerWidth / 100),
      y: window.innerHeight - 148,
      width: Math.max(148, Math.floor(window.innerWidth / cols) - 4),
      height: 148,
      minWidth: 124,
      minHeight: 128,
      resizable: false,
      maximizable: false,
      className: 'win-sha',
    });

    dock.appendChild(document.createComment(`sha-${arch.id}`));

    let worker;
    try {
      worker = new Worker(new URL('../workers/sha-worker.js', import.meta.url), {
        type: 'module',
      });
    } catch {
      panel.querySelector('.sha-hash').textContent = 'WASM unavailable.';
      continue;
    }

    workers.push(worker);

    worker.onmessage = (e) => {
      const { type, hash, hashesPerSec, uptime, cpu, memory } = e.data;
      if (type === 'stats') {
        const hashEl = panel.querySelector('.sha-hash');
        const hpsEl = panel.querySelector('.sha-hps');
        const upEl = panel.querySelector('.sha-uptime');
        const cpuEl = panel.querySelector('.sha-cpu');
        const memEl = panel.querySelector('.sha-mem');

        if (hash) hashEl.textContent = hash.slice(0, 16) + '…';
        hpsEl.textContent = hashesPerSec.toLocaleString();
        upEl.textContent = `${uptime}s`;
        cpuEl.textContent = `${cpu}%`;
        memEl.textContent = `${memory} MB`;
        panel.classList.add('sha-active');
        requestAnimationFrame(() => panel.classList.remove('sha-active'));
      } else if (type === 'error') {
        panel.querySelector('.sha-hash').textContent = 'WASM unavailable.';
      }
    };

    worker.postMessage({ type: 'init', arch: arch.id });
  }

  return {
    stop: () => workers.forEach((w) => {
      w.postMessage({ type: 'stop' });
      w.terminate();
    }),
  };
}
