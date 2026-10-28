# Your online shop: the plain-English guide

*Written for the shop owner. No coding knowledge needed to follow it.*

**What you are getting:** a fast, good-looking clothing shop where anyone can browse and fill a cart, shoppers must sign in (and give a delivery location) to order, and you get a private admin panel to see new orders, change stock and upload product photos. It can run on **free hosting**.

**Contents**
- Part A: What I built, and why I built it this way
- Part B: Try it right now (2 minutes, nothing to install)
- Part C: Putting it online for free, step by step
- Part D: The files you may need to edit
- Part E: How the shop is protected
- Part F: Running the shop day to day
- Part G: Honest limits, costs and risks
- Part H: What I would add next

---

## Part A: What I built, and why

### The look
A confident, modern boutique style, deliberately different from the usual cream-and-brown "fashion template":
- **Cobalt blue** (the brand colour) with a warm **price-tag orange** used only for small accents (cart count, price sticker, "from $x" badge).
- Large, bold headline type, rounded buttons, and a collage of product cards in the hero area.
- Every product has a **soft-coloured illustrated picture** (I drew all eight myself, so there are no licensing worries). When you upload your own photos in the admin panel, they replace the drawings automatically.
- Works on phones, tablets and computers.

### What each type of visitor can do
| Who | Can do |
|---|---|
| **Anyone** (no account) | Browse, search, filter by category, open product details, use the cart (it updates the total instantly) |
| **Customer** (signed in) | Everything above, plus place an order. They must give a phone number, address and choose a **delivery area**. If their area isn't on your list, the order button is blocked and they are told why. They can also see their order history and status |
| **You, the admin** | See **pending orders** (with a counter), confirm / update / cancel them, add or edit products, change stock and prices, **upload photos**, and control which **delivery areas** you serve and their fees |

**One login for everyone.** There is only one "Sign in" page. After the password is checked, the system looks you up and decides: shop owner goes to the admin panel, shoppers go to the shop. Nobody can create an admin account through the website.

### The big decisions I made (and the reasons)

**1. No traditional web server to look after.**
A classic shop needs a rented server running PHP or similar, which costs money every month and needs updates and security patching. I chose a modern setup instead:
- The **website itself** is plain files (pages, styles, pictures). Any free "static hosting" company can serve these, quickly and securely.
- The **database, logins and photo storage** come from **Supabase**, a service with a generous free plan.

Result: **free to run**, nothing to patch, and the free host also gives you HTTPS (the padlock).

**2. Security lives in the database, not just in the website.**
Many beginner shops hide the admin button and hope nobody finds the admin URL. That is not security. Here, the **database itself** refuses to show or change anything the signed-in person isn't allowed to. A shopper who tampers with the website's code still gets "permission denied". Details in Part E.

**3. The server decides prices, not the browser.**
The cart in the browser only remembers "product 4, size M, quantity 2". When an order is placed, the database looks up the **real price and stock itself**. Editing the page to make a coat cost $1 does nothing.

**4. Demo mode first.**
Before connecting anything, the shop runs fully in your browser with sample data and two demo accounts. You can try the whole customer and admin experience in two minutes and decide what you want changed *before* we spend time on setup.

**5. One settings file.**
Everything a shop owner normally changes (name, tagline, currency, contact details) is in **one** small file: `js/config.js`.

### How it is put together (a simple picture)
```
Shopper's phone/computer
   |  opens the website files (free host: Cloudflare Pages or Netlify)
   |
   +--> talks to SUPABASE (free plan)
          - Login system (passwords stored safely, never readable)
          - Database: products, orders, delivery areas
          - Photo storage (public to view, admins-only to upload)
          - Security rules + two guarded "functions": place an order, change order status
```

### What is in the folder
```
marlowe-shop/
  index.html          the page shell (rarely edited)
  _headers            security instructions for the free host (don't edit)
  css/style.css       colours and fonts
  js/config.js        <-- YOUR SETTINGS (the only file most owners ever edit)
  js/app.js           core: login, cart, menu
  js/shop.js          shop, product pop-up, checkout, my orders
  js/admin.js         the admin panel
  js/store-demo.js    demo mode (data in your browser)
  js/store-supabase.js live mode (real database)
  img/products/       the 8 sample product pictures
  supabase/setup.sql  one-time database setup (you paste it once)
  docs/GUIDE.md       this guide
```

---

## Part B: Try it right now (no installation, no internet account)

