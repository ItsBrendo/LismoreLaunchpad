const DB_NAME = 'LismoreLaunchpadDB';
const DB_VERSION = 2;
const AUTH_STORAGE_KEY = 'lismoreCurrentUser';

const defaultKPIs = [
  { id: createId('kpi'), name: 'Product Care $', value: 14800, target: 20000, category: 'Care', trend: '+12.4%' },
  { id: createId('kpi'), name: 'Attach', value: 426, target: 500, category: 'Attach', trend: '+8.7%' },
  { id: createId('kpi'), name: 'Internet Security', value: 312, target: 350, category: 'Internet', trend: '+6.1%' },
  { id: createId('kpi'), name: 'Store Sales', value: 36420, target: 40000, category: 'Sales', trend: '+15.2%' }
];

const defaultNotifications = [
  { id: createId('notify'), title: 'KPI update', message: 'Store sales are trending above target this week.', type: 'info' },
  { id: createId('notify'), title: 'Task reminder', message: 'Quarterly renewal checklist is due Friday.', type: 'task' },
  { id: createId('notify'), title: 'Data import', message: 'MS Access sync is scheduled for the next release.', type: 'sync' }
];

const state = {
  currentUser: null,
  authMode: 'signin'
};

function createId(prefix = 'id') {
  if (crypto && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeUsername(value) {
  return (value || '').trim();
}

async function sha256(value) {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      const storeNames = ['users', 'kpis', 'notifications', 'tasks'];

      storeNames.forEach((storeName) => {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: 'id' });
        }
      });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readStore(storeName) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const txn = db.transaction(storeName, 'readonly');
    const store = txn.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function writeStore(storeName, payload) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const txn = db.transaction(storeName, 'readwrite');
    const store = txn.objectStore(storeName);
    const request = store.put(payload);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function seedUsers() {
  const users = await readStore('users');
  if (users.length > 0) {
    return;
  }

  const defaults = [
    { username: 'admin', password: 'admin123', role: 'admin' },
    { username: 'editor', password: 'editor123', role: 'editor' },
    { username: 'viewer', password: 'viewer123', role: 'viewer' }
  ];

  for (const user of defaults) {
    const record = {
      id: createId('user'),
      username: user.username,
      passwordHash: await sha256(user.password),
      role: user.role,
      createdAt: new Date().toISOString()
    };

    await writeStore('users', record);
  }
}

async function seedDatabase() {
  await seedUsers();

  const existingKPIs = await readStore('kpis');
  const existingNotifications = await readStore('notifications');

  if (!existingKPIs.length) {
    for (const item of defaultKPIs) {
      await writeStore('kpis', item);
    }
  }

  if (!existingNotifications.length) {
    for (const item of defaultNotifications) {
      await writeStore('notifications', item);
    }
  }
}

function setCurrentUser(user) {
  state.currentUser = user;
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  updateUserUI();
}

function clearCurrentUser() {
  state.currentUser = null;
  localStorage.removeItem(AUTH_STORAGE_KEY);
  updateUserUI();
}

function updateUserUI() {
  const userName = document.getElementById('userName');
  const userDisplayName = document.getElementById('userDisplayName');
  const userAvatar = document.getElementById('userAvatar');
  const signOutButton = document.getElementById('signOutButton');
  const resetPasswordButton = document.getElementById('resetPasswordButton');

  const name = state.currentUser ? state.currentUser.username : 'Guest';
  const initials = name.slice(0, 2).toUpperCase();

  if (userName) userName.textContent = name;
  if (userDisplayName) userDisplayName.textContent = name;
  if (userAvatar) userAvatar.textContent = initials;
  if (signOutButton) signOutButton.style.display = state.currentUser ? 'inline-flex' : 'none';
  if (resetPasswordButton) resetPasswordButton.style.display = state.currentUser ? 'inline-flex' : 'none';

  const form = document.getElementById('kpiForm');
  const accessNotice = document.getElementById('accessNotice');
  const allowUpdate = Boolean(state.currentUser && ['editor', 'admin'].includes(state.currentUser.role));

  if (form) {
    form.querySelectorAll('input, select, button[type="submit"]').forEach((element) => {
      if (element.tagName === 'BUTTON') {
        element.disabled = !allowUpdate;
      } else {
        element.disabled = !allowUpdate;
      }
    });
  }

  if (accessNotice) {
    accessNotice.textContent = allowUpdate
      ? 'You have edit access for KPI data.'
      : 'You need editor or admin access to update KPI data.';
  }
}

