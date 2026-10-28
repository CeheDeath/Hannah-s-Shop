/* =====================================================================
   admin.js  -  the shop owner's panel.
   Even if a shopper opened this page, the database would refuse every
   admin action. The check below only keeps the page tidy.
   SECTIONS: 1 page + tabs   2 orders   3 products   4 delivery areas
   ===================================================================== */
(function () {
  'use strict';
  const { $, $$, h, money, fmtDate, STATUS, toast, showMsg, clearMsg, Store, resizeImage } = App;

  App.Views.admin = async function (view) {
    if (!App.user) { App.go('/login'); return; }
    if (App.user.role !== 'admin') { App.go('/'); return; }

    // ---------- 1. PAGE + TABS ----------
    view.innerHTML =
      '<div class="wrap"><section class="page-head"><h1>Admin panel</h1></section>' +
      '<div class="tabs" role="tablist" id="tabs">' +
      '<button class="tab" role="tab" data-tab="pending" aria-selected="true" type="button">Pending orders <span class="badge hidden" id="pending-badge">0</span></button>' +
      '<button class="tab" role="tab" data-tab="orders" aria-selected="false" type="button">All orders</button>' +
      '<button class="tab" role="tab" data-tab="products" aria-selected="false" type="button">Products</button>' +
      '<button class="tab" role="tab" data-tab="zones" aria-selected="false" type="button">Delivery areas</button></div>' +
      '<div class="msg" id="msg" role="alert"></div>' +
      '<section id="panel-pending"></section>' +
      '<section id="panel-orders" class="hidden"><div class="field narrow-field"><label for="status-filter">Show</label><select id="status-filter"><option value="all">All orders</option>' +
      Object.keys(STATUS).filter((s) => s !== 'pending').map((s) => '<option value="' + s + '">' + STATUS[s] + '</option>').join('') + '</select></div><div id="orders-list"></div></section>' +
      '<section id="panel-products" class="hidden">' +
        '<div class="admin-grid"><div class="table-wrap"><table><thead><tr><th>Picture</th><th>Name</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr></thead><tbody id="product-rows"></tbody></table></div>' +
        '<form class="panel" id="product-form" novalidate><h2 id="pf-title">Add a product</h2><input type="hidden" id="pf-id">' +
        '<div class="field"><label for="pf-name">Name</label><input id="pf-name" maxlength="150" required></div>' +
        '<div class="row"><div class="field"><label for="pf-price">Price</label><input id="pf-price" inputmode="decimal" placeholder="25.00" required></div>' +
        '<div class="field"><label for="pf-stock">Stock</label><input id="pf-stock" type="number" min="0" value="0" required></div></div>' +
        '<div class="field"><label for="pf-category">Category</label><input id="pf-category" maxlength="60" placeholder="Dresses" required></div>' +
        '<div class="field"><label for="pf-sizes">Sizes</label><input id="pf-sizes" maxlength="100" placeholder="S,M,L"><small>Separate with commas. Leave empty for one-size items.</small></div>' +
        '<div class="field"><label for="pf-desc">Description</label><textarea id="pf-desc" maxlength="3000"></textarea></div>' +
        '<div class="field"><label for="pf-image">Picture (JPG, PNG or WEBP)</label><input type="file" id="pf-image" accept="image/jpeg,image/png,image/webp"><small>Big photos are shrunk automatically. Portrait (tall) photos look best.</small>' +
        '<img class="preview hidden" id="pf-preview" alt="Picture preview"></div>' +
        '<div class="field check"><input type="checkbox" id="pf-active" checked><label for="pf-active">Show in the shop</label></div>' +
        '<div class="admin-actions"><button class="btn primary" type="submit" id="pf-save">Save product</button><button class="btn" type="button" id="pf-reset">Clear form</button></div></form></div></section>' +
      '<section id="panel-zones" class="hidden"><div class="panel"><h2>Delivery areas</h2><p class="muted">Customers can only order to areas that are switched on.</p><div id="zone-list"></div>' +
      '<h3>Add an area</h3><form class="zone-row" id="zone-new" novalidate><input id="zn-name" placeholder="Area name" aria-label="New area name" maxlength="100" required>' +
      '<input id="zn-fee" placeholder="Fee" aria-label="Delivery fee" inputmode="decimal" required><span class="check"><input type="checkbox" id="zn-active" checked aria-label="Active"><label for="zn-active">On</label></span>' +
      '<button class="btn primary small" type="submit">Add</button></form></div></section></div>';

    const msg = $('#msg'); let active = 'pending'; let productCache = []; let pendingBlob = null;
    const fail = (e) => showMsg(msg, e.message);

    function showTab(name) {
      active = name; clearMsg(msg);
      $$('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
      ['pending', 'orders', 'products', 'zones'].forEach((n) => $('#panel-' + n).classList.toggle('hidden', n !== name));
      ({ pending: loadPending, orders: loadAll, products: loadProducts, zones: loadZones })[name]();
    }
    $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('.tab'); if (b) showTab(b.dataset.tab); });

    // ---------- 2. ORDERS ----------
    function setBadge(n) { const b = $('#pending-badge'); b.textContent = n; b.classList.toggle('hidden', !n); }

    function orderCard(o) {
      const map = (o.lat !== null && o.lng !== null && isFinite(o.lat) && isFinite(o.lng))
        ? '<br><a href="https://www.google.com/maps?q=' + Number(o.lat) + ',' + Number(o.lng) + '" target="_blank" rel="noopener noreferrer">Open shared location on map</a>' : '';
      const locked = o.status === 'cancelled';
      return '<article class="order-card" data-id="' + o.id + '"><div class="order-head"><strong>Order #' + o.id + ' · ' + h(o.customer.name || 'Customer') + '</strong>' +
        '<span class="status ' + h(o.status) + '">' + h(STATUS[o.status]) + '</span></div>' +
        '<div class="muted small">' + h(fmtDate(o.created_at)) + ' · ' + h(o.customer.email) + ' · <a href="tel:' + h(o.phone) + '">' + h(o.phone) + '</a></div>' +
        '<p><strong>Deliver to:</strong> ' + h(o.zone || 'Area removed') + ' — ' + h(o.address) + (o.landmark ? ' (near ' + h(o.landmark) + ')' : '') + map + '</p>' +
        (o.notes ? '<p><strong>Note:</strong> ' + h(o.notes) + '</p>' : '') +
        '<ul class="items">' + o.items.map((i) => '<li>' + h(i.name) + (i.size ? ' (' + h(i.size) + ')' : '') + ' × ' + i.qty + ' — ' + money(i.price * i.qty) + '</li>').join('') + '</ul>' +
        '<div class="sum"><span>Delivery fee</span><span>' + money(o.delivery_fee) + '</span></div><div class="sum total"><span>Total</span><span>' + money(o.total) + '</span></div>' +
        '<div class="admin-actions">' + (o.status === 'pending' ? '<button class="btn primary small" data-act="confirm" type="button">Confirm order</button>' : '') +
        '<select aria-label="Order status"' + (locked ? ' disabled' : '') + '>' + Object.keys(STATUS).map((s) => '<option value="' + s + '"' + (s === o.status ? ' selected' : '') + '>' + STATUS[s] + '</option>').join('') + '</select>' +
        '<button class="btn small" data-act="update" type="button"' + (locked ? ' disabled' : '') + '>Update status</button></div></article>';
    }
    async function loadPending(quiet) {
      try { const d = await Store.adminOrders('pending'); setBadge(d.pendingCount); $('#panel-pending').innerHTML = d.orders.length ? d.orders.map(orderCard).join('') : '<p class="empty">No pending orders right now.</p>'; }
      catch (e) { if (!quiet) fail(e); }
    }
    async function loadAll() {
      try { const d = await Store.adminOrders($('#status-filter').value); setBadge(d.pendingCount); $('#orders-list').innerHTML = d.orders.length ? d.orders.map(orderCard).join('') : '<p class="empty">No orders found.</p>'; }
      catch (e) { fail(e); }
    }
    $('#status-filter').addEventListener('change', loadAll);

    async function changeStatus(card, status) {
      if (status === 'cancelled' && !confirm('Cancel this order? The items will go back into stock.')) return;
      try { await Store.adminSetStatus(Number(card.dataset.id), status); toast('Order updated'); active === 'pending' ? loadPending() : loadAll(); } catch (e) { fail(e); }
    }
    view.firstElementChild.addEventListener('click', (e) => {   // listener lives on this page's own wrapper, so it cannot pile up
      const b = e.target.closest('button[data-act]'); const card = b && b.closest('.order-card'); if (!card) return;
      if (b.dataset.act === 'confirm') changeStatus(card, 'confirmed');
      if (b.dataset.act === 'update') changeStatus(card, $('select', card).value);
    });

    // check for new orders every 45 seconds while the Pending tab is open
    const timer = setInterval(() => { if (active === 'pending' && !document.hidden) loadPending(true); }, 45000);
    App.onLeave = () => clearInterval(timer);

    // ---------- 3. PRODUCTS ----------
    async function loadProducts() {
      try {
        productCache = await Store.listProducts({ all: true });
        $('#product-rows').innerHTML = productCache.length ? productCache.map((p) =>
          '<tr><td><img class="thumb" src="' + h(p.image || 'img/placeholder.svg') + '" alt=""></td><td><strong>' + h(p.name) + '</strong><br><span class="muted small">' + h(p.category) + (p.sizes.length ? ' · ' + h(p.sizes.join(',')) : '') + '</span></td>' +
          '<td>' + money(p.price) + '</td><td>' + p.stock + '</td><td>' + (p.active ? 'Visible' : 'Hidden') + '</td>' +
          '<td class="nowrap"><button class="btn small" type="button" data-edit="' + p.id + '">Edit</button> <button class="btn small danger" type="button" data-del="' + p.id + '">Delete</button></td></tr>').join('')
          : '<tr><td colspan="6" class="empty">No products yet. Add your first one on the right.</td></tr>';
      } catch (e) { fail(e); }
    }
    const pf = $('#product-form');
    function resetForm() { pf.reset(); pendingBlob = null; $('#pf-id').value = ''; $('#pf-title').textContent = 'Add a product'; $('#pf-preview').classList.add('hidden'); $('#pf-active').checked = true; }
    $('#pf-reset').addEventListener('click', resetForm);

    $('#product-rows').addEventListener('click', async (e) => {
      const ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
      if (ed) {
        const p = productCache.find((x) => x.id === Number(ed.dataset.edit)); pendingBlob = null;
        $('#pf-id').value = p.id; $('#pf-name').value = p.name; $('#pf-price').value = p.price.toFixed(2); $('#pf-stock').value = p.stock;
        $('#pf-category').value = p.category; $('#pf-sizes').value = p.sizes.join(','); $('#pf-desc').value = p.description; $('#pf-active').checked = p.active; $('#pf-image').value = '';
        const pv = $('#pf-preview'); pv.src = p.image || 'img/placeholder.svg'; pv.classList.remove('hidden');
        $('#pf-title').textContent = 'Edit: ' + p.name; pf.scrollIntoView({ behavior: 'smooth' });
      }
      if (del) {
        const p = productCache.find((x) => x.id === Number(del.dataset.del));
        if (!confirm('Delete "' + p.name + '"? Past orders keep their record of it. (Tip: untick "Show in the shop" to hide it instead.)')) return;
        try { await Store.adminDeleteProduct(p.id, p.image); toast('Product deleted'); loadProducts(); } catch (err) { fail(err); }
      }
    });

    $('#pf-image').addEventListener('change', async () => {
      const f = $('#pf-image').files[0]; if (!f) return; clearMsg(msg);
      try {
        pendingBlob = await resizeImage(f, 1200);               // shrink + clean before upload
        const r = new FileReader(); r.onload = () => { const pv = $('#pf-preview'); pv.src = r.result; pv.classList.remove('hidden'); }; r.readAsDataURL(pendingBlob);
      } catch (err) { pendingBlob = null; $('#pf-image').value = ''; fail(err); }
    });

    pf.addEventListener('submit', async (e) => {
      e.preventDefault(); clearMsg(msg);
      const name = $('#pf-name').value.trim(), price = $('#pf-price').value.trim(), cat = $('#pf-category').value.trim(), stock = $('#pf-stock').value, sizes = $('#pf-sizes').value;
      if (name.length < 2) return showMsg(msg, 'Enter a product name.');
      if (!/^\d{1,7}(\.\d{1,2})?$/.test(price)) return showMsg(msg, 'Price must be a number like 25 or 25.99.');
      if (cat.length < 2) return showMsg(msg, 'Enter a category.');
      if (!/^\d{1,6}$/.test(String(stock))) return showMsg(msg, 'Stock must be a whole number, 0 or more.');
      if (sizes.split(',').map((s) => s.trim()).filter(Boolean).some((s) => !/^[A-Za-z0-9.\-\/]{1,10}$/.test(s))) return showMsg(msg, 'Sizes may only contain letters, numbers, dot and dash (example: S,M,L or 30,32,34).');
      const id = $('#pf-id').value ? Number($('#pf-id').value) : null;
      const old = id ? (productCache.find((x) => x.id === id) || {}).image : null;
      const btn = $('#pf-save'); btn.disabled = true;
      try {
        await Store.adminSaveProduct({ id, name, description: $('#pf-desc').value, price: Number(price), category: cat, sizes, stock, active: $('#pf-active').checked, oldImage: old }, pendingBlob);
        toast('Product saved'); resetForm(); loadProducts();
      } catch (err) { fail(err); }
      btn.disabled = false;
    });

    // ---------- 4. DELIVERY AREAS ----------
    async function loadZones() {
      try {
        const zones = await Store.listZones({ all: true });
        $('#zone-list').innerHTML = zones.map((z) =>
          '<div class="zone-row" data-id="' + z.id + '"><input value="' + h(z.name) + '" data-f="name" aria-label="Area name" maxlength="100"><input value="' + Number(z.fee).toFixed(2) + '" data-f="fee" aria-label="Delivery fee" inputmode="decimal">' +
          '<span class="check"><input type="checkbox" data-f="active" id="za' + z.id + '"' + (z.active ? ' checked' : '') + '><label for="za' + z.id + '">On</label></span><button class="btn small" type="button" data-zsave="' + z.id + '">Save</button></div>').join('')
          || '<p class="empty">No delivery areas yet. Add one below.</p>';
      } catch (e) { fail(e); }
    }
    const feeOk = (v) => /^\d{1,7}(\.\d{1,2})?$/.test(String(v).trim());
    $('#zone-list').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-zsave]'); if (!b) return; const row = b.closest('.zone-row'); const fee = $('[data-f=fee]', row).value;
      if (!feeOk(fee)) return showMsg(msg, 'Delivery fee must be a number like 5 or 5.50.');
      try { await Store.adminSaveZone({ id: Number(b.dataset.zsave), name: $('[data-f=name]', row).value, fee: Number(fee), active: $('[data-f=active]', row).checked }); toast('Area saved'); } catch (err) { fail(err); }
    });
    $('#zone-new').addEventListener('submit', async (e) => {
      e.preventDefault(); if (!feeOk($('#zn-fee').value)) return showMsg(msg, 'Delivery fee must be a number like 5 or 5.50.');
      try { await Store.adminSaveZone({ name: $('#zn-name').value, fee: Number($('#zn-fee').value), active: $('#zn-active').checked }); $('#zn-name').value = ''; $('#zn-fee').value = ''; toast('Area added'); loadZones(); } catch (err) { fail(err); }
    });

    showTab('pending');
  };
})();
