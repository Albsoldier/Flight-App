var API_BASE = '';
var currentUser = null;
var stopwatchInterval = null;
var activeSessionId = null;
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

  if (role === 'student') {
    var input = document.getElementById('flightStudentId');
    input.value = currentUser.id;
    input.disabled = true;
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

  if (canManage) {
    document.getElementById('uploadForm').addEventListener('submit', uploadMaterial);
  }

  if (canManage) loadStats();
  if (isAdmin) loadOnlineUsers();
  if (canManage) loadUsers();
  loadMaterials();

  if (isAdmin) setInterval(loadOnlineUsers, 30000);

  if (role === 'student') {
    api('/api/flights/sessions/active/' + currentUser.id).then(function(res) {
      if (res.active) {
        activeSessionId = res.session.id;
        stopwatchStartTime = Date.now() - (res.session.elapsedSeconds * 1000);
        startStopwatchDisplay();
        document.getElementById('startFlightBtn').disabled = true;
        document.getElementById('stopFlightBtn').disabled = false;
        document.getElementById('activeSession').textContent = 'Resumed flight #' + activeSessionId;
      }
    }).catch(function() {});
  }

  initBreadcrumbNav();
}

// ---------- UTC CLOCK ----------
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

// ---------- BREADCRUMB NAVIGATION ----------
function initBreadcrumbNav() {
  var links = document.querySelectorAll('.breadcrumb-item[data-target]');
  if (links.length === 0) return;

  function setActiveBreadcrumb(id) {
    for (var j = 0; j < links.length; j++) {
      if (links[j].getAttribute('data-target') === id) {
        links[j].classList.add('active');
      } else {
        links[j].classList.remove('active');
      }
    }
  }

  for (var i = 0; i < links.length; i++) {
    links[i].addEventListener('click', function(e) {
      e.preventDefault();
      var targetId = this.getAttribute('data-target');
      var target = document.getElementById(targetId);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      setActiveBreadcrumb(targetId);
    });
  }

  function updateActiveOnScroll() {
    var scrollPos = window.scrollY + 160;
    var activeId = null;

    for (var k = 0; k < links.length; k++) {
      var targetId = links[k].getAttribute('data-target');
      var el = document.getElementById(targetId);
      if (el && el.offsetTop <= scrollPos) {
        activeId = targetId;
      }
    }

    if (activeId) setActiveBreadcrumb(activeId);
  }

  window.addEventListener('scroll', updateActiveOnScroll, { passive: true });
  updateActiveOnScroll();
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
               (isAdmin ? '<th>Actions</th>' : '') +
               '</tr></thead><tbody>';

    for (var i = 0; i < data.users.length; i++) {
      var u = data.users[i];
      html += '<tr>';
      html += '<td>' + u.id + '</td>';
      html += '<td>' + u.username + '</td>';
      html += '<td>' + u.full_name + '</td>';
      html += '<td><span class="badge badge-' + u.role + '">' + u.role + '</span></td>';
      html += '<td>' + (u.total_hours || 0).toFixed(1) + '</td>';

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
  if (!confirm('Delete user "' + username + '" permanently?\n\nThis will also delete all their flight sessions. This cannot be undone.')) {
    return;
  }
  api('/api/admin/users/' + id + '/hard', { method: 'DELETE' }).then(function() {
    showMessage('User "' + username + '" deleted', 'success');
    loadUsers();
    loadStats();
  }).catch(function(err) {
    showMessage(err.message, 'error');
  });
}

// ---------- FLIGHT ----------
function startFlight() {
  var studentId = document.getElementById('flightStudentId').value;
  if (!studentId) return showMessage('Enter a student ID', 'error');

  api('/api/flights/sessions/start', {
    method: 'POST',
    body: JSON.stringify({
      studentId: parseInt(studentId),
      aircraft: document.getElementById('flightAircraft').value,
      flightType: document.getElementById('flightType').value
    })
  }).then(function(data) {
    activeSessionId = data.sessionId;
    stopwatchStartTime = Date.now();
    startStopwatchDisplay();
    document.getElementById('startFlightBtn').disabled = true;
    document.getElementById('stopFlightBtn').disabled = false;
    document.getElementById('activeSession').textContent = 'Active session #' + activeSessionId;
    showMessage('Flight started', 'success');
  }).catch(function(err) {
    showMessage(err.message, 'error');
  });
}

function startStopwatchDisplay() {
  clearInterval(stopwatchInterval);
  stopwatchInterval = setInterval(function() {
    var elapsed = Math.floor((Date.now() - stopwatchStartTime) / 1000);
    var h = ('0' + Math.floor(elapsed / 3600)).slice(-2);
    var m = ('0' + Math.floor((elapsed % 3600) / 60)).slice(-2);
    var s = ('0' + (elapsed % 60)).slice(-2);
    document.getElementById('stopwatchDisplay').textContent = h + ':' + m + ':' + s;
  }, 1000);
}

function stopFlight() {
  if (!activeSessionId) return;
  api('/api/flights/sessions/' + activeSessionId + '/stop', {
    method: 'POST',
    body: JSON.stringify({})
  }).then(function(result) {
    clearInterval(stopwatchInterval);
    document.getElementById('startFlightBtn').disabled = false;
    document.getElementById('stopFlightBtn').disabled = true;
    document.getElementById('activeSession').textContent = '';
    document.getElementById('stopwatchDisplay').textContent = '00:00:00';
    showMessage('Flight logged: ' + result.duration + ' hours', 'success');
    activeSessionId = null;
    stopwatchStartTime = null;
    if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'instructor')) {
      loadStats();
      loadUsers();
    }
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