async function signInUser(username, password) {
  const safeUsername = normalizeUsername(username);
  if (!safeUsername || !password) return { ok: false, error: 'Username and password are required.' };

  const users = await readStore('users');
  const user = users.find((record) => record.username.toLowerCase() === safeUsername.toLowerCase());

  if (!user) return { ok: false, error: 'No account was found for that username.' };

  const passwordHash = await sha256(password);
  if (user.passwordHash !== passwordHash) {
    return { ok: false, error: 'Incorrect password.' };
  }

  setCurrentUser({ id: user.id, username: user.username, role: user.role });
  return { ok: true };
}

async function createUserAccount(username, password, role) {
  const safeUsername = normalizeUsername(username);
  if (!safeUsername || !password) return { ok: false, error: 'Username and password are required.' };

  const users = await readStore('users');
  const exists = users.some((record) => record.username.toLowerCase() === safeUsername.toLowerCase());
  if (exists) return { ok: false, error: 'That username already exists.' };

  const record = {
    id: createId('user'),
    username: safeUsername,
    passwordHash: await sha256(password),
    role,
    createdAt: new Date().toISOString()
  };

  await writeStore('users', record);
  setCurrentUser({ id: record.id, username: record.username, role: record.role });
  return { ok: true };
}

async function resetUserPassword({ targetUsername, currentPassword, newPassword, actorUsername }) {
  const actor = state.currentUser || { username: actorUsername, role: 'viewer' };
  const safeTargetUsername = normalizeUsername(targetUsername || actor.username);
  const safeCurrentPassword = currentPassword || '';
  const safeNewPassword = (newPassword || '').trim();

  if (!safeTargetUsername) return { ok: false, error: 'Username is required.' };
  if (!safeCurrentPassword) return { ok: false, error: 'Current password is required.' };
  if (!safeNewPassword || safeNewPassword.length < 4) return { ok: false, error: 'New password must be at least 4 characters.' };

  const users = await readStore('users');
  const targetUser = users.find((record) => record.username.toLowerCase() === safeTargetUsername.toLowerCase());

  if (!targetUser) return { ok: false, error: 'User not found.' };

  const isSelfReset = actor.username && actor.username.toLowerCase() === safeTargetUsername.toLowerCase();
  const isAdminReset = actor.role === 'admin';

  if (!isSelfReset && !isAdminReset) {
    return { ok: false, error: 'You do not have permission to reset this password.' };
  }

  const currentHash = await sha256(safeCurrentPassword);
  if (!isAdminReset && targetUser.passwordHash !== currentHash) {
    return { ok: false, error: 'Current password is incorrect.' };
  }

  const updatedUser = {
    ...targetUser,
    passwordHash: await sha256(safeNewPassword),
    updatedAt: new Date().toISOString()
  };

  await writeStore('users', updatedUser);
  return { ok: true, user: { id: updatedUser.id, username: updatedUser.username, role: updatedUser.role } };
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

async function renderKPIs() {
  const kpiList = document.getElementById('kpiList');
  const kpiCountLabel = document.getElementById('kpiCountLabel');
  if (!kpiList) return;

  const kpis = await readStore('kpis');
  if (kpiCountLabel) kpiCountLabel.textContent = String(kpis.length || 0);

  if (!kpis.length) {
    kpiList.innerHTML = '<li class="kpi-item">No KPI data saved yet.</li>';
    return;
  }

  kpiList.innerHTML = kpis
    .map((kpi) => {
      const isMoney = kpi.name.includes('$') || kpi.category === 'Sales';
      return `
        <li class="kpi-item">
          <div class="kpi-item-header">
            <h4>${kpi.name}</h4>
            <span class="trend up">${kpi.trend || '+0%'}</span>
          </div>
          <div class="kpi-value">${isMoney ? formatCurrency(kpi.value) : kpi.value}</div>
          <div class="kpi-meta">
            <span>${kpi.category}</span>
            <span>target ${isMoney ? formatCurrency(kpi.target) : kpi.target}</span>
          </div>
        </li>
      `;
    })
    .join('');
}

async function renderNotifications() {
  const list = document.getElementById('notificationList');
  const detailList = document.getElementById('notificationsDetailList');
  if (!list && !detailList) return;

  const notifications = await readStore('notifications');

  const buildMarkup = (items) => items
    .slice(0, 4)
    .map((item) => `
      <li class="notification-item">
        <div class="notification-badge"></div>
        <div>
          <strong>${item.title}</strong>
          <span>${item.message}</span>
        </div>
      </li>
    `)
    .join('');

  if (list) {
    list.innerHTML = notifications.length
      ? buildMarkup(notifications)
      : '<li class="notification-item"><div class="notification-badge"></div><div><strong>No updates</strong><span>Notifications will appear here as your KPIs and tasks change.</span></div></li>';
  }

  if (detailList) {
    detailList.innerHTML = notifications.length
      ? buildMarkup(notifications)
      : '<li class="notification-item"><div class="notification-badge"></div><div><strong>No updates</strong><span>Notifications will appear here as your KPIs and tasks change.</span></div></li>';
  }
}

async function handleKpiSubmit(event) {
  event.preventDefault();

  const currentUser = state.currentUser;
  if (!currentUser || !['editor', 'admin'].includes(currentUser.role)) {
    const accessNotice = document.getElementById('accessNotice');
    if (accessNotice) accessNotice.textContent = 'Restricted: only editors and admins may update KPI records.';
    return;
  }

  const nameInput = document.getElementById('kpiName');
  const valueInput = document.getElementById('kpiValue');
  const categoryInput = document.getElementById('kpiCategory');

  if (!nameInput || !valueInput || !categoryInput) return;

  const payload = {
    id: createId('kpi'),
    name: nameInput.value.trim() || 'New KPI',
    value: Number(valueInput.value) || 0,
    target: (Number(valueInput.value) || 0) * 1.2,
    category: categoryInput.value,
    trend: '+0%'
  };

  await writeStore('kpis', payload);
  await renderKPIs();

  nameInput.value = 'Product Care $';
  valueInput.value = 14500;
  categoryInput.value = 'Care';
}

function setActiveTab(tabId) {
  document.querySelectorAll('.nav-item').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tabId);
  });

  document.querySelectorAll('.content-tab').forEach((panel) => {
    panel.classList.toggle('active', panel.id === tabId);
  });
}

