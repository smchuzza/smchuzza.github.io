/**
 * Lightweight desktop window manager with GTK2/Motif-style decorations.
 */

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * @typedef {Object} WindowOptions
 * @property {string} id
 * @property {string} title
 * @property {string} [icon]
 * @property {HTMLElement|string} [content]
 * @property {number} [x]
 * @property {number} [y]
 * @property {number} [width]
 * @property {number} [height]
 * @property {number} [minWidth]
 * @property {number} [minHeight]
 * @property {boolean} [resizable]
 * @property {boolean} [maximizable]
 * @property {string} [className]
 */

export class WindowManager {
  /** @param {HTMLElement} desktop */
  constructor(desktop) {
    this.desktop = desktop;
    /** @type {Map<string, object>} */
    this.windows = new Map();
    this.zBase = 100;
    this.topZ = this.zBase;
    this.focusedId = null;
  }

  /**
   * Create a managed window.
   * @param {WindowOptions} opts
   */
  createWindow(opts) {
    const {
      id,
      title,
      icon = '◆',
      content = null,
      x = 80,
      y = 60,
      width = 320,
      height = 220,
      minWidth = 160,
      minHeight = 100,
      resizable = true,
      maximizable = true,
      className = '',
    } = opts;

    const root = document.createElement('div');
    root.className = `win ${className}`.trim();
    root.id = `win-${id}`;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', title);
    root.tabIndex = 0;
    root.style.width = `${width}px`;
    root.style.height = `${height}px`;
    root.style.left = `${x}px`;
    root.style.top = `${y}px`;
    root.style.zIndex = String(++this.topZ);

    const titlebar = document.createElement('div');
    titlebar.className = 'win-titlebar';

    const iconEl = document.createElement('span');
    iconEl.className = 'win-icon';
    iconEl.textContent = icon;
    iconEl.setAttribute('aria-hidden', 'true');

    const titleEl = document.createElement('span');
    titleEl.className = 'win-title';
    titleEl.textContent = title;

    const controls = document.createElement('div');
    controls.className = 'win-controls';

    const btnMin = this._makeBtn('─', 'Minimize', 'win-btn-min');
    const btnMax = maximizable
      ? this._makeBtn('□', 'Maximize', 'win-btn-max')
      : null;
    const btnClose = this._makeBtn('×', 'Close', 'win-btn-close');

    controls.appendChild(btnMin);
    if (btnMax) controls.appendChild(btnMax);
    controls.appendChild(btnClose);

    titlebar.appendChild(iconEl);
    titlebar.appendChild(titleEl);
    titlebar.appendChild(controls);

    const body = document.createElement('div');
    body.className = 'win-body';
    if (content instanceof HTMLElement) {
      body.appendChild(content);
    } else if (typeof content === 'string') {
      body.innerHTML = content;
    }

    root.appendChild(titlebar);
    root.appendChild(body);

    if (resizable) {
      for (const dir of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
        const handle = document.createElement('div');
        handle.className = `win-resize win-resize-${dir}`;
        handle.dataset.dir = dir;
        root.appendChild(handle);
      }
    }

    this.desktop.appendChild(root);

    const state = {
      id,
      root,
      titlebar,
      body,
      titleEl,
      minWidth,
      minHeight,
      resizable,
      maximizable,
      minimized: false,
      maximized: false,
      savedGeom: null,
      x,
      y,
      width,
      height,
    };

    this.windows.set(id, state);
    this._bindWindow(state, btnMin, btnMax, btnClose);
    this.focus(id);

    return {
      id,
      element: root,
      body,
      setTitle: (t) => {
        titleEl.textContent = t;
        root.setAttribute('aria-label', t);
      },
      setContent: (el) => {
        body.replaceChildren(el);
      },
      focus: () => this.focus(id),
      close: () => this.close(id),
      minimize: () => this._minimize(state),
      restore: () => this._restore(state),
    };
  }

  /** @param {string} id */
  focus(id) {
    const win = this.windows.get(id);
    if (!win || win.minimized) return;
    if (this.focusedId) {
      const prev = this.windows.get(this.focusedId);
      if (prev) prev.root.classList.remove('win-focused');
    }
    win.root.style.zIndex = String(++this.topZ);
    win.root.classList.add('win-focused');
    this.focusedId = id;
    win.root.focus({ preventScroll: true });
  }

