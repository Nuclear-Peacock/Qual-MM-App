# Marginal — Qualitative Analysis Workbench

A team qualitative/mixed-methods coding tool (staged workflow: setup → individual/group
coding → master codebook → categories → themes → negative cases → matrices → theme
summary → meta-inferences), backed by Firebase Auth + Firestore so a research team's
work is saved live and shared by project name.

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
   slug) is subscribed to live via `onSnapshot` — teammates' changes appear without a
   refresh — and local edits are debounced and written back automatically, so work is
   never lost on refresh.

## Security note

This scheme is a lightweight team gate, not strong per-project access control:
knowing (or guessing) a project name plus having a whitelisted email is sufficient to
join that project, since Firestore rules can't see *which* password an already-listed
user used to authenticate. If you need real per-project membership (e.g., only certain
whitelisted people can access *this* specific project, not just *any* project), that
requires a different design — an explicit membership list per project checked in
Firestore rules, or a Cloud Function that validates access before granting a session.

## Note on the "role" field

The previous version of this app had an Individual/Group role picker on the login
screen, gating who could edit the master codebook, categories, themes, etc. Since the
simplified login screen now only asks for email and project name, every whitelisted
login defaults to the full-access "group" role — the whitelist is the access gate now.
The read-only "individual" role logic still exists in the code (unused by default); if
you want to bring back per-person permission levels, that's a small addition to the
login flow and profile object.
