var API_BASE = '';
var currentUser = null;
var stopwatchInterval = null;
var activeSessionId = null;
var activeSessionStudentId = null;
var stopwatchStartTime = null;
var utcClockInterval = null;

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

function fmtDate(str) {
  if (!str) return '—';
  var d = new Date(String(str).replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return str;
  return d.toISOString().slice(0, 16).replace('T', ' ') + 'Z';
}

// ---------- LOGIN ----------
function initLoginPage() {
  api('/api/auth/status').then(function(status) {
    if (status.needsSetup) {
      document.getElementById('loginForm').style.display = 'none';
      document.getElementById('setupPanel').style.display = 'block';
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
    }).catch(function(err) {
      showMessage(err.message, 'error');
    });
  });

  document.getElementById('setupForm').addEventListener('submit', function(e) {
    e.preventDefault();
    var username = document.getElementById('setupUsername').value;
    var password = document.getElementById('setupPassword').value;
    api('/api/auth/setup', {
      method: 'POST',
      body: JSON.stringify({
        username: username,
        password: password,
        fullName: document.getElementById('setupFullName').value,
        email: document.getElementById('setupEmail').value
      })
    }).then(function() {
      showMessage('Admin created! Logging in...', 'success');
      setTimeout(function() {
        api('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username: username, password: password })
        }).then(function() {
          window.location.href = 'dashboard.html';
        });
      }, 800);
    }).catch(function(err) {
      showMessage(err.message, 'error');
    });
  });
}

// ---------- DASHBOARD ----------
function initDashboard() {
  api('/api/auth/me').then(function(data) {
    currentUser = data.user;
    document.getElementById('userName').textContent = currentUser.full_name;
    document.getElementById('userRole').textContent = currentUser.role;
    document.getElementById('userRole').className = 'badge badge-' + currentUser.role;
    startUtcClock();
    setupDashboard();
  }).catch(function() {
    window.location.href = 'index.html';
  });
}

