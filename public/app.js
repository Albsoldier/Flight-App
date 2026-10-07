var API_BASE = '';
var currentUser = null;
var stopwatchInterval = null;
var activeSessionId = null;
var activeSessionStudentId = null;
var stopwatchStartTime = null;
var utcClockInterval = null;
var allLogsCache = [];
var socket = null;
var aircraftCache = [];
var notamCache = [];

function api(path, options) {
  options = options || {};
  var isFormData = options.body instanceof FormData;
  var fetchOptions = { credentials: 'include' };
  for (var key in options) { fetchOptions[key] = options[key]; }
  if (!isFormData) {
    fetchOptions.headers = { 'Content-Type': 'application/json' };
  }
  return fetch(API_BASE + path, fetchOptions).then(function(res) {
    return res.json().catch(function() { return {}; }).then(function(data) {
      if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
      return data;
    });
  });
}

function showMessage(text, type) {
  type = type || 'info';
  var el = document.getElementById('message');
  if (!el) return;
  el.textContent = text;
  el.className = 'message ' + type;
  setTimeout(function() { el.textContent = ''; el.className = 'message'; }, 5000);
}

function toast(text, type) {
  type = type || 'info';
  var c = document.getElementById('toastContainer');
  if (!c) return;
  var el = document.createElement('div');
  el.className = 'toast toast-' + type;
  el.textContent = text;
  c.appendChild(el);
  setTimeout(function() { el.classList.add('show'); }, 10);
  setTimeout(function() {
    el.classList.remove('show');
    setTimeout(function() { if (el.parentNode) c.removeChild(el); }, 300);
  }, 4000);
}

function fmtDate(str) {
  if (!str) return '—';
  var d = new Date(String(str).replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return str;
  return d.toISOString().slice(0, 16).replace('T', ' ') + 'Z';
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------- THEME ----------
function initTheme() {
  var saved = localStorage.getItem('theme');
  if (saved !== 'light' && saved !== 'dark') saved = 'dark';
  applyTheme(saved);

  var btn = document.getElementById('themeToggle');
  if (btn && !btn.dataset.bound) {
    btn.dataset.bound = '1';
    btn.addEventListener('click', function() {
      var cur = document.documentElement.getAttribute('data-theme') || 'dark';
      var next = cur === 'dark' ? 'light' : 'dark';
      applyTheme(next);
    });
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.body.setAttribute('data-theme', theme);
  if (theme === 'light') {
    document.body.classList.add('theme-light');
    document.body.classList.remove('theme-dark');
  } else {
    document.body.classList.add('theme-dark');
    document.body.classList.remove('theme-light');
  }
  localStorage.setItem('theme', theme);
  updateThemeIcon(theme);
}

function updateThemeIcon(theme) {
  var btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = theme === 'dark' ? '🌙' : '☀️';
}

// ---------- LOGIN ----------
function initLoginPage() {
  initTheme();

  // Handle error messages from URL (redirected from OAuth callbacks)
  var params = new URLSearchParams(window.location.search);
  var err = params.get('error');
  if (err) {
    var errorBanner = document.getElementById('errorBanner');
    var messages = {
      not_in_gtaW: 'You must be a member of the GTAW Discord server to sign in.',
      missing_role: 'Your GTAW account does not have the required role.',
      account_inactive: 'Your account is inactive. Contact an administrator.',
      state_mismatch: 'Login session expired. Please try again.',
      no_code: 'Login was cancelled.',
      discord_token_failed: 'Could not connect to Discord. Try again.',
      discord_user_failed: 'Could not fetch your Discord profile.',
      discord_error: 'Something went wrong during Discord login.',
      gtaw_token_failed: 'Could not connect to GTA World. Try again.',
      gtaw_user_failed: 'Could not fetch your GTAW profile.',
      gtaw_error: 'Something went wrong during GTA World login.',
      gtaw_invalid_scope: 'GTAW rejected the requested permissions. Contact an admin.',
      gtaw_invalid_client: 'GTAW rejected the app credentials. Contact an admin.'
    };
    if (errorBanner) {
      errorBanner.textContent = messages[err] || 'Login failed: ' + err;
      errorBanner.style.display = 'block';
    }
    window.history.replaceState({}, '', window.location.pathname);
  }

  api('/api/auth/status').then(function(status) {
    if (status.needsSetup) {
      document.getElementById('loginForm').style.display = 'none';
      document.getElementById('setupPanel').style.display = 'block';
    }
    if (status.discordEnabled) {
      var dp = document.getElementById('discordPanel');
      if (dp) dp.style.display = 'block';
    }
    if (status.gtawEnabled) {
      var gp = document.getElementById('gtawPanel');
      if (gp) gp.style.display = 'block';
    }
  }).catch(function(err) {
    showMessage('Cannot reach backend: ' + err.message, 'error');
  });

  document.getElementById('loginForm').addEventListener('submit', function(e) {
    e.preventDefault();
    api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: document.getElementById('username').value,
        password: document.getElementById('password').value
      })
    }).then(function() {
      window.location.href = 'dashboard.html';
    }).catch(function(err) { showMessage(err.message, 'error'); });
  });

  var setupForm = document.getElementById('setupForm');
  if (setupForm) {
    setupForm.addEventListener('submit', function(e) {
      e.preventDefault();
      var username = document.getElementById('setupUsername').value;
      var password = document.getElementById('setupPassword').value;
      api('/api/auth/setup', {
        method: 'POST',
        body: JSON.stringify({
          username: username, password: password,
          fullName: document.getElementById('setupFullName').value,
          email: document.getElementById('setupEmail').value
        })
      }).then(function() {
        showMessage('Admin created! Logging in...', 'success');
        setTimeout(function() {
          api('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username: username, password: password })
          }).then(function() { window.location.href = 'dashboard.html'; });
        }, 800);
      }).catch(function(err) { showMessage(err.message, 'error'); });
    });
  }
}

// ---------- DASHBOARD ----------
function initDashboard() {
  initTheme();
  api('/api/auth/me').then(function(data) {
    currentUser = data.user;
    document.getElementById('userName').textContent = currentUser.full_name;
    document.getElementById('userRole').textContent = currentUser.role;
    document.getElementById('userRole').className = 'badge badge-' + currentUser.role;
    startUtcClock();
    setupDashboard();
    initSocket();
  }).catch(function() {
    window.location.href = 'index.html';
  });
}

// ---------- SOCKET ----------
function initSocket() {
  if (typeof io === 'undefined') return;
  try {
    socket = io();
    socket.on('online-users', function(users) {
      var card = document.getElementById('onlineUsersCard');
      if (!card || card.style.display === 'none') return;
      var count = document.getElementById('onlineCount');
      if (count) count.textContent = '(' + users.length + ')';
      var list = document.getElementById('onlineUsers');
      if (!list) return;
      if (users.length === 0) {
        list.innerHTML = '<p class="muted">Nobody else online.</p>';
      } else {
        var html = '';
        for (var i = 0; i < users.length; i++) {
          var u = users[i];
          html += '<div class="list-item"><strong>' + escapeHtml(u.full_name) + '</strong> <span class="badge badge-' + u.role + '">' + u.role + '</span></div>';
        }
        list.innerHTML = html;
      }
    });
    socket.on('flight-event', function(evt) {
      if (!evt) return;
      if (evt.type === 'start') toast('🛫 ' + evt.pilotName + ' started a flight', 'info');
      else if (evt.type === 'stop') toast('🛬 ' + evt.pilotName + ' landed (' + evt.duration + ' h)', 'success');
      if (currentUser && currentUser.role === 'admin') loadAllLogs();
    });
  } catch (e) { /* ignore */ }
}

