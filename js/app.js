/* =====================================================================
   app.js  -  the core of the website.
   SECTIONS:  1 settings & data layer   2 small helpers   3 the cart
              4 header / footer         5 cart drawer     6 router
              7 login & register page   8 start-up
   The other pages live in shop.js (shop, checkout, my orders) and
   admin.js (admin panel). They plug into App.Views.
   ===================================================================== */
(function () {
  'use strict';

  // ---------- 1. SETTINGS & DATA LAYER ----------
  const cfg = Object.assign({ SHOP_NAME: 'Shop', TAGLINE: '', CURRENCY: '$' }, window.SHOP_CONFIG || {});
  const wantsLive = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  // Live keys present -> real database. Otherwise -> demo mode in this browser.
  const Store = wantsLive ? window.SupabaseStore : window.DemoStore;

  const App = { cfg, Store, live: wantsLive, user: null, products: [], Views: {}, onLeave: null };
  window.App = App;

  // ---------- 2. SMALL HELPERS ----------
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  // h() makes text safe to place inside HTML. EVERY value that comes from a
  // person or the database goes through h(), so a product called
  // "<script>..." is shown as plain text and never runs. (Anti-XSS.)
  const h = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => cfg.CURRENCY + Number(n).toFixed(2);
  const fmtDate = (iso) => { try { return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return ''; } };
  const STATUS = { pending: 'Pending', confirmed: 'Confirmed', out_for_delivery: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled' };

  function toast(text) {
    const el = document.createElement('div');
    el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = text;
    document.body.appendChild(el); setTimeout(() => el.remove(), 2800);
  }
  function showMsg(el, text, kind) { el.className = 'msg ' + (kind || 'error'); el.textContent = text; }
  function clearMsg(el) { el.className = 'msg'; el.textContent = ''; }

  // Shrinks a picture in the browser before upload (max 1200px, JPEG). Faster pages,
  // smaller storage use, and it removes hidden camera/location data from photos.
  async function resizeImage(file, max) {
    max = max || 1200;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Choose a JPG, PNG or WEBP picture.');
    if (file.size > 12 * 1024 * 1024) throw new Error('That picture is too big. Pick one under 12 MB.');
    const bmp = await createImageBitmap(file).catch(() => { throw new Error('That picture could not be read.'); });
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(bmp, 0, 0, c.width, c.height);
    return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not process the picture.'))), 'image/jpeg', 0.86));
  }

  Object.assign(App, { $, $$, h, money, fmtDate, STATUS, toast, showMsg, clearMsg, resizeImage });

  // ---------- 3. THE CART ----------
  // The cart lives in the visitor's browser so guests can shop without an
  // account. It stores ONLY {id, size, qty}. Prices always come from the
  // product list, and are checked again by the server when an order is placed.
  const CART_KEY = 'marlowe_cart_v1';
  const cart = {
    get() {
      try { const l = JSON.parse(localStorage.getItem(CART_KEY) || '[]'); return Array.isArray(l) ? l.filter((i) => Number.isInteger(i.id) && Number.isInteger(i.qty) && i.qty > 0) : []; }
      catch (e) { return []; }
    },
    save(list, silent) {
      try { localStorage.setItem(CART_KEY, JSON.stringify(list)); } catch (e) { /* storage blocked */ }
      updateCount(); if (!silent) document.dispatchEvent(new CustomEvent('cart:changed'));
    },
    add(id, size, qty) {
      const l = cart.get(); const f = l.find((i) => i.id === id && i.size === size);
      if (f) f.qty = Math.min(20, f.qty + qty); else l.push({ id, size, qty: Math.min(20, qty) });
      cart.save(l);
    },
    setQty(id, size, qty) { cart.save(cart.get().map((i) => (i.id === id && i.size === size ? Object.assign({}, i, { qty }) : i)).filter((i) => i.qty > 0)); },
    clear() { cart.save([]); },
    count() { return cart.get().reduce((s, i) => s + i.qty, 0); },

    // Combine the cart with the product list -> lines with name, price, stock warnings, totals.
    priced() {
      const lines = []; let cents = 0, ok = true; const used = {}; const fixed = [];
      cart.get().forEach((it) => {
        const p = App.products.find((x) => x.id === it.id);
        let qty = it.qty, issue = null;
        if (!p) { issue = 'No longer available'; qty = 0; }
        else {
          if (p.sizes.length && !p.sizes.includes(it.size)) issue = 'Choose a size';
          const avail = p.stock - (used[p.id] || 0);
          if (avail < 1) { issue = issue || 'Out of stock'; qty = 0; }
          else if (qty > avail) { issue = issue || ('Only ' + avail + ' left'); qty = avail; }
          used[p.id] = (used[p.id] || 0) + qty;
        }
        if (issue) ok = false;
        const unit = p ? p.price : 0, line = Math.round(unit * 100) * qty;
        cents += line;
        lines.push({ id: it.id, size: it.size, qty, name: p ? p.name : 'Unavailable item', image: p ? p.image : null, unit, total: line / 100, stock: p ? p.stock : 0, issue, wanted: it.qty });
        if (p && qty > 0 && qty < it.qty) fixed.push({ id: it.id, size: it.size, qty });
      });
      if (fixed.length) {   // reduce the saved cart to what is really in stock
        cart.save(cart.get().map((i) => { const f = fixed.find((x) => x.id === i.id && x.size === i.size); return f ? Object.assign({}, i, { qty: f.qty }) : i; }), true);
        toast('Some quantities were reduced to what is in stock.');
      }
      return { lines, subtotal: cents / 100, ok: ok && lines.length > 0 };
    },
  };
  App.cart = cart;

  async function loadCatalog() { App.products = await Store.listProducts(); return App.products; }
  App.loadCatalog = loadCatalog;

  // ---------- 4. HEADER / FOOTER ----------
  function updateCount() { $$('.cart-btn .count').forEach((el) => { el.textContent = cart.count(); }); }

  function renderHeader() {
    const u = App.user;
    const links = ['<a href="#/">Shop</a>'];
    if (u && u.role === 'customer') links.push('<a href="#/orders">My orders</a>');
    if (u && u.role === 'admin') links.push('<a href="#/admin">Admin panel</a>');
    if (u) {
      links.push('<span class="who">' + h(u.name || u.email) + ' <span class="role-tag">' + h(u.role) + '</span></span>');
      links.push('<button class="linklike" id="logout-btn" type="button">Sign out</button>');
    } else links.push('<a href="#/login">Sign in</a>');
    const showCart = !(u && u.role === 'admin');
    $('#site-header').innerHTML =
      '<div class="bar"><a class="brand" href="#/">' + h(cfg.SHOP_NAME) + '</a><nav class="nav" aria-label="Main">' + links.join('') +
      (showCart ? '<button class="cart-btn" id="cart-btn" type="button" aria-label="Open cart">Cart <span class="count">0</span></button>' : '') + '</nav></div>';
    const out = $('#logout-btn');
    if (out) out.addEventListener('click', async () => { await Store.signOut(); App.user = null; App.go('/'); });
    const cb = $('#cart-btn'); if (cb) cb.addEventListener('click', openCart);
    updateCount();
  }

  function renderFooter() {
    const contact = [];
    if (cfg.CONTACT_WHATSAPP) contact.push('<a href="https://wa.me/' + encodeURIComponent(String(cfg.CONTACT_WHATSAPP).replace(/\D/g, '')) + '" rel="noopener noreferrer" target="_blank">WhatsApp us</a>');
    if (cfg.CONTACT_EMAIL) contact.push('<a href="mailto:' + h(cfg.CONTACT_EMAIL) + '">' + h(cfg.CONTACT_EMAIL) + '</a>');
    $('#site-footer').innerHTML = '<div class="wrap foot"><strong>' + h(cfg.SHOP_NAME) + '</strong><span>' + h(cfg.TAGLINE) + '</span><span class="foot-links">' + contact.join(' &nbsp;·&nbsp; ') + '</span></div>';
  }

  // ---------- 5. CART DRAWER ----------
  let drawer, scrim, linesEl, footEl;
  function buildDrawer() {
    scrim = document.createElement('div'); scrim.className = 'scrim';
    drawer = document.createElement('aside'); drawer.className = 'drawer'; drawer.setAttribute('aria-label', 'Shopping cart'); drawer.setAttribute('aria-hidden', 'true');
    drawer.innerHTML = '<header><h2>Your cart</h2><button class="linklike" id="cart-close" type="button">Close</button></header><div class="lines" id="cart-lines"></div><footer id="cart-foot"></footer>';
    document.body.append(scrim, drawer);
    linesEl = $('#cart-lines'); footEl = $('#cart-foot');
    scrim.addEventListener('click', closeCart); $('#cart-close').addEventListener('click', closeCart);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCart(); });
    document.addEventListener('cart:changed', () => { if (drawer.classList.contains('open')) drawCart(); });
    // one listener handles every +, - and Remove button (event delegation)
    linesEl.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]'); if (!b) return;
      const id = Number(b.dataset.id), size = b.dataset.size, it = cart.get().find((i) => i.id === id && i.size === size); if (!it) return;
      if (b.dataset.act === 'inc') cart.setQty(id, size, Math.min(20, it.qty + 1));
      if (b.dataset.act === 'dec') cart.setQty(id, size, it.qty - 1);
      if (b.dataset.act === 'rm') cart.setQty(id, size, 0);
    });
  }
  async function openCart() {
    if (!drawer) buildDrawer();
    drawer.classList.add('open'); scrim.classList.add('open'); drawer.setAttribute('aria-hidden', 'false');
    try { await loadCatalog(); } catch (e) { /* show what we have */ }
    drawCart();
  }
  function closeCart() { if (!drawer) return; drawer.classList.remove('open'); scrim.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); }

  function drawCart() {
    if (!cart.get().length) { linesEl.innerHTML = '<p class="empty">Your cart is empty. Pick something you like from the shop.</p>'; footEl.innerHTML = ''; return; }
    const d = cart.priced();
    linesEl.innerHTML = d.lines.map((l) =>
      '<div class="line"><img src="' + h(l.image || 'img/placeholder.svg') + '" alt="">' +
      '<div><div class="t">' + h(l.name) + '</div><div class="s">' + (l.size ? 'Size ' + h(l.size) + ' · ' : '') + money(l.unit) + ' each</div>' +
      (l.issue ? '<div class="issue">' + h(l.issue) + '</div>' : '') +
      '<div class="stepper"><button type="button" data-act="dec" data-id="' + l.id + '" data-size="' + h(l.size) + '" aria-label="Fewer">−</button><span aria-live="polite">' + l.qty + '</span>' +
      '<button type="button" data-act="inc" data-id="' + l.id + '" data-size="' + h(l.size) + '" aria-label="More"' + (l.qty >= l.stock || l.qty >= 20 ? ' disabled' : '') + '>+</button></div></div>' +
      '<div class="right"><strong>' + money(l.total) + '</strong><button class="linklike muted" type="button" data-act="rm" data-id="' + l.id + '" data-size="' + h(l.size) + '">Remove</button></div></div>').join('');
    footEl.innerHTML = '<div class="sum total"><span>Subtotal</span><span>' + money(d.subtotal) + '</span></div><p class="muted small">Delivery is added at checkout, based on your area.</p>' +
      '<button class="btn primary block" id="go-checkout" type="button">' + (App.user ? 'Go to checkout' : 'Sign in to checkout') + '</button>';
    $('#go-checkout').addEventListener('click', () => {
      if (!d.ok) { toast('Fix the highlighted items first.'); return; }
      closeCart(); App.go(App.user ? '/checkout' : '/login?next=checkout');
    });
  }
  App.openCart = openCart; App.closeCart = closeCart;

  // ---------- 6. ROUTER ----------
  // Pages are chosen by the part after "#" in the address (e.g. #/admin).
  // This works on any free host without special server settings.
  const ROUTES = { '/': ['shop', ''], '/login': ['login', 'Sign in'], '/checkout': ['checkout', 'Checkout'], '/orders': ['orders', 'My orders'], '/admin': ['admin', 'Admin panel'] };
  App.go = (path) => { if (location.hash === '#' + path) render(); else location.hash = '#' + path; };

  async function render() {
    if (typeof App.onLeave === 'function') { try { App.onLeave(); } catch (e) { /* ignore */ } App.onLeave = null; }
    const raw = location.hash.replace(/^#/, '') || '/';
    const parts = raw.split('?'); const entry = ROUTES[parts[0]] || ROUTES['/']; const query = new URLSearchParams(parts[1] || '');
    closeCart();
    try { App.user = await Store.getUser(); } catch (e) { App.user = null; }
    renderHeader();
    const view = $('#view'); view.innerHTML = '<div class="wrap"><p class="empty">Loading…</p></div>';
    document.title = entry[1] ? entry[1] + ' · ' + cfg.SHOP_NAME : cfg.SHOP_NAME;
    try { await App.Views[entry[0]](view, query); }
    catch (e) { view.innerHTML = '<div class="wrap"><p class="msg error">' + h(e.message || 'Something went wrong.') + '</p></div>'; }
    window.scrollTo(0, 0); view.focus({ preventScroll: true });
  }

  // ---------- 7. LOGIN & REGISTER PAGE ----------
  // ONE form for shoppers and the shop owner. The browser never decides the
  // role - it only sends email + password, then goes where the server says.
  const SAFE_NEXT = ['checkout'];   // the only place we allow "go here after login" (stops open-redirect tricks)

  App.Views.login = async function (view, query) {
    if (App.user) { App.go(App.user.role === 'admin' ? '/admin' : '/'); return; }
    const demo = !App.live
      ? '<div class="msg info"><strong>Demo mode.</strong> Try the shop owner view with <code>admin@demo.test</code> / <code>demo1234</code>, or shop as <code>customer@demo.test</code> / <code>demo1234</code>. ' +
        '<button class="linklike" id="fill-admin" type="button">Fill in admin</button> · <button class="linklike" id="fill-cust" type="button">Fill in customer</button></div>' : '';
    view.innerHTML =
      '<div class="wrap"><div class="narrow panel"><div class="tabs" role="tablist"><button class="tab" id="tab-in" role="tab" aria-selected="true" type="button">Sign in</button>' +
      '<button class="tab" id="tab-up" role="tab" aria-selected="false" type="button">Create account</button></div>' + demo +
      '<form id="form-in" novalidate><div class="msg" id="msg-in" role="alert"></div>' +
      '<div class="field"><label for="in-email">Email</label><input id="in-email" type="email" autocomplete="username" required></div>' +
      '<div class="field"><label for="in-pass">Password</label><input id="in-pass" type="password" autocomplete="current-password" required></div>' +
      '<button class="btn primary block" type="submit" id="btn-in">Sign in</button></form>' +
      '<form id="form-up" class="hidden" novalidate><div class="msg" id="msg-up" role="alert"></div>' +
      '<div class="field"><label for="up-name">Full name</label><input id="up-name" autocomplete="name" maxlength="100" required></div>' +
      '<div class="field"><label for="up-email">Email</label><input id="up-email" type="email" autocomplete="email" required></div>' +
      '<div class="field"><label for="up-phone">Phone (for delivery)</label><input id="up-phone" type="tel" autocomplete="tel" maxlength="20"></div>' +
      '<div class="field"><label for="up-pass">Password</label><input id="up-pass" type="password" autocomplete="new-password" required><small>At least 8 characters, with a letter and a number.</small></div>' +
      '<button class="btn primary block" type="submit" id="btn-up">Create account</button></form></div></div>';

    const tab = (signIn) => { $('#form-in').classList.toggle('hidden', !signIn); $('#form-up').classList.toggle('hidden', signIn); $('#tab-in').setAttribute('aria-selected', String(signIn)); $('#tab-up').setAttribute('aria-selected', String(!signIn)); };
    $('#tab-in').onclick = () => tab(true); $('#tab-up').onclick = () => tab(false);
    if ($('#fill-admin')) { $('#fill-admin').onclick = () => { $('#in-email').value = 'admin@demo.test'; $('#in-pass').value = 'demo1234'; }; $('#fill-cust').onclick = () => { $('#in-email').value = 'customer@demo.test'; $('#in-pass').value = 'demo1234'; }; }

    const next = query.get('next');
    const done = (u) => App.go(u.role === 'admin' ? '/admin' : (SAFE_NEXT.includes(next) ? '/' + next : '/'));

    $('#form-in').addEventListener('submit', async (e) => {
      e.preventDefault(); const btn = $('#btn-in'); btn.disabled = true; clearMsg($('#msg-in'));
      try { done(await Store.signIn($('#in-email').value, $('#in-pass').value)); }
      catch (err) { showMsg($('#msg-in'), err.message); btn.disabled = false; }
    });

    $('#form-up').addEventListener('submit', async (e) => {
      e.preventDefault(); const btn = $('#btn-up'); const msg = $('#msg-up'); clearMsg(msg);
      const name = $('#up-name').value.trim(), email = $('#up-email').value.trim(), phone = $('#up-phone').value.trim(), pass = $('#up-pass').value;
      // quick friendly checks (the server checks again - these only save time)
      if (name.length < 2) return showMsg(msg, 'Enter your full name.');
      if (!/^\S+@\S+\.\S+$/.test(email)) return showMsg(msg, 'Enter a valid email address.');
      if (phone && !/^\+?[0-9 ()-]{7,20}$/.test(phone)) return showMsg(msg, 'Enter a valid phone number.');
      if (pass.length < 8 || pass.length > 72 || !/[A-Za-z]/.test(pass) || !/\d/.test(pass)) return showMsg(msg, 'Password needs 8+ characters with a letter and a number.');
      btn.disabled = true;
      try {
        const r = await Store.signUp({ name, email, phone, password: pass });
        if (r.needsEmailConfirm) { showMsg(msg, 'Almost done! We sent a confirmation link to ' + email + '. Open it, then sign in here.', 'ok'); btn.disabled = false; return; }
        done(r.user);
      } catch (err) { showMsg(msg, err.message); btn.disabled = false; }
    });
  };

  // ---------- 8. START-UP ----------
  App.start = async function () {
    renderFooter();
    const banner = $('#demo-banner');
    if (wantsLive && !Store) {
      $('#view').innerHTML = '<div class="wrap"><p class="msg error">The shop could not connect to its database. Check the two Supabase values in js/config.js and your internet connection.</p></div>';
      return;
    }
    if (!App.live) { banner.hidden = false; banner.textContent = 'Demo mode: everything you do is saved only in this browser. To go live, follow Part C of the guide.'; }
    try { await Store.init(); } catch (e) { /* ignore */ }
    window.addEventListener('hashchange', render);
    render();
  };
  document.addEventListener('DOMContentLoaded', App.start);
})();