function setupDashboard() {
  var role = currentUser.role;
  var isAdmin = role === 'admin';
  var isInstructor = role === 'instructor';
  var canManage = isAdmin || isInstructor;

  var adminEls = document.querySelectorAll('.admin-only');
  for (var i = 0; i < adminEls.length; i++) {
    adminEls[i].style.display = isAdmin ? 'block' : 'none';
  }

  var instEls = document.querySelectorAll('.instructor-only');
  for (var j = 0; j < instEls.length; j++) {
    instEls[j].style.display = canManage ? 'block' : 'none';
  }

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
    input.value = currentUser.id;
    input.disabled = true;
  }

  if (canManage) {
    var selfField = document.getElementById('selfLogField');
    if (selfField) selfField.style.display = 'block';

    var selfCheck = document.getElementById('selfLogCheck');
    if (selfCheck) {
      selfCheck.addEventListener('change', function() {
        var studentInput = document.getElementById('flightStudentId');
        if (this.checked) {
          studentInput.value = currentUser.id;
          studentInput.disabled = true;
        } else {
          studentInput.value = '';
          studentInput.disabled = false;
        }
      });
    }
  }

  if (isInstructor) {
    document.getElementById('newRole').innerHTML = '<option value="student">Student</option>';
  }

  document.getElementById('logoutBtn').addEventListener('click', function() {
    api('/api/auth/logout', { method: 'POST' }).then(function() {
      window.location.href = 'index.html';
    }).catch(function() {
      window.location.href = 'index.html';
    });
  });

  if (canManage) {
    document.getElementById('createUserForm').addEventListener('submit', function(e) {
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
      }).catch(function(err) {
        showMessage(err.message, 'error');
      });
    });
    document.getElementById('refreshUsers').addEventListener('click', loadUsers);
  }

  document.getElementById('startFlightBtn').addEventListener('click', startFlight);
  document.getElementById('stopFlightBtn').addEventListener('click', stopFlight);
  document.getElementById('refreshMaterials').addEventListener('click', loadMaterials);
  document.getElementById('refreshMyLog').addEventListener('click', loadMyLog);

  if (isAdmin) {
    document.getElementById('refreshAllLogs').addEventListener('click', loadAllLogs);
  }

  if (canManage) {
    document.getElementById('uploadForm').addEventListener('submit', uploadMaterial);
  }

  if (canManage) loadStats();
  if (isAdmin) loadOnlineUsers();
  if (canManage) loadUsers();
  loadMaterials();
  loadMyLog();
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
    if (res.active) {
      attachActiveSession(res.session);
      return;
    }
    api('/api/flights/sessions/active/all').then(function(data) {
      if (data.sessions && data.sessions.length > 0) {
        var latest = data.sessions[0];
        var start = new Date(latest.start_time);
        var now = new Date();
        latest.elapsedSeconds = Math.floor((now - start) / 1000);
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

  startStopwatchDisplay();
  document.getElementById('startFlightBtn').disabled = true;
  document.getElementById('stopFlightBtn').disabled = false;
  document.getElementById('stopwatchDisplay').classList.add('running');

  var info = document.getElementById('activeSession');
  if (info) {
    info.textContent = 'Active flight #' + session.id + ' — ' + (session.student_name || session.student_id);
  }
}

// ---------- CLOCK ----------
function startUtcClock() {
  function tick() {
    var now = new Date();
    var h = ('0' + now.getUTCHours()).slice(-2);
    var m = ('0' + now.getUTCMinutes()).slice(-2);
    var s = ('0' + now.getUTCSeconds()).slice(-2);
    var timeStr = h + ':' + m + ':' + s;
    var clockEl = document.getElementById('utcClock');
    if (clockEl) clockEl.textContent = timeStr + 'Z';
    var rightEl = document.getElementById('clockRight');
    if (rightEl) rightEl.textContent = 'UTC ' + timeStr + 'Z';
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
        html += '<div class="list-item"><strong>' + u.full_name + '</strong> <span class="badge badge-' + u.role + '">' + u.role + '</span></div>';
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
      html += '<tr><td>' + u.id + '</td><td>' + u.username + '</td><td>' + u.full_name + '</td>' +
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
    document.getElementById('usersList').innerHTML = '<p class="muted">' + err.message + '</p>';
  });
}

function deleteUser(id, username) {
  if (!confirm('Delete user "' + username + '" permanently?\n\nThis will also delete all their flight sessions. This cannot be undone.')) return;
  api('/api/admin/users/' + id + '/hard', { method: 'DELETE' }).then(function() {
    showMessage('User "' + username + '" deleted', 'success');
    loadUsers();
    loadStats();
  }).catch(function(err) { showMessage(err.message, 'error'); });
}

// ---------- MY FLIGHT LOG ----------
function loadMyLog() {
  api('/api/flights/sessions/my').then(function(data) {
    if (!data.sessions || data.sessions.length === 0) {
      document.getElementById('myLogList').innerHTML = '<p class="muted">No flights logged yet.</p>';
      return;
    }

    var totalHours = 0;
    for (var t = 0; t < data.sessions.length; t++) {
      totalHours += (data.sessions[t].duration_hours || 0);
    }

    var html = '<p class="muted" style="margin-bottom:10px;">Total: <strong style="color:#38bdf8;">' + totalHours.toFixed(2) + ' hours</strong> across ' + data.sessions.length + ' flights</p>';
    html += '<table class="table"><thead><tr><th>Date</th><th>Aircraft</th><th>Type</th><th>Instructor</th><th>Duration</th></tr></thead><tbody>';

    for (var i = 0; i < data.sessions.length; i++) {
      var s = data.sessions[i];
      html += '<tr>' +
        '<td>' + fmtDate(s.start_time) + '</td>' +
        '<td>' + (s.aircraft || '—') + '</td>' +
        '<td>' + (s.flight_type || '—') + '</td>' +
        '<td>' + (s.instructor_name || (s.pilot_role === 'admin' || s.pilot_role === 'instructor' ? 'Self' : '—')) + '</td>' +
        '<td>' + (s.duration_hours || 0).toFixed(2) + ' h</td>' +
      '</tr>';
    }
    html += '</tbody></table>';
    document.getElementById('myLogList').innerHTML = html;
  }).catch(function(err) {
    document.getElementById('myLogList').innerHTML = '<p class="muted">' + err.message + '</p>';
  });
}

// ---------- ALL FLIGHT LOGS ----------
function loadAllLogs() {
  api('/api/flights/sessions/all').then(function(data) {
    if (!data.sessions || data.sessions.length === 0) {
      document.getElementById('allLogsList').innerHTML = '<p class="muted">No flight logs yet.</p>';
      return;
    }

    var totalHours = 0;
    for (var t = 0; t < data.sessions.length; t++) {
      totalHours += (data.sessions[t].duration_hours || 0);
    }

    var html = '<p class="muted" style="margin-bottom:10px;">System Total: <strong style="color:#38bdf8;">' + totalHours.toFixed(2) + ' hours</strong> across ' + data.sessions.length + ' flights</p>';
    html += '<table class="table"><thead><tr><th>Date</th><th>Pilot</th><th>Role</th><th>Aircraft</th><th>Type</th><th>Instructor</th><th>Duration</th></tr></thead><tbody>';

    for (var i = 0; i < data.sessions.length; i++) {
      var s = data.sessions[i];
      var role = s.pilot_role || s.pilot_role_actual || 'student';
      html += '<tr>' +
        '<td>' + fmtDate(s.start_time) + '</td>' +
        '<td>' + (s.pilot_name || '—') + '</td>' +
        '<td><span class="badge badge-' + role + '">' + role + '</span></td>' +
        '<td>' + (s.aircraft || '—') + '</td>' +
        '<td>' + (s.flight_type || '—') + '</td>' +
        '<td>' + (s.instructor_name || '—') + '</td>' +
        '<td>' + (s.duration_hours || 0).toFixed(2) + ' h</td>' +
      '</tr>';
    }
    html += '</tbody></table>';
    document.getElementById('allLogsList').innerHTML = html;
  }).catch(function(err) {
    document.getElementById('allLogsList').innerHTML = '<p class="muted">' + err.message + '</p>';
  });
}

// ---------- FLIGHT ----------
function startFlight() {
  if (activeSessionId) {
    return showMessage('A flight is already active — stop it first', 'error');
  }

  var selfLogCheck = document.getElementById('selfLogCheck');
  var selfLog = selfLogCheck && selfLogCheck.checked;
  var studentId = document.getElementById('flightStudentId').value;
  if (!studentId && !selfLog) return showMessage('Enter a student ID', 'error');

  var body = {
    aircraft: document.getElementById('flightAircraft').value,
    flightType: document.getElementById('flightType').value
  };
  if (selfLog) {
    body.selfLog = true;
  } else {
    body.studentId = parseInt(studentId);
  }

  api('/api/flights/sessions/start', {
    method: 'POST',
    body: JSON.stringify(body)
  }).then(function(data) {
    activeSessionId = data.sessionId;
    activeSessionStudentId = selfLog ? currentUser.id : parseInt(studentId);
    stopwatchStartTime = Date.now();
    startStopwatchDisplay();
    document.getElementById('startFlightBtn').disabled = true;
    document.getElementById('stopFlightBtn').disabled = false;
    document.getElementById('activeSession').textContent =
      'Active session #' + activeSessionId + (selfLog ? ' (self-log)' : '');
    document.getElementById('stopwatchDisplay').classList.add('running');
    showMessage('Flight started', 'success');
  }).catch(function(err) {
    if (err.message && err.message.indexOf('already has active session') !== -1) {
      showMessage('Recovering stuck session...', 'info');
      recoverStuckSession(selfLog ? currentUser.id : parseInt(studentId));
    } else {
      showMessage(err.message, 'error');
    }
  });
}

function recoverStuckSession(studentId) {
  api('/api/flights/sessions/active/' + studentId).then(function(res) {
    if (res.active) {
      attachActiveSession(res.session);
      showMessage('Recovered active flight #' + res.session.id, 'success');
    } else {
      showMessage('No active session found', 'error');
    }
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
  api('/api/flights/sessions/' + activeSessionId + '/stop', {
    method: 'POST',
    body: JSON.stringify({})
  }).then(function(result) {
    if (stopwatchInterval) clearInterval(stopwatchInterval);
    stopwatchInterval = null;
    document.getElementById('startFlightBtn').disabled = false;
    document.getElementById('stopFlightBtn').disabled = true;
    document.getElementById('activeSession').textContent = '';
    document.getElementById('stopwatchDisplay').textContent = '00:00:00';
    document.getElementById('stopwatchDisplay').classList.remove('running');
    showMessage('Flight logged: ' + result.duration + ' hours', 'success');
    activeSessionId = null;
    activeSessionStudentId = null;
    stopwatchStartTime = null;
    if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'instructor')) {
      loadStats();
      loadUsers();
    }
    loadMyLog();
    if (currentUser && currentUser.role === 'admin') loadAllLogs();
  }).catch(function(err) {
    showMessage(err.message, 'error');
  });
}

// ---------- MATERIALS ----------
function loadMaterials() {
  api('/api/materials').then(function(data) {
    if (data.materials.length === 0) {
      document.getElementById('materialsList').innerHTML = '<p class="muted">No materials uploaded yet.</p>';
      return;
    }
    var html = '';
    for (var i = 0; i < data.materials.length; i++) {
      var m = data.materials[i];
      html += '<div class="list-item"><strong>' + m.title + '</strong> <span class="badge">' + (m.category || 'General') + '</span> <a href="/api/materials/' + m.id + '/download" target="_blank">Download</a></div>';
    }
    document.getElementById('materialsList').innerHTML = html;
  }).catch(function(err) {
    document.getElementById('materialsList').innerHTML = '<p class="muted">' + err.message + '</p>';
  });
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
    loadMaterials();
  }).catch(function(err) {
    showMessage(err.message, 'error');
  });
}
