# Irisona: Qualitative and Mixed Methods Analysis

A team qualitative/mixed-methods coding tool (staged workflow: setup → individual/group
coding → master codebook → categories → themes → negative cases → matrices → theme
summary → meta-inferences), backed by Firebase Auth + Firestore so a research team's
work is shared by project name and saved with an explicit Save button.

## Logo

The brand mark is your provided artwork (the rainbow spiral + wordmark), cropped into
the pieces the app actually needs:

- `src/assets/logo-icon.png` (256×256) — the spiral icon alone, square-cropped. Used
  for the compact in-app header badge and the loading screen. Imported directly into
  `App.jsx` (`import logoIcon from "./assets/logo-icon.png"`), so Vite bundles it at
  build time — if the file is ever missing, the build fails immediately instead of
  showing a broken image at runtime.
- `src/assets/logo-lockup.png` — the full icon + "Irisona" + tagline lockup, trimmed of
  extra whitespace. Used on the login screen, same import pattern.
- `public/favicon-32.png`, `favicon-16.png`, `apple-touch-icon.png` — browser tab /
  home-screen icon sizes, referenced from `index.html`'s `<link>` tags the standard
  static-file way (these have to live in `public/`, since `index.html` isn't processed
  by the JS bundler).
- `public/logo-icon-512.png` — a larger unreferenced copy, kept around for anywhere
  else you need a bigger raster version (app listings, social previews).

To swap in a different or updated logo: replace `src/assets/logo-icon.png` and
`src/assets/logo-lockup.png` with your own files (same filenames, or update the two
`import` lines near the top of `src/App.jsx`), and separately replace the three
favicon files in `public/` if you want the browser tab icon to match too.

