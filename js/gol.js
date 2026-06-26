/**
 * Braille Conway's Game of Life background animation.
 * Preserves the original implementation exactly.
 * @param {HTMLElement} canvas - Container element for cell spans
 */
export function initGameOfLife(canvas) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  const colors = ['#00ff88', '#00aaff', '#aa88ff', '#ff8800', '#ff4488'];

  const FADE_IN = 400;
  const FADE_OUT = 600;

  const CW = 20;
  const CH = 22;
  const COLS = Math.floor(document.documentElement.clientWidth / CW);
  const ROWS = Math.floor(document.documentElement.clientHeight / CH);

  let grid = new Uint8Array(COLS * ROWS);
  let next = new Uint8Array(COLS * ROWS);

  const cells = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const el = document.createElement('span');
      el.className = 'cell';
      el.style.left = `${c * CW}px`;
      el.style.top = `${r * CH}px`;
      el.textContent = frames[0];
      canvas.appendChild(el);
      cells.push({
        el,
        offset: Math.floor(Math.random() * frames.length),
        speed: 80 + Math.floor(Math.random() * 120),
        tick: 0,
        colorIdx: Math.floor(Math.random() * colors.length),
        colorTick: 0,
        colorSpeed: 600 + Math.floor(Math.random() * 1200),
        alive: false,
        opacity: 0,
        fadeDir: 0,
      });
    }
  }

  function idx(r, c) {
    return r * COLS + c;
  }

  function neighbors(r, c) {
    let n = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        n += grid[((r + dr + ROWS) % ROWS) * COLS + ((c + dc + COLS) % COLS)];
      }
    }
    return n;
  }

  function seed(density) {
    for (let i = 0; i < grid.length; i++) {
      grid[i] = Math.random() < density ? 1 : 0;
    }
  }

  let mouseC = -1;
  let mouseR = -1;
  const CURSOR_RADIUS = 8;
  const CURSOR_BOOST = 0.85;

  function stepGol() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const n = neighbors(r, c);
        const alive = grid[idx(r, c)];
        if (alive) {
          next[idx(r, c)] = n === 2 || n === 3 ? 1 : 0;
        } else {
          let birthProb = n === 3 ? 1 : 0;
          if (mouseC >= 0) {
            const dr = r - mouseR;
            const dc = c - mouseC;
            const dist = Math.sqrt(dr * dr + dc * dc);
            if (dist < CURSOR_RADIUS) {
              const influence = 1 - dist / CURSOR_RADIUS;
              birthProb = Math.max(birthProb, influence * CURSOR_BOOST);
            }
          }
          next[idx(r, c)] = Math.random() < birthProb ? 1 : 0;
        }
      }
    }
    const tmp = grid;
    grid = next;
    next = tmp;
  }

  function countAlive() {
    let n = 0;
    for (let i = 0; i < grid.length; i++) n += grid[i];
    return n;
  }

  function syncAlive() {
    for (let i = 0; i < cells.length; i++) {
      const shouldBeAlive = grid[i] === 1;
      const s = cells[i];
      if (shouldBeAlive && !s.alive) {
        s.alive = true;
        s.fadeDir = 1;
        s.fadeTick = 0;
      } else if (!shouldBeAlive && s.alive) {
        s.alive = false;
        s.fadeDir = -1;
        s.fadeTick = 0;
      }
    }
  }

  seed(0.32);
  for (let i = 0; i < cells.length; i++) {
    if (grid[i] === 1) {
      cells[i].alive = true;
      cells[i].opacity = 1;
      cells[i].el.style.opacity = '1';
      cells[i].el.style.color = colors[cells[i].colorIdx];
    }
  }

  document.addEventListener('mousemove', (e) => {
    mouseC = Math.floor(e.clientX / CW);
    mouseR = Math.floor(e.clientY / CH);
  });

  let golTick = 0;
  const GOL_INTERVAL = 100;
  let stagnationTick = 0;
  let lastAlive = 0;
  let last = 0;

  function animate(ts) {
    const dt = last === 0 ? 0 : ts - last;
    last = ts;

    golTick += dt;
    if (golTick >= GOL_INTERVAL) {
      golTick = 0;
      stepGol();
      syncAlive();

      const alive = countAlive();
      if (Math.abs(alive - lastAlive) < 5 || alive < COLS * ROWS * 0.02) {
        stagnationTick++;
        if (stagnationTick > 25) {
          seed(0.3);
          for (let i = 0; i < cells.length; i++) {
            const s = cells[i];
            if (grid[i]) {
              s.alive = true;
              s.fadeDir = 1;
              s.fadeTick = 0;
            } else if (s.opacity > 0) {
              s.alive = false;
              s.fadeDir = -1;
              s.fadeTick = 0;
            }
          }
          stagnationTick = 0;
        }
      } else {
        stagnationTick = 0;
      }
      lastAlive = alive;
    }

    for (let i = 0; i < cells.length; i++) {
      const s = cells[i];

      if (s.fadeDir !== 0) {
        s.fadeTick += dt;
        if (s.fadeDir === 1) {
          s.opacity = Math.min(1, s.fadeTick / FADE_IN);
          if (s.opacity >= 1) {
            s.opacity = 1;
            s.fadeDir = 0;
          }
        } else {
          s.opacity = Math.max(0, 1 - s.fadeTick / FADE_OUT);
          if (s.opacity <= 0) {
            s.opacity = 0;
            s.fadeDir = 0;
          }
        }
        s.el.style.opacity = s.opacity.toFixed(3);
      }

      if (s.opacity === 0) continue;

      s.tick += dt;
      s.colorTick += dt;
      if (s.tick >= s.speed) {
        s.tick = 0;
        s.offset = (s.offset + 1) % frames.length;
        s.el.textContent = frames[s.offset];
      }
      if (s.colorTick >= s.colorSpeed) {
        s.colorTick = 0;
        s.colorIdx = (s.colorIdx + 1) % colors.length;
        s.el.style.color = colors[s.colorIdx];
      }
    }

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);

  /** Recompute grid on viewport resize */
  function onResize() {
    // Background cells are fixed at init; full rebuild would be disruptive.
    // Gol continues with original dimensions — canvas CSS fills viewport.
  }

  window.addEventListener('resize', onResize);
}
