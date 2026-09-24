/* ---------------- STORAGE ----------------
   Students & sessions: localStorage (tiny, fine).
   Materials (uploaded files): IndexedDB — holds far more than localStorage's
   ~5-10MB cap (typically hundreds of MB to a few GB, a share of free disk space).
------------------------------------------- */
const LS_KEYS = { students: 'fs_students', materials: 'fs_materials', sessions: 'fs_sessions' };

function loadLS(key){
  try{ const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : []; }
  catch(e){ return []; }
}
function saveLS(key, arr){
  try{ localStorage.setItem(key, JSON.stringify(arr)); return true; }
  catch(e){ console.error('Storage save failed (quota?)', e); return false; }
}

let idbInstance = null;
function openIDB(){
  return new Promise((resolve, reject)=>{
    if(idbInstance){ resolve(idbInstance); return; }
    const req = indexedDB.open('fsDB', 1);
    req.onupgradeneeded = ()=>{ req.result.createObjectStore('materials', {keyPath:'id'}); };
    req.onsuccess = ()=>{ idbInstance = req.result; resolve(idbInstance); };
    req.onerror = ()=>reject(req.error);
  });
}
async function idbGetAll(){
  const db = await openIDB();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction('materials','readonly');
    const req = tx.objectStore('materials').getAll();
    req.onsuccess = ()=>resolve(req.result||[]);
    req.onerror = ()=>reject(req.error);
  });
}
async function idbPut(doc){
  const db = await openIDB();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction('materials','readwrite');
    tx.objectStore('materials').put(doc);
    tx.oncomplete = ()=>resolve(true);
    tx.onerror = ()=>reject(tx.error);
  });
}
async function idbDelete(id){
  const db = await openIDB();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction('materials','readwrite');
    tx.objectStore('materials').delete(id);
    tx.oncomplete = ()=>resolve(true);
    tx.onerror = ()=>reject(tx.error);
  });
}
async function migrateMaterialsIfNeeded(){
  const legacy = loadLS(LS_KEYS.materials);
  if(legacy.length){
    for(const m of legacy){ try{ await idbPut(m); }catch(e){} }
    localStorage.removeItem(LS_KEYS.materials); // free up the old localStorage quota
  }
}

let students = loadLS(LS_KEYS.students);   // {id, name, aircraft, notes, totalHours}
let materials = [];                        // {id, name, dataUrl, contentType, uploadedAt} — loaded from IndexedDB
let sessions = loadLS(LS_KEYS.sessions);   // {id, studentId, studentName, startedAt, endedAt, durationSeconds, note}

const materialsReady = migrateMaterialsIfNeeded()
  .then(idbGetAll)
  .then(arr => { materials = arr; })
  .catch(e => console.error('Could not load materials from IndexedDB', e));

let currentTab = 'roster';
let viewingStudentId = null;

