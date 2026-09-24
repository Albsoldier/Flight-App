/* ---------------------------------------------------------------
   App login (Roster/Materials/Stopwatch access), backed by Firebase
   Realtime Database so every browser/device shares the same account
   list. This is what fixes "every new visitor sees Create Admin" —
   they now all read the same /users node instead of their own empty
   localStorage.
 
   Still not bank-grade security: passwords are hashed (SHA-256 +
   per-user salt) before being stored, but anyone signed in (even
   anonymously, per the database rules) can read the /users list
   client-side. Fine for keeping casual visitors out of a hobby
   flight-school dashboard, not for protecting sensitive data from a
   determined attacker.
----------------------------------------------------------------- */
const LS_SESSION = 'fs_session'; // which account THIS browser is signed in as — fine to keep per-browser
 
let currentUser = null; // {id, username, role, linkedStudentId}
let allUsers = [];      // live cached copy of /users
 
function usersRef(){ return firebase.database().ref('users'); }
 
function randPassword(){
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out=''; for(let i=0;i<10;i++) out += chars[Math.floor(Math.random()*chars.length)];
  return out;
}
function randSalt(){ return Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b=>b.toString(16).padStart(2,'0')).join(''); }
async function hashPassword(password, salt){
  const enc = new TextEncoder().encode(salt+':'+password);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
 
async function initAuth(){
  const ok = await firebaseReady;
  if(!ok){ showCloudUnavailable(); return; }
 
  // Live copy of /users, so the Users tab and login checks always
  // see the latest data — including changes made from another device.
  usersRef().on('value', (snap)=>{
    const val = snap.val() || {};
    allUsers = Object.entries(val).map(([id, d]) => ({ id, ...d }));
    if(currentUser){
      const fresh = allUsers.find(u=>u.id===currentUser.id);
      if(fresh) currentUser = fresh;
      if(document.getElementById('appScreen').style.display==='block'){
        document.getElementById('whoami').textContent = `${currentUser.username} · ${currentUser.role}`;
        if(typeof currentTab !== 'undefined' && currentTab==='users') renderUsers();
      }
    }
  });
 
  const snap = await usersRef().once('value');
  const users = snap.val() ? Object.entries(snap.val()).map(([id,d])=>({id,...d})) : [];
 
  if(users.length===0){ showSetup(); return; }
  const sess = JSON.parse(localStorage.getItem(LS_SESSION)||'null');
  const found = sess && users.find(u=>u.id===sess.userId);
  if(found){ currentUser = found; showApp(); }
  else { showLogin(); }
}
 
function showCloudUnavailable(){
  document.getElementById('loginScreen').style.display='block';
  document.getElementById('appScreen').style.display='none';
  document.getElementById('loginTitle').textContent = 'Cloud login unavailable';
  const errEl = document.getElementById('loginError');
  errEl.textContent = "Can't reach the shared account database right now — check your internet connection, or ask the admin to check firebase-config.js.";
  errEl.style.display='block';
}
 
function showSetup(){
  document.getElementById('loginScreen').style.display='block';
  document.getElementById('appScreen').style.display='none';
  document.getElementById('loginTitle').textContent = 'Create the admin account';
  document.getElementById('loginUser').placeholder = 'Choose a username';
  document.getElementById('loginPass').placeholder = 'Choose a password';
  document.getElementById('loginError').style.display='none';
}
function showLogin(){
  document.getElementById('loginScreen').style.display='block';
  document.getElementById('appScreen').style.display='none';
  document.getElementById('loginTitle').textContent = 'Sign in';
  document.getElementById('loginUser').value='';
  document.getElementById('loginPass').value='';
  document.getElementById('loginError').style.display='none';
}
async function showApp(){
  document.getElementById('loginScreen').style.display='none';
  document.getElementById('appScreen').style.display='block';
  document.getElementById('whoami').textContent = `${currentUser.username} · ${currentUser.role}`;
  applyRoleUI();
  if(typeof startPresence === 'function') startPresence(currentUser);
  await materialsReady;
  render();
}
 
async function handleLogin(){
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value;
  const errEl = document.getElementById('loginError');
  errEl.style.display='none';
  if(!username || !password){ errEl.textContent='Enter a username and password.'; errEl.style.display='block'; return; }
 
  const snap = await usersRef().once('value');
  const users = snap.val() ? Object.entries(snap.val()).map(([id,d])=>({id,...d})) : [];
 
  if(users.length===0){
    const salt = randSalt();
    const passHash = await hashPassword(password, salt);
    const newId = usersRef().push().key;
    const adminDoc = { username, salt, passHash, role:'admin', linkedStudentId:null, createdAt: firebase.database.ServerValue.TIMESTAMP };
 
    // Atomic write: if two browsers race to create the admin at the
    // same moment, only one transaction commits — the loser is told
    // to sign in instead of creating a second admin account.
    const result = await usersRef().transaction(current => {
      if(current && Object.keys(current).length>0) return; // abort — an admin already exists
      return { [newId]: adminDoc };
    });
 
    if(!result.committed){
      errEl.textContent = 'An admin account was just created by someone else — please sign in instead.';
      errEl.style.display='block';
      showLogin();
      return;
    }
    currentUser = { id:newId, ...adminDoc };
    localStorage.setItem(LS_SESSION, JSON.stringify({userId: newId}));
    toast('Admin account created');
    showApp();
    return;
  }
 
  const u = users.find(x=>x.username.toLowerCase()===username.toLowerCase());
  if(!u){ errEl.textContent='No account with that username.'; errEl.style.display='block'; return; }
  const hash = await hashPassword(password, u.salt);
  if(hash!==u.passHash){ errEl.textContent='Incorrect password.'; errEl.style.display='block'; return; }
  currentUser = u;
  localStorage.setItem(LS_SESSION, JSON.stringify({userId: u.id}));
  showApp();
}
 
function logout(){
  if(typeof stopPresence === 'function') stopPresence();
  currentUser = null;
  localStorage.removeItem(LS_SESSION);
  showLogin();
}
 
/* role helpers */
function isAdmin(){ return currentUser && currentUser.role==='admin'; }
function isStaff(){ return currentUser && (currentUser.role==='admin' || currentUser.role==='instructor'); }
function isStudent(){ return currentUser && currentUser.role==='student'; }
 
function applyRoleUI(){
  document.querySelectorAll('nav button').forEach(b=>b.style.display='');
  if(!isAdmin()) document.querySelector('nav button[data-tab="users"]').style.display='none';
  if(isStudent()){
    document.querySelector('nav button[data-tab="stopwatch"]').style.display='none';
    document.querySelector('nav button[data-tab="roster"]').textContent = 'My Record';
    currentTab = 'roster';
    viewingStudentId = currentUser.linkedStudentId;
  }
}
 
/* ---------------- USERS TAB (admin only) ---------------- */
let lastGeneratedPassword = null;
 
function renderUsers(){
  const el = document.getElementById('tab-users');
  if(!isAdmin()){ el.innerHTML = `<div class="empty">Only admins can manage users.</div>`; return; }
  const users = allUsers;
  const studentOptions = students.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
 
  let html = `<div class="card">
    <h2>Create User</h2>
    <div class="row">
      <div class="field"><label class="small">Username</label><input id="nuUsername" placeholder="username"></div>
      <div class="field"><label class="small">Role</label>
        <select id="nuRole" onchange="document.getElementById('nuStudentWrap').style.display=this.value==='student'?'flex':'none'">
          <option value="instructor">Instructor</option>
          <option value="student">Student</option>
        </select>
      </div>
      <div class="field" id="nuStudentWrap"><label class="small">Linked student</label>
        <select id="nuStudent">${studentOptions || '<option value="">No students in roster yet</option>'}</select>
      </div>
      <div style="align-self:flex-end"><button class="btn" onclick="createUser()">Generate account</button></div>
    </div>
  </div>`;
 
  if(lastGeneratedPassword){
    html += `<div class="card" style="border-color:var(--good)">
      <h2>New account created</h2>
      <div class="muted">Share these with <strong>${esc(lastGeneratedPassword.username)}</strong> — the password won't be shown again.</div>
      <div class="row" style="margin-top:10px">
        <div class="pill">Username: ${esc(lastGeneratedPassword.username)}</div>
        <div class="pill">Password: ${esc(lastGeneratedPassword.password)}</div>
      </div>
    </div>`;
  }
 
  html += `<div class="card"><h2>All Users (${users.length})</h2>`;
  users.forEach(u=>{
    const linked = u.linkedStudentId ? (students.find(s=>s.id===u.linkedStudentId)||{}).name : null;
    const online = typeof isUserOnline === 'function' && isUserOnline(u.id);
    const statusDot = presenceConfigured
      ? `<span style="color:${online?'var(--good)':'var(--muted)'}">● ${online?'Online':'Offline'}</span>`
      : '';
    html += `<div class="student-item">
      <div><div class="name">${esc(u.username)}</div>
      <div class="meta">${u.role}${linked ? ' · linked to '+esc(linked) : ''} ${statusDot ? '· '+statusDot : ''}</div></div>
      <div class="row">
        <button class="btn secondary" onclick="resetPassword('${u.id}')">Reset password</button>
        ${u.id!==currentUser.id ? `<button class="btn danger" onclick="deleteUser('${u.id}')">Delete</button>` : ''}
      </div>
    </div>`;
  });
  html += `</div>`;
  el.innerHTML = html;
}
 
async function createUser(){
  const username = document.getElementById('nuUsername').value.trim();
  const role = document.getElementById('nuRole').value;
  const linkedStudentId = role==='student' ? (document.getElementById('nuStudent').value||null) : null;
  if(!username){ toast('Enter a username'); return; }
  if(role==='student' && !linkedStudentId){ toast('Add a student to the roster first'); return; }
  if(allUsers.some(u=>u.username.toLowerCase()===username.toLowerCase())){ toast('Username already taken'); return; }
 
  const password = randPassword();
  const salt = randSalt();
  const passHash = await hashPassword(password, salt);
  const newId = usersRef().push().key;
  const newUser = { username, salt, passHash, role, linkedStudentId, createdAt: firebase.database.ServerValue.TIMESTAMP };
  await usersRef().child(newId).set(newUser);
  lastGeneratedPassword = { username, password };
  toast('Account created');
  renderUsers();
}
 
async function resetPassword(id){
  const u = allUsers.find(x=>x.id===id);
  if(!u) return;
  const password = randPassword();
  const salt = randSalt();
  const passHash = await hashPassword(password, salt);
  await usersRef().child(id).update({ salt, passHash });
  lastGeneratedPassword = { username: u.username, password };
  toast('Password reset');
  renderUsers();
}
 
async function deleteUser(id){
  if(!confirm('Delete this user account?')) return;
  await usersRef().child(id).remove();
  renderUsers();
}
 