1. Unzip the folder.
2. **Double-click `index.html`.** It opens in your browser.
3. Look around as a visitor: open a product, pick a size, add to cart, change quantities.
4. Click **Sign in** and use the demo buttons:
   - **Admin:** `admin@demo.test` / `demo1234`. You will land in the admin panel.
   - **Customer:** `customer@demo.test` / `demo1234` (or create your own account).
5. Place an order as a customer, then sign out, sign in as admin, and you'll see it under **Pending orders**. Confirm it, add a product with a photo, switch a delivery area off.

> **Important:** in demo mode everything is saved only in *your* browser, and the demo passwords are not secured. It's a rehearsal stage, not the real shop. The orange banner at the top reminds you. It disappears automatically when you connect the real database (Part C).

---

## Part C: Putting it online for free, step by step

You need: a free **Supabase** account, a free **Cloudflare** account (or Netlify), and about 30 to 45 minutes the first time. You'll copy and paste; you won't write code.

### C1. Create the database (Supabase)
1. Go to **supabase.com**, sign up (free), and click **New project**.
2. Give it a name (e.g. `my-shop`), choose a **strong database password** (save it in a password manager), pick the region closest to your customers, and create it. Wait a minute or two.
3. In the left menu open **SQL Editor** > **New query**.
4. Open the file `supabase/setup.sql` in Notepad, **select everything and copy**, paste it into the SQL Editor, and press **Run**. You should see "Success". (Running it twice is harmless.)
5. In the left menu open **Authentication** > **Sign In / Providers** (the name may differ slightly) and:
   - Set **minimum password length to 8**.
   - Decide on **Confirm email**: *ON* is safer for a real shop (shoppers must click a link in their email, which blocks fake sign-ups). *OFF* is easier while you're testing. Supabase's built-in email sender is limited in how many emails it sends, so for a busy shop later you would connect your own email service.
6. Open **Project Settings** > **API**. Copy two things:
   - **Project URL** (looks like `https://abcdxyz.supabase.co`)
   - The **anon / publishable key** (a long text). **Never** copy the one called `service_role`; it's a master key.

### C2. Connect the website to the database
1. Open `js/config.js` in Notepad.
2. Paste your Project URL and anon key between the quotation marks, and set your shop name, tagline and currency symbol. Save.
3. Open `index.html` by double-click again: the orange demo banner should be gone. You are now talking to your real database.