function bindNavigation() {
  document.querySelectorAll('.nav-item').forEach((button) => {
    button.addEventListener('click', () => setActiveTab(button.dataset.tab));
  });
}

function bindAuthControls() {
  const authForm = document.getElementById('authForm');
  const toggleButton = document.getElementById('toggleAuthMode');
  const roleFieldWrap = document.getElementById('roleFieldWrap');
  const authTitle = document.getElementById('authTitle');
  const authSubmit = document.getElementById('authSubmit');
  const authStatus = document.getElementById('authStatus');
  const signOutButton = document.getElementById('signOutButton');

  if (toggleButton) {
    toggleButton.addEventListener('click', () => {
      state.authMode = state.authMode === 'signin' ? 'signup' : 'signin';
      const isSignup = state.authMode === 'signup';
      if (authTitle) authTitle.textContent = isSignup ? 'Create account' : 'Sign in to Lismore';
      if (authSubmit) authSubmit.textContent = isSignup ? 'Create account' : 'Sign in';
      if (toggleButton) toggleButton.textContent = isSignup ? 'Already have an account? Sign in' : 'Need an account? Create one';
      if (roleFieldWrap) roleFieldWrap.classList.toggle('hidden', !isSignup);
      if (authStatus) authStatus.textContent = '';
    });
  }

  if (authForm) {
    authForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const usernameInput = document.getElementById('authUsername');
      const passwordInput = document.getElementById('authPassword');
      const roleSelect = document.getElementById('authRole');

      if (!usernameInput || !passwordInput || !authStatus) return;

      const username = usernameInput.value;
      const password = passwordInput.value;

      try {
        if (state.authMode === 'signup') {
          const role = roleSelect ? roleSelect.value : 'viewer';
          const result = await createUserAccount(username, password, role);
          if (!result.ok) {
            authStatus.textContent = result.error;
            return;
          }
          authStatus.textContent = 'Account created successfully.';
          document.getElementById('authModal').classList.remove('active');
        } else {
          const result = await signInUser(username, password);
          if (!result.ok) {
            authStatus.textContent = result.error;
            return;
          }
          document.getElementById('authModal').classList.remove('active');
        }

        updateUserUI();
        setActiveTab('homeTab');
        await renderKPIs();
        await renderNotifications();
      } catch (error) {
        authStatus.textContent = 'Authentication failed. Please try again.';
      }
    });
  }

  if (signOutButton) {
    signOutButton.addEventListener('click', () => {
      clearCurrentUser();
      document.getElementById('authModal').classList.add('active');
    });
  }

  const resetPasswordButton = document.getElementById('resetPasswordButton');
  if (resetPasswordButton) {
    resetPasswordButton.addEventListener('click', async () => {
      if (!state.currentUser) {
        document.getElementById('authModal').classList.add('active');
        return;
      }

      const currentPassword = window.prompt('Enter your current password:');
      if (currentPassword === null) return;

      const newPassword = window.prompt('Enter your new password (minimum 4 characters):');
      if (newPassword === null) return;

      const confirmPassword = window.prompt('Confirm your new password:');
      if (confirmPassword === null) return;

      if (newPassword !== confirmPassword) {
        window.alert('New passwords do not match.');
        return;
      }

      const result = await resetUserPassword({
        targetUsername: state.currentUser.username,
        currentPassword,
        newPassword
      });

      if (result.ok) {
        window.alert('Password updated successfully.');
      } else {
        window.alert(result.error || 'Unable to reset password.');
      }
    });
  }
}

async function initializeDashboard() {
  await seedDatabase();
  await renderKPIs();
  await renderNotifications();
  bindNavigation();
  bindAuthControls();
  updateUserUI();

  const userCountLabel = document.getElementById('userCountLabel');
  const users = await readStore('users');
  if (userCountLabel) userCountLabel.textContent = String(users.length || 0);

  const storedSession = localStorage.getItem(AUTH_STORAGE_KEY);
  if (storedSession) {
    try {
      const parsed = JSON.parse(storedSession);
      if (parsed && parsed.username) {
        state.currentUser = parsed;
        document.getElementById('authModal').classList.remove('active');
      }
    } catch (error) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }

  updateUserUI();

  const kpiForm = document.getElementById('kpiForm');
  if (kpiForm) {
    kpiForm.addEventListener('submit', handleKpiSubmit);
  }

  const seedButton = document.getElementById('seedKpiData');
  if (seedButton) {
    seedButton.addEventListener('click', async () => {
      await seedDatabase();
      await renderKPIs();
      await renderNotifications();
    });
  }

  if (!state.currentUser) {
    document.getElementById('authModal').classList.add('active');
  }
}

initializeDashboard();