**If a logo ever shows as a broken image again:** that almost always means the file
isn't actually present at the path being referenced — check that `src/assets/` (for
the two in-app images) or `public/` (for favicons) actually made it into your local
checkout and deployment, and that filenames match exactly (case-sensitive on Netlify's
Linux servers, even if your local machine isn't case-sensitive).

## Visual polish

`src/index.css` carries the shared interaction layer: antialiased text, eased
transitions on every interactive element, a soft focus ring for keyboard navigation
(vs. the harsh browser default), thin scrollbars, a spinner, and a subtle fade-in
whenever you switch stages. Corners were softened app-wide (sharp 2px corners → 8px),
and card-style panels got a faint drop shadow for depth. This is a systemic pass rather
than a screen-by-screen redesign — it should read as noticeably calmer and more
polished everywhere, but if any specific screen still feels rough, point me at it.

## Codebook: deductive seeding, inductive additions, and who sees what

Two coding pathways feed the same shared codebook:

- **Individual coders add inductive codes as they go** — while coding in the Code
  stage, anyone (Individual or Group role) can create a new code on the fly by
  selecting text and clicking "+ create." This is unrestricted by design; it's how
  open/inductive coding is supposed to work, and every new code goes into the shared
  master codebook immediately, regardless of who created it.
- **The Group role can pre-seed deductive codes before anyone starts coding** — Master
  Codebook has an "Add a predetermined code" panel (Group role only) that creates a
  code with no excerpt attached, for codes you already know you want going in — derived
  from your research questions or learning theory, not yet observed in the data.

Every code carries an **Origin** (deductive/inductive) and, if deductive, which
**learning theory** it comes from — editable any time from Master Codebook, which also
shows that theory right in each code's collapsed row.

**Who can select which codes while coding** is asymmetric by design:
- **Deductive codes are selectable by everyone**, always — the whole point of
  pre-seeding them is that coders should be looking for them from the start.
- **Inductive codes are only selectable by the researcher who created them.** If
  Researcher A invents an inductive code, Researcher B won't see it in their own code
  picker — it's still saved to the shared master codebook and will surface once
  Master Codebook unlocks for them, but it doesn't appear as a selectable option while
  they're independently coding. This keeps independent coding genuinely independent —
  nobody's inductive vocabulary leaks into anyone else's initial pass.
- **The Group role sees and can select every code**, deductive or inductive, from
  anyone — no filtering applies to Group.

**Master Codebook itself stays locked to Individual coders** until **every single
document** has at least one saved code *and* at least one memo from them — not just
"coded everything overall, plus one memo anywhere." A memo only counts toward a given
document if it's linked to that document specifically (the dropdown in Memos — "General
/ project-level" memos don't count toward any document's requirement). The individual
banner at the top of the app shows live progress and names exactly which documents
still need a code, a memo, or both. Once every document clears both, Master Codebook
and everything past it becomes visible, read-only. Until then, they still have full
access to whatever deductive codes exist, just through the Code stage's picker, not
through browsing the codebook itself.

## Combined survey upload

If quantitative and qualitative data arrive in one CSV (a typical form/survey export —
Likert items and open-ended responses as columns side by side), Setup now has a
**"Combined survey upload"** section, separate from the two single-purpose uploads
above it. Upload or paste the CSV, and for each detected column pick a role:

- **Participant ID** — links everything below to one person. Pick one column (a name,
  email, or ID field); it becomes both the document title and the row identifier in the
  quantitative dataset, so the two stay linked. If you skip this, rows are labeled
  "Respondent 1," "Respondent 2," etc.
- **Quantitative** — numeric items (Likert scales, ratings). These become columns in
  the quantitative dataset, same as the separate quant CSV upload, feeding the
  descriptive stats and paired analysis in Matrices.
- **Qualitative** — open-ended text responses. One new document gets created per
  participant, combining all of their qualitative columns (each labeled with its
  original column header) into one codeable document.
- **Demographic** — categorical context (training level, cohort, prior experience).
  Attached as attributes on each created document — shown as context while coding, not
  fed into any specific matrix (see the note below on what attributes actually do).
- **Ignore** — anything irrelevant (timestamps, consent checkboxes, etc.).

Roles are auto-guessed (all-numeric columns → quantitative, low-variety short text →
demographic, header names containing "id"/"name"/"email" → participant ID, everything
else → qualitative) but every guess is a dropdown you can override. Running it creates
new documents and **replaces** the quantitative dataset — your existing individually-
uploaded documents and the standalone quant CSV upload are unaffected either way, and
running it twice will create duplicate documents rather than merge, so delete the old
ones first if you're re-importing a corrected file.

**What document attributes are (and aren't) for:** attributes are free-form key/value
tags on a document — "Training level: Novice," "Cohort: A" — shown as context next to
that document while you're reading and coding it. They don't feed any matrix or
statistic; that used to be true in an earlier version of this app but isn't anymore.
The actual quantitative dataset that drives descriptive stats, Wilcoxon tests, and the
paired analysis comes only from an uploaded CSV — either the standalone one or the
combined one above.

## 1. Firebase project setup (free "Spark" plan is enough)

1. Go to https://console.firebase.google.com and create a new project.
2. **Authentication** → *Sign-in method* → enable **Email/Password**.
3. **Firestore Database** → *Create database* (start in production mode; the rules below
   lock it down).
4. **Project settings** → *General* → scroll to "Your apps" → add a **Web app** → copy the
   config values shown (`apiKey`, `authDomain`, `projectId`, `storageBucket`,
   `messagingSenderId`, `appId`).
5. **Firestore Database** → *Rules* → paste:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /allowed_users/{docId} {
         allow read: if true;    // must be publicly readable so the pre-login whitelist check can run
         allow write: if false;  // manage this list from the console only
       }
       match /users/{userId} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
       match /projects/{projectId} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```

   **What this does and doesn't protect:** `allowed_users` has to be publicly readable
   for the whitelist check to run *before* anyone is signed in — that only exposes the
   list of approved email addresses, nothing else, and write access stays locked to the
   console. Once someone is authenticated, any signed-in user can read/write any
   `projects/{id}` document — the project name (used as the password) is what keeps
   people out in practice, not a per-document permission check. See the security note
   at the end of this file before using this for anything sensitive.

6. **Firestore Database** → *Data* → create a collection named `allowed_users`. Add one
   document per approved researcher (auto-generated document ID is fine) with a single
   field:
   ```
   email: "researcher@example.com"
   ```
   Only emails present here can ever sign in.

## 2. Local development

```bash
npm install
cp .env.example .env       # then fill in the six Firebase values from step 4 above
npm run dev
```

## 3. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

`.env` is git-ignored on purpose — never commit real Firebase keys to the repo (set them
in Netlify instead, step 4).

## 4. Deploy on Netlify

1. https://app.netlify.com → **Add new site** → **Import an existing project** → connect
   GitHub → pick this repo.
2. Build settings are already defined in `netlify.toml` (`npm run build`, publishes
   `dist`) — Netlify should detect them automatically.
3. **Site settings** → **Environment variables** → add all six:
   `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
   `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`,
   `VITE_FIREBASE_APP_ID` — same values as your local `.env`.
4. **Deploys** → trigger a deploy (or push another commit — Netlify auto-deploys on
   push once connected).
5. In the Firebase console, **Authentication** → **Settings** → **Authorized domains**
   → add your Netlify URL (e.g. `your-site.netlify.app`) so sign-in works from
   production.

## How login works

Each person signs in with **their own email** + **the project's name**. Behind the
scenes:

1. The typed email is checked against the `allowed_users` collection. Not listed →
   "Access Denied: Your email is not on the pre-approved whitelist."
2. If listed, the app tries `signInWithEmailAndPassword(email, projectName)`. If that
   email has never used this project name before, it automatically registers via
   `createUserWithEmailAndPassword` instead — so the *first* person to type a given
   project name effectively creates it, and everyone after must type it identically to
   join the same one.
3. The Firestore document at `projects/{ProjectName}` (the literal project name, not a
   slug) is loaded once at login. From there, **saving is manual**: a "Save changes"
   button in the header (highlighted gold when there are unsaved edits) writes the
   current state back with a single `setDoc` call, and a "reload" button pulls the
   latest saved version back down on demand. There's no background sync — if you close
   the tab with unsaved changes, the browser will warn you first, but nothing is written
   automatically. Click Save before switching stages or stepping away, and click Reload
   before you start work if a teammate may have saved more recently than your last load.

## If Save or Reload fails

Open the browser console (the Save button logs the real Firebase error there) — the
most common causes are:
- The Firestore rules above haven't actually been published (Firestore Database →
  Rules → **Publish**, not just saved as a draft).
- The signed-in user's email isn't actually in `allowed_users`, or the `email` field on
  that document doesn't exactly match (case, whitespace) what was typed at login.
- The Firebase project is on a quota/billing hold, or the six `VITE_FIREBASE_*` values
  don't match this Firebase project (a stale `.env` after switching projects is a
  frequent culprit).