### C3. Put the website online (free)
**Option 1: Cloudflare Pages** (what I'd use)
1. Sign up at **cloudflare.com** (free).
2. In the dashboard choose **Workers & Pages** > **Create** > **Pages** > **Upload assets** (direct upload, no GitHub or coding needed).
3. Name the project (e.g. `my-shop`), then **drag the whole `marlowe-shop` folder** (the contents, with `index.html` at the top level) into the upload box and click **Deploy**.
4. In a minute you get a free address like `my-shop.pages.dev`. HTTPS (the padlock) is automatic.
   *Cloudflare changes its dashboard wording from time to time. If a button is named differently, look for "Pages" and "Direct Upload".*

**Option 2: Netlify.** Go to **app.netlify.com/drop** and drag the folder onto the page. Free address and HTTPS, same idea.

> Avoid GitHub Pages for this project. It cannot apply the `_headers` security file, which is one of the protections in Part E.

### C4. Tell Supabase your website's address
In Supabase: **Authentication** > **URL Configuration**. Set **Site URL** to your new address (e.g. `https://my-shop.pages.dev`). This makes the email confirmation links return to your shop.

### C5. Make yourself the admin
1. Open your live shop, click **Sign in** > **Create account**, and register with **your** email (confirm the email if you left that option on).
2. Back in Supabase **SQL Editor**, paste this one line with *your* email and press **Run**:
   ```sql
   update public.profiles set role = 'admin' where email = 'you@example.com';
   ```
3. Sign out and sign in again on the shop. You'll be taken to the admin panel.

### C6. Make it yours
Sign in as admin and:
- **Delivery areas:** replace the three sample areas with your real ones and fees.
- **Products:** edit or delete the sample products, upload your real photos. Tall (portrait) photos look best; large photos are shrunk automatically.
- Place a test order from a second account and confirm it. Then cancel it and check the stock returned.

### C7. Your own domain name (optional, not free)
`my-shop.pages.dev` works fine for starting. A custom domain like `yourshop.com` costs roughly the price of a yearly registration (typically around ten dollars or the local equivalent) and can be attached in Cloudflare Pages > Custom domains. After that, update the **Site URL** in step C4.

### Free-plan facts to know (checked at the time of writing)
- **Supabase free plan:** about 500 MB database and 1 GB file storage, which is plenty for hundreds of products and thousands of orders. **Free projects are paused after about a week without activity** (you can restore them in one click, but a paused shop is a dead shop). There are **no automatic backups** on the free plan.
- **Cloudflare Pages free plan:** unlimited static requests/bandwidth for a site like this. Limits apply to things like file count and file size, which this small site won't approach.
- Plans and limits change. Re-check the current plan pages before you launch.

---

## Part D: The files you may need to edit

| You want to... | Edit this file | What to change |
|---|---|---|
| Change shop name, tagline, currency, WhatsApp or email | `js/config.js` | The text between quotation marks |
| Connect the real database | `js/config.js` | Paste the Supabase URL and anon key (Part C2) |
| Change brand colours | `css/style.css` | The block at the top called `1. TOKENS`: change the colour codes like `#2230C9` |
| Change the font | `css/style.css` and `index.html` | The `--font` line, and the Google Fonts link in `index.html` |
| Add/edit products, photos, stock, delivery areas | **No file.** Use the admin panel | |
| Change the headline on the home page | `js/config.js` | `TAGLINE` |
| Change starting sample data | `supabase/setup.sql` (before running) | Or just use the admin panel afterwards |
| Change the favicon/browser-tab icon | `img/favicon.svg` | Replace with your own logo file |

**Files you should *not* touch:** `_headers`, `supabase/setup.sql` after it's been run, and everything in `js/` except `config.js`. If you want something changed there, ask your developer.

After editing any file, **upload the folder again** to Cloudflare/Netlify (drag and drop, as in C3). Changes show up in a minute. Photos and products added through the admin panel do *not* need re-uploading; they go straight to the database.

---

## Part E: How the shop is protected

### Logins
- **Passwords are never stored as text.** Supabase stores only a scrambled form (a salted hash), so even with full database access nobody can read anyone's password. *I never see or store passwords either.*
- Passwords must be 8+ characters with a letter and a number.
- Repeated wrong passwords are throttled by Supabase's built-in rate limits.
- Sessions are managed by Supabase with automatically renewing tokens, and "Sign out" ends the session.
- The error for a wrong login never says whether the email exists.
- **Admin accounts cannot be created from the website.** Everyone who registers is a customer; only you can promote an account, with the SQL line in C5.

### Who may see or change what (the key protection)
The database has **Row Level Security** switched on for every table. In plain words:
- Shoppers see only **active** products and **active** delivery areas.
- A customer can read **only their own** orders and profile. Other customers' data does not exist as far as they are concerned.
- **Nobody can write to the orders table directly.** Orders are created and changed only through two guarded functions (below).
- Only an admin can add/edit/delete products and delivery areas, or upload pictures.
- A customer **cannot change their own role** to admin: the database blocks that column from editing.
- Even if an attacker opened the browser console and called the database directly, these rules still apply. They're enforced **on the server**.

### The two guarded functions
1. **Place order.** The browser sends only product, size and quantity. The database then checks the person is signed in and not an admin, checks the phone and address, **checks the delivery area exists and is switched on**, locks each product while it checks stock, uses the **real price from the database**, subtracts the stock, and saves everything in one all-or-nothing step. It also limits each account to 5 pending orders so someone can't flood you with fake ones.
2. **Change order status** (admin only). Cancelling puts the items back in stock automatically.

### Attacks and what stops them
| Attack (plain words) | Protection |
|---|---|
| Changing the price in the browser | Prices are re-read from the database when ordering |
| Pretending to be an admin | Role is stored server-side; admin actions are checked by the database each time |
| Seeing other people's orders/addresses | Row Level Security: you only get your own rows |
| Injecting code through a product name or address (XSS) | All text is escaped before being displayed; and a Content-Security-Policy tells browsers to run only our own scripts. *(I tested a product named with script code; it displays as harmless text.)* |
| SQL injection | No hand-written database queries from the browser; the library and database functions use safe parameters |
| Malicious file upload | Only admins can upload; the storage bucket accepts only JPG/PNG/WEBP up to 3 MB; photos are re-drawn in the browser first, which also strips hidden camera/location data |
| Two people buying the last item | Stock is locked during checkout |
| Fake bulk orders | Max 5 pending orders per account; only signed-in customers may order |
| Open redirect (login links that send people to evil sites) | After login, only a fixed list of internal pages is allowed |
| Embedding your shop inside a fake page (clickjacking) | `X-Frame-Options` and CSP `frame-ancestors` |
| Man-in-the-middle snooping | HTTPS everywhere; HSTS header tells browsers to insist on it |
| Leaked secret keys | Only the **public** anon key is in the site. The master `service_role` key is never used |

### What *you* must do to stay safe
- Use a **long, unique password** for your admin account and for Supabase and Cloudflare logins; switch on two-factor authentication on both.
- Never paste the `service_role` key anywhere.
- Keep **Confirm email** switched on once you have real customers.
- Don't share your admin account. If someone leaves, change the password.
- **Export your data** regularly (see Part F).

### Honest security limits
- Without a paid plan there are no automatic backups. Export them yourself.
- Supabase's free email sender is meant for testing; connect a proper email service before a big launch.
- There is no CAPTCHA on sign-up. If you receive bot sign-ups, ask your developer to add one (Supabase supports it).
- The CDN-hosted library (`supabase-js`) is loaded from jsDelivr at a pinned version. A stricter setup would download and host that file yourself.

---

## Part F: Running the shop day to day

**Daily:** open `your-site/#/admin`, sign in, check **Pending orders**. The red counter shows how many wait. The list refreshes itself about every 45 seconds while open. For each order you'll see the customer's phone (tap to call), the area, address, landmark and a **map link** if they shared their location. Press **Confirm order**, then later change the status to **Out for delivery** and **Delivered**.

**Adding stock:** Admin > Products > Edit > change the *Stock* number > Save.
**Hiding an item** (seasonal, out of stock for good): Edit > untick "Show in the shop". It stays in your records.
**New area:** Admin > Delivery areas > Add an area with its fee. Switch off any area you can't serve at the moment.
**Backup / export (weekly):** in Supabase > **Table Editor**, open `orders`, `order_items` and `products` and use the **Export** button (CSV). Save the files somewhere safe.
**Keep the shop awake (free plan):** if nobody visits for about a week, Supabase pauses a free project. Either visit your shop weekly, or set up a free uptime monitor that opens your shop's product list on a schedule. When the shop starts earning, the paid plan removes this problem and adds daily backups.

---

## Part G: Honest limits, costs and risks

- **Cost to start:** $0 (domain name optional).
- **No online payment yet.** Checkout says "pay on delivery". That's deliberate for a first version: payments need a business account with a payment provider, and the order must only be marked as paid after the provider confirms it to the server. This can be added later.
- **No automatic emails/SMS** to customers. You confirm by phone or WhatsApp (put your number in `config.js` and a WhatsApp link appears in the footer and checkout).
- **Delivery check is by named area**, not by map distance. Locations shared by customers are saved for the rider but don't automatically accept or refuse an order.
- **One picture per product.**
- **Free-plan pausing and no backups** (Part C and F).
- **Testing status, so you know exactly what was verified:**
  - ✅ **Tested in a real browser:** the whole shop and admin experience in demo mode: browsing, cart maths, sign-up rules, login routing (admin vs customer), delivery-area blocking, placing and confirming orders, cancelling and restocking, product and photo upload, rejecting a fake image, and showing script code as harmless text. No script or security-policy errors.
  - ⚠️ **Not yet tested live:** I had no internet access in my build environment, so the Supabase connection and `setup.sql` have **not** been run against a real Supabase project. The code follows Supabase's documented methods, and demo mode mirrors the same rules, but expect to spend a few minutes on a first-run check. Do the checklist below and send me any error text.

### First-run checklist (after Part C)
- [ ] The shop opens with no orange banner and shows the 8 sample products
- [ ] You can register; (if email confirm is ON) the email arrives and you can sign in
- [ ] After the SQL line in C5, signing in takes you to the admin panel
- [ ] A second account (private window) can order; it shows as Pending for you
- [ ] Cancelling an order puts stock back
- [ ] Uploading a product photo works and shows in the shop
- [ ] As a customer, `#/admin` sends you back to the shop
- [ ] Choosing "My area is not listed" blocks ordering

**If something fails:** note the exact message, and check Supabase > **Logs** (and the browser's developer console). Common causes: a typo in the URL/key in `config.js`, the whole `setup.sql` not being pasted, or the "confirm email" setting.

---

## Part H: What I'd build next (in order of value)
1. **Order notification** to you (email or WhatsApp) the moment an order arrives.
2. **Mobile-money / card payments** with server-side confirmation.
3. **Multiple photos** per product and a zoom gallery.
4. **Customer can cancel** while an order is still pending.
5. **Sales report** page (daily and monthly totals, best sellers).
6. **Distance-based delivery fees** using the shop's coordinates.
7. **Discount codes** and a "New / Sale" badge.

---

*Questions you may have: "Can I change the design completely?" Yes, the look is all in `css/style.css`. "Can it be moved off the free services later?" Yes. The data is standard Postgres and can be exported and moved to any host if the shop grows.*
