# Irisona: Qualitative and Mixed Methods Analysis

A team qualitative/mixed-methods coding tool (staged workflow: setup → individual/group
coding → master codebook → categories → themes → negative cases → matrices → theme
summary → meta-inferences), backed by Firebase Auth + Firestore so a research team's
work is shared by project name and saved with an explicit Save button.

## Logo

The brand mark is your provided artwork (the rainbow spiral + wordmark), cropped into
the pieces the app actually needs:

- `public/logo-icon.png` (256×256, also `logo-icon-512.png` at 512×512) — the spiral
  icon alone, square-cropped. Used for the compact in-app header badge.
- `public/logo-lockup.png` — the full icon + "Irisona" + tagline lockup, trimmed of
  extra whitespace. Used on the login screen.
- `public/favicon-32.png`, `favicon-16.png`, `apple-touch-icon.png` — browser tab /
  home-screen icon sizes, all rendered from the icon crop.

To swap in a different or updated logo: replace these files with your own (same
filenames), or update the four `src="/logo-*.png"` references — two in `src/App.jsx`
(login screen and header) and three `<link>` tags in `index.html`.

## Visual polish

`src/index.css` carries the shared interaction layer: antialiased text, eased
transitions on every interactive element, a soft focus ring for keyboard navigation
(vs. the harsh browser default), thin scrollbars, a spinner, and a subtle fade-in
whenever you switch stages. Corners were softened app-wide (sharp 2px corners → 8px),
and card-style panels got a faint drop shadow for depth. This is a systemic pass rather
than a screen-by-screen redesign — it should read as noticeably calmer and more
polished everywhere, but if any specific screen still feels rough, point me at it.

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
