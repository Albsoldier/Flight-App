// --- Storage ---
const STORAGE_KEY = 'flightlog.students.v1';

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Failed to load flight log data', e);
    return [];
  }
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(students));
  } catch (e) {
    console.error('Failed to save flight log data', e);
  }
}

let students = loadData();
let activeStudentId = students.length ? students[0].id : null;

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// --- Elements ---
const studentList = document.getElementById('studentList');
const rosterEmpty = document.getElementById('rosterEmpty');
const noStudentState = document.getElementById('noStudentState');
const studentView = document.getElementById('studentView');
const studentNameEl = document.getElementById('studentName');
const studentMetaEl = document.getElementById('studentMeta');
const totalsStrip = document.getElementById('totalsStrip');
const logRows = document.getElementById('logRows');
const totalsRow = document.getElementById('totalsRow');
const logEmpty = document.getElementById('logEmpty');

const studentModal = document.getElementById('studentModal');
const studentForm = document.getElementById('studentForm');
const flightModal = document.getElementById('flightModal');
const flightForm = document.getElementById('flightForm');

document.getElementById('addStudentBtn').addEventListener('click', () => {
  studentForm.reset();
  studentModal.showModal();
});
document.getElementById('logFlightBtn').addEventListener('click', () => {
  flightForm.reset();
  document.getElementById('fDate').value = new Date().toISOString().slice(0, 10);
  flightModal.showModal();
});
document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => btn.closest('dialog').close());
});

studentForm.addEventListener('submit', e => {
  e.preventDefault();
  const name = document.getElementById('inpName').value.trim();
  const meta = document.getElementById('inpMeta').value.trim();
  if (!name) return;
  const student = { id: uid(), name, meta, flights: [] };
  students.push(student);
  activeStudentId = student.id;
  saveData();
  renderRoster();
  renderStudent();
  studentModal.close();
});

flightForm.addEventListener('submit', e => {
  e.preventDefault();
  const student = getActiveStudent();
  if (!student) return;
  const entry = {
    id: uid(),
    date: document.getElementById('fDate').value,
    aircraft: document.getElementById('fAircraft').value.trim(),
    route: document.getElementById('fRoute').value.trim(),
    dual: parseFloat(document.getElementById('fDual').value) || 0,
    solo: parseFloat(document.getElementById('fSolo').value) || 0,
    night: parseFloat(document.getElementById('fNight').value) || 0,
    xc: parseFloat(document.getElementById('fXc').value) || 0,
    instructor: document.getElementById('fInstructor').value.trim(),
    remarks: document.getElementById('fRemarks').value.trim()
  };
  student.flights.push(entry);
  student.flights.sort((a, b) => a.date.localeCompare(b.date));
  saveData();
  renderRoster();
  renderStudent();
  flightModal.close();
});

document.getElementById('deleteStudentBtn').addEventListener('click', () => {
  const student = getActiveStudent();
  if (!student) return;
  if (!confirm(`Remove ${student.name} and all their flight records? This can't be undone.`)) return;
  students = students.filter(s => s.id !== student.id);
  activeStudentId = students.length ? students[0].id : null;
  saveData();
  renderRoster();
  renderStudent();
});

document.getElementById('exportBtn').addEventListener('click', () => {
  const student = getActiveStudent();
  if (!student) return;
  exportCSV(student);
});

function getActiveStudent() {
  return students.find(s => s.id === activeStudentId) || null;
}

function computeTotals(flights) {
  return flights.reduce((t, f) => {
    t.total += f.dual + f.solo;
    t.dual += f.dual;
    t.solo += f.solo;
    t.night += f.night;
    t.xc += f.xc;
    return t;
  }, { total: 0, dual: 0, solo: 0, night: 0, xc: 0 });
}

function fmt(n) {
  return (Math.round(n * 10) / 10).toFixed(1);
}

function renderRoster() {
  studentList.innerHTML = '';
  rosterEmpty.style.display = students.length ? 'none' : 'block';
  students.forEach(s => {
    const li = document.createElement('li');
    li.className = s.id === activeStudentId ? 'active' : '';
    const totals = computeTotals(s.flights);
    li.innerHTML = `<span>${escapeHTML(s.name)}</span><span class="hrs">${fmt(totals.total)}h</span>`;
    li.addEventListener('click', () => {
      activeStudentId = s.id;
      renderRoster();
      renderStudent();
    });
    studentList.appendChild(li);
  });
}

function renderStudent() {
  const student = getActiveStudent();
  if (!student) {
    noStudentState.classList.remove('hidden');
    studentView.classList.add('hidden');
    return;
  }
  noStudentState.classList.add('hidden');
  studentView.classList.remove('hidden');

  studentNameEl.textContent = student.name;
  studentMetaEl.textContent = student.meta ? student.meta : '';

  const totals = computeTotals(student.flights);
  totalsStrip.innerHTML = `
    <div class="stat"><span class="num">${fmt(totals.total)}</span><span class="label">Total hrs</span></div>
    <div class="stat"><span class="num">${fmt(totals.dual)}</span><span class="label">Dual</span></div>
    <div class="stat"><span class="num">${fmt(totals.solo)}</span><span class="label">Solo</span></div>
    <div class="stat"><span class="num">${fmt(totals.night)}</span><span class="label">Night</span></div>
    <div class="stat"><span class="num">${fmt(totals.xc)}</span><span class="label">Cross-country</span></div>
    <div class="stat"><span class="num">${student.flights.length}</span><span class="label">Flights logged</span></div>
  `;

  logRows.innerHTML = '';
  logEmpty.style.display = student.flights.length ? 'none' : 'block';
  student.flights.forEach(f => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${f.date}</td>
      <td>${escapeHTML(f.aircraft)}</td>
      <td>${escapeHTML(f.route)}</td>
      <td class="num-cell">${fmt(f.dual)}</td>
      <td class="num-cell">${fmt(f.solo)}</td>
      <td class="num-cell">${fmt(f.night)}</td>
      <td class="num-cell">${fmt(f.xc)}</td>
      <td>${escapeHTML(f.instructor)}</td>
      <td class="remarks-cell">${escapeHTML(f.remarks)}</td>
      <td><button class="row-del" title="Delete entry" data-id="${f.id}">&#10005;</button></td>
    `;
    tr.querySelector('.row-del').addEventListener('click', () => {
      student.flights = student.flights.filter(fl => fl.id !== f.id);
      saveData();
      renderRoster();
      renderStudent();
    });
    logRows.appendChild(tr);
  });

  totalsRow.innerHTML = `
    <td colspan="3">Totals</td>
    <td class="num-cell">${fmt(totals.dual)}</td>
    <td class="num-cell">${fmt(totals.solo)}</td>
    <td class="num-cell">${fmt(totals.night)}</td>
    <td class="num-cell">${fmt(totals.xc)}</td>
    <td colspan="3"></td>
  `;
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function exportCSV(student) {
  const header = ['Date','Aircraft','Route','Dual','Solo','Night','Cross-country','Instructor','Remarks'];
  const rows = student.flights.map(f => [
    f.date, f.aircraft, f.route, fmt(f.dual), fmt(f.solo), fmt(f.night), fmt(f.xc), f.instructor, f.remarks
  ]);
  const csv = [header, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${student.name.replace(/\s+/g, '_')}_flight_log.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Init ---
renderRoster();
renderStudent();