- **A Content-Security-Policy blocking `eval`.** Firestore's SDK relies on a dependency
  (protobuf message encoding) that uses `new Function()` internally, which any CSP
  without `unsafe-eval` in `script-src` will block — this shows up in Chrome's DevTools
  **Issues** tab (not the Console tab) as "The Content Security Policy (CSP) prevents
  the evaluation of arbitrary strings." `public/_headers` sets an explicit CSP that
  allows this, plus Firebase's domains, Google Fonts, and the app's own bundled assets.
  If you already have a CSP configured elsewhere (Netlify dashboard → Site
  configuration → Headers, or your own `netlify.toml` edits), that one may be taking
  precedence instead — check there first, and merge in the `script-src 'unsafe-eval'`
  and `connect-src` values from `public/_headers` rather than running two conflicting
  policies.

## Typography

All text renders in Open Sans at 16px (12pt) or larger — set globally via
`tailwind.config.js` (which points Tailwind's `sans`/`serif`/`mono` families at Open
Sans so no individual component needed editing) and loaded in `index.html` from Google
Fonts. The one exception is the tiny in-chart percentage labels inside the diverging
stacked-bar segments in Matrices, which were removed rather than enlarged — a 16px
label doesn't fit inside a 20px-tall bar segment, and the same numbers are already
shown at full size in the legend underneath each chart.

## Security note

This scheme is a lightweight team gate, not strong per-project access control:
knowing (or guessing) a project name plus having a whitelisted email is sufficient to
join that project, since Firestore rules can't see *which* password an already-listed
user used to authenticate. If you need real per-project membership (e.g., only certain
whitelisted people can access *this* specific project, not just *any* project), that
requires a different design — an explicit membership list per project checked in
Firestore rules, or a Cloud Function that validates access before granting a session.

## Individual vs. Group role

The login screen only asks for email and project name, so role isn't chosen at
sign-in. Instead, everyone starts as **Individual** on first login (their own coding +
memo space, read-only everywhere else until they've coded every document), and can
switch themselves to **Group** (full edit access to the master codebook, categories,
themes, negative cases, matrices, and summaries) at any time using the toggle in the
header. The choice is saved to their Firestore profile (`users/{uid}`), so it persists
across reloads.

This is a self-service toggle, not an access-control boundary — anyone can flip
themselves to Group. It exists to nudge a good process (code independently first, then
move to group consensus), not to enforce it. If you need a hard boundary — e.g. only
specific people can ever reach Group — that has to be enforced server-side (Firestore
rules keyed off a separate admin list, or a Cloud Function), since Firestore rules alone
can't distinguish "this authenticated user chose Group" from "this authenticated user is
allowed to choose Group."
