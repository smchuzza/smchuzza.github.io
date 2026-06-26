/**
 * v86 Debian Linux VM — boots real Debian via 9p virtio filesystem.
 */

const V86_BASE = 'assets/v86/';
const DEBIAN_BASE = 'assets/debian/';

/**
 * @param {string} src
 */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

/**
 * @param {string} url
 */
async function assetExists(url) {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * @param {HTMLElement} container
 * @param {HTMLElement} statusEl
 */
export async function initVm(container, statusEl) {
  const screenWrap = document.createElement('div');
  screenWrap.className = 'vm-screen-wrap';
  screenWrap.tabIndex = 0;
  screenWrap.setAttribute('aria-label', 'Debian virtual machine');

  const screen = document.createElement('div');
  screen.className = 'vm-screen';
  screen.id = 'vm-screen-container';

  const progress = document.createElement('div');
  progress.className = 'vm-progress';
  progress.innerHTML =
    '<span class="vm-progress-label">Loading Debian…</span>' +
    '<div class="vm-progress-bar"><div class="vm-progress-fill"></div></div>';

  container.appendChild(screenWrap);
  screenWrap.appendChild(screen);
  screenWrap.appendChild(progress);

  const fill = progress.querySelector('.vm-progress-fill');
  const label = progress.querySelector('.vm-progress-label');
  let booted = false;

  const setProgress = (pct, text) => {
    fill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    if (text) label.textContent = text;
  };

  const hideProgress = () => {
    if (booted) return;
    booted = true;
    statusEl.textContent = 'Running';
    requestAnimationFrame(() => {
      progress.classList.add('vm-progress-hidden');
      setTimeout(() => progress.remove(), 500);
    });
  };

  let emulator = null;

  const destroy = () => {
    if (emulator) {
      try {
        emulator.destroy();
      } catch {
        /* ignore */
      }
      emulator = null;
    }
  };

  const failTimeout = setTimeout(() => {
    if (!booted) {
      progress.remove();
      screen.innerHTML =
        '<div class="vm-error">Unable to boot VM.<br><small>Debian image missing or timed out. Run <code>scripts/build-debian.sh</code>.</small></div>';
      statusEl.textContent = 'Error';
    }
  }, 300000);

  try {
    const fsJson = `${DEBIAN_BASE}debian-base-fs.json`;
    const rootfs = `${DEBIAN_BASE}debian-9p-rootfs-flat/`;
    const stateBin = `${DEBIAN_BASE}debian-state-base.bin`;

    setProgress(2, 'Checking Debian image…');
    const hasFs = await assetExists(fsJson);
    if (!hasFs) {
      throw new Error('Debian filesystem not found at assets/debian/');
    }

    setProgress(5, 'Loading libv86.js…');
    statusEl.textContent = 'Loading engine…';
    await loadScript(`${V86_BASE}libv86.js`);

    if (typeof window.V86 !== 'function') {
      throw new Error('V86 constructor not found');
    }

    const hasState = await assetExists(stateBin);

    /** @type {Record<string, unknown>} */
    const config = {
      wasm_path: `${V86_BASE}v86.wasm`,
      memory_size: 512 * 1024 * 1024,
      vga_memory_size: 8 * 1024 * 1024,
      screen_container: screen,
      bios: { url: `${V86_BASE}seabios.bin` },
      vga_bios: { url: `${V86_BASE}vgabios.bin` },
      filesystem: {
        baseurl: rootfs,
        basefs: { url: fsJson },
      },
      bzimage_initrd_from_filesystem: true,
      cmdline:
        'rw init=/bin/systemd root=host9p console=ttyS0 spectre_v2=off pti=off',
      autostart: true,
      disable_keyboard: false,
      disable_mouse: false,
    };

    if (hasState) {
      config.initial_state = { url: stateBin, async: true };
      delete config.bzimage_initrd_from_filesystem;
      setProgress(10, 'Loading saved Debian state…');
      statusEl.textContent = 'Restoring state…';
    } else {
      setProgress(10, 'Booting Debian (first boot may take 1–2 min)…');
      statusEl.textContent = 'Booting Debian…';
    }

    emulator = new window.V86(config);

    emulator.add_listener('download-progress', (e) => {
      const name = (e.file_name || 'image').replace(/^assets\//, '');
      if (e.total > 0) {
        setProgress(10 + (e.loaded / e.total) * 75, `Loading ${name}…`);
      } else {
        setProgress(40, `Loading ${name}…`);
      }
      statusEl.textContent = `Loading ${name}…`;
    });

    emulator.add_listener('emulator-loaded', () => {
      clearTimeout(failTimeout);
      if (hasState) {
        hideProgress();
      } else {
        setProgress(90, 'Starting systemd…');
        statusEl.textContent = 'Starting Debian…';
      }
    });

    emulator.add_listener('emulator-started', () => {
      clearTimeout(failTimeout);
      hideProgress();
      if (emulator.screen_set_scale) {
        emulator.screen_set_scale(1, 1);
      }
    });

    if (!hasState) {
      emulator.add_listener('screen-put-char', () => {
        clearTimeout(failTimeout);
        hideProgress();
      });
    }

    screenWrap.addEventListener('mousedown', () => {
      screenWrap.focus();
    });

    screenWrap.addEventListener('keydown', (e) => {
      e.stopPropagation();
    });

    if (navigator.clipboard) {
      screenWrap.addEventListener('paste', async (e) => {
        try {
          const text =
            e.clipboardData?.getData('text') ||
            (await navigator.clipboard.readText());
          if (text && emulator?.keyboard_send_text) {
            emulator.keyboard_send_text(text);
          }
        } catch {
          /* clipboard unavailable */
        }
      });
    }

    return { emulator, destroy, screenWrap };
  } catch (err) {
    clearTimeout(failTimeout);
    console.error('VM init failed:', err);
    progress.remove();
    screen.innerHTML = `<div class="vm-error">Unable to boot VM.<br><small>${err.message}</small></div>`;
    statusEl.textContent = 'Error';
    return { emulator: null, destroy, screenWrap };
  }
}

/**
 * @returns {{shell: HTMLElement, area: HTMLElement, status: HTMLElement}}
 */
export function createVmShell() {
  const shell = document.createElement('div');
  shell.className = 'vm-shell';

  const status = document.createElement('div');
  status.className = 'vm-status';
  status.textContent = 'Starting…';

  const area = document.createElement('div');
  area.className = 'vm-area';

  shell.appendChild(area);
  shell.appendChild(status);

  return { shell, area, status };
}
