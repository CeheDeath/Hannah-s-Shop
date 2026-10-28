/* =====================================================================
   store-demo.js  -  DEMO MODE data layer.
   Used automatically when config.js has no Supabase keys. It stores
   everything in THIS browser only (localStorage), so you can try the whole
   shop - customer AND admin - without setting anything up.

   !! DEMO ONLY !!  Passwords are stored as plain text here and there is no
   real security. The live version (store-supabase.js) never does this.

   Both stores offer exactly the same functions, so the pages
   (app.js, shop.js, admin.js) do not care which one is running.
   ===================================================================== */
window.DemoStore = (function () {
  const KEY = 'marlowe_demo_v1';
  const STATUSES = ['pending', 'confirmed', 'out_for_delivery', 'delivered', 'cancelled'];

  // ---------- starting data ----------
  function seed() {
    const img = (n) => 'img/products/' + n + '.svg';
    return {
      session: null, seq: { user: 3, product: 9, zone: 4, order: 1 },
      users: [
        { id: 1, email: 'admin@demo.test', name: 'Demo Admin', phone: '', password: 'demo1234', role: 'admin' },
        { id: 2, email: 'customer@demo.test', name: 'Demo Customer', phone: '+1 555 0100', password: 'demo1234', role: 'customer' },
      ],
      zones: [
        { id: 1, name: 'City Centre', fee: 3, active: true },
        { id: 2, name: 'North Suburbs', fee: 5, active: true },
        { id: 3, name: 'South Suburbs', fee: 5, active: true },
      ],
      products: [
        { id: 1, name: 'Linen Wrap Dress', description: 'Breathable cobalt linen with a self-tie waist and flutter sleeves. Falls just below the knee.', price: 64, category: 'Dresses', sizes: ['S', 'M', 'L'], stock: 12, image: img('linen-wrap-dress'), active: true },
        { id: 2, name: 'Wide-Leg Trousers', description: 'High-rise, pressed crease, concealed zip. Drapes well and washes easily.', price: 52, category: 'Trousers', sizes: ['28', '30', '32', '34'], stock: 20, image: img('wide-leg-trousers'), active: true },
        { id: 3, name: 'Boxy Cotton Tee', description: 'Heavy 220gsm cotton, relaxed boxy fit, pre-washed so it keeps its shape.', price: 19.99, category: 'Tops', sizes: ['S', 'M', 'L', 'XL'], stock: 40, image: img('boxy-cotton-tee'), active: true },
        { id: 4, name: 'Camel Wool Coat', description: 'Single-breasted, notch lapel, two flap pockets. Warm without the bulk.', price: 139, category: 'Outerwear', sizes: ['S', 'M', 'L'], stock: 8, image: img('wool-coat'), active: true },
        { id: 5, name: 'Canvas Market Tote', description: 'Large natural canvas tote with a cobalt stripe and an inner zip pocket.', price: 22, category: 'Accessories', sizes: [], stock: 25, image: img('canvas-tote'), active: true },
        { id: 6, name: 'Court Sneaker', description: 'Clean leather-look upper, cushioned insole, cobalt stripe.', price: 74, category: 'Shoes', sizes: ['38', '39', '40', '41', '42'], stock: 15, image: img('court-sneaker'), active: true },
        { id: 7, name: 'Bucket Hat', description: 'Cotton twill, soft brim, stitched crown. Packs flat.', price: 18.5, category: 'Accessories', sizes: [], stock: 30, image: img('bucket-hat'), active: true },
        { id: 8, name: 'Rib-Knit Sweater', description: 'Soft cotton-blend rib knit in sage. Relaxed fit, ribbed cuffs and hem.', price: 58, category: 'Tops', sizes: ['S', 'M', 'L', 'XL'], stock: 18, image: img('rib-knit-sweater'), active: true },
      ],
      orders: [],
    };
  }

  function load() {
    try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.users) return d; } catch (e) { /* fall through */ }
    const d = seed(); save(d); return d;
  }
  function save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { throw new Error('Browser storage is full or blocked.'); } }
  const cents = (n) => Math.round(Number(n) * 100);
  const pub = (u) => u && { id: u.id, email: u.email, name: u.name, phone: u.phone || '', role: u.role };
  function me(d) { return d.session ? d.users.find((u) => u.id === d.session) || null : null; }
  function needAdmin(d) { const u = me(d); if (!u) throw new Error('Please sign in to continue.'); if (u.role !== 'admin') throw new Error('You do not have permission to do that.'); return u; }
  const delay = (v) => new Promise((r) => setTimeout(() => r(v), 60));

  function view(d, o) {   // build the order shape the pages expect
    const z = d.zones.find((x) => x.id === o.zoneId);
    const c = d.users.find((x) => x.id === o.userId) || {};
    return {
      id: o.id, status: o.status, subtotal: o.subtotal, delivery_fee: o.deliveryFee, total: o.total,
      address: o.address, landmark: o.landmark, phone: o.phone, notes: o.notes, lat: o.lat, lng: o.lng,
      created_at: o.createdAt, zone: z ? z.name : null,
      customer: { name: c.name || '', email: c.email || '', phone: c.phone || '' },
      items: o.items.map((i) => ({ name: i.name, size: i.size, price: i.price, qty: i.qty })),
    };
  }

  return {
    mode: 'demo',
    async init() { load(); },

    // ---------- accounts ----------
    async getUser() { return delay(pub(me(load()))); },

    async signUp({ name, email, phone, password }) {
      const d = load(); email = String(email).trim().toLowerCase();
      if (d.users.some((u) => u.email === email)) throw new Error('Could not create the account. If you already registered, sign in instead.');
      const u = { id: d.seq.user++, email, name, phone: phone || '', password, role: 'customer' };   // role is ALWAYS customer
      d.users.push(u); d.session = u.id; save(d);
      return delay({ user: pub(u), needsEmailConfirm: false });
    },

    async signIn(email, password) {
      const d = load(); email = String(email).trim().toLowerCase();
      const u = d.users.find((x) => x.email === email && x.password === password);
      if (!u) throw new Error('Incorrect email or password.');
      d.session = u.id; save(d); return delay(pub(u));
    },

    async signOut() { const d = load(); d.session = null; save(d); },

    // ---------- shop ----------
    async listProducts({ all = false } = {}) {
      const d = load(); if (all) needAdmin(d);
      return delay(d.products.filter((p) => all || p.active).slice().reverse().map((p) => ({ ...p })));
    },
    async listZones({ all = false } = {}) {
      const d = load(); if (all) needAdmin(d);
      return delay(d.zones.filter((z) => all || z.active).map((z) => ({ ...z })));
    },

    // Mirrors place_order() in supabase/setup.sql: the same checks, in the same order.
    async placeOrder({ items, zoneId, address, landmark, phone, notes, lat, lng }) {
      const d = load(); const u = me(d);
      if (!u) throw new Error('Please sign in to place an order.');
      if (u.role === 'admin') throw new Error('Admin accounts cannot place orders. Use a customer account.');
      if (!Array.isArray(items) || !items.length) throw new Error('Your cart is empty.');
      address = String(address || '').trim(); phone = String(phone || '').trim();
      if (address.length < 5 || address.length > 255) throw new Error('Enter your street address.');
      if (!/^\+?[0-9 ()-]{7,20}$/.test(phone)) throw new Error('Enter a valid phone number.');
      if (d.orders.filter((o) => o.userId === u.id && o.status === 'pending').length >= 5) throw new Error('You already have 5 pending orders. Please wait until they are confirmed.');
      const zone = d.zones.find((z) => z.id === Number(zoneId) && z.active);
      if (!zone) throw new Error('Sorry, we do not deliver to that area yet.');

      const lines = []; let subtotal = 0;
      const stock = Object.fromEntries(d.products.map((p) => [p.id, p.stock]));   // work on a copy; commit only if all OK
      for (const it of items) {
        const qty = Number(it.qty);
        const p = d.products.find((x) => x.id === Number(it.id) && x.active);
        if (!p) throw new Error('An item in your cart is no longer available.');
        if (!Number.isInteger(qty) || qty < 1 || qty > 20) throw new Error('Invalid quantity.');
        let size = String(it.size || '');
        if (p.sizes.length) { if (!p.sizes.includes(size)) throw new Error('Choose a size for ' + p.name + '.'); } else size = '';
        if (stock[p.id] < qty) throw new Error('Only ' + stock[p.id] + ' left of ' + p.name + '.');
        stock[p.id] -= qty;
        lines.push({ productId: p.id, name: p.name, size, price: p.price, qty });
        subtotal += cents(p.price) * qty;
      }
      d.products.forEach((p) => { p.stock = stock[p.id]; });
      const order = {
        id: d.seq.order++, userId: u.id, status: 'pending', subtotal: subtotal / 100, deliveryFee: zone.fee,
        total: (subtotal + cents(zone.fee)) / 100, zoneId: zone.id, address, landmark: landmark || null, phone,
        notes: notes || null, lat: lat ?? null, lng: lng ?? null, createdAt: new Date().toISOString(), items: lines,
      };
      d.orders.push(order); save(d);
      return delay({ orderId: order.id, total: order.total });
    },

    async myOrders() {
      const d = load(); const u = me(d); if (!u) throw new Error('Please sign in to continue.');
      return delay(d.orders.filter((o) => o.userId === u.id).reverse().map((o) => view(d, o)));
    },

    // ---------- admin ----------
    async pendingCount() { const d = load(); needAdmin(d); return d.orders.filter((o) => o.status === 'pending').length; },

    async adminOrders(status) {
      const d = load(); needAdmin(d);
      const list = d.orders.filter((o) => !STATUSES.includes(status) || o.status === status).reverse().map((o) => view(d, o));
      return delay({ orders: list, pendingCount: d.orders.filter((o) => o.status === 'pending').length });
    },

    async adminSetStatus(id, status) {
      const d = load(); needAdmin(d);
      if (!STATUSES.includes(status)) throw new Error('Unknown status.');
      const o = d.orders.find((x) => x.id === Number(id));
      if (!o) throw new Error('Order not found.');
      if (o.status === 'cancelled') throw new Error('A cancelled order cannot be changed.');
      if (status === 'cancelled') o.items.forEach((i) => { const p = d.products.find((x) => x.id === i.productId); if (p) p.stock += i.qty; });
      o.status = status; save(d); return delay(true);
    },

    async adminSaveProduct(p, imageBlob) {
      const d = load(); needAdmin(d);
      const price = Number(p.price);
      if (String(p.name).trim().length < 2) throw new Error('Enter a product name.');
      if (!isFinite(price) || price < 0) throw new Error('Price must be a number like 25 or 25.99.');
      if (String(p.category).trim().length < 2) throw new Error('Enter a category.');
      const rec = {
        name: String(p.name).trim(), description: String(p.description || '').trim(), price: Math.round(price * 100) / 100,
        category: String(p.category).trim(), stock: Math.max(0, parseInt(p.stock, 10) || 0), active: !!p.active,
        sizes: String(p.sizes || '').split(',').map((s) => s.trim()).filter(Boolean),
      };
      let img = null;
      if (imageBlob) img = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(imageBlob); });
      if (p.id) {
        const cur = d.products.find((x) => x.id === Number(p.id)); if (!cur) throw new Error('Product not found.');
        Object.assign(cur, rec); if (img) cur.image = img;
      } else d.products.push({ id: d.seq.product++, ...rec, image: img });
      save(d); return delay(true);
    },

    async adminDeleteProduct(id) {
      const d = load(); needAdmin(d);
      d.products = d.products.filter((p) => p.id !== Number(id)); save(d); return delay(true);
    },

    async adminSaveZone(z) {
      const d = load(); needAdmin(d);
      const name = String(z.name || '').trim(), fee = Number(z.fee);
      if (name.length < 2) throw new Error('Enter an area name.');
      if (!isFinite(fee) || fee < 0) throw new Error('Delivery fee must be a number like 5 or 5.50.');
      if (d.zones.some((x) => x.name.toLowerCase() === name.toLowerCase() && x.id !== Number(z.id))) throw new Error('An area with that name already exists.');
      if (z.id) Object.assign(d.zones.find((x) => x.id === Number(z.id)), { name, fee, active: !!z.active });
      else d.zones.push({ id: d.seq.zone++, name, fee, active: !!z.active });
      save(d); return delay(true);
    },
  };
})();