function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2200);
}
function fmtDur(sec){
  sec = Math.floor(sec);
  const h = String(Math.floor(sec/3600)).padStart(2,'0');
  const m = String(Math.floor((sec%3600)/60)).padStart(2,'0');
  const s = String(sec%60).padStart(2,'0');
  return h+':'+m+':'+s;
}
function fmtHours(sec){ return (sec/3600).toFixed(1); }
function uid(){ return 'id_'+Math.random().toString(36).slice(2,10); }
function esc(s){ return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ---------------- ROSTER ---------------- */
function renderRoster(){
  const el = document.getElementById('tab-roster');
  if(isStudent()){ viewingStudentId = currentUser.linkedStudentId; renderStudentDetail(el, true); return; }
  if(viewingStudentId){ renderStudentDetail(el); return; }

  let html = `<div class="card">
    <h2>Add Student</h2>
    <div class="row">
      <div class="field"><label class="small">Name</label><input id="newName" placeholder="Student name"></div>
      <div class="field"><label class="small">Aircraft</label><input id="newAircraft" placeholder="e.g. Cessna 172"></div>
      <div style="align-self:flex-end"><button class="btn" onclick="addStudent()">Add</button></div>
    </div>
  </div>
  <div class="card"><h2>Roster (${students.length})</h2>`;

  if(students.length===0){
    html += `<div class="empty">No students yet — add your first one above.</div>`;
  } else {
    students.forEach(st=>{
      const total = totalHoursFor(st.id, st.totalHours);
      html += `<div class="student-item">
        <div>
          <div class="name">${esc(st.name)}</div>
          <div class="meta">${esc(st.aircraft||'—')}</div>
        </div>
        <div class="row" style="align-items:center">
          <span class="pill">${total} hrs</span>
          <button class="btn secondary" onclick="viewStudent('${st.id}')">View file</button>
        </div>
      </div>`;
    });
  }
  html += `</div>`;
  el.innerHTML = html;
}

function totalHoursFor(studentId, fallback){
  const secs = sessions.filter(s=>s.studentId===studentId).reduce((a,s)=>a+(s.durationSeconds||0),0);
  if(secs>0) return fmtHours(secs);
  return fallback ? Number(fallback).toFixed(1) : '0.0';
}

function addStudent(){
  const name = document.getElementById('newName').value.trim();
  const aircraft = document.getElementById('newAircraft').value.trim();
  if(!name){ toast('Enter a student name'); return; }
  const id = uid();
  const doc = { id, name, aircraft, notes:'', totalHours:0, createdAt: Date.now() };
  students.push(doc);
  saveLS(LS_KEYS.students, students);
  toast('Student added');
  render();
}

function viewStudent(id){ viewingStudentId = id; render(); }

function renderStudentDetail(el, readOnly){
  const st = students.find(s=>s.id===viewingStudentId);
  if(!st){
    if(readOnly){ el.innerHTML = `<div class="empty">Your account isn't linked to a roster record yet — ask your instructor.</div>`; return; }
    viewingStudentId=null; renderRoster(); return;
  }
  const studentSessions = sessions.filter(s=>s.studentId===st.id).sort((a,b)=>(b.endedAt||0)-(a.endedAt||0));
  const total = totalHoursFor(st.id, st.totalHours);

  let sessRows = studentSessions.length ? studentSessions.map(s=>`
    <div class="session-row">
      <span>${s.endedAt ? new Date(s.endedAt).toLocaleString() : '—'}${s.note ? ' · '+esc(s.note):''}</span>
      <span><strong>${fmtDur(s.durationSeconds||0)}</strong></span>
    </div>`).join('') : `<div class="empty">No logged sessions yet.</div>`;

  const notesBlock = readOnly
    ? `<label class="small">Notes from your instructor</label><div style="white-space:pre-wrap">${esc(st.notes||'No notes yet.')}</div>`
    : `<label class="small">Notes</label>
       <textarea id="studentNotes" rows="3" style="width:100%" placeholder="Progress notes...">${esc(st.notes||'')}</textarea>
       <div style="margin-top:8px"><button class="btn secondary" onclick="saveNotes('${st.id}')">Save notes</button></div>`;

  el.innerHTML = `
    ${readOnly ? '' : `<button class="detail-back" onclick="viewingStudentId=null; render();">← Back to roster</button>`}
    <div class="card">
      <h2>${esc(st.name)}</h2>
      <div class="muted" style="margin-bottom:10px">${esc(st.aircraft||'No aircraft set')} · <span class="pill">${total} total hrs</span></div>
      ${notesBlock}
    </div>
    <div class="card">
      <h2>Flight session log</h2>
      ${sessRows}
    </div>
  `;
}

function saveNotes(id){
  const notes = document.getElementById('studentNotes').value;
  const st = students.find(s=>s.id===id);
  if(st){ st.notes = notes; saveLS(LS_KEYS.students, students); toast('Notes saved'); }
}

/* ---------------- MATERIALS ---------------- */
function renderMaterials(){
  const el = document.getElementById('tab-materials');
  let html = '';
  if(isStaff()){
    html += `<div class="card">
      <h2>Upload Teaching Material</h2>
      <div class="upload-drop" onclick="document.getElementById('fileInput').click()">
        📎 Click to upload PDF, JPG, PNG, or other files
      </div>
      <input type="file" id="fileInput" style="display:none" multiple onchange="handleUpload(event)">
      <div class="muted" style="font-size:.75rem;margin-top:8px">Files are stored in this browser only (not synced across devices) — capacity is typically hundreds of MB or more.</div>
    </div>`;
  }
  html += `<div class="card"><h2>Materials (${materials.length})</h2>`;

  if(materials.length===0){
    html += `<div class="empty">No materials uploaded yet.</div>`;
  } else {
    materials.slice().reverse().forEach(m=>{
      html += `<div class="material-item">
        <div class="row" style="align-items:center">
          <div class="thumb">${iconFor(m.contentType)}</div>
          <div>
            <div class="name">${esc(m.name)}</div>
            <div class="meta">${new Date(m.uploadedAt).toLocaleDateString()}</div>
          </div>
        </div>
        <div class="row">
          <a class="btn secondary" href="${m.dataUrl}" download="${esc(m.name)}">Download</a>
          ${isStaff() ? `<button class="btn danger" onclick="deleteMaterial('${m.id}')">Delete</button>` : ''}
        </div>
      </div>`;
    });
  }
  html += `</div>`;
  el.innerHTML = html;
}
function iconFor(ct){
  if(!ct) return '📄';
  if(ct.includes('pdf')) return '📕';
  if(ct.includes('image')) return '🖼️';
  return '📄';
}
function fileToDataUrl(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = ()=>resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
async function handleUpload(evt){
  const files = Array.from(evt.target.files||[]);
  if(!files.length) return;
  for(const file of files){
    try{
      const dataUrl = await fileToDataUrl(file);
      const doc = { id: uid(), name:file.name, dataUrl, contentType:file.type, uploadedAt: Date.now() };
      await idbPut(doc);
      materials.push(doc);
      toast('Uploaded '+file.name);
    }catch(e){ toast('Upload failed: '+file.name); }
  }
  evt.target.value = '';
  render();
}
async function deleteMaterial(id){
  materials = materials.filter(m=>m.id!==id);
  try{ await idbDelete(id); }catch(e){}
  render();
}

/* ---------------- STOPWATCH ---------------- */
let swState = 'idle'; // idle | running | paused
let swStudentId = '';
let swElapsedMs = 0;
let swStartTs = 0;
let swInterval = null;

function renderStopwatch(){
  const el = document.getElementById('tab-stopwatch');
  const options = students.map(s=>`<option value="${s.id}" ${s.id===swStudentId?'selected':''}>${esc(s.name)}</option>`).join('');
  const disabledSel = swState!=='idle' ? 'disabled' : '';

  el.innerHTML = `
  <div class="card">
    <h2>Flight Hour Stopwatch</h2>
    <div class="field" style="margin-bottom:14px">
      <label class="small">Student</label>
      <select id="swStudent" ${disabledSel} onchange="swStudentId=this.value">
        <option value="">${students.length? 'Select a student…' : 'No students in roster yet'}</option>
        ${options}
      </select>
    </div>
    <div class="stopwatch-display" id="swDisplay">${fmtDur(currentElapsedSec())}</div>
    <div class="sw-controls">
      ${swState==='idle' ? `<button class="btn good" onclick="startStopwatch()">▶ Start</button>` : ''}
      ${swState==='running' ? `<button class="btn secondary" onclick="pauseStopwatch()">⏸ Pause</button>` : ''}
      ${swState==='paused' ? `<button class="btn good" onclick="resumeStopwatch()">▶ Resume</button>` : ''}
      ${swState!=='idle' ? `<button class="btn danger" onclick="endStopwatch()">⏹ End Session</button>` : ''}
    </div>
  </div>`;
}

function currentElapsedSec(){
  let ms = swElapsedMs;
  if(swState==='running') ms += (Date.now()-swStartTs);
  return ms/1000;
}
function tickDisplay(){
  const d = document.getElementById('swDisplay');
  if(d) d.textContent = fmtDur(currentElapsedSec());
}
function startStopwatch(){
  const sel = document.getElementById('swStudent');
  swStudentId = sel.value;
  if(!swStudentId){ toast('Select a student first'); return; }
  swState='running'; swElapsedMs=0; swStartTs=Date.now();
  swInterval = setInterval(tickDisplay, 1000);
  renderStopwatch();
}
function pauseStopwatch(){
  swElapsedMs += (Date.now()-swStartTs);
  swState='paused';
  clearInterval(swInterval);
  renderStopwatch();
}
function resumeStopwatch(){
  swStartTs = Date.now();
  swState='running';
  swInterval = setInterval(tickDisplay, 1000);
  renderStopwatch();
}
function endStopwatch(){
  if(swState==='running'){ swElapsedMs += (Date.now()-swStartTs); }
  clearInterval(swInterval);
  const durationSeconds = Math.round(swElapsedMs/1000);
  const student = students.find(s=>s.id===swStudentId);
  swState='idle';
  if(durationSeconds<1){ swElapsedMs=0; renderStopwatch(); return; }

  const note = prompt('Optional session note (maneuvers, route, etc.):','') || '';
  if(student){
    const doc = { id: uid(), studentId: student.id, studentName: student.name, startedAt: Date.now()-swElapsedMs, endedAt: Date.now(), durationSeconds, note };
    sessions.push(doc);
    saveLS(LS_KEYS.sessions, sessions);
    const newTotalSec = sessions.filter(s=>s.studentId===student.id).reduce((a,s)=>a+(s.durationSeconds||0),0);
    student.totalHours = Number((newTotalSec/3600).toFixed(2));
    saveLS(LS_KEYS.students, students);
    toast(`Saved ${fmtDur(durationSeconds)} to ${student.name}'s file`);
  }
  swElapsedMs = 0;
  render();
}

/* ---------------- SHARED / INIT ---------------- */
function render(){
  if(!currentUser) return;
  document.getElementById('tab-roster').style.display = currentTab==='roster' ? 'block':'none';
  document.getElementById('tab-materials').style.display = currentTab==='materials' ? 'block':'none';
  document.getElementById('tab-stopwatch').style.display = currentTab==='stopwatch' ? 'block':'none';
  document.getElementById('tab-users').style.display = currentTab==='users' ? 'block':'none';
  if(currentTab==='roster') renderRoster();
  if(currentTab==='materials') renderMaterials();
  if(currentTab==='stopwatch' && isStaff()) renderStopwatch();
  if(currentTab==='users') renderUsers();
}

document.querySelectorAll('nav button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    if(swState!=='idle'){ toast('Stopwatch is running — end the session first'); return; }
    document.querySelectorAll('nav button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    currentTab = btn.dataset.tab;
    if(!isStudent()) viewingStudentId = null;
    render();
  });
});

initAuth();
