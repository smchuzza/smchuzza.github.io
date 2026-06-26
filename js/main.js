/**
 * Application entry — Game of Life background, window manager, VM, SHA monitors.
 */

import { initGameOfLife } from './gol.js';
import { WindowManager } from './window-manager.js';
import { initVm, createVmShell } from './vm.js';
import { initShaMonitors } from './sha-monitors.js';
import { initQubitWindow } from './qubit-sim.js';

function main() {
  const canvas = document.getElementById('canvas');
  const desktop = document.getElementById('desktop');
  const hashDock = document.getElementById('hash-dock');

  initGameOfLife(canvas);

  const wm = new WindowManager(desktop);

  /* ── Debian VM window (lower-right) ── */
  const { shell, area, status } = createVmShell();
  const vmWin = wm.createWindow({
    id: 'debian-vm',
    title: 'Debian VM',
    icon: '🐧',
    content: shell,
    x: Math.max(20, window.innerWidth - 360),
    y: Math.max(20, window.innerHeight - 280 - hashDock.offsetHeight),
    width: 380,
    height: 280,
    minWidth: 340,
    minHeight: 240,
    resizable: true,
    maximizable: true,
    className: 'win-vm',
  });

  /* Defer until window layout has dimensions */
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      initVm(area, status).then(({ screenWrap, emulator }) => {
        if (screenWrap) {
          screenWrap.addEventListener('focus', () => vmWin.focus());
        }
        /* Avoid fractional screen scaling — keeps VGA text sharp */
        if (emulator?.screen_set_scale) {
          emulator.screen_set_scale(1, 1);
        }
      });
    });
  });

  /* ── 1-qubit WASM simulator (bottom-left) ── */
  initQubitWindow(wm);

  /* ── SHA-1 monitors (all architectures) ── */
  const sha = initShaMonitors(wm, hashDock);

  /* Move SHA windows into dock for flex layout */
  for (const el of desktop.querySelectorAll('.win-sha')) {
    hashDock.appendChild(el);
  }

  window.addEventListener('resize', () => {
    const dockH = hashDock.offsetHeight;
    const vmEl = document.getElementById('win-debian-vm');
    if (vmEl && !vmEl.classList.contains('win-maximized')) {
      vmEl.style.left = `${Math.max(20, window.innerWidth - vmEl.offsetWidth - 12)}px`;
      vmEl.style.top = `${Math.max(20, window.innerHeight - vmEl.offsetHeight - dockH - 8)}px`;
    }
  });

  window.addEventListener('beforeunload', () => sha.stop());
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
