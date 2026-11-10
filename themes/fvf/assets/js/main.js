// Fedora-V Force blog theme. No dependencies.
// Site-wide behaviour is set up once; per-page behaviour lives in initPage(),
// which runs on first load and again after every PJAX navigation.
const root = document.documentElement;
const media = matchMedia('(prefers-color-scheme: dark)');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const isDark = () => root.dataset.theme ? root.dataset.theme === 'dark' : media.matches;
const store = (k, v) => { try { localStorage.setItem(k, v) } catch (e) { /* storage unavailable */ } };
const isZh = () => /^zh/i.test(root.lang);
const t = (zh, en) => isZh() ? zh : en;

/* ---------- giscus ---------- */
const giscusTheme = el => {
  if (/^(localhost|127\.|\[::1\])/.test(location.hostname)) return isDark() ? 'dark' : 'light';
  return isDark() ? el.dataset.themeDark : el.dataset.themeLight;
};
const syncGiscus = () => {
  const el = document.getElementById('giscus');
  const frame = document.querySelector('iframe.giscus-frame');
  if (el && frame) frame.contentWindow.postMessage({ giscus: { setConfig: { theme: giscusTheme(el) } } }, 'https://giscus.app');
};
// Same rule giscus uses for mapping="pathname", applied to the Chinese page's path,
// so an article and its translation share one discussion.
const giscusTerm = path => {
  const p = new URL(path, location.origin).pathname;
  return p.length < 2 ? 'index' : p.substring(1).replace(/\.\w+$/, '');
};
function initGiscus(cleanups) {
  const g = document.getElementById('giscus');
  if (!g) return;
  const load = () => {
    const s = document.createElement('script');
    s.src = 'https://giscus.app/client.js';
    s.async = true;
    s.crossOrigin = 'anonymous';
    const attrs = {
      'data-repo': g.dataset.repo, 'data-repo-id': g.dataset.repoId,
      'data-category': g.dataset.category, 'data-category-id': g.dataset.categoryId,
      'data-mapping': 'specific', 'data-term': giscusTerm(g.dataset.termPath || location.pathname),
      'data-strict': '1', 'data-reactions-enabled': '1', 'data-emit-metadata': '0',
      'data-input-position': 'top', 'data-lang': g.dataset.lang, 'data-theme': giscusTheme(g), 'data-loading': 'lazy'
    };
    for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
    g.appendChild(s);
  };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); load() } }, { rootMargin: '600px' });
    io.observe(g);
    cleanups.push(() => io.disconnect());
  } else load();
}

/* ---------- per-page features ---------- */
function initSearch() {
  const q = document.getElementById('q');
  if (!q) return;
  const items = [...document.querySelectorAll('#home-list [data-q]')];
  const empty = document.getElementById('q-empty');
  q.addEventListener('input', () => {
    const v = q.value.trim().toLowerCase();
    let shown = 0;
    for (const it of items) { const hit = !v || it.dataset.q.toLowerCase().includes(v); it.hidden = !hit; shown += hit }
    if (empty) empty.hidden = shown > 0;
  });
}

let tocState = null;
function initToc() {
  const links = [...document.querySelectorAll('.toc-side nav a[href^="#"]')];
  const heads = links.map(a => document.getElementById(decodeURIComponent(a.hash.slice(1)))).filter(Boolean);
  tocState = heads.length ? { links, heads } : null;
  spy();
}
function spy() {
  if (!tocState) return;
  let cur = tocState.heads[0];
  for (const h of tocState.heads) if (h.getBoundingClientRect().top < 140) cur = h;
  for (const a of tocState.links) a.classList.toggle('on', decodeURIComponent(a.hash.slice(1)) === cur.id);
}

