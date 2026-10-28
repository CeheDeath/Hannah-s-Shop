/* =====================================================================
   store-supabase.js  -  LIVE MODE data layer (real database).
   Used automatically when config.js contains your Supabase URL + key.

   SECURITY NOTE (read this once):
   The "anon" key in config.js is PUBLIC by design - everyone who opens the
   site can see it. That is safe because the database rules in
   supabase/setup.sql (Row Level Security) decide what each person may read
   or change. Never put the "service_role" key anywhere in this site.
   ===================================================================== */
window.SupabaseStore = (function () {
  const cfg = window.SHOP_CONFIG || {};
  // If the keys are missing or the Supabase library did not load, step aside (app.js shows a clear message).
  if (!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return null;
  let sb;
  try {
    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  } catch (e) { return null; }
  const BUCKET = 'product-images';
  let cachedUser;   // undefined = not loaded yet

  // Turn technical errors into sentences a shopper can understand.
  function fail(error, fallback) {
    const m = (error && error.message) || '';
    if (/invalid login credentials/i.test(m)) return new Error('Incorrect email or password.');
    if (/email not confirmed/i.test(m)) return new Error('Please confirm your email first - check your inbox.');
    if (/rate limit|too many/i.test(m)) return new Error('Too many attempts. Please wait a few minutes and try again.');
    if (/password/i.test(m) && /(short|least|weak)/i.test(m)) return new Error('That password is too weak. Use 8+ characters with letters and numbers.');
    if (/duplicate key|23505/i.test(m)) return new Error('An item with that name already exists.');
    if (/Failed to fetch|NetworkError/i.test(m)) return new Error('Cannot reach the server. Check your internet connection.');
    // messages we wrote ourselves inside setup.sql are already friendly:
    if (m && m.length < 160 && !/^(new row|violates|permission denied|JWT)/i.test(m)) return new Error(m);
    if (/permission denied|row-level security|violates row/i.test(m)) return new Error('You do not have permission to do that.');
    return new Error(fallback || 'Something went wrong. Please try again.');
  }
  const must = (res, fb) => { if (res.error) throw fail(res.error, fb); return res.data; };

  const mapProduct = (p) => ({
    id: p.id, name: p.name, description: p.description || '', price: Number(p.price), category: p.category,
    sizes: (p.sizes || '').split(',').map((s) => s.trim()).filter(Boolean), stock: p.stock, image: p.image_url, active: p.active,
  });
  const mapOrder = (o) => ({
    id: o.id, status: o.status, subtotal: Number(o.subtotal), delivery_fee: Number(o.delivery_fee), total: Number(o.total),
    address: o.address, landmark: o.landmark, phone: o.phone, notes: o.notes,
    lat: o.lat === null ? null : Number(o.lat), lng: o.lng === null ? null : Number(o.lng), created_at: o.created_at,
    zone: o.delivery_zones ? o.delivery_zones.name : null,
    customer: o.profiles ? { name: o.profiles.full_name, email: o.profiles.email, phone: o.profiles.phone || '' } : { name: '', email: '', phone: '' },
    items: (o.order_items || []).map((i) => ({ name: i.product_name, size: i.size, price: Number(i.unit_price), qty: i.quantity })),
  });
  const storagePath = (url) => { const m = String(url || '').match(/\/product-images\/([^?]+)/); return m ? decodeURIComponent(m[1]) : null; };

  return {
    mode: 'live',
    async init() { /* nothing to prepare */ },

    // ---------- accounts ----------
    async getUser() {
      if (cachedUser !== undefined) return cachedUser;
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return (cachedUser = null);
      const { data, error } = await sb.from('profiles').select('id,email,full_name,phone,role').eq('id', session.user.id).maybeSingle();
      if (error || !data) return (cachedUser = null);
      return (cachedUser = { id: data.id, email: data.email, name: data.full_name, phone: data.phone || '', role: data.role });
    },

    async signUp({ name, email, phone, password }) {
      const res = await sb.auth.signUp({ email: String(email).trim(), password, options: { data: { full_name: name, phone: phone || '' } } });
      if (res.error) throw fail(res.error, 'Could not create the account.');
      // When "confirm email" is ON, an already-registered address comes back with no identities.
      if (res.data.user && res.data.user.identities && res.data.user.identities.length === 0) {
        throw new Error('Could not create the account. If you already registered, sign in instead.');
      }
      cachedUser = undefined;
      if (!res.data.session) return { user: null, needsEmailConfirm: true };
      return { user: await this.getUser(), needsEmailConfirm: false };
    },

    async signIn(email, password) {
      const res = await sb.auth.signInWithPassword({ email: String(email).trim(), password });
      if (res.error) throw fail(res.error);
      cachedUser = undefined;
      return this.getUser();
    },

    async signOut() { await sb.auth.signOut(); cachedUser = null; },

    // ---------- shop ----------
    async listProducts({ all = false } = {}) {
      let q = sb.from('products').select('*').order('created_at', { ascending: false });
      if (!all) q = q.eq('active', true);
      return must(await q, 'Could not load products.').map(mapProduct);
    },

    async listZones({ all = false } = {}) {
      let q = sb.from('delivery_zones').select('*').order('name');
      if (!all) q = q.eq('active', true);
      return must(await q, 'Could not load delivery areas.').map((z) => ({ id: z.id, name: z.name, fee: Number(z.fee), active: z.active }));
    },

    // The browser sends only {id,size,qty}. Prices/stock/delivery are decided inside place_order() on the server.
    async placeOrder({ items, zoneId, address, landmark, phone, notes, lat, lng }) {
      const res = await sb.rpc('place_order', {
        p_items: items.map((i) => ({ id: i.id, size: i.size || '', qty: i.qty })),
        p_zone_id: zoneId, p_address: address, p_landmark: landmark || '', p_phone: phone, p_notes: notes || '',
        p_lat: lat ?? null, p_lng: lng ?? null,
      });
      const d = must(res, 'Could not place the order. Please try again.');
      return { orderId: d.order_id, total: Number(d.total) };
    },

    async myOrders() {
      const u = await this.getUser(); if (!u) throw new Error('Please sign in to continue.');
      const data = must(await sb.from('orders').select('*, order_items(*), delivery_zones(name)').eq('user_id', u.id).order('id', { ascending: false }).limit(100), 'Could not load your orders.');
      return data.map(mapOrder);
    },

    // ---------- admin (the database refuses these for non-admins, even if someone edits this file) ----------
    async pendingCount() {
      const r = await sb.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pending');
      if (r.error) throw fail(r.error); return r.count || 0;
    },

    async adminOrders(status) {
      let q = sb.from('orders').select('*, order_items(*), delivery_zones(name), profiles(full_name,email,phone)').order('id', { ascending: false }).limit(200);
      if (status && status !== 'all') q = q.eq('status', status);
      const data = must(await q, 'Could not load orders.');
      return { orders: data.map(mapOrder), pendingCount: await this.pendingCount() };
    },

    async adminSetStatus(id, status) {
      must(await sb.rpc('admin_set_order_status', { p_order_id: id, p_status: status }), 'Could not update the order.');
      return true;
    },

    async adminSaveProduct(p, imageBlob) {
      let imageUrl = null;
      if (imageBlob) {
        const ext = imageBlob.type === 'image/webp' ? 'webp' : imageBlob.type === 'image/png' ? 'png' : 'jpg';
        const path = (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2)) + '.' + ext;
        const up = await sb.storage.from(BUCKET).upload(path, imageBlob, { contentType: imageBlob.type, cacheControl: '31536000', upsert: false });
        if (up.error) throw fail(up.error, 'The picture could not be uploaded.');
        imageUrl = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      }
      const rec = {
        name: String(p.name).trim(), description: String(p.description || '').trim(), price: p.price, category: String(p.category).trim(),
        sizes: String(p.sizes || '').split(',').map((s) => s.trim()).filter(Boolean).join(','), stock: parseInt(p.stock, 10) || 0, active: !!p.active,
      };
      if (imageUrl) rec.image_url = imageUrl;
      if (p.id) {
        must(await sb.from('products').update(rec).eq('id', p.id), 'Could not save the product.');
        if (imageUrl && p.oldImage) { const old = storagePath(p.oldImage); if (old) await sb.storage.from(BUCKET).remove([old]); }
      } else {
        must(await sb.from('products').insert(rec), 'Could not save the product.');
      }
      return true;
    },

    async adminDeleteProduct(id, imageUrl) {
      must(await sb.from('products').delete().eq('id', id), 'Could not delete the product.');
      const old = storagePath(imageUrl); if (old) await sb.storage.from(BUCKET).remove([old]);
      return true;
    },

    async adminSaveZone(z) {
      const rec = { name: String(z.name).trim(), fee: z.fee, active: !!z.active };
      const q = z.id ? sb.from('delivery_zones').update(rec).eq('id', z.id) : sb.from('delivery_zones').insert(rec);
      must(await q, 'Could not save the area.'); return true;
    },
  };
})();
