/* ============================================================
   LK Power Outage Tracker — configuration
   ------------------------------------------------------------
   Option A (recommended): leave these empty. Deploy the site,
   then click the ⚙ (settings) button on the live site and paste
   your Supabase credentials there. They are stored only in your
   browser's localStorage — no code edit needed.

   Option B: paste your credentials below (useful if you want
   everyone who opens the site to share the same database).
   Get them from: Supabase Dashboard → Settings → API
     - Project URL      → SUPABASE_URL
     - anon public key  → SUPABASE_ANON_KEY

   The anon key is meant to be public: access is protected by
   Row Level Security (see supabase_setup.sql).
   ============================================================ */
window.LKPM_CONFIG = {
  SUPABASE_URL: 'https://yxyxezeryemxgtascpmu.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_Y3quZsoZTwCqxL0J9vFNdQ_7TyeWek7'
};