const copy = (btn, text) => {
  const label = btn.textContent;
  const done = msg => { btn.textContent = msg; setTimeout(() => { btn.textContent = label }, 1600) };
  if (!navigator.clipboard) return done(t('请手动选中复制', 'Select and copy manually'));
  navigator.clipboard.writeText(text).then(() => done(t('已复制', 'Copied')), () => done(t('请手动选中复制', 'Select and copy manually')));
};
function initCopy() {
  document.querySelectorAll('[data-copy-code]').forEach(b => b.addEventListener('click', () => copy(b, b.closest('.term').querySelector('pre').innerText.replace(/\n$/, ''))));
  document.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => copy(b, b.dataset.copy)));
  document.querySelectorAll('[data-email-user]').forEach(c => {
    const addr = c.dataset.emailUser + '@' + c.dataset.emailDomain;
    c.textContent = addr;
    c.parentElement.querySelector('[data-copy-email]')?.addEventListener('click', e => copy(e.currentTarget, addr));
  });
}

// hero: a grid of package cells coloured like build states
function initFarm(cleanups) {
  const cv = document.getElementById('farm');
  if (!cv || !cv.getContext) return;
  const ctx = cv.getContext('2d');
  let cells = [], cw = 0, ch = 0, raf = 0, rt = 0;
  const pick = w => w < .62 ? '#2F63AD' : w < .7 ? '#3B74C4' : w < .9 ? '#26304F' : w < .97 ? '#C8463A' : '#FDB515';
  const draw = time => {
    ctx.clearRect(0, 0, cw, ch);
    for (const c of cells) {
      ctx.globalAlpha = c.a * (c.c === '#FDB515' ? .55 + .45 * Math.sin(time * 2.2 + c.ph) : 1);
      ctx.fillStyle = c.c;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(c.x, c.y, 14, 14, 3); else ctx.rect(c.x, c.y, 14, 14);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
  const setup = () => {
    cancelAnimationFrame(raf);
    const r = cv.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    cv.width = r.width * dpr; cv.height = r.height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cw = r.width; ch = r.height; cells = [];
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let y = 8; y < ch - 14; y += 18) for (let x = 8; x < cw - 14; x += 18) cells.push({ x, y, c: pick(rnd()), a: .35 + rnd() * .55, ph: rnd() * 6.28 });
    draw(0);
    if (!reduceMotion.matches && !document.hidden) { const t0 = performance.now(); const loop = now => { draw((now - t0) / 1000); raf = requestAnimationFrame(loop) }; raf = requestAnimationFrame(loop) }
  };
  const onResize = () => { clearTimeout(rt); rt = setTimeout(setup, 150) };
  const onVisible = () => { if (document.hidden) cancelAnimationFrame(raf); else setup() };
  setup();
  addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVisible);
  cleanups.push(() => { cancelAnimationFrame(raf); clearTimeout(rt); removeEventListener('resize', onResize); document.removeEventListener('visibilitychange', onVisible) });
}

let pageCleanups = [];
function initPage() {
  pageCleanups.forEach(fn => fn());
  pageCleanups = [];
  initSearch();
  initToc();
  initCopy();
  initGiscus(pageCleanups);
  initFarm(pageCleanups);
}

/* ---------- site-wide, once ---------- */
document.addEventListener('click', e => {
  const btn = e.target.closest('#theme-btn, #menu-btn');
  if (!btn) return;
  if (btn.id === 'theme-btn') {
    root.dataset.theme = isDark() ? 'light' : 'dark';
    store('fvf-theme', root.dataset.theme);
    syncGiscus();
  } else {
    const top = document.getElementById('top');
    const open = top.classList.toggle('open');
    btn.setAttribute('aria-expanded', open);
    btn.setAttribute('aria-label', open ? btn.dataset.labelClose : btn.dataset.labelOpen);
  }
});
media.addEventListener?.('change', syncGiscus);
document.addEventListener('keydown', e => {
  const q = document.getElementById('q');
  if (q && e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) { e.preventDefault(); q.focus() }
});
let ticking = false;
addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; spy() }) } }, { passive: true });

