// Fedora-V Force blog theme: theme toggle, mobile menu, home search, TOC highlight,
// copy buttons, Giscus loader, hero grid. No dependencies.
const root = document.documentElement;
const media = matchMedia('(prefers-color-scheme: dark)');
const isDark = () => root.dataset.theme ? root.dataset.theme === 'dark' : media.matches;
const store = (k, v) => { try { localStorage.setItem(k, v) } catch (e) { /* storage unavailable */ } };

// theme toggle
const giscusTheme = () => {
  const el = document.getElementById('giscus');
  if (!el) return '';
  const local = /^(localhost|127\.|\[::1\])/.test(location.hostname);
  if (local) return isDark() ? 'dark' : 'light';
  return isDark() ? el.dataset.themeDark : el.dataset.themeLight;
};
const syncGiscus = () => {
  const frame = document.querySelector('iframe.giscus-frame');
  if (frame) frame.contentWindow.postMessage({ giscus: { setConfig: { theme: giscusTheme() } } }, 'https://giscus.app');
};
document.getElementById('theme-btn')?.addEventListener('click', () => {
  root.dataset.theme = isDark() ? 'light' : 'dark';
  store('fvf-theme', root.dataset.theme);
  syncGiscus();
});
media.addEventListener?.('change', syncGiscus);

// mobile menu
const top = document.getElementById('top');
const menuBtn = document.getElementById('menu-btn');
menuBtn?.addEventListener('click', () => {
  const open = top.classList.toggle('open');
  menuBtn.setAttribute('aria-expanded', open);
  menuBtn.setAttribute('aria-label', open ? '关闭菜单' : '打开菜单');
});

// home search: filter list items by title + summary
const q = document.getElementById('q');
if (q) {
  const items = [...document.querySelectorAll('#home-list [data-q]')];
  const empty = document.getElementById('q-empty');
  q.addEventListener('input', () => {
    const v = q.value.trim().toLowerCase();
    let shown = 0;
    for (const it of items) { const hit = !v || it.dataset.q.toLowerCase().includes(v); it.hidden = !hit; shown += hit }
    if (empty) empty.hidden = shown > 0;
  });
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) { e.preventDefault(); q.focus() }
  });
}

// TOC highlight
const tocLinks = [...document.querySelectorAll('.toc-side nav a[href^="#"]')];
if (tocLinks.length) {
  const heads = tocLinks.map(a => document.getElementById(decodeURIComponent(a.hash.slice(1)))).filter(Boolean);
  let ticking = false;
  const spy = () => {
    ticking = false;
    if (!heads.length) return;
    let cur = heads[0];
    for (const h of heads) if (h.getBoundingClientRect().top < 140) cur = h;
    for (const a of tocLinks) a.classList.toggle('on', decodeURIComponent(a.hash.slice(1)) === cur.id);
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(spy) } }, { passive: true });
  spy();
}

// copy buttons
const copy = (btn, text) => {
  const label = btn.textContent;
  const done = t => { btn.textContent = t; setTimeout(() => { btn.textContent = label }, 1600) };
  if (!navigator.clipboard) return done('请手动选中复制');
  navigator.clipboard.writeText(text).then(() => done('已复制'), () => done('请手动选中复制'));
};
document.querySelectorAll('[data-copy-code]').forEach(b => b.addEventListener('click', () => copy(b, b.closest('.term').querySelector('pre').innerText.replace(/\n$/, ''))));
document.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => copy(b, b.dataset.copy)));
document.querySelectorAll('[data-email-user]').forEach(c => {
  const addr = c.dataset.emailUser + '@' + c.dataset.emailDomain;
  c.textContent = addr;
  c.parentElement.querySelector('[data-copy-email]')?.addEventListener('click', e => copy(e.currentTarget, addr));
});

// Giscus: load lazily, with the theme that matches the page
const g = document.getElementById('giscus');
if (g) {
  const load = () => {
    const s = document.createElement('script');
    s.src = 'https://giscus.app/client.js';
    s.async = true;
    s.crossOrigin = 'anonymous';
    const attrs = {
      'data-repo': g.dataset.repo, 'data-repo-id': g.dataset.repoId,
      'data-category': g.dataset.category, 'data-category-id': g.dataset.categoryId,
      'data-mapping': g.dataset.mapping, 'data-strict': '1', 'data-reactions-enabled': '1',
      'data-emit-metadata': '0', 'data-input-position': 'top', 'data-lang': g.dataset.lang,
      'data-theme': giscusTheme(), 'data-loading': 'lazy'
    };
    for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
    g.appendChild(s);
  };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); load() } }, { rootMargin: '600px' });
    io.observe(g);
  } else load();
}

// hero: a grid of package cells coloured like build states
const cv = document.getElementById('farm');
if (cv && cv.getContext) {
  const ctx = cv.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cells = [], cw = 0, ch = 0, raf = 0;
  const pick = w => w < .62 ? '#2F63AD' : w < .7 ? '#3B74C4' : w < .9 ? '#26304F' : w < .97 ? '#C8463A' : '#FDB515';
  const draw = t => {
    ctx.clearRect(0, 0, cw, ch);
    for (const c of cells) {
      ctx.globalAlpha = c.a * (c.c === '#FDB515' ? .55 + .45 * Math.sin(t * 2.2 + c.ph) : 1);
      ctx.fillStyle = c.c;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(c.x, c.y, 14, 14, 3); else ctx.rect(c.x, c.y, 14, 14);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
  const setup = () => {
    const r = cv.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    cv.width = r.width * dpr; cv.height = r.height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cw = r.width; ch = r.height; cells = [];
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let y = 8; y < ch - 14; y += 18) for (let x = 8; x < cw - 14; x += 18) cells.push({ x, y, c: pick(rnd()), a: .35 + rnd() * .55, ph: rnd() * 6.28 });
    cancelAnimationFrame(raf);
    draw(0);
    if (!reduce) { const t0 = performance.now(); const loop = t => { draw((t - t0) / 1000); raf = requestAnimationFrame(loop) }; raf = requestAnimationFrame(loop) }
  };
  setup();
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(setup, 150) });
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelAnimationFrame(raf); else setup() });
}
