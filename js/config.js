/* =====================================================================
   config.js  -  THE ONLY FILE YOU NEED TO EDIT.
   Change the text between the quote marks, save, and refresh the page.
   ===================================================================== */
window.SHOP_CONFIG = {

  /* ---- Your shop ---- */
  SHOP_NAME: "Marlowe",
  TAGLINE: "Dress like you meant it.",
  CURRENCY: "$",                       // shown before every price, e.g. "K", "R", "£", "KSh "
  CONTACT_WHATSAPP: "26771476443",                // optional, digits only with country code, e.g. "260971234567"
  CONTACT_EMAIL: "cehezcothin@gmail.com",                   // optional, shown in the footer

  /* ---- Connecting the real database (see docs/GUIDE.md, Part C) ----
     Leave both EMPTY to run in DEMO MODE: everything works, but data is only
     saved inside your own browser. Perfect for trying the design.
     Paste the two values from Supabase -> Project Settings -> API to go LIVE. */
  SUPABASE_URL: "https://bilmwwkankqhqnvaaegf.supabase.co",                    // looks like  https://abcdxyz.supabase.co
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpbG13d2thbmtxaHFudmFhZWdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxNDE0OTksImV4cCI6MjEwODcxNzQ5OX0.eqsj9mF2i-m1Qj3txrBBW_P49Iyk0Q0ei2rLToGWhYU"                // the long "anon" / "publishable" key. NEVER paste the "service_role" key here.
};
