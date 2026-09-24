/* ---------------------------------------------------------------
   Client-side auth. IMPORTANT: this is a static site with no server,
   so this can only gate casual access — anyone with browser dev tools
   can read localStorage. Do not use for sensitive/regulated data.
   Passwords are hashed (SHA-256 + per-user salt) rather than stored
   in plain text, but that only protects against a quick glance, not
   a determined attacker with access to the browser.
----------------------------------------------------------------- */
const LS_USERS = 'fs_users';
const LS_SESSION = 'fs_session';

let currentUser = null; // {id, username, role, linkedStudentId}

function loadUsers(){ try{ return JSON.parse(localStorage.getItem(LS_USERS))||[]; }catch(e){ return []; } }
function saveUsers(list){ localStorage.setItem(LS_USERS, JSON.stringify(list)); }

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
  const users = loadUsers();
  if(users.length===0){ showSetup(); return; }
  const sess = JSON.parse(localStorage.getItem(LS_SESSION)||'null');
  const found = sess && users.find(u=>u.id===sess.userId);
  if(found){ currentUser = found; showApp(); }
  else { showLogin(); }
}

function showSetup(){
  document.getElementById('loginScreen').style.display='block';
  document.getElementById('appScreen').style.display='none';
  document.getElementById('loginTitle').textContent = 'Create the admin account';
  document.getElementById('loginUser').placeholder = 'Choose a username';
  document.getElementById('loginPass').placeholder = 'Choose a password';
}
function showLogin(){
  document.getElementById('loginScreen').style.display='block';
  document.getElementById('appScreen').style.display='none';
  document.getElementById('loginTitle').textContent = 'Sign in';
  document.getElementById('loginUser').value='';
  document.getElementById('loginPass').value='';
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

  const users = loadUsers();
  if(users.length===0){
    const salt = randSalt();
    const passHash = await hashPassword(password, salt);
    const admin = { id: uid(), username, salt, passHash, role:'admin', linkedStudentId:null, createdAt: Date.now() };
    saveUsers([admin]);
    currentUser = admin;
    localStorage.setItem(LS_SESSION, JSON.stringify({userId: admin.id}));
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
  const users = loadUsers();
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
  const users = loadUsers();
  if(users.some(u=>u.username.toLowerCase()===username.toLowerCase())){ toast('Username already taken'); return; }

  const password = randPassword();
  const salt = randSalt();
  const passHash = await hashPassword(password, salt);
  const newUser = { id: uid(), username, salt, passHash, role, linkedStudentId, createdAt: Date.now() };
  users.push(newUser);
  saveUsers(users);
  lastGeneratedPassword = { username, password };
  toast('Account created');
  renderUsers();
}

async function resetPassword(id){
  const users = loadUsers();
  const u = users.find(x=>x.id===id);
  if(!u) return;
  const password = randPassword();
  u.salt = randSalt();
  u.passHash = await hashPassword(password, u.salt);
  saveUsers(users);
  lastGeneratedPassword = { username: u.username, password };
  toast('Password reset');
  renderUsers();
}

function deleteUser(id){
  if(!confirm('Delete this user account?')) return;
  saveUsers(loadUsers().filter(u=>u.id!==id));
  renderUsers();
}
