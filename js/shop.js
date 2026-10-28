/* =====================================================================
   shop.js  -  what shoppers see.
   SECTIONS: 1 shop page (hero, filters, grid)   2 product pop-up
             3 checkout page                      4 "my orders" page
   ===================================================================== */
(function () {
  'use strict';
  const { $, $$, h, money, fmtDate, STATUS, toast, showMsg, clearMsg, cart, Store, cfg } = App;
  const PLACEHOLDER = 'img/placeholder.svg';

  // ---------- 1. SHOP PAGE ----------
  App.Views.shop = async function (view) {
    const products = await App.loadCatalog();
    let category = '', term = '';
    const cats = Array.from(new Set(products.map((p) => p.category))).sort();
    const lowest = products.length ? Math.min.apply(null, products.map((p) => p.price)) : 0;
    const hero = products.slice(0, 3);

    view.innerHTML =
      '<section class="hero"><div class="wrap hero-grid"><div class="hero-copy"><h1>' + h(cfg.TAGLINE || cfg.SHOP_NAME) + '</h1>' +
      '<p>Everyday pieces, cut well and priced fairly. Browse freely, you only need an account when you are ready to order.</p>' +
      '<a class="btn light" href="#collection" id="hero-cta">Shop the collection</a></div>' +
      '<div class="collage" aria-hidden="true">' + hero.map((p, i) => '<img class="c' + (i + 1) + '" src="' + h(p.image || PLACEHOLDER) + '" alt="">').join('') +
      (products.length ? '<span class="sticker">from ' + h(money(lowest)) + '</span>' : '') + '</div></div></section>' +
      '<section class="wrap" id="collection"><div class="toolbar"><input type="search" id="search" placeholder="Search the collection" aria-label="Search products">' +
      '<div class="chips" id="chips" role="group" aria-label="Categories"></div></div><div class="grid" id="grid" aria-live="polite"></div></section>';

    $('#hero-cta').addEventListener('click', (e) => { e.preventDefault(); $('#collection').scrollIntoView({ behavior: 'smooth' }); });

    function draw() {
      $('#chips').innerHTML = ['All'].concat(cats).map((c) => { const v = c === 'All' ? '' : c; return '<button class="chip" type="button" data-cat="' + h(v) + '" aria-pressed="' + (v === category) + '">' + h(c) + '</button>'; }).join('');
      const t = term.toLowerCase();
      const list = products.filter((p) => (!category || p.category === category) && (!t || (p.name + ' ' + p.description).toLowerCase().includes(t)));
      $('#grid').innerHTML = list.length ? list.map((p) =>
        '<button class="tile" type="button" data-id="' + p.id + '"><div class="photo"><img src="' + h(p.image || PLACEHOLDER) + '" alt="' + h(p.name) + '" loading="lazy">' +
        (p.stock < 1 ? '<span class="tag-out">Sold out</span>' : '') + '</div><div class="tile-row"><span class="name">' + h(p.name) + '</span><span class="price">' + money(p.price) + '</span></div>' +
        '<div class="meta">' + h(p.category) + '</div></button>').join('')
        : '<p class="empty">Nothing matches that search. Try another word or category.</p>';
    }
    $('#chips').addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (b) { category = b.dataset.cat; draw(); } });
    let timer; $('#search').addEventListener('input', (e) => { clearTimeout(timer); timer = setTimeout(() => { term = e.target.value.trim(); draw(); }, 200); });
    $('#grid').addEventListener('click', (e) => { const t = e.target.closest('.tile'); if (t) openDetails(products.find((p) => p.id === Number(t.dataset.id))); });
    if (!products.length) $('#grid').innerHTML = '<p class="empty">The shop is being stocked. Please check back soon.</p>'; else draw();
  };

  // ---------- 2. PRODUCT POP-UP (opens without signing in) ----------
  let dlg;
  function openDetails(p) {
    if (!p) return;
    if (!dlg) {
      dlg = document.createElement('dialog'); dlg.setAttribute('aria-label', 'Product details'); document.body.appendChild(dlg);
      dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    }
    let size = '';
    dlg.innerHTML =
      '<div class="detail"><div class="photo"><img src="' + h(p.image || PLACEHOLDER) + '" alt="' + h(p.name) + '"></div><div class="info">' +
      '<button class="close-x" id="d-close" type="button" aria-label="Close">&times;</button>' +
      '<div class="meta">' + h(p.category) + '</div><h2>' + h(p.name) + '</h2><div class="price big">' + money(p.price) + '</div>' +
      '<p>' + h(p.description) + '</p><p class="muted small">' + (p.stock < 1 ? 'Sold out' : p.stock <= 5 ? 'Only ' + p.stock + ' left' : 'In stock') + '</p>' +
      (p.sizes.length ? '<label>Size</label><div class="sizes" id="d-sizes">' + p.sizes.map((s) => '<button class="size" type="button" data-size="' + h(s) + '" aria-pressed="false">' + h(s) + '</button>').join('') + '</div>' : '') +
      '<div class="field"><label for="d-qty">Quantity</label><input id="d-qty" type="number" min="1" max="' + Math.min(20, Math.max(1, p.stock)) + '" value="1" class="qty"></div>' +
      '<div class="msg" id="d-msg" role="alert"></div><button class="btn primary block" id="d-add" type="button"' + (p.stock < 1 ? ' disabled' : '') + '>Add to cart</button></div></div>';
    $('#d-close', dlg).onclick = () => dlg.close();
    const sizes = $('#d-sizes', dlg);
    if (sizes) sizes.addEventListener('click', (e) => { const b = e.target.closest('.size'); if (!b) return; size = b.dataset.size; $$('.size', sizes).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); });
    $('#d-add', dlg).onclick = () => {
      if (p.sizes.length && !size) return showMsg($('#d-msg', dlg), 'Choose a size first.');
      const qty = Math.max(1, Math.min(Number($('#d-qty', dlg).value) || 1, p.stock, 20));
      cart.add(p.id, size, qty); dlg.close(); toast('Added to cart'); App.openCart();
    };
    dlg.showModal();
  }

  // ---------- 3. CHECKOUT (signed-in customers only) ----------
  App.Views.checkout = async function (view) {
    if (!App.user) { App.go('/login?next=checkout'); return; }                       // must sign in to order
    if (App.user.role === 'admin') { view.innerHTML = '<div class="wrap"><p class="msg info">Admin accounts cannot place orders. Sign in with a customer account to test ordering.</p></div>'; return; }
    await App.loadCatalog();
    if (!cart.get().length) { view.innerHTML = '<div class="wrap narrow"><h1>Your cart is empty</h1><a class="btn primary" href="#/">Go to the shop</a></div>'; return; }
    const zones = await Store.listZones();
    let geo = null;

    view.innerHTML =
      '<div class="wrap checkout"><section><h1>Delivery details</h1><div class="msg" id="msg" role="alert"></div><form id="form" novalidate>' +
      '<div class="row"><div class="field"><label for="f-name">Full name</label><input id="f-name" disabled></div>' +
      '<div class="field"><label for="f-phone">Phone number</label><input id="f-phone" type="tel" autocomplete="tel" maxlength="20" required></div></div>' +
      '<div class="field"><label for="f-zone">Delivery area</label><select id="f-zone" required></select><small>We only deliver to the areas listed. The fee depends on the area.</small></div>' +
      '<div class="field"><label for="f-address">Street address / house number</label><input id="f-address" autocomplete="street-address" maxlength="255" required></div>' +
      '<div class="field"><label for="f-landmark">Nearby landmark (optional)</label><input id="f-landmark" maxlength="150"></div>' +
      '<div class="field"><button class="btn small" type="button" id="btn-geo">Share my current location</button> <small id="geo-status">Optional. Helps the rider find you.</small></div>' +
      '<div class="field"><label for="f-notes">Note for the rider (optional)</label><textarea id="f-notes" maxlength="500"></textarea></div>' +
      '<button class="btn primary" type="submit" id="btn-order">Place order</button></form></section>' +
      '<aside class="panel summary" aria-label="Order summary"><h2>Your order</h2><div id="lines"></div><div class="sum"><span>Subtotal</span><span id="s-sub"></span></div>' +
      '<div class="sum"><span>Delivery</span><span id="s-fee">Choose an area</span></div><div class="sum total"><span>Total</span><span id="s-total">—</span></div>' +
      '<p class="muted small">Pay on delivery. We confirm your order by phone or message.</p></aside></div>';

    const msg = $('#msg');
    $('#f-name').value = App.user.name || ''; $('#f-phone').value = App.user.phone || '';
    $('#f-zone').innerHTML = '<option value="">Select your area…</option>' + zones.map((z) => '<option value="' + z.id + '">' + h(z.name) + '</option>').join('') + '<option value="other">My area is not listed</option>';

    let data = cart.priced();
    function summary() {
      data = cart.priced();
      $('#lines').innerHTML = data.lines.map((l) => '<div class="sum"><span>' + h(l.name) + (l.size ? ' (' + h(l.size) + ')' : '') + ' × ' + l.qty + '</span><span>' + money(l.total) + '</span></div>' + (l.issue ? '<div class="msg error">' + h(l.name) + ': ' + h(l.issue) + '</div>' : '')).join('');
      $('#s-sub').textContent = money(data.subtotal);
      const z = zones.find((x) => x.id === Number($('#f-zone').value));
      $('#s-fee').textContent = z ? money(z.fee) : 'Choose an area';
      $('#s-total').textContent = z ? money(data.subtotal + z.fee) : '—';
      $('#btn-order').disabled = !data.ok || $('#f-zone').value === 'other';
    }
    summary();

    $('#f-zone').addEventListener('change', () => {
      if ($('#f-zone').value === 'other') {
        const wa = cfg.CONTACT_WHATSAPP ? ' You can message us on WhatsApp to ask.' : '';
        showMsg(msg, 'Sorry, we cannot deliver outside the listed areas yet.' + wa, 'info');
      } else clearMsg(msg);
      summary();
    });
    $('#btn-geo').addEventListener('click', () => {
      const st = $('#geo-status');
      if (!navigator.geolocation) { st.textContent = 'Your browser cannot share location.'; return; }
      st.textContent = 'Getting your location…';
      navigator.geolocation.getCurrentPosition(
        (pos) => { geo = { lat: Math.round(pos.coords.latitude * 1e6) / 1e6, lng: Math.round(pos.coords.longitude * 1e6) / 1e6 }; st.textContent = 'Location attached. Thank you.'; },
        () => { st.textContent = 'Location was not shared. You can still order with your address.'; }, { timeout: 10000 });
    });

    $('#form').addEventListener('submit', async (e) => {
      e.preventDefault(); clearMsg(msg);
      const zoneVal = $('#f-zone').value;
      if (!zoneVal || zoneVal === 'other') return showMsg(msg, 'Choose one of our delivery areas.');
      if ($('#f-address').value.trim().length < 5) return showMsg(msg, 'Enter your street address.');
      if (!/^\+?[0-9 ()-]{7,20}$/.test($('#f-phone').value.trim())) return showMsg(msg, 'Enter a valid phone number.');
      const btn = $('#btn-order'); btn.disabled = true;
      try {
        const r = await Store.placeOrder({
          items: cart.get(), zoneId: Number(zoneVal), address: $('#f-address').value, landmark: $('#f-landmark').value,
          phone: $('#f-phone').value.trim(), notes: $('#f-notes').value, lat: geo ? geo.lat : null, lng: geo ? geo.lng : null,
        });
        cart.clear();
        view.innerHTML = '<div class="wrap"><div class="narrow panel"><h1>Order placed</h1><p>Thank you! Your order #' + r.orderId + ' (total ' + money(r.total) + ') is pending. We will confirm it shortly.</p>' +
          '<a class="btn primary" href="#/orders">View my orders</a> <a class="btn" href="#/">Keep shopping</a></div></div>';
      } catch (err) { showMsg(msg, err.message); await App.loadCatalog().catch(() => {}); summary(); }
    });
  };

  // ---------- 4. MY ORDERS ----------
  App.Views.orders = async function (view) {
    if (!App.user) { App.go('/login'); return; }
    if (App.user.role === 'admin') { App.go('/admin'); return; }
    const orders = await Store.myOrders();
    view.innerHTML = '<div class="wrap"><section class="page-head"><h1>My orders</h1></section><div id="list">' + (orders.length ? orders.map((o) =>
      '<article class="order-card"><div class="order-head"><strong>Order #' + o.id + '</strong><span class="status ' + h(o.status) + '">' + h(STATUS[o.status] || o.status) + '</span></div>' +
      '<div class="muted small">' + h(fmtDate(o.created_at)) + ' · ' + h(o.zone || 'Area removed') + ' · ' + h(o.address) + '</div>' +
      '<ul class="items">' + o.items.map((i) => '<li>' + h(i.name) + (i.size ? ' (' + h(i.size) + ')' : '') + ' × ' + i.qty + ' — ' + money(i.price * i.qty) + '</li>').join('') + '</ul>' +
      '<div class="sum"><span>Delivery</span><span>' + money(o.delivery_fee) + '</span></div><div class="sum total"><span>Total</span><span>' + money(o.total) + '</span></div></article>').join('')
      : '<p class="empty">You have not placed any orders yet. <a href="#/">Start shopping</a>.</p>') + '</div></div>';
  };
})();
