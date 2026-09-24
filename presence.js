/* ---------------------------------------------------------------
   Live "who's online" tracker.
   Uses Firebase Realtime Database's standard presence pattern:
   each signed-in browser writes a node under /presence/{userId},
   with onDisconnect() cleaning it up automatically (including on
   closed tabs, lost network, etc.) — no polling needed, updates
   push to every connected browser in real time.
------------------------------------------------------------------ */
let presenceConfigured = firebaseConfig
  && !String(firebaseConfig.apiKey||'').includes('YOUR_')
  && !String(firebaseConfig.databaseURL||'').match(/YOUR_|PASTE_/);
let presenceUsers = [];           // [{id, username, role, lastActive}]
let presenceRef = null;
let presenceListRef = null;

function setOnlineBadge(text, ok){
  const el = document.getElementById('onlineBadge');
  if(!el) return;
  el.textContent = text;
  el.style.color = ok ? 'var(--good)' : 'var(--muted)';
}

async function initPresence(){
  if(!presenceConfigured){
    setOnlineBadge('● live tracker not configured', false);
    return;
  }
  try{
    firebase.initializeApp(firebaseConfig);
    await firebase.auth().signInAnonymously();
  }catch(e){
    console.error('Firebase init/auth failed', e);
    setOnlineBadge('● live tracker unavailable', false);
    presenceConfigured = false;
  }
}

function startPresence(user){
  if(!presenceConfigured) return;
  try{
    const db = firebase.database();
    presenceRef = db.ref('presence/' + user.id);
    presenceListRef = db.ref('presence');

    db.ref('.info/connected').on('value', (snap)=>{
      if(snap.val()===true){
        presenceRef.onDisconnect().remove();
        presenceRef.set({
          username: user.username,
          role: user.role,
          lastActive: firebase.database.ServerValue.TIMESTAMP
        });
      }
    });

    presenceListRef.on('value', (snap)=>{
      const val = snap.val() || {};
      presenceUsers = Object.entries(val).map(([id, d]) => ({ id, ...d }));
      const n = presenceUsers.length;
      setOnlineBadge(`● ${n} online`, true);
      if(typeof currentTab !== 'undefined' && currentTab === 'users' && typeof renderUsers === 'function'){
        renderUsers();
      }
    });
  }catch(e){
    console.error('Presence tracking failed to start', e);
    setOnlineBadge('● live tracker unavailable', false);
  }
}

function stopPresence(){
  if(presenceRef){ presenceRef.remove().catch(()=>{}); presenceRef = null; }
  if(presenceListRef){ presenceListRef.off(); presenceListRef = null; }
  presenceUsers = [];
}

function isUserOnline(userId){
  return presenceUsers.some(p => p.id === userId);
}

initPresence();
