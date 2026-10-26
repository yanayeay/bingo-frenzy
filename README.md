# Minion Rush Craze — Bingo Frenzy

A public shared club info center. No ChatGPT sign-in or separate player accounts.

- **Club Board:** member totals, Have/Need summary, planned sends.
- **Club Members:** edit everyone's Have/Need cards, Regular/Gold/King types, Star and spare quantities.
- **Card Matches:** needed cards with a Sender assigned.
- Assigning Sender also shows Recipient on the sender's matching Have card. Changing or clearing Sender updates both views.

## Deploy to your accounts

### 1. GitHub

Upload this folder's contents to https://github.com/yanayeay/bingo-frenzy on `main`. `package.json` and `app/` must be at the repository root, not inside a second folder. Include the `supabase/` and `scripts/` directories. Do not upload `node_modules`, `.next`, `.env.local`, or club data exports.

### 2. Supabase

Open your project `qxnebikkjjlhezpigisw` in the Supabase dashboard. Open **SQL Editor → New query**, paste the complete contents of `supabase/migrations/202610260001_club.sql`, and run it. It creates only the app's `bingo_players` and `bingo_listings` tables plus an optional import function. It does not create sample members.

In **Project Settings → API Keys**, locate or create a **secret key** (`sb_secret_...`). Keep it for the Vercel step. A publishable/anon key will not work for this backend. Never commit the secret key or use a `NEXT_PUBLIC_` prefix for it.

### 3. Vercel

1. Open https://vercel.com/yanas-projects-71276705 and select **Add New → Project**.
2. Import `yanayeay/bingo-frenzy`. If missing, adjust Vercel's GitHub app repository access in your own GitHub account.
3. Use framework **Next.js**, root directory **./**, Node.js **24.x**, and the default build command (`npm run build`).
4. Add these Environment Variables for **Production** and, if desired, **Preview**:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | `https://qxnebikkjjlhezpigisw.supabase.co` |
| `SUPABASE_SECRET_KEY` | Your Supabase secret key |

5. Deploy. Use the project's production domain for club members. Check **Settings → Deployment Protection** if visitors see a Vercel login wall; the production domain must allow public access. Preview URLs may remain protected.
6. If you add or change environment variables after deploying, redeploy to apply them.

### 4. Check the live app

Open the production link in an incognito/private window while signed out of ChatGPT and Vercel. Add a member and a card; refresh and confirm they remain. Open the same link on another device and confirm the same records load. Set a Sender on a needed card and check the matching sender's Have list for its Recipient. Clear Sender and confirm both the assignment and Recipient disappear.

The sample club remains in-memory demo data; it resets on refresh and does not write to Supabase.

## Public shared editing

Anyone who can open the public app can add, edit and remove club entries, as requested. Member names and game IDs are public on that app. Supabase tables have RLS enabled and no direct browser access; all reads and updates go through the app's server API. The API key never goes to the browser. This setup deliberately has no individual accounts or edit password.

## Existing club data

GitHub stores code only. Existing records from the ChatGPT-hosted app must be imported separately; no live member data or credentials are included in this public repository. To import a `club-data.json` export into **empty** tables:

```sh
npm ci
cp .env.example .env.local
# Fill in SUPABASE_SECRET_KEY in .env.local locally.
npm run data:import -- /path/to/club-data.json
```

The import runs in a database transaction, preserves IDs, names, cards, types, Star and Sender, and refuses to overwrite an existing club. Import before adding new members to the new app. If you want to start fresh, skip this step.

## Local development

Requires Node.js 24.

```sh
npm ci
cp .env.example .env.local
# Fill in the secret key, then:
npm run dev
```

Open http://localhost:3000. Run `npm test`, `npm run typecheck`, and `npm run build` to verify changes.

The frontend is React/Next.js; the backend is Next.js Route Handlers calling Supabase's REST API. It has no Cloudflare, D1, Sites or ChatGPT runtime dependencies. Vercel redeploys after pushes to the connected production branch.