  /** @param {string} id */
  close(id) {
    const win = this.windows.get(id);
    if (!win) return;
    win.root.remove();
    this.windows.delete(id);
    if (this.focusedId === id) this.focusedId = null;
  }

  _makeBtn(label, aria, cls) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `win-btn ${cls}`;
    b.textContent = label;
    b.setAttribute('aria-label', aria);
    return b;
  }

  _bindWindow(state, btnMin, btnMax, btnClose) {
    const { root, titlebar } = state;

    root.addEventListener('mousedown', (e) => {
      if (e.target.closest('.win-btn')) return;
      this.focus(state.id);
    });

    root.addEventListener('focusin', () => this.focus(state.id));

    btnMin.addEventListener('click', (e) => {
      e.stopPropagation();
      this._minimize(state);
    });

    btnClose.addEventListener('click', (e) => {
      e.stopPropagation();
      this.close(state.id);
    });

    if (btnMax) {
      btnMax.addEventListener('click', (e) => {
        e.stopPropagation();
        this._toggleMaximize(state);
      });
    }

    this._bindDrag(state, titlebar);
    if (state.resizable) this._bindResize(state);
  }

  _minimize(state) {
    state.minimized = true;
    state.root.classList.add('win-minimized');
    state.root.setAttribute('aria-hidden', 'true');
  }

  _restore(state) {
    state.minimized = false;
    state.root.classList.remove('win-minimized');
    state.root.removeAttribute('aria-hidden');
    this.focus(state.id);
  }

  _toggleMaximize(state) {
    if (!state.maximized) {
      const rect = state.root.getBoundingClientRect();
      state.savedGeom = {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      };
      const dock = document.getElementById('hash-dock');
      const dockH = dock ? dock.offsetHeight : 0;
      state.root.style.left = '0';
      state.root.style.top = '0';
      state.root.style.width = `${window.innerWidth}px`;
      state.root.style.height = `${window.innerHeight - dockH}px`;
      state.maximized = true;
      state.root.classList.add('win-maximized');
    } else {
      const g = state.savedGeom;
      if (g) {
        state.root.style.left = `${g.x}px`;
        state.root.style.top = `${g.y}px`;
        state.root.style.width = `${g.width}px`;
        state.root.style.height = `${g.height}px`;
      }
      state.maximized = false;
      state.root.classList.remove('win-maximized');
    }
  }

  _bindDrag(state, handle) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let origX = 0;
    let origY = 0;
    let raf = 0;

    const onMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        state.root.style.left = `${origX + dx}px`;
        state.root.style.top = `${origY + dy}px`;
      });
    };

    const onUp = () => {
      dragging = false;
      document.body.classList.remove('wm-dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    handle.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || state.maximized) return;
      if (state.minimized) {
        this._restore(state);
        return;
      }
      e.preventDefault();
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      origX = state.root.offsetLeft;
      origY = state.root.offsetTop;
      document.body.classList.add('wm-dragging');
      this.focus(state.id);
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  _bindResize(state) {
    const { root } = state;

    root.querySelectorAll('.win-resize').forEach((handle) => {
      handle.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || state.maximized) return;
        e.preventDefault();
        e.stopPropagation();

        const dir = handle.dataset.dir;
        const startX = e.clientX;
        const startY = e.clientY;
        const rect = root.getBoundingClientRect();
        let { left, top, width, height } = rect;
        document.body.classList.add('wm-dragging');
        this.focus(state.id);

        const onMove = (ev) => {
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          requestAnimationFrame(() => {
            let newLeft = left;
            let newTop = top;
            let newW = width;
            let newH = height;

            if (dir.includes('e')) newW = width + dx;
            if (dir.includes('w')) {
              newW = width - dx;
              newLeft = left + dx;
            }
            if (dir.includes('s')) newH = height + dy;
            if (dir.includes('n')) {
              newH = height - dy;
              newTop = top + dy;
            }

            newW = Math.max(state.minWidth, newW);
            newH = Math.max(state.minHeight, newH);

            if (dir.includes('w')) newLeft = left + width - newW;
            if (dir.includes('n')) newTop = top + height - newH;

            root.style.left = `${newLeft}px`;
            root.style.top = `${newTop}px`;
            root.style.width = `${newW}px`;
            root.style.height = `${newH}px`;
          });
        };

        const onUp = () => {
          document.body.classList.remove('wm-dragging');
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    });
  }
}

export { REDUCED_MOTION };
