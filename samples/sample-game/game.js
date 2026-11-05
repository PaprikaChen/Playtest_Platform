// Lantern Hop: a tiny platformer used as the sample build for the playtest platform.
// Level 2 has a deliberately hard jump so testers have something to comment on.
(() => {
  const c = document.getElementById("c");
  const ctx = c.getContext("2d");
  const keys = {};
  addEventListener("keydown", (e) => { keys[e.code] = true; if (e.code === "Space") e.preventDefault(); });
  addEventListener("keyup", (e) => { keys[e.code] = false; });

  const LEVELS = [
    {
      plats: [[0, 420, 800, 30], [150, 340, 120, 14], [340, 280, 120, 14], [540, 220, 120, 14]],
      lanterns: [[200, 310], [390, 250], [590, 190]],
      door: [720, 370], spikes: [],
    },
    {
      plats: [[0, 420, 180, 30], [300, 420, 120, 30], [560, 420, 240, 30], [200, 320, 70, 14], [470, 250, 50, 14]],
      lanterns: [[230, 290], [490, 215], [650, 390]],
      door: [740, 370], spikes: [[180, 120], [420, 140]],
    },
  ];

  let li = 0, lives = 3, p, got, lv;
  function load(i) {
    lv = LEVELS[i];
    p = { x: 30, y: 380, vx: 0, vy: 0, w: 22, h: 30, ground: false };
    got = lv.lanterns.map(() => false);
    document.getElementById("level").textContent = `Level ${i + 1}`;
  }
  load(0);

  function hud() {
    document.getElementById("score").textContent = `Lanterns ${got.filter(Boolean).length}/${got.length}`;
    document.getElementById("lives").textContent = "♥".repeat(Math.max(lives, 0));
  }

  function die() {
    lives -= 1;
    if (lives <= 0) { lives = 3; li = 0; }
    load(li);
  }

  function step() {
    p.vx = (keys.ArrowRight ? 4 : 0) - (keys.ArrowLeft ? 4 : 0);
    if (keys.Space && p.ground) { p.vy = -10.5; p.ground = false; }
    p.vy = Math.min(p.vy + 0.5, 12);
    p.x += p.vx; p.y += p.vy; p.ground = false;
    for (const [x, y, w, h] of lv.plats) {
      if (p.x + p.w > x && p.x < x + w && p.y + p.h > y && p.y + p.h - p.vy <= y + 1) {
        p.y = y - p.h; p.vy = 0; p.ground = true;
      }
    }
    p.x = Math.max(0, Math.min(800 - p.w, p.x));
    if (p.y > 470) die();
    for (const [x, w] of lv.spikes) if (p.x + p.w > x && p.x < x + w && p.y + p.h >= 440) die();
    lv.lanterns.forEach(([x, y], i) => { if (!got[i] && Math.abs(p.x + 11 - x) < 20 && Math.abs(p.y + 15 - y) < 24) got[i] = true; });
    const [dx, dy] = lv.door;
    if (got.every(Boolean) && Math.abs(p.x - dx) < 24 && Math.abs(p.y - dy) < 40) {
      li = (li + 1) % LEVELS.length; load(li);
    }
  }

  function draw() {
    ctx.clearRect(0, 0, 800, 450);
    ctx.fillStyle = "#5b6aa8";
    for (const [x, y, w, h] of lv.plats) ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#c2453c";
    for (const [x, w] of lv.spikes) for (let s = x; s < x + w; s += 20) {
      ctx.beginPath(); ctx.moveTo(s, 450); ctx.lineTo(s + 10, 430); ctx.lineTo(s + 20, 450); ctx.fill();
    }
    lv.lanterns.forEach(([x, y], i) => {
      if (got[i]) return;
      ctx.fillStyle = "#f2c14e"; ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
    });
    const [dx, dy] = lv.door;
    ctx.fillStyle = got.every(Boolean) ? "#6fcf97" : "#444b66";
    ctx.fillRect(dx, dy, 34, 50);
    ctx.fillStyle = "#e8e6df"; ctx.fillRect(p.x, p.y, p.w, p.h);
    hud();
  }

  (function loop() { step(); draw(); requestAnimationFrame(loop); })();
})();