function setupDashboard() {
  var role = currentUser.role;
  var isAdmin = role === 'admin';
  var isInstructor = role === 'instructor';
  var canManage = isAdmin || isInstructor;

  var adminEls = document.querySelectorAll('.admin-only');
  for (var i = 0; i < adminEls.length; i++) adminEls[i].style.display = isAdmin ? 'block' : 'none';

  var instEls = document.querySelectorAll('.instructor-only');
  for (var j = 0; j < instEls.length; j++) instEls[j].style.display = canManage ? 'block' : 'none';

  var onlineCard = document.getElementById('onlineUsersCard');
  if (onlineCard) onlineCard.style.display = isAdmin ? 'block' : 'none';

  if (isAdmin) {
    var c = document.getElementById('allLogsCrumb');
    if (c) c.style.display = 'inline-block';
    var s = document.getElementById('allLogsSep');
    if (s) s.style.display = 'inline';
  }

  if (role === 'student') {
    var input = document.getElementById('flightStudentId');
    if (input) { input.value = currentUser.id; input.disabled = true; }
  }

  if (canManage) {
    var selfField = document.getElementById('selfLogField');
    if (selfField) selfField.style.display = 'block';

    var selfCheck = document.getElementById('selfLogCheck');
    if (selfCheck && !selfCheck.dataset.bound) {
      selfCheck.dataset.bound = '1';
      selfCheck.addEventListener('change', function() {
        var studentInput = document.getElementById('flightStudentId');
        var instructorField = document.getElementById('instructorSelectField');
        if (this.checked) {
          studentInput.value = currentUser.id;
          studentInput.disabled = true;
          if (instructorField) instructorField.style.display = 'none';
        } else {
          studentInput.value = '';
          studentInput.disabled = false;
          if (instructorField) instructorField.style.display = 'block';
        }
      });
    }
  }

  if (isInstructor) {
    var roleSelect = document.getElementById('newRole');
    if (roleSelect) roleSelect.innerHTML = '<option value="student">Student</option>';
  }

  var logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn && !logoutBtn.dataset.bound) {
    logoutBtn.dataset.bound = '1';
    logoutBtn.addEventListener('click', function() {
      api('/api/auth/logout', { method: 'POST' }).then(function() {
        window.location.href = 'index.html';
      }).catch(function() { window.location.href = 'index.html'; });
    });
  }

  if (canManage) {
    var cuForm = document.getElementById('createUserForm');
    if (cuForm && !cuForm.dataset.bound) {
      cuForm.dataset.bound = '1';
      cuForm.addEventListener('submit', function(e) {
        e.preventDefault();
        api('/api/admin/users', {
          method: 'POST',
          body: JSON.stringify({
            username: document.getElementById('newUsername').value,
            password: document.getElementById('newPassword').value,
            role: document.getElementById('newRole').value,
            fullName: document.getElementById('newFullName').value,
            email: document.getElementById('newEmail').value,
            phone: document.getElementById('newPhone').value
          })
        }).then(function() {
          showMessage('User created successfully', 'success');
          e.target.reset();
          loadUsers();
          loadInstructors();
        }).catch(function(err) { showMessage(err.message, 'error'); });
      });
    }
    var ruBtn = document.getElementById('refreshUsers');
    if (ruBtn && !ruBtn.dataset.bound) {
      ruBtn.dataset.bound = '1';
      ruBtn.addEventListener('click', loadUsers);
    }
  }

  var startBtn = document.getElementById('startFlightBtn');
  if (startBtn && !startBtn.dataset.bound) {
    startBtn.dataset.bound = '1';
    startBtn.addEventListener('click', startFlight);
  }
  var stopBtn = document.getElementById('stopFlightBtn');
  if (stopBtn && !stopBtn.dataset.bound) {
    stopBtn.dataset.bound = '1';
    stopBtn.addEventListener('click', stopFlight);
  }
  var rmBtn = document.getElementById('refreshMaterials');
  if (rmBtn && !rmBtn.dataset.bound) {
    rmBtn.dataset.bound = '1';
    rmBtn.addEventListener('click', loadMaterials);
  }
  var rmlBtn = document.getElementById('refreshMyLog');
  if (rmlBtn && !rmlBtn.dataset.bound) {
    rmlBtn.dataset.bound = '1';
    rmlBtn.addEventListener('click', loadMyLog);
  }
  var plBtn = document.getElementById('printLogbook');
  if (plBtn && !plBtn.dataset.bound) {
    plBtn.dataset.bound = '1';
    plBtn.addEventListener('click', printLogbook);
  }

  if (isAdmin) {
    var ralBtn = document.getElementById('refreshAllLogs');
    if (ralBtn && !ralBtn.dataset.bound) {
      ralBtn.dataset.bound = '1';
      ralBtn.addEventListener('click', loadAllLogs);
    }
    var ecBtn = document.getElementById('exportCsv');
    if (ecBtn && !ecBtn.dataset.bound) {
      ecBtn.dataset.bound = '1';
      ecBtn.addEventListener('click', exportCsv);
    }
    var fpIn = document.getElementById('filterPilot');
    var fiIn = document.getElementById('filterInstructor');
    var ffIn = document.getElementById('filterFrom');
    var ftIn = document.getElementById('filterTo');
    var cfBtn = document.getElementById('clearFilters');
    if (fpIn) fpIn.addEventListener('input', applyFilters);
    if (fiIn) fiIn.addEventListener('input', applyFilters);
    if (ffIn) ffIn.addEventListener('change', applyFilters);
    if (ftIn) ftIn.addEventListener('change', applyFilters);
    if (cfBtn) cfBtn.addEventListener('click', function() {
      document.getElementById('filterPilot').value = '';
      document.getElementById('filterInstructor').value = '';
      document.getElementById('filterFrom').value = '';
      document.getElementById('filterTo').value = '';
      applyFilters();
    });
  }

  // Upload panel toggle
  if (canManage) {
    var uf = document.getElementById('uploadForm');
    if (uf && !uf.dataset.bound) {
      uf.dataset.bound = '1';
      uf.addEventListener('submit', uploadMaterial);
    }
    var sub = document.getElementById('showUploadBtn');
    if (sub && !sub.dataset.bound) {
      sub.dataset.bound = '1';
      sub.addEventListener('click', function() {
        var form = document.getElementById('uploadForm');
        if (form) { form.style.display = 'block'; this.style.display = 'none'; }
      });
    }
    var cub = document.getElementById('cancelUploadBtn');
    if (cub && !cub.dataset.bound) {
      cub.dataset.bound = '1';
      cub.addEventListener('click', function() {
        var form = document.getElementById('uploadForm');
        var showBtn = document.getElementById('showUploadBtn');
        if (form) { form.style.display = 'none'; form.reset(); }
        if (showBtn) showBtn.style.display = 'inline-block';
      });
    }
  }

  // Aircraft add toggle
  var showAddBtn = document.getElementById('showAddAircraftBtn');
  if (showAddBtn && !showAddBtn.dataset.bound) {
    showAddBtn.dataset.bound = '1';
    showAddBtn.addEventListener('click', function() {
      var form = document.getElementById('addAircraftForm');
      if (form) { form.style.display = 'block'; this.style.display = 'none'; }
    });
  }
  var cancelAcBtn = document.getElementById('cancelAddAircraft');
  if (cancelAcBtn && !cancelAcBtn.dataset.bound) {
    cancelAcBtn.dataset.bound = '1';
    cancelAcBtn.addEventListener('click', function() {
      var form = document.getElementById('addAircraftForm');
      var showBtn = document.getElementById('showAddAircraftBtn');
      if (form) { form.style.display = 'none'; form.reset(); }
      if (showBtn) showBtn.style.display = 'inline-block';
    });
  }
  var addAcForm = document.getElementById('addAircraftForm');
  if (addAcForm && !addAcForm.dataset.bound) {
    addAcForm.dataset.bound = '1';
    addAcForm.addEventListener('submit', createAircraft);
  }

  // Flight planner
  var findRouteBtn = document.getElementById('findRouteBtn');
  if (findRouteBtn && !findRouteBtn.dataset.bound) {
    findRouteBtn.dataset.bound = '1';
    findRouteBtn.addEventListener('click', findRoute);
  }

  // NOTAM button wiring — inline handlers in the HTML call these globals
  var notamCloseBtn = document.getElementById('notamClose');
  if (notamCloseBtn && !notamCloseBtn.dataset.bound) {
    notamCloseBtn.dataset.bound = '1';
    notamCloseBtn.addEventListener('click', function() {
      var sb = document.getElementById('notamSidebar');
      if (sb) sb.classList.remove('open');
    });
  }
  var notamToggleBtn = document.getElementById('notamToggle');
  if (notamToggleBtn && !notamToggleBtn.dataset.bound) {
    notamToggleBtn.dataset.bound = '1';
    notamToggleBtn.addEventListener('click', function() {
      var sb = document.getElementById('notamSidebar');
      if (sb) sb.classList.toggle('open');
    });
  }
  var notamRefreshBtn = document.getElementById('notamRefresh');
  if (notamRefreshBtn && !notamRefreshBtn.dataset.bound) {
    notamRefreshBtn.dataset.bound = '1';
    notamRefreshBtn.addEventListener('click', loadNotams);
  }
  var notamAddBtn = document.getElementById('notamAddBtn');
  if (notamAddBtn && !notamAddBtn.dataset.bound) {
    notamAddBtn.dataset.bound = '1';
    notamAddBtn.addEventListener('click', openNotamModal);
  }

  // NOTAM sidebar always visible for everyone
  var notamSidebar = document.getElementById('notamSidebar');
  if (notamSidebar) notamSidebar.classList.add('open');

  // Only admins see the "+ Add" button
  if (isAdmin) {
    var na = document.getElementById('notamAddBtn');
    if (na) na.style.display = 'inline-block';
  }

  // Initial loads
  if (canManage) loadStats();
  if (isAdmin) loadOnlineUsers();
  if (canManage) loadUsers();
  loadInstructors();
  loadMaterials();
  loadMyLog();
  loadAircraft();
  loadNotams();
  loadWaypoints();
  if (isAdmin) loadAllLogs();

  if (isAdmin) setInterval(loadOnlineUsers, 30000);
  resumeActiveFlight();
  initBreadcrumbNav();
}

