/* BEZEL — the few behaviours CSS cannot do. v0.3 (Apple dark)
   Everything else is native: <select>, <dialog>, <details>, <input type=range>.
   Drop-in: <script src="bezel.js" defer>. Wires anything already on the page and
   anything added later (one MutationObserver). No dependencies. */
(() => {
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---- segmented control: <div class="bz-seg"><button data-value>…
     The selected capsule is the container's ::before, positioned by --x/--w (Apple's sliding thumb). ---- */
  function seg(el) {
    if (el.dataset.bz) return; el.dataset.bz = '1';
    el.setAttribute('role', 'radiogroup');
    const btns = $$('button', el);
    const place = (b, animate = true) => {
      if (!animate) el.classList.add('noanim');
      el.style.setProperty('--x', (b.offsetLeft - el.clientLeft - parseFloat(getComputedStyle(el).paddingLeft)) + 'px');
      el.style.setProperty('--w', b.offsetWidth + 'px');
      if (!animate) requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('noanim')));
    };
    const set = (b, animate = true) => {
      btns.forEach((x) => { const on = x === b; x.setAttribute('aria-checked', on); x.classList.toggle('on', on); });
      el.value = b.dataset.value ?? b.textContent.trim();
      place(b, animate);
      el.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: el.value }));
    };
    btns.forEach((b) => {
      b.type = 'button'; b.setAttribute('role', 'radio');
      b.addEventListener('click', () => set(b));
    });
    const first = btns.find((b) => b.classList.contains('on')) || btns[0];
    if (first) {
      btns.forEach((x) => x.setAttribute('aria-checked', x === first));
      el.value = first.dataset.value ?? first.textContent.trim();
      place(first, false);
      // fonts arriving late change widths — re-measure once they are in
      if (document.fonts?.ready) document.fonts.ready.then(() => place(el.querySelector('button.on') || first, false));
    }
    new ResizeObserver(() => { const on = el.querySelector('button.on'); if (on) place(on, false); }).observe(el);
    el.addEventListener('keydown', (e) => {
      const i = btns.indexOf(document.activeElement); if (i < 0) return;
      const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!d) return; e.preventDefault(); const n = btns[(i + d + btns.length) % btns.length]; n.focus(); set(n);
    });
  }

  /* ---- tabs: <div class="bz-tabs"><div class="bz-tablist"><button data-tab=a>…</div><section data-panel=a>… ---- */
  function tabs(el) {
    if (el.dataset.bz) return; el.dataset.bz = '1';
    const list = el.querySelector('.bz-tablist');
    const btns = $$('[data-tab]', el), panels = $$('[data-panel]', el);
    const place = (b, animate = true) => {
      if (!list) return;
      if (!animate) list.classList.add('noanim');
      list.style.setProperty('--x', (b.offsetLeft - parseFloat(getComputedStyle(list).paddingLeft)) + 'px');
      list.style.setProperty('--w', b.offsetWidth + 'px');
      if (!animate) requestAnimationFrame(() => requestAnimationFrame(() => list.classList.remove('noanim')));
    };
    const show = (name, animate = true) => {
      let active = null;
      btns.forEach((b) => { const on = b.dataset.tab === name; if (on) active = b; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; });
      panels.forEach((p) => { p.hidden = p.dataset.panel !== name; });
      if (active) place(active, animate);
      el.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: name }));
    };
    btns.forEach((b) => { b.type = 'button'; b.setAttribute('role', 'tab'); b.addEventListener('click', () => show(b.dataset.tab)); });
    list?.setAttribute('role', 'tablist');
    el.addEventListener('keydown', (e) => {
      const i = btns.indexOf(document.activeElement); if (i < 0) return;
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return; e.preventDefault(); const n = btns[(i + d + btns.length) % btns.length]; n.focus(); show(n.dataset.tab);
    });
    show((btns.find((b) => b.classList.contains('on')) || btns[0])?.dataset.tab, false);
    if (document.fonts?.ready) document.fonts.ready.then(() => { const on = el.querySelector('[data-tab].on'); if (on) place(on, false); });
  }

  /* ---- slider: <label class="bz-slider"><span>Name</span><input type=range><output></output></label> ---- */
  function slider(el) {
    if (el.dataset.bz) return; el.dataset.bz = '1';
    const r = el.querySelector('input[type=range]'), out = el.querySelector('output');
    if (!r) return;
    const dp = el.dataset.dp != null ? +el.dataset.dp : (String(r.step).includes('.') ? String(r.step).split('.')[1].length : 0);
    const paint = () => {
      const min = +r.min || 0, max = r.max === '' ? 100 : +r.max, v = +r.value;
      r.style.setProperty('--p', `${((v - min) / (max - min || 1)) * 100}%`);
      if (out) out.textContent = v.toFixed(dp) + (el.dataset.unit || '');
    };
    r.addEventListener('input', paint); paint();
    out?.addEventListener('dblclick', () => {
      const v = prompt(el.querySelector('span')?.textContent || 'Value', r.value);
      if (v != null && v !== '') { r.value = v; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); }
    });
  }

  /* ---- glass: the specular highlight follows the pointer (Liquid Glass "lensing", cheap) ---- */
  function glass(el) {
    if (el.dataset.bzGlass) return; el.dataset.bzGlass = '1';
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      el.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  }

  /* ---- toast: BEZEL.toast('Saved', {kind:'ok'|'warn'|'bad', ms}) ---- */
  let stack;
  function toast(msg, { kind = '', ms = 2600 } = {}) {
    if (!stack) { stack = document.createElement('div'); stack.className = 'bz-toasts'; document.body.appendChild(stack); }
    const t = document.createElement('div'); t.className = `bz-toast bz-glass ${kind}`; t.setAttribute('role', 'status'); t.textContent = msg;
    stack.appendChild(t);
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => { t.classList.remove('in'); t.addEventListener('transitionend', () => t.remove(), { once: true }); }, ms);
    return t;
  }

  /* ---- dialog helpers: [data-open="#id"] opens, [data-close] closes, backdrop click closes ---- */
  function dialogs(root) {
    $$('dialog.bz-dialog', root).forEach((d) => {
      if (d.dataset.bz) return; d.dataset.bz = '1';
      d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
      $$('[data-close]', d).forEach((b) => b.addEventListener('click', () => d.close()));
    });
    $$('[data-open]', root).forEach((b) => {
      if (b.dataset.bz) return; b.dataset.bz = '1';
      b.addEventListener('click', () => document.querySelector(b.dataset.open)?.showModal());
    });
  }

  function wire(root = document) {
    $$('.bz-seg', root).forEach(seg);
    $$('.bz-tabs', root).forEach(tabs);
    $$('.bz-slider', root).forEach(slider);
    $$('.bz-glass', root).forEach(glass);
    dialogs(root);
  }

  const start = () => {
    wire();
    new MutationObserver((muts) => muts.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) wire(n); })))
      .observe(document.body, { childList: true, subtree: true });
  };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start) : start();

  window.BEZEL = { wire, toast, version: '0.3.0' };
})();