/* ---------- PJAX ---------- */
const progress = document.getElementById('progress');
const assetKey = d => [...d.querySelectorAll('link[rel=stylesheet], script[src]')].map(n => n.getAttribute('href') || n.getAttribute('src')).filter(s => !s.includes('giscus.app')).join('|');
const pageAssets = assetKey(document);
let inflight = null;
let currentPage = location.pathname + location.search;

const pjaxable = (a, e) => {
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  if (a.target && a.target !== '_self') return false;
  if (a.hasAttribute('download') || a.hasAttribute('data-no-pjax')) return false;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin) return false;
  if (!/(\/|\.html)$/.test(url.pathname)) return false;
  if (url.pathname === location.pathname && url.search === location.search && url.hash) return false;
  return url;
};

const saveScroll = () => history.replaceState({ ...(history.state || {}), y: scrollY }, '');

async function navigate(url, { push = true, y = 0 } = {}) {
  inflight?.abort();
  const ctrl = new AbortController();
  inflight = ctrl;
  const timer = setTimeout(() => progress?.classList.add('run'), 120);
  try {
    const res = await fetch(url.href, { signal: ctrl.signal, headers: { Accept: 'text/html' } });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('text/html')) throw new Error('not html');
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    if (assetKey(doc) !== pageAssets || !doc.querySelector('main')) throw new Error('assets changed');
    if (ctrl.signal.aborted) return;
    const apply = () => {
      document.title = doc.title;
      root.lang = doc.documentElement.lang;
      for (const sel of ['meta[name=description]', 'link[rel=canonical]', 'meta[property="og:title"]', 'meta[property="og:description"]', 'meta[property="og:url"]', 'meta[property="og:type"]']) {
        const cur = document.head.querySelector(sel), next = doc.head.querySelector(sel);
        if (cur && next) cur.replaceWith(next.cloneNode(true));
      }
      document.head.querySelectorAll('link[rel=alternate]').forEach(n => n.remove());
      doc.head.querySelectorAll('link[rel=alternate]').forEach(n => document.head.appendChild(n.cloneNode(true)));
      for (const id of ['top', 'main']) document.getElementById(id).replaceWith(document.adoptNode(doc.getElementById(id)));
      document.querySelector('footer').replaceWith(document.adoptNode(doc.querySelector('footer')));
      const skip = document.querySelector('.skip'), nextSkip = doc.querySelector('.skip');
      if (skip && nextSkip) skip.textContent = nextSkip.textContent;
      if (push) history.pushState({ y: 0 }, '', url.href);
      currentPage = url.pathname + url.search;
      const target = url.hash && document.getElementById(decodeURIComponent(url.hash.slice(1)));
      if (target) target.scrollIntoView(); else scrollTo(0, y);
      initPage();
    };
    if (document.startViewTransition && !reduceMotion.matches) await document.startViewTransition(apply).updateCallbackDone;
    else apply();
    document.getElementById('main').focus({ preventScroll: true });
    const live = document.getElementById('announce');
    if (live) live.textContent = doc.title;
  } catch (err) {
    if (err.name === 'AbortError') return;
    location.assign(url.href);
  } finally {
    clearTimeout(timer);
    if (inflight === ctrl) {
      inflight = null;
      if (progress?.classList.contains('run')) {
        progress.classList.replace('run', 'done');
        setTimeout(() => progress.classList.remove('done'), 600);
      }
    }
  }
}

if (window.fetch && window.DOMParser && history.pushState) {
  history.scrollRestoration = 'manual';
  history.replaceState({ ...(history.state || {}), y: scrollY }, '');
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    const url = pjaxable(a, e);
    if (!url) return;
    e.preventDefault();
    document.getElementById('top')?.classList.remove('open');
    saveScroll();
    navigate(url);
  });
  addEventListener('popstate', e => {
    // Back/forward between #anchors of the same page: let the browser scroll.
    if (location.pathname + location.search === currentPage) return;
    navigate(new URL(location.href), { push: false, y: e.state?.y || 0 });
  });
  addEventListener('pagehide', saveScroll);
}

initPage();
