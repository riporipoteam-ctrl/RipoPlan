/*
 * RipoPlan Front‑End Logic
 *
 * This script implements all client‑side functionality for the RipoPlan
 * application. It handles user signup/login, task CRUD operations, image
 * uploads, and rendering suggestions from the backend. All API calls are
 * relative to the current origin, making the application portable when
 * deployed alongside the FastAPI backend.
 */

// Retrieve references to DOM elements
const authSection = document.getElementById('auth-section');
const signupForm = document.getElementById('signup-form');
const loginForm = document.getElementById('login-form');
const signupDiv = document.getElementById('signup');
const loginDiv = document.getElementById('login');
const showLoginLink = document.getElementById('show-login');
const showSignupLink = document.getElementById('show-signup');
const appDiv = document.getElementById('app');
const logoutBtn = document.getElementById('logout');
const newTaskForm = document.getElementById('new-task-form');
const tasksList = document.getElementById('tasks-list');
const suggestionsList = document.getElementById('suggestions-list');

// Helper: perform a fetch request including the auth token if present
function fetchWithAuth(url, options = {}) {
  const token = localStorage.getItem('token');
  const opts = { ...options };
  opts.headers = opts.headers || {};
  if (token) {
    opts.headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(url, opts);
}

// Show the application interface
function showApp() {
  authSection.style.display = 'none';
  appDiv.classList.remove('hidden');
  loadTasks();
  loadSuggestions();
}

// Show the authentication interface
function showAuth() {
  appDiv.classList.add('hidden');
  authSection.style.display = 'block';
  // Default to showing signup form
  signupDiv.classList.remove('hidden');
  loginDiv.classList.add('hidden');
}

// Switch between signup and login forms
if (showLoginLink) {
  showLoginLink.addEventListener('click', (e) => {
    e.preventDefault();
    signupDiv.classList.add('hidden');
    loginDiv.classList.remove('hidden');
  });
}
if (showSignupLink) {
  showSignupLink.addEventListener('click', (e) => {
    e.preventDefault();
    loginDiv.classList.add('hidden');
    signupDiv.classList.remove('hidden');
  });
}

// Handle signup
if (signupForm) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value.trim();
    const formData = new FormData();
    formData.append('email', email);
    formData.append('password', password);
    try {
      const res = await fetch('/signup', { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json();
        alert(err.detail || 'Signup failed');
        return;
      }
      // Automatically log in after successful signup
      await handleLogin(email, password);
    } catch (err) {
      console.error(err);
      alert('Signup failed');
    }
  });
}

// Handle login
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();
    await handleLogin(email, password);
  });
}

async function handleLogin(email, password) {
  const formData = new FormData();
  formData.append('email', email);
  formData.append('password', password);
  try {
    const res = await fetch('/login', { method: 'POST', body: formData });
    if (!res.ok) {
      const err = await res.json();
      alert(err.detail || 'Login failed');
      return;
    }
    const data = await res.json();
    localStorage.setItem('token', data.token);
    showApp();
  } catch (err) {
    console.error(err);
    alert('Login failed');
  }
}

// Handle logout
if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('token');
    showAuth();
  });
}

// Load tasks from the server and render them
async function loadTasks() {
  try {
    const res = await fetchWithAuth('/tasks');
    const tasks = await res.json();
    renderTasks(tasks);
  } catch (err) {
    console.error(err);
  }
}

