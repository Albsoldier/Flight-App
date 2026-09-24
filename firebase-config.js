/* ---------------------------------------------------------------
   Fill this in with YOUR Firebase project's config so the live
   "who's online" tracker works across everyone's devices.

   How to get these values:
   1. Go to https://console.firebase.google.com and create a project
      (the free "Spark" plan is enough for this).
   2. In your project, click the "</>" (web app) icon to register a
      web app — you don't need Hosting, just the config object.
   3. Build → Realtime Database → Create Database (start in
      "locked mode" is fine, we set rules below).
   4. Build → Authentication → Sign-in method → enable "Anonymous".
      (We use anonymous auth only so the database security rules
      can require "signed in" without you having to build a second
      login system — it has nothing to do with your app's own
      admin/instructor/student accounts.)
   5. In Realtime Database → Rules, paste:
        {
          "rules": {
            "presence": {
              ".read": "auth != null",
              ".write": "auth != null"
            }
          }
        }
   6. Copy the config object Firebase shows you and paste the values
      below, replacing the placeholders.

   If you leave this unfilled, the app still works fine — the
   online-user badge just shows "not configured" instead of a count.
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