// ---------- RESUME ----------
function resumeActiveFlight() {
  if (currentUser.role === 'student') {
    api('/api/flights/sessions/active/' + currentUser.id).then(function(res) {
      if (res.active) attachActiveSession(res.session);
    }).catch(function() {});
    return;
  }
  api('/api/flights/sessions/active/' + currentUser.id).then(function(res) {
    if (res.active) { attachActiveSession(res.session); return; }
    api('/api/flights/sessions/active/all').then(function(data) {
      if (data.sessions && data.sessions.length > 0) {
        var latest = data.sessions[0];
        var start = new Date(latest.start_time);
        latest.elapsedSeconds = Math.floor((new Date() - start) / 1000);
        attachActiveSession(latest);
      }
    }).catch(function() {});
  }).catch(function() {});
}

function attachActiveSession(session) {
  activeSessionId = session.id;
  activeSessionStudentId = session.student_id;
  stopwatchStartTime = Date.now() - (session.elapsedSeconds * 1000);
  var input = document.getElementById('flightStudentId');
  if (input && !input.disabled) input.value = session.student_id;
  if (session.instructor_id) {
    var instSelect = document.getElementById('flightInstructorId');
    if (instSelect) instSelect.value = session.instructor_id;
  }
  if (session.notes) {
    var notesEl = document.getElementById('flightNotes');
    if (notesEl) notesEl.value = session.notes;
  }
  startStopwatchDisplay();
  document.getElementById('startFlightBtn').disabled = true;
  document.getElementById('stopFlightBtn').disabled = false;
  document.getElementById('stopwatchDisplay').classList.add('running');
  var info = document.getElementById('activeSession');
  if (info) info.textContent = 'Active flight #' + session.id + ' — ' + (session.student_name || session.student_id);
}

// ---------- CLOCK ----------
function startUtcClock() {
  function tick() {
    var now = new Date();
    var h = ('0' + now.getUTCHours()).slice(-2);
    var m = ('0' + now.getUTCMinutes()).slice(-2);
    var s = ('0' + now.getUTCSeconds()).slice(-2);
    var t = h + ':' + m + ':' + s;
    var ce = document.getElementById('utcClock');
    if (ce) ce.textContent = t + 'Z';
    var re = document.getElementById('clockRight');
    if (re) re.textContent = 'UTC ' + t + 'Z';
  }
  tick();
  if (utcClockInterval) clearInterval(utcClockInterval);
  utcClockInterval = setInterval(tick, 1000);
}

// ---------- BREADCRUMB ----------
function initBreadcrumbNav() {
  var links = document.querySelectorAll('.breadcrumb-item[data-target]');
  if (links.length === 0) return;
  function setActive(id) {
    for (var j = 0; j < links.length; j++) {
      if (links[j].getAttribute('data-target') === id) links[j].classList.add('active');
      else links[j].classList.remove('active');
    }
  }
  for (var i = 0; i < links.length; i++) {
    links[i].addEventListener('click', function(e) {
      e.preventDefault();
      var tid = this.getAttribute('data-target');
      var t = document.getElementById(tid);
      if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActive(tid);
    });
  }
  function upd() {
    var sp = window.scrollY + 160;
    var activeId = null;
    for (var k = 0; k < links.length; k++) {
      var tid = links[k].getAttribute('data-target');
      var el = document.getElementById(tid);
      if (el && el.style.display !== 'none' && el.offsetTop <= sp) activeId = tid;
    }
    if (activeId) setActive(activeId);
  }
  window.addEventListener('scroll', upd, { passive: true });
  upd();
}

// ---------- LOADERS ----------
function loadStats() {
  api('/api/admin/stats').then(function(stats) {
    document.getElementById('stats').innerHTML =
      '<div class="stat-box"><div class="stat-num">' + stats.students + '</div><div class="stat-label">Students</div></div>' +
      '<div class="stat-box"><div class="stat-num">' + stats.instructors + '</div><div class="stat-label">Instructors</div></div>' +
      '<div class="stat-box"><div class="stat-num">' + stats.totalFlightHours.toFixed(1) + '</div><div class="stat-label">Flight Hours</div></div>' +
      '<div class="stat-box"><div class="stat-num">' + stats.activeFlightSessions + '</div><div class="stat-label">Active Flights</div></div>' +
      '<div class="stat-box"><div class="stat-num">' + stats.studyMaterials + '</div><div class="stat-label">Materials</div></div>';
  }).catch(function() {});
}

