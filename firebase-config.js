/* ---------------------------------------------------------------
   Firebase project config + one-time init.

   This project is now shared by EVERYTHING in the app: login
   accounts, the student roster, session logs, uploaded materials,
   and the "who's online" tracker — so every device sees the same
   data instead of each browser having its own separate copy.
   (This is also the fix for "every visitor sees Create Admin":
   they all now read the same shared /users list.)

   One-time setup (free "Spark" plan is enough):
   1. https://console.firebase.google.com → your project (already
      created — this file already has its keys below).
   2. Build → Realtime Database → Rules → paste:
        {
          "rules": {
            "users":    { ".read": "auth != null", ".write": "auth != null" },
            "students": { ".read": "auth != null", ".write": "auth != null" },
            "sessions": { ".read": "auth != null", ".write": "auth != null" },
            "materials":{ ".read": "auth != null", ".write": "auth != null" },
            "presence": { ".read": "auth != null", ".write": "auth != null" }
          }
        }
   3. Build → Storage → Get started (if you haven't already) — this
      is where uploaded material FILES live (the database rule above
      only covers their name/link, not the file bytes).
      Storage → Rules → paste:
        rules_version = '2';
        service firebase.storage {
          match /b/{bucket}/o {
            match /materials/{allPaths=**} {
              allow read, write: if request.auth != null;
            }
          }
        }
   4. Build → Authentication → Sign-in method → make sure
      "Anonymous" is enabled. (This has nothing to do with your
      app's own admin/instructor/student logins — it's just how the
      rules above tell a real visitor's browser apart from a random
      stranger on the internet.)

   If this file is ever left with placeholder values, the app shows
   a clear "cloud login unavailable" message instead of silently
   falling back to the old broken per-browser behavior.
------------------------------------------------------------------ */
const firebaseConfig = {
  apiKey: "AIzaSyBGC-0HOy158ACASDOoIrL2aMqxRA2rrWU",
  authDomain: "saaa-bc22e.firebaseapp.com",
  databaseURL: "https://saaa-bc22e-default-rtdb.firebaseio.com",
  projectId: "saaa-bc22e",
  storageBucket: "saaa-bc22e.firebasestorage.app",
  messagingSenderId: "754711069895",
  appId: "1:754711069895:web:ce3c0f07ace50a2bf8aae2"
};

const firebaseConfigured = !!firebaseConfig
  && !String(firebaseConfig.apiKey || '').includes('YOUR_')
  && !String(firebaseConfig.databaseURL || '').match(/YOUR_|PASTE_/);

// firebaseReady resolves `true` once we're signed in and safe to read/
// write the database & storage, or `false` if not configured / auth
// failed. Every other file awaits this instead of calling
// firebase.initializeApp() or signInAnonymously() itself, so init only
// ever happens once, no matter how many scripts use Firebase.
let firebaseReady;
if (firebaseConfigured) {
  firebase.initializeApp(firebaseConfig);
  firebaseReady = firebase.auth().signInAnonymously()
    .then(() => true)
    .catch(e => { console.error('Firebase auth failed', e); return false; });
} else {
  firebaseReady = Promise.resolve(false);
}
