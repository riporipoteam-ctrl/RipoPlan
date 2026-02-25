const authSection = document.getElementById('auth-section');
const signupForm = document.getElementById('signup-form');
const loginForm = document.getElementById('login-form');
const signupDiv = document.getElementById('signup');
const loginDiv = document.getElementById('login');
const showLoginLink = document.getElementById('show-login');
const showSignupLink = document.getElementById('show-signup');
const appDiv = document.getElementById('app');
const logoutBtn = document.getElementById('logout');
const settingsToggle = document.getElementById('settings-toggle');
const settingsPanel = document.getElementById('settings-panel');
const themeSelect = document.getElementById('theme-select');
const vinInput = document.getElementById('vin-input');
const loadVehicleBtn = document.getElementById('load-vehicle');
const printReportBtn = document.getElementById('print-report');
const vehicleDetails = document.getElementById('vehicle-details');
const hero = document.getElementById('hero');
const specsList = document.getElementById('specs-list');
const issuesList = document.getElementById('issues-list');
const diagnosticsList = document.getElementById('diagnostics-list');
const fixesList = document.getElementById('fixes-list');
const chatTimeline = document.getElementById('chat-timeline');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');

function fetchWithAuth(url, options = {}) {
  const token = localStorage.getItem('token');
  const opts = { ...options };
  opts.headers = opts.headers || {};
  if (token) opts.headers.Authorization = `Bearer ${token}`;
  return fetch(url, opts);
}

function showApp() {
  authSection.style.display = 'none';
  appDiv.classList.remove('hidden');
  loadSettings();
}

function showAuth() {
  appDiv.classList.add('hidden');
  authSection.style.display = 'block';
  signupDiv.classList.remove('hidden');
  loginDiv.classList.add('hidden');
}

function currentVin() {
  return (vinInput.value || '').trim().toUpperCase();
}

function setTheme(theme) {
  document.body.dataset.theme = theme;
  localStorage.setItem('theme', theme);
  themeSelect.value = theme;
}

async function loadSettings() {
  const local = localStorage.getItem('theme') || 'light';
  setTheme(local);
  try {
    const res = await fetchWithAuth('/profile/settings');
    if (!res.ok) return;
    const data = await res.json();
    setTheme(data.theme || local);
  } catch (e) {
    console.error(e);
  }
}

async function saveSettings(theme) {
  setTheme(theme);
  try {
    await fetchWithAuth('/profile/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme }),
    });
  } catch (e) {
    console.error(e);
  }
}

showLoginLink?.addEventListener('click', (e) => {
  e.preventDefault();
  signupDiv.classList.add('hidden');
  loginDiv.classList.remove('hidden');
});
showSignupLink?.addEventListener('click', (e) => {
  e.preventDefault();
  loginDiv.classList.add('hidden');
  signupDiv.classList.remove('hidden');
});

signupForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData();
  formData.append('email', document.getElementById('signup-email').value.trim());
  formData.append('password', document.getElementById('signup-password').value.trim());
  const res = await fetch('/signup', { method: 'POST', body: formData });
  if (!res.ok) return alert('Signup failed');
  await handleLogin(formData.get('email'), formData.get('password'));
});

loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  await handleLogin(
    document.getElementById('login-email').value.trim(),
    document.getElementById('login-password').value.trim()
  );
});

async function handleLogin(email, password) {
  const formData = new FormData();
  formData.append('email', email);
  formData.append('password', password);
  const res = await fetch('/login', { method: 'POST', body: formData });
  if (!res.ok) return alert('Login failed');
  const data = await res.json();
  localStorage.setItem('token', data.token);
  showApp();
}

logoutBtn?.addEventListener('click', () => {
  localStorage.removeItem('token');
  showAuth();
});

settingsToggle?.addEventListener('click', () => settingsPanel.classList.toggle('hidden'));
themeSelect?.addEventListener('change', (e) => saveSettings(e.target.value));

loadVehicleBtn?.addEventListener('click', async () => {
  const vin = currentVin();
  if (!vin) return alert('VIN required');
  await loadVehicleDetails(vin);
  await loadChatHistory(vin);
});

printReportBtn?.addEventListener('click', () => {
  const vin = currentVin();
  if (!vin) return alert('VIN required');
  window.open(`/vehicle/${encodeURIComponent(vin)}/report`, '_blank');
});

async function loadVehicleDetails(vin) {
  const res = await fetchWithAuth(`/vehicle/${encodeURIComponent(vin)}/details`);
  if (!res.ok) return alert('Failed to load vehicle details');
  const v = await res.json();
  vehicleDetails.classList.remove('hidden');
  hero.innerHTML = `<img src="${v.hero_image}" alt="${v.year} ${v.make} ${v.model}" /><div><h2>${v.year} ${v.make} ${v.model}</h2><p>VIN: ${v.vin}</p></div>`;

  specsList.innerHTML = Object.entries(v.specs).map(([k, val]) => `<li><strong>${k}</strong>: ${val}</li>`).join('');
  issuesList.innerHTML = v.known_issues.map((item) => `<li>${item}</li>`).join('');
  diagnosticsList.innerHTML = v.diagnostics
    .map((d) => `<li><strong>${d.code}</strong> (${d.status}) - ${d.description}</li>`)
    .join('');
  fixesList.innerHTML = v.recommended_fixes.map((item) => `<li>${item}</li>`).join('');
}

function renderMessage(msg) {
  const wrap = document.createElement('div');
  wrap.className = `chat-msg ${msg.type}`;
  if (msg.type === 'user') {
    wrap.innerHTML = `<p>${msg.content}</p>`;
    return wrap;
  }
  const content = msg.content || {};
  const steps = (content.steps || []).map((s) => `<li>${s}</li>`).join('');
  const images = (content.images || [])
    .map((i) => `<figure><img src="${i.url}" alt="${i.label}"/><figcaption>${i.label}</figcaption></figure>`)
    .join('');
  const videos = (content.videos || [])
    .map((v) => `<li><a href="${v.url}" target="_blank" rel="noopener">${v.title}</a></li>`)
    .join('');
  wrap.innerHTML = `
    <p>${content.summary || ''}</p>
    <ol>${steps}</ol>
    <div class="chat-images">${images}</div>
    <ul>${videos}</ul>`;
  return wrap;
}

async function loadChatHistory(vin) {
  const res = await fetchWithAuth(`/chat/${encodeURIComponent(vin)}`);
  if (!res.ok) return;
  const msgs = await res.json();
  chatTimeline.innerHTML = '';
  msgs.forEach((msg) => chatTimeline.appendChild(renderMessage(msg)));
}

chatForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const vin = currentVin();
  if (!vin) return alert('VIN required');
  const message = chatInput.value.trim();
  if (!message) return;

  const userMsg = { type: 'user', content: message };
  chatTimeline.appendChild(renderMessage(userMsg));

  const res = await fetchWithAuth('/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vin, message }),
  });
  if (!res.ok) return alert('Chat failed');
  const assistantMsg = await res.json();
  chatTimeline.appendChild(renderMessage(assistantMsg));
  chatInput.value = '';
});

if (localStorage.getItem('token')) {
  showApp();
} else {
  showAuth();
}