function loadOnlineUsers() {
  api('/api/admin/online-users').then(function(data) {
    document.getElementById('onlineCount').textContent = '(' + data.count + ')';
    if (data.users.length === 0) {
      document.getElementById('onlineUsers').innerHTML = '<p class="muted">Nobody else online.</p>';
    } else {
      var html = '';
      for (var i = 0; i < data.users.length; i++) {
        var u = data.users[i];
        html += '<div class="list-item"><strong>' + escapeHtml(u.full_name) + '</strong> <span class="badge badge-' + u.role + '">' + u.role + '</span></div>';
      }
      document.getElementById('onlineUsers').innerHTML = html;
    }
  }).catch(function() {});
}

function loadUsers() {
  api('/api/admin/users').then(function(data) {
    if (data.users.length === 0) {
      document.getElementById('usersList').innerHTML = '<p class="muted">No users yet.</p>';
      return;
    }
    var isAdmin = currentUser && currentUser.role === 'admin';
    var html = '<table class="table"><thead><tr><th>ID</th><th>Username</th><th>Name</th><th>Role</th><th>Hours</th>' +
               (isAdmin ? '<th>Actions</th>' : '') + '</tr></thead><tbody>';
    for (var i = 0; i < data.users.length; i++) {
      var u = data.users[i];
      var nameLink = '<a href="#" onclick="showProgress(' + u.id + ', \'' + escapeHtml(u.full_name).replace(/'/g, "\\'") + '\'); return false;">' + escapeHtml(u.full_name) + '</a>';
      html += '<tr><td>' + u.id + '</td><td>' + escapeHtml(u.username) + '</td><td>' + nameLink + '</td>' +
              '<td><span class="badge badge-' + u.role + '">' + u.role + '</span></td>' +
              '<td>' + (u.total_hours || 0).toFixed(1) + '</td>';
      if (isAdmin) {
        html += '<td>';
        if (u.role !== 'admin') {
          html += '<button class="btn-danger btn-small" onclick="deleteUser(' + u.id + ', \'' + u.username.replace(/'/g, "\\'") + '\')">Delete</button>';
        } else {
          html += '<span class="muted">—</span>';
        }
        html += '</td>';
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    document.getElementById('usersList').innerHTML = html;
  }).catch(function(err) {
    document.getElementById('usersList').innerHTML = '<p class="muted">' + escapeHtml(err.message) + '</p>';
  });
}

function loadInstructors() {
  api('/api/admin/instructors').then(function(data) {
    var select = document.getElementById('flightInstructorId');
    if (!select) return;
    var current = select.value;
    select.innerHTML = '<option value="">— No instructor —</option>';
    for (var i = 0; i < data.instructors.length; i++) {
      var inst = data.instructors[i];
      var opt = document.createElement('option');
      opt.value = inst.id;
      opt.textContent = inst.full_name + ' (#' + inst.id + ')';
      select.appendChild(opt);
    }
    if (current) select.value = current;
  }).catch(function() {});
}

function deleteUser(id, username) {
  if (!confirm('Delete user "' + username + '" permanently?\n\nThis will also delete all their flight sessions. This cannot be undone.')) return;
  api('/api/admin/users/' + id + '/hard', { method: 'DELETE' }).then(function() {
    showMessage('User "' + username + '" deleted', 'success');
    loadUsers();
    loadStats();
    loadInstructors();
  }).catch(function(err) { showMessage(err.message, 'error'); });
}

// ---------- PROGRESS MODAL ----------
function showProgress(userId, userName) {
  document.getElementById('progressTitle').textContent = 'Progress — ' + (userName || 'Student');
  document.getElementById('progressBody').innerHTML = '<p class="muted">Loading...</p>';
  document.getElementById('progressModal').style.display = 'flex';

  api('/api/flights/sessions/student/' + userId).then(function(data) {
    var sessions = data.sessions || [];
    var totalHours = 0;
    for (var i = 0; i < sessions.length; i++) totalHours += (sessions[i].duration_hours || 0);

    var milestones = [
      { name: 'Student Pilot', hours: 10 },
      { name: 'Private Pilot (PPL)', hours: 40 },
      { name: 'Instrument Rating (IR)', hours: 50 },
      { name: 'Commercial Pilot (CPL)', hours: 250 },
      { name: 'Airline Transport Pilot (ATP)', hours: 1500 }
    ];

    var html = '<div class="progress-summary"><div class="stat-box"><div class="stat-num">' + totalHours.toFixed(1) + '</div><div class="stat-label">Total Hours</div></div>' +
               '<div class="stat-box"><div class="stat-num">' + sessions.length + '</div><div class="stat-label">Total Flights</div></div></div>';

    html += '<h4 style="margin:20px 0 10px; color:#38bdf8;">Certificate Progress</h4>';
    for (var m = 0; m < milestones.length; m++) {
      var ms = milestones[m];
      var pct = Math.min(100, (totalHours / ms.hours) * 100);
      html += '<div class="milestone"><div class="milestone-head"><span>' + ms.name + '</span><span>' + totalHours.toFixed(1) + ' / ' + ms.hours + ' h</span></div>' +
              '<div class="progress-bar"><div class="progress-fill" style="width:' + pct + '%"></div></div></div>';
    }

    document.getElementById('progressBody').innerHTML = html;
  }).catch(function(err) {
    document.getElementById('progressBody').innerHTML = '<p class="muted">' + escapeHtml(err.message) + '</p>';
  });
}

function closeProgressModal() {
  document.getElementById('progressModal').style.display = 'none';
}

// ---------- MY FLIGHT LOG ----------
function loadMyLog() {
  api('/api/flights/sessions/my').then(function(data) {
    if (!data.sessions || data.sessions.length === 0) {
      document.getElementById('myLogList').innerHTML = '<p class="muted">No flights logged yet.</p>';
      return;
    }
    var totalHours = 0;
    for (var t = 0; t < data.sessions.length; t++) totalHours += (data.sessions[t].duration_hours || 0);

    var html = '<p class="muted" style="margin-bottom:10px;">Total: <strong style="color:#38bdf8;">' + totalHours.toFixed(2) + ' hours</strong> across ' + data.sessions.length + ' flights</p>';
    html += '<table class="table"><thead><tr><th>Date</th><th>Aircraft</th><th>Type</th><th>Instructor</th><th>Notes</th><th>Duration</th></tr></thead><tbody>';
    for (var i = 0; i < data.sessions.length; i++) {
      var s = data.sessions[i];
      var instName = s.instructor_name || ((s.pilot_role === 'admin' || s.pilot_role === 'instructor') ? 'Self' : '—');
      html += '<tr><td>' + fmtDate(s.start_time) + '</td><td>' + escapeHtml(s.aircraft || '—') + '</td>' +
              '<td>' + escapeHtml(s.flight_type || '—') + '</td><td>' + escapeHtml(instName) + '</td>' +
              '<td class="notes-cell">' + escapeHtml(s.notes || '—') + '</td>' +
              '<td>' + (s.duration_hours || 0).toFixed(2) + ' h</td></tr>';
    }
    html += '</tbody></table>';
    document.getElementById('myLogList').innerHTML = html;
  }).catch(function(err) {
    document.getElementById('myLogList').innerHTML = '<p class="muted">' + escapeHtml(err.message) + '</p>';
  });
}

// ---------- ALL FLIGHT LOGS ----------
function loadAllLogs() {
  api('/api/flights/sessions/all').then(function(data) {
    allLogsCache = data.sessions || [];
    renderAllLogs();
  }).catch(function(err) {
    document.getElementById('allLogsList').innerHTML = '<p class="muted">' + escapeHtml(err.message) + '</p>';
  });
}

function applyFilters() { renderAllLogs(); }

function renderAllLogs() {
  var filterPilot = (document.getElementById('filterPilot').value || '').toLowerCase();
  var filterInstructor = (document.getElementById('filterInstructor').value || '').toLowerCase();
  var filterFrom = document.getElementById('filterFrom').value;
  var filterTo = document.getElementById('filterTo').value;

  var filtered = [];
  for (var i = 0; i < allLogsCache.length; i++) {
    var s = allLogsCache[i];
    var pilot = (s.pilot_name || '').toLowerCase();
    var inst = (s.instructor_name || '').toLowerCase();
    var dateStr = s.start_time ? String(s.start_time).slice(0, 10) : '';
    if (filterPilot && pilot.indexOf(filterPilot) === -1) continue;
    if (filterInstructor && inst.indexOf(filterInstructor) === -1) continue;
    if (filterFrom && dateStr < filterFrom) continue;
    if (filterTo && dateStr > filterTo) continue;
    filtered.push(s);
  }

  if (filtered.length === 0) {
    document.getElementById('allLogsList').innerHTML = '<p class="muted">No flights match your filter.</p>';
    return;
  }

  var totalHours = 0;
  for (var t = 0; t < filtered.length; t++) totalHours += (filtered[t].duration_hours || 0);

  var html = '<p class="muted" style="margin-bottom:10px;">Showing <strong style="color:#38bdf8;">' + filtered.length + '</strong> flights · ' + totalHours.toFixed(2) + ' hours</p>';
  html += '<table class="table"><thead><tr><th>Date</th><th>Pilot</th><th>Role</th><th>Aircraft</th><th>Type</th><th>Instructor</th><th>Notes</th><th>Duration</th><th>Actions</th></tr></thead><tbody>';

  for (var j = 0; j < filtered.length; j++) {
    var s = filtered[j];
    var role = s.pilot_role || s.pilot_role_actual || 'student';
    var instName = s.instructor_name || ((role === 'admin' || role === 'instructor') ? 'Self' : '—');
    html += '<tr><td>' + fmtDate(s.start_time) + '</td><td>' + escapeHtml(s.pilot_name || '—') + '</td>' +
            '<td><span class="badge badge-' + role + '">' + role + '</span></td>' +
            '<td>' + escapeHtml(s.aircraft || '—') + '</td><td>' + escapeHtml(s.flight_type || '—') + '</td>' +
            '<td>' + escapeHtml(instName) + '</td><td class="notes-cell">' + escapeHtml(s.notes || '—') + '</td>' +
            '<td>' + (s.duration_hours || 0).toFixed(2) + ' h</td>' +
            '<td><button class="btn-secondary btn-small" onclick="editSession(' + s.id + ')">Edit</button> ' +
            '<button class="btn-danger btn-small" onclick="deleteSession(' + s.id + ')">Delete</button></td></tr>';
  }
  html += '</tbody></table>';
  document.getElementById('allLogsList').innerHTML = html;
}

// ---------- EDIT SESSION ----------
function editSession(id) {
  var s = null;
  for (var i = 0; i < allLogsCache.length; i++) if (allLogsCache[i].id === id) { s = allLogsCache[i]; break; }
  if (!s) return;
  document.getElementById('editSessionId').value = s.id;
  document.getElementById('editDateTime').value = fmtDate(s.start_time);
  document.getElementById('editAircraft').value = s.aircraft || '';
  document.getElementById('editType').value = s.flight_type || '';
  document.getElementById('editDuration').value = s.duration_hours || 0;
  document.getElementById('editNotes').value = s.notes || '';
  document.getElementById('editModal').style.display = 'flex';
}

function closeEditModal() { document.getElementById('editModal').style.display = 'none'; }

function saveEditSession() {
  var id = document.getElementById('editSessionId').value;
  var body = {
    aircraft: document.getElementById('editAircraft').value,
    flight_type: document.getElementById('editType').value,
    duration_hours: parseFloat(document.getElementById('editDuration').value) || 0,
    notes: document.getElementById('editNotes').value
  };
  api('/api/flights/sessions/' + id, { method: 'PUT', body: JSON.stringify(body) }).then(function() {
    showMessage('Session updated', 'success');
    closeEditModal();
    loadAllLogs();
    loadMyLog();
    loadStats();
    loadUsers();
  }).catch(function(err) { showMessage(err.message, 'error'); });
}

function deleteSession(id) {
  if (!confirm('Delete this flight session permanently?\n\nThis will subtract its duration from the pilot\'s total hours.')) return;
  api('/api/flights/sessions/' + id, { method: 'DELETE' }).then(function() {
    showMessage('Session deleted', 'success');
    loadAllLogs();
    loadMyLog();
    loadStats();
    loadUsers();
  }).catch(function(err) { showMessage(err.message, 'error'); });
}

// ---------- CSV EXPORT ----------
function exportCsv() {
  var rows = [['Date', 'Pilot', 'Role', 'Aircraft', 'Flight Type', 'Instructor', 'Notes', 'Duration (h)']];
  for (var i = 0; i < allLogsCache.length; i++) {
    var s = allLogsCache[i];
    var role = s.pilot_role || s.pilot_role_actual || 'student';
    rows.push([
      fmtDate(s.start_time), s.pilot_name || '', role, s.aircraft || '', s.flight_type || '',
      s.instructor_name || ((role === 'admin' || role === 'instructor') ? 'Self' : ''),
      s.notes || '', (s.duration_hours || 0).toFixed(2)
    ]);
  }
  downloadCsv(rows, 'all-flight-logs-' + new Date().toISOString().slice(0, 10) + '.csv');
}

function downloadCsv(rows, filename) {
  var csv = '';
  for (var i = 0; i < rows.length; i++) {
    var row = [];
    for (var j = 0; j < rows[i].length; j++) {
      var cell = String(rows[i][j] == null ? '' : rows[i][j]);
      if (cell.indexOf(',') !== -1 || cell.indexOf('"') !== -1 || cell.indexOf('\n') !== -1) {
        cell = '"' + cell.replace(/"/g, '""') + '"';
      }
      row.push(cell);
    }
    csv += row.join(',') + '\r\n';
  }
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------- PRINT LOGBOOK ----------
function printLogbook() {
  api('/api/flights/sessions/my').then(function(data) {
    var sessions = data.sessions || [];
    var totalHours = 0;
    for (var i = 0; i < sessions.length; i++) totalHours += (sessions[i].duration_hours || 0);
    var html = '<html><head><title>Logbook — ' + escapeHtml(currentUser.full_name) + '</title>';
    html += '<style>body{font-family:Georgia,serif;padding:40px;color:#000}h1{margin-bottom:4px}.sub{color:#666;margin-bottom:24px}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #999;padding:6px 8px;text-align:left;font-size:12px}th{background:#eee}.total{margin-top:16px;font-weight:bold;font-size:14px}</style></head><body>';
    html += '<h1>Pilot Logbook</h1><div class="sub">' + escapeHtml(currentUser.full_name) + ' · ' + new Date().toLocaleDateString() + '</div>';
    html += '<table><thead><tr><th>Date</th><th>Aircraft</th><th>Type</th><th>Instructor</th><th>Notes</th><th>Duration (h)</th></tr></thead><tbody>';
    for (var j = 0; j < sessions.length; j++) {
      var s = sessions[j];
      html += '<tr><td>' + fmtDate(s.start_time) + '</td><td>' + escapeHtml(s.aircraft || '—') + '</td><td>' + escapeHtml(s.flight_type || '—') + '</td><td>' + escapeHtml(s.instructor_name || '—') + '</td><td>' + escapeHtml(s.notes || '—') + '</td><td>' + (s.duration_hours || 0).toFixed(2) + '</td></tr>';
    }
    html += '</tbody></table><div class="total">Total Hours: ' + totalHours.toFixed(2) + '</div></body></html>';
    var w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    setTimeout(function() { w.print(); }, 500);
  });
}

// ---------- FLIGHT ----------
function startFlight() {
  if (activeSessionId) return showMessage('A flight is already active — stop it first', 'error');
  var selfLogCheck = document.getElementById('selfLogCheck');
  var selfLog = selfLogCheck && selfLogCheck.checked;
  var studentId = document.getElementById('flightStudentId').value;
  if (!studentId && !selfLog) return showMessage('Enter a student ID', 'error');
  var instructorSelect = document.getElementById('flightInstructorId');
  var instructorId = instructorSelect && instructorSelect.value ? parseInt(instructorSelect.value) : null;
  var body = {
    aircraft: document.getElementById('flightAircraft').value,
    flightType: document.getElementById('flightType').value,
    notes: document.getElementById('flightNotes').value
  };
  if (selfLog) body.selfLog = true;
  else {
    body.studentId = parseInt(studentId);
    if (instructorId) body.instructorId = instructorId;
  }
  api('/api/flights/sessions/start', { method: 'POST', body: JSON.stringify(body) }).then(function(data) {
    activeSessionId = data.sessionId;
    activeSessionStudentId = selfLog ? currentUser.id : parseInt(studentId);
    stopwatchStartTime = Date.now();
    startStopwatchDisplay();
    document.getElementById('startFlightBtn').disabled = true;
    document.getElementById('stopFlightBtn').disabled = false;
    document.getElementById('activeSession').textContent = 'Active session #' + activeSessionId + (selfLog ? ' (self-log)' : '');
    document.getElementById('stopwatchDisplay').classList.add('running');
    showMessage('Flight started', 'success');
  }).catch(function(err) {
    if (err.message && err.message.indexOf('already has active session') !== -1) {
      showMessage('Recovering stuck session...', 'info');
      recoverStuckSession(selfLog ? currentUser.id : parseInt(studentId));
    } else { showMessage(err.message, 'error'); }
  });
}

function recoverStuckSession(studentId) {
  api('/api/flights/sessions/active/' + studentId).then(function(res) {
    if (res.active) { attachActiveSession(res.session); showMessage('Recovered flight #' + res.session.id, 'success'); }
    else showMessage('No active session found', 'error');
  }).catch(function(err) { showMessage(err.message, 'error'); });
}

function startStopwatchDisplay() {
  if (stopwatchInterval) clearInterval(stopwatchInterval);
  function tick() {
    if (!stopwatchStartTime) return;
    var elapsed = Math.floor((Date.now() - stopwatchStartTime) / 1000);
    var h = ('0' + Math.floor(elapsed / 3600)).slice(-2);
    var m = ('0' + Math.floor((elapsed % 3600) / 60)).slice(-2);
    var s = ('0' + (elapsed % 60)).slice(-2);
    var el = document.getElementById('stopwatchDisplay');
    if (el) el.textContent = h + ':' + m + ':' + s;
  }
  tick();
  stopwatchInterval = setInterval(tick, 1000);
}

function stopFlight() {
  if (!activeSessionId) {
    var input = document.getElementById('flightStudentId');
    var targetId = currentUser.role === 'student' ? currentUser.id : (input && input.value ? parseInt(input.value) : null);
    if (!targetId) return showMessage('Enter a student ID to recover', 'error');
    return recoverStuckSession(targetId);
  }
  doStopFlight();
}

function doStopFlight() {
  var notes = document.getElementById('flightNotes').value;
  api('/api/flights/sessions/' + activeSessionId + '/stop', { method: 'POST', body: JSON.stringify({ notes: notes }) }).then(function(result) {
    if (stopwatchInterval) clearInterval(stopwatchInterval);
    stopwatchInterval = null;
    document.getElementById('startFlightBtn').disabled = false;
    document.getElementById('stopFlightBtn').disabled = true;
    document.getElementById('activeSession').textContent = '';
    document.getElementById('stopwatchDisplay').textContent = '00:00:00';
    document.getElementById('stopwatchDisplay').classList.remove('running');
    document.getElementById('flightNotes').value = '';
    showMessage('Flight logged: ' + result.duration + ' hours', 'success');
    activeSessionId = null;
    activeSessionStudentId = null;
    stopwatchStartTime = null;
    if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'instructor')) { loadStats(); loadUsers(); }
    loadMyLog();
    if (currentUser && currentUser.role === 'admin') loadAllLogs();
  }).catch(function(err) { showMessage(err.message, 'error'); });
}

// ---------- MATERIALS ----------
function loadMaterials() {
  api('/api/materials').then(function(data) {
    if (data.materials.length === 0) {
      document.getElementById('materialsList').innerHTML = '<p class="muted">No materials uploaded yet.</p>';
      return;
    }

    var isAdmin = currentUser && currentUser.role === 'admin';
    var html = '';

    for (var i = 0; i < data.materials.length; i++) {
      var m = data.materials[i];
      var icon = getFileIcon(m.mime_type, m.file_name);
      var size = formatFileSize(m.file_size);
      var category = m.category || 'General';

      html += '<div class="material-card">';
      html += '  <div class="material-icon">' + icon + '</div>';
      html += '  <div class="material-body">';
      html += '    <div class="material-header">';
      html += '      <div class="material-title">' + escapeHtml(m.title) + '</div>';
      html += '      <span class="material-category">' + escapeHtml(category) + '</span>';
      html += '    </div>';
      if (m.description) {
        html += '    <div class="material-description">' + escapeHtml(m.description) + '</div>';
      }
      html += '    <div class="material-meta">';
      html += '      <span>' + size + '</span>';
      if (m.uploader_name) {
        html += '      <span>·</span>';
        html += '      <span>by ' + escapeHtml(m.uploader_name) + '</span>';
      }
      html += '    </div>';
      html += '    <div class="material-actions">';
      html += '      <a href="/api/materials/' + m.id + '/download" target="_blank" class="btn-small btn-download">Download</a>';
      if (isAdmin) {
        html += '      <button class="btn-small btn-danger" onclick="deleteMaterial(' + m.id + ', \'' + escapeHtml(m.title).replace(/'/g, "\\'") + '\')">Delete</button>';
      }
      html += '    </div>';
      html += '  </div>';
      html += '</div>';
    }

    document.getElementById('materialsList').innerHTML = html;
  }).catch(function(err) {
    document.getElementById('materialsList').innerHTML = '<p class="muted">' + escapeHtml(err.message) + '</p>';
  });
}

function getFileIcon(mime, filename) {
  if (!mime) mime = '';
  var ext = (filename || '').toLowerCase().split('.').pop();

  if (mime.indexOf('pdf') !== -1 || ext === 'pdf') return '📄';
  if (mime.indexOf('word') !== -1 || ext === 'doc' || ext === 'docx') return '📝';
  if (mime.indexOf('powerpoint') !== -1 || ext === 'ppt' || ext === 'pptx') return '📊';
  if (mime.indexOf('excel') !== -1 || ext === 'xls' || ext === 'xlsx') return '📈';
  if (mime.indexOf('zip') !== -1 || ext === 'zip' || ext === 'rar') return '🗜️';
  if (mime.indexOf('image') !== -1) return '🖼️';
  if (mime.indexOf('video') !== -1) return '🎬';
  if (mime.indexOf('audio') !== -1) return '🎵';
  if (mime.indexOf('text') !== -1 || ext === 'txt') return '📃';
  return '📁';
}

function formatFileSize(bytes) {
  if (!bytes) return '—';
  var kb = bytes / 1024;
  if (kb < 1024) return kb.toFixed(1) + ' KB';
  var mb = kb / 1024;
  if (mb < 1024) return mb.toFixed(1) + ' MB';
  return (mb / 1024).toFixed(2) + ' GB';
}

function uploadMaterial(e) {
  e.preventDefault();
  var file = document.getElementById('matFile').files[0];
  if (!file) return;
  var formData = new FormData();
  formData.append('file', file);
  formData.append('title', document.getElementById('matTitle').value);
  formData.append('description', document.getElementById('matDescription').value);
  formData.append('category', document.getElementById('matCategory').value || 'General');

  api('/api/materials', { method: 'POST', body: formData }).then(function() {
    showMessage('Material uploaded', 'success');
    e.target.reset();
    e.target.style.display = 'none';
    var showBtn = document.getElementById('showUploadBtn');
    if (showBtn) showBtn.style.display = 'inline-block';
    loadMaterials();
  }).catch(function(err) { showMessage(err.message, 'error'); });
}

function deleteMaterial(id, title) {
  if (!confirm('Delete material "' + title + '" permanently?\n\nThis will remove the file from storage and cannot be undone.')) {
    return;
  }
  api('/api/materials/' + id, { method: 'DELETE' }).then(function() {
    showMessage('Material "' + title + '" deleted', 'success');
    loadMaterials();
    loadStats();
  }).catch(function(err) {
    showMessage(err.message, 'error');
  });
}

// ============================================
// AIRCRAFT RENTALS
// ============================================
function loadAircraft() {
  api('/api/aircraft').then(function(data) {
    aircraftCache = data.aircraft || [];
    renderAircraft();
  }).catch(function(err) {
    var el = document.getElementById('aircraftList');
    if (el) el.innerHTML = '<p class="muted">' + escapeHtml(err.message) + '</p>';
  });
}

function renderAircraft() {
  var el = document.getElementById('aircraftList');
  if (!el) return;

  if (aircraftCache.length === 0) {
    el.innerHTML = '<p class="muted">No aircraft in the fleet yet.</p>';
    return;
  }

  var isAdmin = currentUser && currentUser.role === 'admin';
  var html = '';

  for (var i = 0; i < aircraftCache.length; i++) {
    var ac = aircraftCache[i];
    var photoUrl = ac.photo_filename ? '/api/aircraft/' + ac.id + '/photo?v=' + encodeURIComponent(ac.photo_filename) : null;
    var statusLabel = ac.is_available === 1
      ? '<span class="aircraft-status available">Available</span>'
      : '<span class="aircraft-status unavailable">Unavailable</span>';

    html += '<div class="aircraft-card">';
    html += '<div class="aircraft-photo">';
    if (photoUrl) {
      html += '<img src="' + photoUrl + '" alt="' + escapeHtml(ac.tail_number) + '" loading="lazy">';
    } else {
      html += '<div class="aircraft-photo-placeholder">✈️</div>';
    }
    html += statusLabel;
    html += '</div>';
    html += '<div class="aircraft-info">';
    html += '<div class="aircraft-tail">' + escapeHtml(ac.tail_number) + '</div>';
    html += '<div class="aircraft-model">' + escapeHtml(ac.model) + '</div>';
    if (ac.description) html += '<div class="aircraft-description">' + escapeHtml(ac.description) + '</div>';
    html += '<div class="aircraft-rate">$' + Number(ac.hourly_rate).toLocaleString() + ' <span>/ hour</span></div>';
    if (isAdmin) {
      html += '<div class="aircraft-actions">';
      html += '<button class="btn-secondary btn-small" onclick="editAircraft(' + ac.id + ')">Edit</button> ';
      html += '<button class="btn-danger btn-small" onclick="deleteAircraft(' + ac.id + ', \'' + escapeHtml(ac.tail_number).replace(/'/g, "\\'") + '\')">Delete</button>';
      html += '</div>';
    }
    html += '</div></div>';
  }

  el.innerHTML = html;
}

function createAircraft(e) {
  e.preventDefault();
  var formData = new FormData();
  formData.append('tail_number', document.getElementById('acTailNumber').value);
  formData.append('model', document.getElementById('acModel').value);
  formData.append('description', document.getElementById('acDescription').value);
  formData.append('hourly_rate', document.getElementById('acRate').value);
  var photo = document.getElementById('acPhoto').files[0];
  if (photo) formData.append('photo', photo);

  api('/api/aircraft', { method: 'POST', body: formData }).then(function() {
    showMessage('Aircraft added', 'success');
    document.getElementById('addAircraftForm').reset();
    document.getElementById('addAircraftForm').style.display = 'none';
    document.getElementById('showAddAircraftBtn').style.display = 'inline-block';
    loadAircraft();
  }).catch(function(err) { showMessage(err.message, 'error'); });
}

function editAircraft(id) {
  var ac = null;
  for (var i = 0; i < aircraftCache.length; i++) if (aircraftCache[i].id === id) { ac = aircraftCache[i]; break; }
  if (!ac) return;
  document.getElementById('editAcId').value = ac.id;
  document.getElementById('editAcTail').value = ac.tail_number || '';
  document.getElementById('editAcModel').value = ac.model || '';
  document.getElementById('editAcRate').value = ac.hourly_rate || 1500;
  document.getElementById('editAcDescription').value = ac.description || '';
  document.getElementById('editAcPhoto').value = '';
  document.getElementById('editAcAvailable').checked = ac.is_available === 1;
  document.getElementById('aircraftModal').style.display = 'flex';
}

function closeAircraftModal() { document.getElementById('aircraftModal').style.display = 'none'; }

function saveAircraftEdit() {
  var id = document.getElementById('editAcId').value;
  var formData = new FormData();
  formData.append('tail_number', document.getElementById('editAcTail').value);
  formData.append('model', document.getElementById('editAcModel').value);
  formData.append('hourly_rate', document.getElementById('editAcRate').value);
  formData.append('description', document.getElementById('editAcDescription').value);
  formData.append('is_available', document.getElementById('editAcAvailable').checked ? 'true' : 'false');
  var photo = document.getElementById('editAcPhoto').files[0];
  if (photo) formData.append('photo', photo);

  api('/api/aircraft/' + id, { method: 'PUT', body: formData }).then(function() {
    showMessage('Aircraft updated', 'success');
    closeAircraftModal();
    loadAircraft();
  }).catch(function(err) { showMessage(err.message, 'error'); });
}

function deleteAircraft(id, tail) {
  if (!confirm('Delete aircraft "' + tail + '" permanently?\n\nThis cannot be undone.')) return;
  api('/api/aircraft/' + id, { method: 'DELETE' }).then(function() {
    showMessage('Aircraft "' + tail + '" deleted', 'success');
    loadAircraft();
  }).catch(function(err) { showMessage(err.message, 'error'); });
}

// ============================================
// NOTAMS
// ============================================
function loadNotams() {
  api('/api/notams').then(function(data) {
    notamCache = data.notams || [];
    renderNotams();
  }).catch(function(err) {
    var el = document.getElementById('notamList');
    if (el) el.innerHTML = '<p class="notam-empty">' + escapeHtml(err.message) + '</p>';
  });
}

function renderNotams() {
  var el = document.getElementById('notamList');
  if (!el) return;

  if (notamCache.length === 0) {
    el.innerHTML = '<p class="notam-empty">No active NOTAMs.</p>';
    return;
  }

  var isAdmin = currentUser && currentUser.role === 'admin';
  var html = '';

  for (var i = 0; i < notamCache.length; i++) {
    var n = notamCache[i];
    var severityClass = 'notam-' + (n.severity || 'info');
    var expires = n.expires_at ? 'Expires ' + fmtDate(n.expires_at) : 'Permanent';
    html += '<div class="notam-item ' + severityClass + '">';
    html += '  <div class="notam-item-header">';
    html += '    <span class="notam-severity">' + (n.severity || 'info').toUpperCase() + '</span>';
    html += '    <span class="notam-time">' + fmtDate(n.created_at) + '</span>';
    html += '  </div>';
    html += '  <div class="notam-item-title">' + escapeHtml(n.title) + '</div>';
    html += '  <div class="notam-item-body">' + escapeHtml(n.body) + '</div>';
    html += '  <div class="notam-item-footer">';
    html += '    <span>' + expires + '</span>';
    if (isAdmin) {
      html += '    <button class="btn-danger btn-small" onclick="deleteNotam(' + n.id + ')">Delete</button>';
    }
    html += '  </div>';
    html += '</div>';
  }

  el.innerHTML = html;
}

function openNotamModal() {
  document.getElementById('notamTitle').value = '';
  document.getElementById('notamBody').value = '';
  document.getElementById('notamSeverity').value = 'info';
  document.getElementById('notamExpires').value = '';
  document.getElementById('notamAddModal').style.display = 'flex';
  setTimeout(function() {
    var t = document.getElementById('notamTitle');
    if (t) t.focus();
  }, 50);
}

function closeNotamModal() {
  document.getElementById('notamAddModal').style.display = 'none';
}

function saveNotam() {
  var titleEl = document.getElementById('notamTitle');
  var bodyEl = document.getElementById('notamBody');
  var severityEl = document.getElementById('notamSeverity');
  var expiresEl = document.getElementById('notamExpires');

  if (!titleEl || !bodyEl) {
    console.error('NOTAM form fields missing from DOM');
    return;
  }

  var title = titleEl.value.trim();
  var body = bodyEl.value.trim();
  if (!title || !body) {
    showMessage('Title and body are required', 'error');
    return;
  }

  var payload = {
    title: title,
    body: body,
    severity: severityEl ? severityEl.value : 'info',
    expires_at: (expiresEl && expiresEl.value) ? expiresEl.value : null
  };

  var modal = document.getElementById('notamAddModal');
  var buttons = modal ? modal.querySelectorAll('button') : [];
  for (var b = 0; b < buttons.length; b++) buttons[b].disabled = true;

  api('/api/notams', { method: 'POST', body: JSON.stringify(payload) }).then(function() {
    showMessage('NOTAM published', 'success');
    closeNotamModal();
    loadNotams();
  }).catch(function(err) {
    showMessage(err.message || 'Failed to publish NOTAM', 'error');
  }).then(function() {
    for (var b = 0; b < buttons.length; b++) buttons[b].disabled = false;
  });
}

function deleteNotam(id) {
  if (!confirm('Delete this NOTAM?')) return;
  api('/api/notams/' + id, { method: 'DELETE' }).then(function() {
    showMessage('NOTAM deleted', 'success');
    loadNotams();
  }).catch(function(err) {
    showMessage(err.message, 'error');
  });
}

// Expose NOTAM functions globally so inline onclick handlers work
window.openNotamModal = openNotamModal;
window.closeNotamModal = closeNotamModal;
window.saveNotam = saveNotam;
window.deleteNotam = deleteNotam;
window.loadNotams = loadNotams;

// ============================================
// FLIGHT ROUTE PLANNER
// ============================================
function loadWaypoints() {
  var fromSelect = document.getElementById('routeFrom');
  var toSelect = document.getElementById('routeTo');
  if (!fromSelect || !toSelect) return;

  api('/api/routes/waypoints').then(function(data) {
    var waypoints = data.waypoints || [];
    var optionsHtml = '<option value="">— Select waypoint —</option>';
    for (var i = 0; i < waypoints.length; i++) {
      optionsHtml += '<option value="' + waypoints[i].name + '">' + waypoints[i].name + '</option>';
    }
    fromSelect.innerHTML = optionsHtml;
    toSelect.innerHTML = optionsHtml;
  }).catch(function(err) {
    var result = document.getElementById('routeResult');
    if (result) {
      result.style.display = 'block';
      result.innerHTML = '<p class="muted">Could not load waypoints: ' + escapeHtml(err.message) + '</p>';
    }
  });
}

function findRoute() {
  var from = document.getElementById('routeFrom').value;
  var to = document.getElementById('routeTo').value;
  var resultEl = document.getElementById('routeResult');

  if (!from || !to) {
    showMessage('Please select both departure and arrival waypoints', 'error');
    return;
  }
  if (from === to) {
    showMessage('Departure and arrival must be different', 'error');
    return;
  }

  resultEl.style.display = 'block';
  resultEl.innerHTML = '<p class="muted">Calculating route...</p>';

  api('/api/routes/find', {
    method: 'POST',
    body: JSON.stringify({ from: from, to: to })
  }).then(function(data) {
    var path = data.path || [];
    var routeStr = path.join(' → ');

    var html = '';
    html += '<div class="route-header">';
    html += '  <span class="route-badge">' + data.waypoint_count + ' waypoints</span>';
    html += '  <span class="route-badge route-distance">' + data.distance_nm + ' NM</span>';
    html += '</div>';
    html += '<div class="route-line">';
    for (var i = 0; i < path.length; i++) {
      var isEndpoint = (i === 0 || i === path.length - 1);
      html += '<span class="route-waypoint' + (isEndpoint ? ' route-endpoint' : '') + '">' + escapeHtml(path[i]) + '</span>';
      if (i < path.length - 1) html += '<span class="route-arrow">→</span>';
    }
    html += '</div>';
    html += '<div class="route-text"><strong>Route:</strong> ' + escapeHtml(routeStr) + '</div>';

    resultEl.innerHTML = html;
  }).catch(function(err) {
    resultEl.innerHTML = '<p class="muted">' + escapeHtml(err.message) + '</p>';
  });
}