// Render task list
function renderTasks(tasks) {
  tasksList.innerHTML = '';
  tasks.forEach((task) => {
    const li = document.createElement('li');
    li.className = 'task-item';

    // Header with title and status/due date
    const header = document.createElement('div');
    header.className = 'task-header';
    const title = document.createElement('p');
    title.className = 'task-title';
    title.textContent = task.title;
    header.appendChild(title);
    const meta = document.createElement('p');
    meta.className = 'task-meta';
    let metaText = '';
    if (task.due_date) metaText += `Due: ${task.due_date}`;
    if (task.status) metaText += `${metaText ? ' · ' : ''}${task.status}`;
    meta.textContent = metaText;
    header.appendChild(meta);
    li.appendChild(header);

    // Description
    if (task.description) {
      const desc = document.createElement('p');
      desc.textContent = task.description;
      li.appendChild(desc);
    }

    // Image preview
    if (task.image) {
      const img = document.createElement('img');
      img.src = task.image;
      img.alt = task.title;
      img.style.maxWidth = '100%';
      img.style.borderRadius = '4px';
      li.appendChild(img);
    }

    // Buttons container
    const btns = document.createElement('div');
    btns.className = 'task-buttons';

    // Complete button if pending
    if (task.status !== 'completed') {
      const completeBtn = document.createElement('button');
      completeBtn.className = 'complete';
      completeBtn.textContent = 'Complete';
      completeBtn.addEventListener('click', () => completeTask(task.id));
      btns.appendChild(completeBtn);
    }

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => deleteTask(task.id));
    btns.appendChild(deleteBtn);

    // Image upload button
    const uploadBtn = document.createElement('button');
    uploadBtn.className = 'upload';
    uploadBtn.textContent = 'Upload Image';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => handleImageUpload(task.id, fileInput.files[0]));
    btns.appendChild(uploadBtn);
    btns.appendChild(fileInput);

    li.appendChild(btns);
    tasksList.appendChild(li);
  });
}

// Load suggestions from the server
async function loadSuggestions() {
  try {
    const res = await fetchWithAuth('/suggestions');
    const suggestions = await res.json();
    renderSuggestions(suggestions);
  } catch (err) {
    console.error(err);
  }
}

// Render suggestions list
function renderSuggestions(suggestions) {
  suggestionsList.innerHTML = '';
  if (suggestions.length === 0) {
    suggestionsList.textContent = 'No suggestions at the moment.';
    return;
  }
  suggestions.forEach((task) => {
    const li = document.createElement('li');
    li.textContent = `${task.title} (Due: ${task.due_date || 'N/A'})`;
    suggestionsList.appendChild(li);
  });
}

// Handle new task submission
if (newTaskForm) {
  newTaskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('new-title').value.trim();
    const description = document.getElementById('new-desc').value.trim();
    const dueDate = document.getElementById('new-due').value || null;
    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', description);
    formData.append('due_date', dueDate);
    try {
      const res = await fetchWithAuth('/tasks', { method: 'POST', body: formData });
      if (res.ok) {
        const task = await res.json();
        loadTasks();
        loadSuggestions();
        newTaskForm.reset();
      } else {
        const err = await res.json();
        alert(err.detail || 'Failed to create task');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to create task');
    }
  });
}

// Complete a task
async function completeTask(taskId) {
  const formData = new FormData();
  formData.append('status', 'completed');
  try {
    const res = await fetchWithAuth(`/tasks/${taskId}`, { method: 'PUT', body: formData });
    if (res.ok) {
      loadTasks();
      loadSuggestions();
    } else {
      const err = await res.json();
      alert(err.detail || 'Failed to update task');
    }
  } catch (err) {
    console.error(err);
    alert('Failed to update task');
  }
}

// Delete a task
async function deleteTask(taskId) {
  try {
    const res = await fetchWithAuth(`/tasks/${taskId}`, { method: 'DELETE' });
    if (res.ok) {
      loadTasks();
      loadSuggestions();
    } else {
      const err = await res.json();
      alert(err.detail || 'Failed to delete task');
    }
  } catch (err) {
    console.error(err);
    alert('Failed to delete task');
  }
}

// Upload an image for a task
async function handleImageUpload(taskId, file) {
  const formData = new FormData();
  formData.append('image', file);
  try {
    const res = await fetchWithAuth(`/tasks/${taskId}`, { method: 'PUT', body: formData });
    if (res.ok) {
      loadTasks();
    } else {
      const err = await res.json();
      alert(err.detail || 'Failed to upload image');
    }
  } catch (err) {
    console.error(err);
    alert('Failed to upload image');
  }
}

// Initial check: if a token exists, show the app; otherwise show auth
if (localStorage.getItem('token')) {
  showApp();
} else {
  showAuth();
}