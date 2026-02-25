const authSection = document.getElementById('auth-section');
const signupForm = document.getElementById('signup-form');
const loginForm = document.getElementById('login-form');
const signupDiv = document.getElementById('signup');
const loginDiv = document.getElementById('login');
const showLoginLink = document.getElementById('show-login');
const showSignupLink = document.getElementById('show-signup');
const appDiv = document.getElementById('app');
const logoutBtn = document.getElementById('logout');

const vinForm = document.getElementById('vin-form');
const manualVinInput = document.getElementById('manual-vin');
const vinStatus = document.getElementById('vin-status');
const scanVinBtn = document.getElementById('scan-vin');
const vinImageInput = document.getElementById('vin-image');
const vehicleTitle = document.getElementById('vehicle-title');
const vehicleImage = document.getElementById('vehicle-image');
const vehicleSpecs = document.getElementById('vehicle-specs');
const runDiagnosticsBtn = document.getElementById('run-diagnostics');
const diagnosticsList = document.getElementById('diagnostics-list');
const repairSteps = document.getElementById('repair-steps');
const chatLauncher = document.getElementById('chat-launcher');
const chatLog = document.getElementById('chat-log');

let activeVin = null;
let latestDiagnostics = [];

function fetchWithAuth(url, options = {}) {
  const token = localStorage.getItem('token');
  const opts = { ...options };
  opts.headers = opts.headers || {};
  if (token) {
    opts.headers.Authorization = `Bearer ${token}`;
  }
  return fetch(url, opts);
}

function showApp() {
  authSection.style.display = 'none';
  appDiv.classList.remove('hidden');
}

function showAuth() {
  appDiv.classList.add('hidden');
  authSection.style.display = 'block';
  signupDiv.classList.remove('hidden');
  loginDiv.classList.add('hidden');
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
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value.trim();
  const formData = new FormData();
  formData.append('email', email);
  formData.append('password', password);

  const res = await fetch('/signup', { method: 'POST', body: formData });
  if (!res.ok) {
    const err = await res.json();
    alert(err.detail || 'Signup failed');
    return;
  }
  await handleLogin(email, password);
});

loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value.trim();
  await handleLogin(email, password);
});

async function handleLogin(email, password) {
  const formData = new FormData();
  formData.append('email', email);
  formData.append('password', password);
  const res = await fetch('/login', { method: 'POST', body: formData });
  if (!res.ok) {
    const err = await res.json();
    alert(err.detail || 'Login failed');
    return;
  }
  const data = await res.json();
  localStorage.setItem('token', data.token);
  showApp();
}

logoutBtn?.addEventListener('click', () => {
  localStorage.removeItem('token');
  showAuth();
});

async function decodeVin(vin) {
  const formData = new FormData();
  formData.append('vin', vin);
  const res = await fetchWithAuth('/vin/decode', { method: 'POST', body: formData });
  if (!res.ok) {
    throw new Error('Unable to decode VIN');
  }
  return res.json();
}

async function scanVinFromCamera() {
  const vin = window.prompt('Camera scan simulator: paste scanned VIN');
  if (!vin) return;
  await processVin(vin.trim().toUpperCase());
}

async function uploadVinImage() {
  const file = vinImageInput.files?.[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetchWithAuth('/vin/decode', { method: 'POST', body: formData });
  if (!res.ok) {
    throw new Error('Image VIN extraction failed');
  }
  const data = await res.json();
  await processVin(data.vin);
}

async function loadVehicleProfile(vin) {
  const res = await fetchWithAuth(`/vehicle/${encodeURIComponent(vin)}`);
  if (!res.ok) {
    throw new Error('Unable to load vehicle profile');
  }
  const profile = await res.json();

  vehicleTitle.textContent = `${profile.brand} ${profile.model} (${profile.year})`;
  if (profile.hero_image) {
    vehicleImage.src = profile.hero_image;
    vehicleImage.style.display = 'block';
  }

  vehicleSpecs.innerHTML = '';
  Object.entries(profile.specs).forEach(([key, value]) => {
    const p = document.createElement('p');
    p.textContent = `${key}: ${value}`;
    vehicleSpecs.appendChild(p);
  });
}

async function startDiagnostics() {
  if (!activeVin) {
    alert('Decode a VIN first.');
    return;
  }

  const diagRes = await fetchWithAuth('/diagnostics/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vin: activeVin }),
  });
  if (!diagRes.ok) {
    throw new Error('Diagnostics failed');
  }
  const diagData = await diagRes.json();
  latestDiagnostics = diagData.issues;

  diagnosticsList.innerHTML = '';
  diagData.issues.forEach((issue) => {
    const li = document.createElement('li');
    li.textContent = `${issue.code}: ${issue.summary} (${issue.severity})`;
    diagnosticsList.appendChild(li);
  });

  const planRes = await fetchWithAuth('/repair/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vin: activeVin, issues: latestDiagnostics }),
  });
  const planData = await planRes.json();

  repairSteps.innerHTML = '';
  planData.steps.forEach((step) => {
    const li = document.createElement('li');
    li.textContent = `${step.action} — ${step.eta}`;
    repairSteps.appendChild(li);
  });
}

async function processVin(vin) {
  vinStatus.textContent = 'Decoding VIN...';
  const decoded = await decodeVin(vin);
  activeVin = decoded.vin;
  manualVinInput.value = decoded.vin;
  vinStatus.textContent = `Decoded: ${decoded.vin} (${decoded.country}, ${decoded.manufacturer})`;
  await loadVehicleProfile(decoded.vin);
}

vinForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await processVin(manualVinInput.value.trim().toUpperCase());
  } catch (err) {
    console.error(err);
    vinStatus.textContent = 'VIN decode failed.';
  }
});

scanVinBtn?.addEventListener('click', async () => {
  try {
    await scanVinFromCamera();
  } catch (err) {
    console.error(err);
    vinStatus.textContent = 'VIN camera scan failed.';
  }
});

vinImageInput?.addEventListener('change', async () => {
  try {
    await uploadVinImage();
  } catch (err) {
    console.error(err);
    vinStatus.textContent = 'VIN image upload failed.';
  }
});

runDiagnosticsBtn?.addEventListener('click', async () => {
  try {
    await startDiagnostics();
  } catch (err) {
    console.error(err);
    alert('Diagnostics could not be completed.');
  }
});

chatLauncher?.addEventListener('click', async () => {
  const message = window.prompt('Ask a follow-up question about this vehicle or diagnosis:');
  if (!message || !activeVin) return;
  const res = await fetchWithAuth('/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vin: activeVin, message, diagnostics: latestDiagnostics }),
  });
  const data = await res.json();
  const p = document.createElement('p');
  p.textContent = `You: ${message} | Assistant: ${data.reply}`;
  chatLog.prepend(p);
});

if (localStorage.getItem('token')) {
  showApp();
} else {
  showAuth();
}
