/* ═══════════════════════════════════════════════════════════════
   RRA COMMAND CENTER — Production App
   Full SPA: Auth, Pipeline, CRM, Tasks, Financials, Showings, Vendors
   Firebase Realtime DB · Vanilla JS
   ═══════════════════════════════════════════════════════════════ */

// ── Firebase ──
const firebaseConfig = { databaseURL: "https://realtyryan-dashboard-default-rtdb.firebaseio.com" };
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ── Auth (Firebase /users/ with SHA-256 hashed passwords) ──
// Legacy USERS kept as fallback only for migration; all new auth goes through Firebase /users/
const LEGACY_USERS = {
  'ryan@realtyryan.com': { password: 'rra2026!', uid: 'ryan-001', name: 'Ryan Palmer', initials: 'RP', role: 'agent-lead', email: 'ryanpalmer@hmproperties.com' },
  'ally@realtyryan.com':  { password: 'rra2026!', uid: 'ally-001', name: 'Ally Doerr', initials: 'AD', role: 'partner', email: 'ally@realtyryan.com' }
};
let currentUser = null;
let usersCache = {};

// SHA-256 hashing via Web Crypto API
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Date Helper (local timezone, not UTC) ──
function localDateStr(d) {
  d = d || new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// ── Constants ──
const LISTING_STAGES = [
  { id: 'pre-list', label: 'Pre-List', color: '#9a9590' },
  { id: 'listed', label: 'Listed', color: '#3a6ea5' },
  { id: 'under-contract', label: 'Under Contract', color: '#b8860b' },
  { id: 'due-diligence', label: 'Due Diligence', color: '#a0342e' },
  { id: 'pending', label: 'Pending', color: '#6b4c9a' },
  { id: 'closed', label: 'Closed', color: '#2d6a4f' }
];

const BUYER_STAGES = [
  { id: 'lead', label: 'Leads', color: '#9a9590' },
  { id: 'hot-lead', label: 'Hot Leads', color: '#a0342e' },
  { id: 'contingent', label: 'Contingent', color: '#b8860b' },
  { id: 'active-buyer', label: 'Active Buyers', color: '#3a6ea5' },
  { id: 'under-contract', label: 'Under Contract', color: '#6b4c9a' },
  { id: 'closed', label: 'Closed', color: '#2d6a4f' }
];

const CONTACT_TYPES = ['buyer','seller','both','vendor','agent','other'];
const CONTACT_STATUSES = ['lead','active','under-contract','closed','archived','lost'];
const CONTACT_SOURCES = ['zillow','realtor','referral','sphere','sign-call','open-house','fub-import','manual'];
const EXPENSE_CATS = [
  {id:'photography',label:'Photography',icon:'📸'},{id:'videography',label:'Videography/Drone',icon:'🎥'},
  {id:'marketing',label:'Marketing/Ads',icon:'📣'},{id:'staging',label:'Staging',icon:'🛋️'},
  {id:'open-house',label:'Open House',icon:'🏠'},{id:'signage',label:'Signage',icon:'🪧'},
  {id:'inspection',label:'Inspection',icon:'🔍'},{id:'appraisal',label:'Appraisal',icon:'📋'},
  {id:'attorney',label:'Attorney Fees',icon:'⚖️'},{id:'repairs',label:'Repairs/Credits',icon:'🔧'},
  {id:'gift',label:'Closing Gift',icon:'🎁'},{id:'other',label:'Other',icon:'📎'}
];

const VENDOR_CATS = [
  {id:'photographer',label:'Photographer'},{id:'videographer',label:'Videographer/Drone'},
  {id:'inspector',label:'Home Inspector'},{id:'attorney',label:'Real Estate Attorney'},
  {id:'lender',label:'Lender/Mortgage Broker'},{id:'contractor',label:'General Contractor'},
  {id:'stager',label:'Stager'},{id:'appraiser',label:'Appraiser'},
  {id:'title-company',label:'Title Company'},{id:'handyman',label:'Handyman'},
  {id:'cleaner',label:'Cleaning Service'},{id:'other',label:'Other'}
];

const LISTING_DOC_TEMPLATE = [
  {name:"Listing Agreement",category:"required"},{name:"WWREA",category:"required"},
  {name:"Incomplete Form",category:"required"},{name:"Agent MLS Sheet",category:"required"},
  {name:"Residential Property Disclosure",category:"required"},
  {name:"Lead-Based Paint Addendum",category:"conditional",condition:"If property built before 1978"},
  {name:"Mineral Oil & Gas Rights Disclosure",category:"required"},
  {name:"Professional Services Disclosure",category:"required"},
  {name:"Square Footage & Measurements",category:"required"},{name:"GIS Info",category:"required"},
  {name:"Property Tax Card",category:"required"},{name:"Real Estate Property Report",category:"required"},
  {name:"Property Tax Bill",category:"required"},{name:"Deed",category:"required"},
  {name:"Plat Map",category:"required"},{name:"Tax Map",category:"required"},
  {name:"Survey",category:"optional"},{name:"Floodplain Map",category:"required"},
  {name:"Stormwater Map",category:"required"},
  {name:"Deed Restrictions",category:"conditional",condition:"If applicable"},
  {name:"CCRs",category:"conditional",condition:"If HOA"},
  {name:"Email Correspondence",category:"required"},{name:"Miscellaneous",category:"optional"}
];

const BUYER_DOC_TEMPLATE = [
  {name:"Offer to Purchase & Contract",category:"required"},{name:"Receipt Page",category:"required"},
  {name:"Earnest Money Check",category:"required"},{name:"DD Check",category:"required"},
  {name:"Residential Property Disclosure (Completed)",category:"required"},
  {name:"Mineral Oil & Gas (Completed)",category:"required"},
  {name:"Lead-Based Paint (Completed)",category:"conditional",condition:"If property built before 1978"},
  {name:"Compensation Agreement Form 220",category:"required"},
  {name:"Under Contract MLS Report",category:"required"},{name:"Buyer WWREA Disclosure",category:"required"},
  {name:"Buyer Agency Agreement",category:"required"},{name:"Professional Services Disclosure",category:"required"},
  {name:"Due Diligence Agreement",category:"required"},{name:"Inspection Reports",category:"required"},
  {name:"Email Correspondence",category:"required"},{name:"Settlement & Closing Statement",category:"required"},
  {name:"Miscellaneous",category:"optional"}
];

// ── Data cache ──
let txnCache = {};
let contactCache = {};
let vendorCache = {};
let taskCache = {};
let apptCache = {};
let calEventCache = {};

// ── Calendar state ──
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let calViewMode = 'month'; // 'month' | 'week' | 'list'

// ── Role-based transaction filtering ──
// Ryan (agent-lead): sees ALL transactions
// Ally (partner): sees ALL transactions
// Individual agents (future): see only their assignedTo transactions
function getVisibleTxns() {
  if (!currentUser) return {};
  // agent-lead and partner see everything
  if (currentUser.role === 'agent-lead' || currentUser.role === 'partner') return txnCache;
  // Future agents: filter by assignedTo
  const filtered = {};
  Object.entries(txnCache).forEach(([id, t]) => {
    if (t.assignedTo === currentUser.uid) filtered[id] = t;
  });
  return filtered;
}

function getVisibleContacts() {
  if (!currentUser) return {};
  if (currentUser.role === 'agent-lead' || currentUser.role === 'partner') return contactCache;
  const filtered = {};
  Object.entries(contactCache).forEach(([id, c]) => {
    if (c.assignedTo === currentUser.uid) filtered[id] = c;
  });
  return filtered;
}

// ══════════════════════════════════════
// INIT
// ══════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  setupLogin();
  setupNav();
  setupGlobalSearch();
  const saved = localStorage.getItem('rra_user');
  if (saved) { currentUser = JSON.parse(saved); showApp(); }
});

// ══════════════════════════════════════
// AUTH
// ══════════════════════════════════════
function setupLogin() {
  document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const pw = document.getElementById('login-password').value;
    const err = document.getElementById('login-error');
    err.textContent = 'Signing in...';

    // Try Firebase /users/ first
    const snap = await db.ref('users').orderByChild('email').equalTo(email).once('value');
    const users = snap.val();

    if (users) {
      const userId = Object.keys(users)[0];
      const u = users[userId];

      if (u.status === 'inactive') { err.textContent = 'Account deactivated. Contact admin.'; return; }

      const hashedPw = await sha256(pw);
      if (u.passwordHash !== hashedPw) { err.textContent = 'Invalid email or password'; return; }

      // Update last login
      db.ref(`users/${userId}/lastLogin`).set(Date.now());

      const initials = (u.name || '').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
      currentUser = {
        uid: userId, name: u.name, initials, role: u.role, email: u.email,
        phone: u.phone || '', licenseNumber: u.licenseNumber || '', firm: u.firm || '',
        profilePhotoUrl: u.profilePhotoUrl || ''
      };
      localStorage.setItem('rra_user', JSON.stringify(currentUser));
      err.textContent = '';
      showApp();
      return;
    }

    // Fallback: legacy hardcoded users (for migration)
    const legacy = LEGACY_USERS[email];
    if (legacy && legacy.password === pw) {
      currentUser = { ...legacy }; delete currentUser.password;
      localStorage.setItem('rra_user', JSON.stringify(currentUser));
      err.textContent = '';
      showApp();
      // Auto-migrate legacy user to Firebase
      migrateUserToFirebase(legacy, pw);
      return;
    }

    err.textContent = 'Invalid email or password';
  });

  // Forgot password form
  document.getElementById('forgot-form').addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('forgot-email').value.trim().toLowerCase();
    const msg = document.getElementById('forgot-msg');
    msg.style.color = 'var(--muted-dark)';
    msg.textContent = 'Checking...';

    const snap = await db.ref('users').orderByChild('email').equalTo(email).once('value');
    if (!snap.val()) { msg.style.color = 'var(--danger)'; msg.textContent = 'No account found with that email.'; return; }

    const userId = Object.keys(snap.val())[0];
    const token = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
    await db.ref(`passwordResets/${token}`).set({ userId, email, createdAt: Date.now(), used: false });

    msg.style.color = 'var(--success)';
    msg.textContent = `Reset token: ${token}`;
    // Show reset form
    document.getElementById('forgot-form').classList.add('hidden');
    document.getElementById('reset-form').classList.remove('hidden');
    document.getElementById('reset-token').value = token;
  });

  // Reset password form
  document.getElementById('reset-form').addEventListener('submit', async e => {
    e.preventDefault();
    const token = document.getElementById('reset-token').value.trim();
    const newPw = document.getElementById('reset-new-pw').value;
    const confirmPw = document.getElementById('reset-confirm-pw').value;
    const msg = document.getElementById('reset-msg');

    if (newPw.length < 8) { msg.textContent = 'Password must be at least 8 characters.'; return; }
    if (newPw !== confirmPw) { msg.textContent = 'Passwords do not match.'; return; }

    const snap = await db.ref(`passwordResets/${token}`).once('value');
    const reset = snap.val();
    if (!reset || reset.used) { msg.textContent = 'Invalid or expired reset token.'; return; }

    // Check token age (24h expiry)
    if (Date.now() - reset.createdAt > 86400000) { msg.textContent = 'Token expired. Please request a new one.'; return; }

    const hashedPw = await sha256(newPw);
    await db.ref(`users/${reset.userId}/passwordHash`).set(hashedPw);
    await db.ref(`passwordResets/${token}/used`).set(true);

    msg.style.color = 'var(--success)';
    msg.textContent = 'Password reset! You can now sign in.';
    setTimeout(() => hideForgotPassword(), 2000);
  });

  document.getElementById('btn-signout').addEventListener('click', () => {
    currentUser = null;
    localStorage.removeItem('rra_user');
    document.getElementById('app-shell').classList.add('hidden');
    document.getElementById('login-screen').style.display = '';
    hideForgotPassword();
  });
}

// Forgot password UI helpers
function showForgotPassword() {
  document.getElementById('login-form').classList.add('hidden');
  document.getElementById('forgot-password-link').classList.add('hidden');
  document.getElementById('forgot-form').classList.remove('hidden');
  document.getElementById('reset-form').classList.add('hidden');
}

function hideForgotPassword() {
  document.getElementById('login-form').classList.remove('hidden');
  document.getElementById('forgot-password-link').classList.remove('hidden');
  document.getElementById('forgot-form').classList.add('hidden');
  document.getElementById('reset-form').classList.add('hidden');
  document.getElementById('forgot-msg').textContent = '';
  document.getElementById('reset-msg').textContent = '';
}

// Migrate legacy hardcoded user to Firebase /users/
async function migrateUserToFirebase(legacyUser, plainPassword) {
  const snap = await db.ref(`users/${legacyUser.uid}`).once('value');
  if (snap.val()) return; // Already migrated

  const hashedPw = await sha256(plainPassword);
  await db.ref(`users/${legacyUser.uid}`).set({
    name: legacyUser.name,
    email: legacyUser.email || legacyUser.uid + '@realtyryan.com',
    phone: '',
    role: legacyUser.role === 'agent-lead' ? 'admin' : legacyUser.role,
    status: 'active',
    passwordHash: hashedPw,
    licenseNumber: '',
    firm: 'Corcoran HM Properties',
    profilePhotoUrl: '',
    createdAt: Date.now(),
    lastLogin: Date.now(),
    createdBy: 'system-migration'
  });
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-shell').classList.remove('hidden');
  document.getElementById('sidebar-name').textContent = currentUser.name;
  document.getElementById('sidebar-avatar').textContent = currentUser.initials;
  const roleLabel = { admin: 'Admin', 'agent-lead': 'Agent Lead', broker: 'Broker', agent: 'Agent', partner: 'Partner' };
  document.getElementById('sidebar-role').textContent = roleLabel[currentUser.role] || currentUser.role;
  document.getElementById('topbar-name').textContent = currentUser.name;
  document.getElementById('topbar-avatar').textContent = currentUser.initials;

  // Show/hide admin nav
  const adminNav = document.querySelector('.nav-admin-only');
  if (adminNav) {
    if (isAdmin()) adminNav.classList.remove('hidden');
    else adminNav.classList.add('hidden');
  }

  setDashboardDate();
  initFirebaseListeners();
  initNotifications();
  // Default view based on role
  if (currentUser.role === 'partner') navigateTo('tasks');
  else navigateTo('dashboard');
}

function isAdmin() { return currentUser && (currentUser.role === 'admin' || currentUser.role === 'agent-lead'); }
function isRyan() { return currentUser && (currentUser.role === 'agent-lead' || currentUser.role === 'admin'); }

// ══════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════
function setupNav() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const v = item.dataset.view;
      if (v) navigateTo(v);
      document.getElementById('sidebar').classList.remove('open');
    });
  });
  document.getElementById('hamburger').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
  document.getElementById('sidebar-close').addEventListener('click', () => document.getElementById('sidebar').classList.remove('open'));
}

function navigateTo(view) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
  document.querySelectorAll('.view').forEach(v => { v.classList.remove('active'); v.style.display = 'none'; });
  const el = document.getElementById(`view-${view}`);
  if (el) { el.style.display = 'block'; requestAnimationFrame(() => el.classList.add('active')); }
  // Trigger view render
  if (view === 'dashboard') renderDashboard();
  if (view === 'contacts') renderContacts();
  if (view === 'tasks') renderTasks();
  if (view === 'financials') renderFinancials();
  if (view === 'showings') renderShowings();
  if (view === 'vendors') renderVendors();
  if (view === 'appointments') renderAppointments();
  if (view === 'calendar') renderCalendar();
  if (view === 'activity') renderActivity();
  if (view === 'reports') renderReports();
  if (view === 'admin') renderAdminUsers();
  if (view === 'profile') renderMyProfile();
}

function setupGlobalSearch() {
  document.getElementById('global-search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase().trim();
    if (q.length < 2) return;
    // Simple: search contacts and transactions
    const results = [];
    Object.entries(contactCache).forEach(([id, c]) => {
      if (`${c.firstName} ${c.lastName}`.toLowerCase().includes(q) || (c.email||'').toLowerCase().includes(q))
        results.push({ type: 'contact', id, label: `${c.firstName} ${c.lastName}`, sub: c.email });
    });
    Object.entries(getVisibleTxns()).forEach(([id, t]) => {
      if ((t.property?.address||'').toLowerCase().includes(q))
        results.push({ type: 'txn', id, label: t.property.address, sub: formatPrice(t.property?.price) });
    });
    // Could show dropdown — for now just log
  });
}

// ══════════════════════════════════════
// FIREBASE LISTENERS
// ══════════════════════════════════════
function initFirebaseListeners() {
  db.ref('users').on('value', snap => {
    usersCache = snap.val() || {};
    if (document.getElementById('view-admin').classList.contains('active')) renderAdminUsers();
  });
  db.ref('transactions').on('value', snap => {
    txnCache = snap.val() || {};
    renderListingPipeline();
    renderBuyerPipeline();
  });
  db.ref('contacts').on('value', snap => {
    contactCache = snap.val() || {};
    if (document.getElementById('view-contacts').classList.contains('active')) renderContacts();
  });
  db.ref('vendors').on('value', snap => {
    vendorCache = snap.val() || {};
    if (document.getElementById('view-vendors').classList.contains('active')) renderVendors();
  });
  db.ref('listingAppointments').on('value', snap => {
    apptCache = snap.val() || {};
    if (document.getElementById('view-appointments').classList.contains('active')) renderAppointments();
  });
  db.ref('activityLog').orderByChild('timestamp').limitToLast(100).on('value', snap => {
    activityCache = snap.val() || {};
  });
  db.ref('calendarEvents').on('value', snap => {
    calEventCache = snap.val() || {};
    if (document.getElementById('view-calendar').classList.contains('active')) renderCalendar();
  });
}

// ══════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════
function setDashboardDate() {
  const d = new Date();
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('dashboard-date').textContent = `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function renderDashboard() {
  const txns = Object.values(getVisibleTxns());
  const listings = txns.filter(t => t.type === 'listing');
  const buyers = txns.filter(t => t.type === 'buyer');
  const activeListings = listings.filter(t => ['pre-list','listed','under-contract','due-diligence','pending'].includes(t.listingPipeline?.stage));
  const activeBuyers = buyers.filter(t => ['lead','hot-lead','contingent','active-buyer','under-contract'].includes(t.buyerPipeline?.stage));
  const pendingClose = txns.filter(t => (t.listingPipeline?.stage === 'pending') || (t.buyerPipeline?.stage === 'under-contract'));

  let pendingGCI = 0;
  txns.forEach(t => {
    const stage = t.type === 'listing' ? t.listingPipeline?.stage : t.buyerPipeline?.stage;
    if (['under-contract','due-diligence','pending'].includes(stage)) {
      pendingGCI += t.financials?.commission?.gci || 0;
    }
  });

  document.getElementById('dashboard-stats').innerHTML = `
    <div class="stat-card"><div class="stat-number">${activeListings.length}</div><div class="stat-label">Active Listings</div></div>
    <div class="stat-card"><div class="stat-number">${activeBuyers.length}</div><div class="stat-label">Active Buyers</div></div>
    <div class="stat-card"><div class="stat-number">${pendingClose.length}</div><div class="stat-label">Pending Close</div></div>
    <div class="stat-card accent"><div class="stat-number">${formatPriceShort(pendingGCI)}</div><div class="stat-label">Pending GCI</div></div>
  `;

  // Tasks
  const tasksEl = document.getElementById('dashboard-tasks');
  const allTasks = [];
  Object.entries(getVisibleTxns()).forEach(([txnId, txn]) => {
    if (txn.tasks) {
      Object.entries(txn.tasks).forEach(([tid, task]) => {
        if (task.status !== 'complete' && task.status !== 'skipped')
          allTasks.push({ ...task, txnId, taskId: tid, address: txn.property?.address || 'Unknown' });
      });
    }
  });
  allTasks.sort((a, b) => (new Date(a.dueDate || '9999') - new Date(b.dueDate || '9999')));
  const topTasks = allTasks.slice(0, 5);

  if (topTasks.length === 0) {
    tasksEl.innerHTML = '<p class="empty-msg">No pending tasks</p>';
  } else {
    tasksEl.innerHTML = topTasks.map(t => {
      const isOverdue = t.dueDate && new Date(t.dueDate) < new Date();
      const cls = isOverdue ? 'urgent' : t.priority === 'high' ? 'high' : '';
      return `<div class="task-item ${cls}"><span class="task-dot"></span><span>${t.title} — ${t.address}</span><span class="task-due">${t.dueDate || ''}</span></div>`;
    }).join('');
  }

  // Activity
  const actEl = document.getElementById('dashboard-activity');
  const activities = [];
  Object.entries(getVisibleTxns()).forEach(([txnId, txn]) => {
    if (txn.notes) {
      Object.values(txn.notes).forEach(n => {
        activities.push({ text: n.text, time: n.createdAt, address: txn.property?.address });
      });
    }
  });
  activities.sort((a, b) => (b.time || 0) - (a.time || 0));
  const topAct = activities.slice(0, 5);
  if (topAct.length === 0) {
    actEl.innerHTML = '<p class="empty-msg">No recent activity</p>';
  } else {
    actEl.innerHTML = topAct.map(a => `<div class="activity-item"><span class="activity-time">${timeAgo(a.time)}</span><span>${a.text}</span></div>`).join('');
  }

  // Dashboard upcoming calendar events
  renderDashboardCalendarEvents();
}

function renderDashboardCalendarEvents() {
  const el = document.getElementById('dashboard-calendar-events');
  if (!el) return;
  const events = buildCalendarEvents();
  const now = new Date();
  const upcoming = events
    .filter(e => new Date(e.date) >= new Date(localDateStr(now)))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 8);

  if (upcoming.length === 0) {
    el.innerHTML = '<p class="empty-msg">No upcoming calendar events</p>';
    return;
  }

  el.innerHTML = upcoming.map(e => {
    const d = new Date(e.date + 'T12:00:00');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const colorMap = { dd: '#a0342e', closing: '#2d6a4f', inspection: '#3a6ea5', appraisal: '#6b4c9a', appointment: '#b8860b', other: '#9a9590' };
    const daysUntil = Math.ceil((d - now) / 86400000);
    const urgency = daysUntil <= 3 ? ' style="font-weight:700"' : '';
    return `
      <div class="cal-event-mini"${urgency}>
        <span class="cal-dot" style="background:${colorMap[e.type] || '#9a9590'}"></span>
        <span class="cal-event-mini-date">${months[d.getMonth()]} ${d.getDate()}</span>
        <span>${e.title}</span>
        ${daysUntil <= 7 ? `<span class="task-due">${daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : daysUntil + 'd'}</span>` : ''}
      </div>
    `;
  }).join('');
}

// ══════════════════════════════════════
// PIPELINE
// ══════════════════════════════════════
// Pipeline open-stage state
let listingOpenStages = {};
let buyerOpenStages = {};

function renderListingPipeline() {
  const board = document.getElementById('listing-pipeline');
  const listings = Object.entries(getVisibleTxns()).filter(([,t]) => t.type === 'listing');
  // Default: open stages with cards
  if (Object.keys(listingOpenStages).length === 0) LISTING_STAGES.forEach(s => { listingOpenStages[s.id] = true; });
  board.innerHTML = '';
  LISTING_STAGES.forEach(stage => {
    const cards = listings.filter(([,t]) => t.listingPipeline?.stage === stage.id);
    board.appendChild(createPipelineAccordion(stage, cards, 'listing', listingOpenStages));
  });
}

function renderBuyerPipeline() {
  const board = document.getElementById('buyer-pipeline');
  const buyers = Object.entries(getVisibleTxns()).filter(([,t]) => t.type === 'buyer');
  if (Object.keys(buyerOpenStages).length === 0) BUYER_STAGES.forEach(s => { buyerOpenStages[s.id] = true; });
  board.innerHTML = '';
  BUYER_STAGES.forEach(stage => {
    const cards = buyers.filter(([,t]) => t.buyerPipeline?.stage === stage.id);
    board.appendChild(createPipelineAccordion(stage, cards, 'buyer', buyerOpenStages));
  });
}

function createPipelineAccordion(stage, items, type, openState) {
  const section = document.createElement('div');
  section.className = 'pipeline-stage-section';
  const isOpen = openState[stage.id] !== false;

  section.innerHTML = `
    <div class="pipeline-stage-header${isOpen ? ' open' : ''}">
      <div class="stage-header-left">
        <span class="stage-color-dot" style="background:${stage.color}"></span>
        <span class="column-title">${stage.label}</span>
        <span class="column-count">${items.length}</span>
      </div>
      <span class="stage-chevron">›</span>
    </div>
    <div class="column-cards${isOpen ? '' : ' collapsed'}" data-stage="${stage.id}" data-type="${type}"></div>
  `;

  const header = section.querySelector('.pipeline-stage-header');
  const container = section.querySelector('.column-cards');

  header.addEventListener('click', () => {
    openState[stage.id] = container.classList.contains('collapsed');
    container.classList.toggle('collapsed');
    header.classList.toggle('open');
  });

  items.forEach(([txnId, txn]) => container.appendChild(createPipelineCard(txnId, txn, type)));

  // Drop zone
  container.addEventListener('dragover', e => { e.preventDefault(); container.classList.add('drag-over'); if(container.classList.contains('collapsed')){container.classList.remove('collapsed');header.classList.add('open');openState[stage.id]=true;} });
  container.addEventListener('dragleave', () => container.classList.remove('drag-over'));
  container.addEventListener('drop', e => {
    e.preventDefault(); container.classList.remove('drag-over');
    if (!isRyan()) return;
    const dragId = e.dataTransfer.getData('text/plain');
    const dragType = e.dataTransfer.getData('card-type');
    if (dragType !== type) return;
    const pipeline = type === 'listing' ? 'listingPipeline' : 'buyerPipeline';
    db.ref(`transactions/${dragId}/${pipeline}/stage`).set(stage.id);
    db.ref(`transactions/${dragId}/${pipeline}/stageHistory`).push({
      stage: stage.id, timestamp: Date.now(), changedBy: currentUser.uid
    });
    // Log activity + notify
    logActivity('stage-change', `Moved to ${stage.label}`, txnCache[dragId]?.property?.address || '', currentUser.uid);
    notifyStageChange(dragId, stage.label, txnCache[dragId]?.property?.address || '');
    toast(`Moved to ${stage.label}`);
    runAutomations(dragId, stage.id, type);
    createCalendarEventsForStage(dragId, stage.id, type);
  });
  return section;
}

function createPipelineCard(txnId, txn, type) {
  const card = document.createElement('div');
  card.className = 'pipeline-card';
  card.draggable = isRyan();
  card.style.cursor = isRyan() ? 'grab' : 'pointer';

  const addr = txn.property?.address || 'TBD';
  const price = txn.property?.price || txn.property?.listPrice || 0;
  const contact = getContactName(txn.contactId);

  // Doc progress
  const docs = txn.documents ? Object.values(txn.documents) : [];
  const docsTotal = docs.length;
  const docsDone = docs.filter(d => ['signed','uploaded','verified'].includes(d.status)).length;

  // DD countdown
  const pipeline = type === 'listing' ? txn.listingPipeline : txn.buyerPipeline;
  let ddBadge = '';
  if (pipeline?.ddEndDate) {
    const daysLeft = Math.ceil((new Date(pipeline.ddEndDate) - new Date()) / 86400000);
    if (daysLeft > 0 && daysLeft <= 14) ddBadge = `<span class="card-badge badge-hot">DD: ${daysLeft}d</span>`;
    if (daysLeft <= 0) ddBadge = `<span class="card-badge badge-hot">DD Expired</span>`;
  }

  card.innerHTML = `
    <div class="card-address">${addr}</div>
    <div class="card-client">${contact}</div>
    <div class="card-price">${formatPrice(price)}</div>
    <div class="card-meta">
      ${docsTotal > 0 ? `<span class="card-badge badge-docs">📋 ${docsDone}/${docsTotal}</span>` : ''}
      ${ddBadge}
    </div>
  `;

  card.addEventListener('dragstart', e => {
    card.classList.add('dragging');
    e.dataTransfer.setData('text/plain', txnId);
    e.dataTransfer.setData('card-type', type);
  });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));
  card.addEventListener('click', () => openTransactionDetail(txnId));
  return card;
}

// ══════════════════════════════════════
// TRANSACTION DETAIL
// ══════════════════════════════════════
function openTransactionDetail(txnId) {
  const txn = txnCache[txnId];
  if (!txn) return;
  const p = txn.property || {};
  const pipeline = txn.type === 'listing' ? txn.listingPipeline : txn.buyerPipeline;
  const stages = txn.type === 'listing' ? LISTING_STAGES : BUYER_STAGES;
  const stageLabel = stages.find(s => s.id === pipeline?.stage)?.label || pipeline?.stage || '—';
  const contact = txn.contactId ? contactCache[txn.contactId] : null;
  const docs = txn.documents ? Object.entries(txn.documents) : [];
  const docsTotal = docs.length;
  const docsDone = docs.filter(([,d]) => ['signed','uploaded','verified'].includes(d.status)).length;

  const tasks = txn.tasks ? Object.entries(txn.tasks) : [];
  const showings = txn.showings ? Object.entries(txn.showings) : [];

  // Financials
  const fin = txn.financials?.commission || {};
  const expenses = txn.financials?.expenses ? Object.values(txn.financials.expenses) : [];
  const totalExp = expenses.reduce((s, e) => s + (e.amount || 0), 0);

  openModal(`
    <button class="modal-close" onclick="closeModal()">×</button>
    <div class="modal-header">
      <h2>${p.address || 'Transaction'}</h2>
      <div class="modal-meta">
        <span>${formatPrice(p.price || p.listPrice)}</span>
        <span class="modal-badge">${stageLabel}</span>
        ${p.mlsNumber ? `<span style="font-size:0.8rem;color:var(--muted)">MLS# ${p.mlsNumber}</span>` : ''}
      </div>
    </div>
    <div class="modal-tabs" id="txn-tabs">
      <button class="modal-tab active" data-tab="overview">Overview</button>
      <button class="modal-tab" data-tab="documents">Documents (${docsDone}/${docsTotal})</button>
      <button class="modal-tab" data-tab="tasks">Tasks</button>
      <button class="modal-tab" data-tab="showings">Showings (${showings.length})</button>
      <button class="modal-tab" data-tab="financials">Financials</button>
      <button class="modal-tab" data-tab="notes">Notes</button>
    </div>
    <div id="txn-tab-content">
      ${renderOverviewTab(txn, txnId, pipeline, contact, docsTotal, docsDone, fin, totalExp)}
    </div>
  `, 'modal-lg');

  // Tab switching
  document.querySelectorAll('#txn-tabs .modal-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#txn-tabs .modal-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const t = tab.dataset.tab;
      const content = document.getElementById('txn-tab-content');
      if (t === 'overview') content.innerHTML = renderOverviewTab(txn, txnId, pipeline, contact, docsTotal, docsDone, fin, totalExp);
      else if (t === 'documents') { content.innerHTML = renderDocumentsTab(txnId, docs); setupDocActions(txnId); }
      else if (t === 'tasks') { content.innerHTML = renderTasksTab(txnId, tasks); setupTaskActions(txnId); }
      else if (t === 'showings') content.innerHTML = renderShowingsTab(txnId, showings);
      else if (t === 'financials') { content.innerHTML = renderFinancialsTab(txnId, fin, expenses, totalExp); setupFinActions(txnId); }
      else if (t === 'notes') { content.innerHTML = renderNotesTab(txnId, txn.notes); setupNoteActions(txnId); }
    });
  });
}

function renderOverviewTab(txn, txnId, pipeline, contact, docsTotal, docsDone, fin, totalExp) {
  const p = txn.property || {};
  const docPct = docsTotal > 0 ? Math.round(docsDone / docsTotal * 100) : 0;
  const netComm = (fin.netCommission || 0) - totalExp;
  return `
    <div class="detail-grid">
      <div class="detail-section">
        <h4>Key Dates</h4>
        <div class="detail-row"><span>List Date</span><span>${pipeline?.listDate || pipeline?.offerDate || '—'}</span></div>
        <div class="detail-row"><span>Contract Date</span><span>${pipeline?.contractDate || '—'}</span></div>
        <div class="detail-row"><span>DD End</span><span>${pipeline?.ddEndDate || '—'}</span></div>
        <div class="detail-row"><span>Closing</span><span>${pipeline?.closingDate || '—'}</span></div>
        <div class="detail-row"><span>Commission</span><span>${pipeline?.commission || pipeline?.buyerAgencyAgreementDate ? (pipeline.commission || '—') + '%' : '—'}</span></div>
      </div>
      <div class="detail-section">
        <h4>Contact</h4>
        ${contact ? `
          <div class="detail-row"><span>Name</span><span>${contact.firstName} ${contact.lastName}</span></div>
          <div class="detail-row"><span>Phone</span><span>${contact.phone || '—'}</span></div>
          <div class="detail-row"><span>Email</span><span>${contact.email || '—'}</span></div>
        ` : '<p class="empty-msg">No contact linked</p>'}
        <h4 style="margin-top:16px">Property</h4>
        <div class="detail-row"><span>Beds/Baths/SF</span><span>${p.beds || '—'} / ${p.baths || '—'} / ${p.sqft ? p.sqft.toLocaleString() : '—'}</span></div>
        <div class="detail-row"><span>Type</span><span>${p.propertyType || '—'}</span></div>
      </div>
    </div>
    <div class="overview-stats">
      <div class="ov-stat"><span>📋 Documents</span><div class="progress-bar"><div class="progress-fill" style="width:${docPct}%"></div></div><span>${docsDone}/${docsTotal} (${docPct}%)</span></div>
      <div class="ov-stat"><span>💰 Net Profit</span><span class="ov-big">${formatPrice(netComm)}</span></div>
    </div>
  `;
}

function renderDocumentsTab(txnId, docs) {
  if (docs.length === 0) return `<p class="empty-msg">No documents. <button class="btn-link" onclick="generateDocChecklist('${txnId}')">Generate Checklist</button></p>`;
  const sorted = docs.sort((a, b) => {
    const order = {required: 0, conditional: 1, optional: 2};
    return (order[a[1].category] || 2) - (order[b[1].category] || 2);
  });
  const statusIcon = s => ({
    'not-started': '⚪', 'sent-for-signature': '✍️', 'signed': '✅', 'uploaded': '📤', 'verified': '✓', 'na': '➖'
  })[s] || '⚪';
  return `
    <div class="doc-actions-bar">
      <button class="btn-sm btn-outline" onclick="generateDocChecklist('${txnId}')">🔄 Regenerate Checklist</button>
    </div>
    <table class="data-table">
      <thead><tr><th></th><th>Document</th><th>Category</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>
        ${sorted.map(([docId, doc]) => `
          <tr>
            <td>${statusIcon(doc.status)}</td>
            <td>${doc.name}${doc.condition ? `<br><small class="text-muted">${doc.condition}</small>` : ''}</td>
            <td><span class="tag tag-${doc.category}">${doc.category}</span></td>
            <td>${formatDocStatus(doc.status)}</td>
            <td class="doc-actions" data-doc-id="${docId}">
              ${doc.status === 'not-started' ? `<button class="btn-xs" onclick="setDocStatus('${txnId}','${docId}','uploaded')">📤 Upload</button>
                <button class="btn-xs" onclick="setDocStatus('${txnId}','${docId}','sent-for-signature')">✍️ Send</button>
                <button class="btn-xs" onclick="setDocStatus('${txnId}','${docId}','na')">N/A</button>` : ''}
              ${doc.status === 'sent-for-signature' ? `<button class="btn-xs" onclick="setDocStatus('${txnId}','${docId}','signed')">✅ Signed</button>` : ''}
              ${doc.status === 'signed' || doc.status === 'uploaded' ? `<button class="btn-xs" onclick="setDocStatus('${txnId}','${docId}','verified')">✓ Verify</button>` : ''}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderTasksTab(txnId, tasks) {
  const pending = tasks.filter(([,t]) => t.status !== 'complete' && t.status !== 'skipped');
  const done = tasks.filter(([,t]) => t.status === 'complete');
  return `
    <div class="doc-actions-bar">
      <button class="btn-sm btn-outline" onclick="showAddTaskForm('${txnId}')">+ Add Task</button>
    </div>
    <div id="add-task-form-${txnId}" class="hidden add-form"></div>
    ${pending.length > 0 ? `<h4 class="section-label">Pending (${pending.length})</h4>` : ''}
    ${pending.map(([tid, t]) => `
      <div class="task-row">
        <button class="task-check" onclick="completeTask('${txnId}','${tid}')">☐</button>
        <div class="task-info">
          <span class="task-title">${t.title}</span>
          <span class="task-meta">${t.assignedTo === 'ally-001' ? 'Ally' : 'Ryan'} · ${t.dueDate || 'No date'} · <span class="priority-${t.priority}">${t.priority}</span></span>
        </div>
      </div>
    `).join('')}
    ${done.length > 0 ? `<h4 class="section-label" style="margin-top:16px">Completed (${done.length})</h4>` : ''}
    ${done.map(([tid, t]) => `
      <div class="task-row done"><span class="task-check-done">✓</span><div class="task-info"><span class="task-title">${t.title}</span></div></div>
    `).join('')}
    ${tasks.length === 0 ? '<p class="empty-msg">No tasks yet.</p>' : ''}
  `;
}

function renderShowingsTab(txnId, showings) {
  if (showings.length === 0) return '<p class="empty-msg">No showings recorded.</p>';
  const sorted = showings.sort((a, b) => (b[1].startTime || 0) - (a[1].startTime || 0));
  const interestIcon = i => ({
    'very-interested': '🟢', 'interested': '🔵', 'somewhat-interested': '🟡', 'not-interested': '🔴'
  })[i] || '⏳';
  return `
    <table class="data-table">
      <thead><tr><th>Date</th><th>Time</th><th>Buyer Agent</th><th>Interest</th><th>Feedback</th></tr></thead>
      <tbody>
        ${sorted.map(([, s]) => `
          <tr>
            <td>${s.date || '—'}</td>
            <td>${s.time || '—'}</td>
            <td>${s.buyerAgentName || '—'}<br><small class="text-muted">${s.buyerAgentBrokerage || ''}</small></td>
            <td>${interestIcon(s.feedback?.interestLevel)} ${formatInterest(s.feedback?.interestLevel)}</td>
            <td>${s.feedback?.comments || '<span class="text-muted">Pending</span>'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderFinancialsTab(txnId, fin, expenses, totalExp) {
  const gci = fin.gci || 0;
  const net = (fin.netCommission || 0) - totalExp;
  return `
    <div class="fin-summary">
      <div class="fin-block">
        <h4>Commission</h4>
        <div class="detail-row"><span>List Price</span><span>${formatPrice(fin.listPrice)}</span></div>
        <div class="detail-row"><span>Sale Price</span><span>${formatPrice(fin.salePrice)}</span></div>
        <div class="detail-row"><span>Commission %</span><span>${fin.commissionPct || '—'}%</span></div>
        <div class="detail-row"><span>GCI</span><span class="text-accent">${formatPrice(gci)}</span></div>
        <div class="detail-row"><span>Broker Split (${fin.splits?.brokerSplit || 20}%)</span><span>${formatPrice(fin.splits?.brokerAmount)}</span></div>
        <div class="detail-row"><span>Agent Net (${fin.splits?.agentSplit || 80}%)</span><span>${formatPrice(fin.splits?.agentAmount)}</span></div>
        <div class="detail-row bold"><span>Net Commission</span><span>${formatPrice(fin.netCommission)}</span></div>
      </div>
    </div>
    <h4 class="section-label" style="margin-top:20px">Expenses <button class="btn-xs" onclick="showAddExpenseForm('${txnId}')">+ Add</button></h4>
    <div id="add-expense-form-${txnId}" class="hidden add-form"></div>
    ${expenses.length > 0 ? `
      <table class="data-table">
        <thead><tr><th>Category</th><th>Description</th><th>Amount</th><th>Vendor</th></tr></thead>
        <tbody>
          ${expenses.map(e => {
            const cat = EXPENSE_CATS.find(c => c.id === e.category);
            return `<tr><td>${cat ? cat.icon + ' ' + cat.label : e.category}</td><td>${e.description || ''}</td><td>${formatPrice(e.amount)}</td><td>${e.vendorName || '—'}</td></tr>`;
          }).join('')}
          <tr class="total-row"><td colspan="2"><strong>Total Expenses</strong></td><td><strong>${formatPrice(totalExp)}</strong></td><td></td></tr>
        </tbody>
      </table>
    ` : '<p class="empty-msg">No expenses recorded.</p>'}
    <div class="fin-net-box">💰 NET PROFIT: <strong>${formatPrice(net)}</strong></div>
  `;
}

function renderNotesTab(txnId, notes) {
  const entries = notes ? Object.entries(notes).sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0)) : [];
  return `
    <div class="add-note-form">
      <textarea id="note-text-${txnId}" placeholder="Add a note..." rows="3" class="note-input"></textarea>
      <button class="btn-sm btn-primary" onclick="addNote('${txnId}')">Add Note</button>
    </div>
    ${entries.map(([, n]) => `
      <div class="note-item">
        <div class="note-header"><span class="note-type">${n.type || 'note'}</span><span class="note-time">${timeAgo(n.createdAt)}</span></div>
        <p>${n.text}</p>
      </div>
    `).join('')}
    ${entries.length === 0 ? '<p class="empty-msg" style="margin-top:12px">No notes yet.</p>' : ''}
  `;
}

// ══════════════════════════════════════
// DOCUMENT ACTIONS
// ══════════════════════════════════════
function generateDocChecklist(txnId) {
  const txn = txnCache[txnId];
  if (!txn) return;
  const template = txn.type === 'listing' ? LISTING_DOC_TEMPLATE : BUYER_DOC_TEMPLATE;
  const updates = {};
  template.forEach(doc => {
    const key = db.ref(`transactions/${txnId}/documents`).push().key;
    updates[key] = {
      name: doc.name, category: doc.category, condition: doc.condition || '',
      status: 'not-started', fileUrl: '', signatureRequestId: '', signatureStatus: '',
      auditTrail: [{ action: 'created', timestamp: Date.now(), userId: currentUser.uid, userName: currentUser.name, details: 'Document placeholder created' }],
      uploadedAt: null, uploadedBy: null, verifiedAt: null, verifiedBy: null, notes: ''
    };
  });
  db.ref(`transactions/${txnId}/documents`).update(updates).then(() => {
    toast(`${template.length} documents created`);
    openTransactionDetail(txnId); // refresh
  });
}

function setDocStatus(txnId, docId, status) {
  const updates = { status };
  if (status === 'verified') { updates.verifiedAt = Date.now(); updates.verifiedBy = currentUser.uid; }
  if (status === 'uploaded') { updates.uploadedAt = Date.now(); updates.uploadedBy = currentUser.uid; }
  db.ref(`transactions/${txnId}/documents/${docId}`).update(updates);
  // Audit trail
  db.ref(`transactions/${txnId}/documents/${docId}/auditTrail`).push({
    action: status, timestamp: Date.now(), userId: currentUser.uid, userName: currentUser.name,
    details: `Status changed to ${status}`
  });
  // Notify doc status change
  const docName = txnCache[txnId]?.documents?.[docId]?.name || 'Document';
  const addr = txnCache[txnId]?.property?.address || '';
  if (status === 'uploaded' || status === 'signed' || status === 'verified') {
    notifyDocUploaded(txnId, `${docName} (${status})`, addr);
  }
  toast(`Document marked as ${status}`);
  setTimeout(() => openTransactionDetail(txnId), 300);
}

function setupDocActions() {} // Actions are inline onclick

// ══════════════════════════════════════
// TASK ACTIONS
// ══════════════════════════════════════
function showAddTaskForm(txnId) {
  const el = document.getElementById(`add-task-form-${txnId}`);
  el.classList.toggle('hidden');
  if (!el.classList.contains('hidden')) {
    el.innerHTML = `
      <div class="inline-form">
        <input type="text" id="new-task-title-${txnId}" placeholder="Task title" class="form-input">
        <select id="new-task-assignee-${txnId}" class="form-select">
          <option value="ryan-001">Ryan</option>
          <option value="ally-001">Ally</option>
        </select>
        <input type="date" id="new-task-due-${txnId}" class="form-input">
        <select id="new-task-priority-${txnId}" class="form-select">
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
          <option value="low">Low</option>
        </select>
        <button class="btn-sm btn-primary" onclick="addTask('${txnId}')">Add</button>
      </div>
    `;
  }
}

function addTask(txnId) {
  const title = document.getElementById(`new-task-title-${txnId}`).value.trim();
  if (!title) return;
  const assignee = document.getElementById(`new-task-assignee-${txnId}`).value;
  db.ref(`transactions/${txnId}/tasks`).push({
    title,
    assignedTo: assignee,
    dueDate: document.getElementById(`new-task-due-${txnId}`).value,
    priority: document.getElementById(`new-task-priority-${txnId}`).value,
    status: 'pending', category: 'general', createdAt: Date.now(), createdBy: currentUser.uid
  });
  notifyTaskAssigned(txnId, title, assignee);
  toast('Task added');
  setTimeout(() => openTransactionDetail(txnId), 300);
}

function completeTask(txnId, taskId) {
  db.ref(`transactions/${txnId}/tasks/${taskId}`).update({
    status: 'complete', completedAt: Date.now(), completedBy: currentUser.uid
  });
  logActivity('task-completed', 'Task completed', txnCache[txnId]?.property?.address || '', currentUser.uid);
  toast('Task completed');
  setTimeout(() => openTransactionDetail(txnId), 300);
}

function setupTaskActions() {}

// ══════════════════════════════════════
// EXPENSE ACTIONS
// ══════════════════════════════════════
function showAddExpenseForm(txnId) {
  const el = document.getElementById(`add-expense-form-${txnId}`);
  el.classList.toggle('hidden');
  if (!el.classList.contains('hidden')) {
    el.innerHTML = `
      <div class="inline-form">
        <select id="new-exp-cat-${txnId}" class="form-select">${EXPENSE_CATS.map(c => `<option value="${c.id}">${c.icon} ${c.label}</option>`).join('')}</select>
        <input type="text" id="new-exp-desc-${txnId}" placeholder="Description" class="form-input">
        <input type="number" id="new-exp-amt-${txnId}" placeholder="Amount" class="form-input" style="width:100px">
        <button class="btn-sm btn-primary" onclick="addExpense('${txnId}')">Add</button>
      </div>
    `;
  }
}

function addExpense(txnId) {
  const cat = document.getElementById(`new-exp-cat-${txnId}`).value;
  const desc = document.getElementById(`new-exp-desc-${txnId}`).value;
  const amt = parseFloat(document.getElementById(`new-exp-amt-${txnId}`).value) || 0;
  if (!amt) return;
  db.ref(`transactions/${txnId}/financials/expenses`).push({
    category: cat, description: desc, amount: amt, date: localDateStr(),
    paid: false, createdAt: Date.now(), createdBy: currentUser.uid
  });
  // Recalc total
  const txn = txnCache[txnId];
  const exps = txn?.financials?.expenses ? Object.values(txn.financials.expenses) : [];
  const total = exps.reduce((s, e) => s + (e.amount || 0), 0) + amt;
  db.ref(`transactions/${txnId}/financials/totalExpenses`).set(total);
  db.ref(`transactions/${txnId}/financials/netProfit`).set((txn?.financials?.commission?.netCommission || 0) - total);
  toast('Expense added');
  setTimeout(() => openTransactionDetail(txnId), 300);
}

function setupFinActions() {}

// ══════════════════════════════════════
// NOTES
// ══════════════════════════════════════
function addNote(txnId) {
  const text = document.getElementById(`note-text-${txnId}`).value.trim();
  if (!text) return;
  db.ref(`transactions/${txnId}/notes`).push({
    text, type: 'note', createdAt: Date.now(), createdBy: currentUser.uid
  });
  logActivity('note-added', 'Note added', txnCache[txnId]?.property?.address || '', currentUser.uid);
  toast('Note added');
  setTimeout(() => openTransactionDetail(txnId), 300);
}

function setupNoteActions() {}

// ══════════════════════════════════════
// NEW TRANSACTION
// ══════════════════════════════════════
document.addEventListener('click', e => {
  if (e.target.id === 'btn-new-listing') showNewTxnForm('listing');
  if (e.target.id === 'btn-new-buyer') showNewTxnForm('buyer');
});

function showNewTxnForm(type) {
  const contacts = Object.entries(contactCache).map(([id, c]) => `<option value="${id}">${c.firstName} ${c.lastName}</option>`).join('');
  openModal(`
    <button class="modal-close" onclick="closeModal()">×</button>
    <h2>New ${type === 'listing' ? 'Listing' : 'Buyer'} Transaction</h2>
    <form id="new-txn-form" class="form-stack">
      <div class="input-group"><label>Contact</label>
        <select id="txn-contact" class="form-select"><option value="">-- Select --</option>${contacts}<option value="new">+ New Contact</option></select>
      </div>
      <div class="input-group"><label>Property Address</label><input type="text" id="txn-address" required></div>
      <div class="form-row">
        <div class="input-group"><label>Price</label><input type="number" id="txn-price"></div>
        <div class="input-group"><label>MLS #</label><input type="text" id="txn-mls"></div>
      </div>
      <div class="form-row">
        <div class="input-group"><label>Beds</label><input type="number" id="txn-beds"></div>
        <div class="input-group"><label>Baths</label><input type="number" id="txn-baths"></div>
        <div class="input-group"><label>Sq Ft</label><input type="number" id="txn-sqft"></div>
      </div>
      <div class="input-group"><label>Commission %</label><input type="number" id="txn-commission" step="0.1" value="2.5"></div>
      <button type="submit" class="btn-primary btn-full">Create Transaction</button>
    </form>
  `);
  document.getElementById('new-txn-form').addEventListener('submit', e => {
    e.preventDefault();
    const contactId = document.getElementById('txn-contact').value;
    const price = parseFloat(document.getElementById('txn-price').value) || 0;
    const commission = parseFloat(document.getElementById('txn-commission').value) || 2.5;
    const gci = Math.round(price * commission / 100);
    const brokerAmt = Math.round(gci * 0.2);
    const agentAmt = gci - brokerAmt;

    const txnData = {
      type,
      contactId: contactId !== 'new' ? contactId : '',
      contactIds: contactId && contactId !== 'new' ? [contactId] : [],
      assignedTo: 'ryan-001',
      status: 'active',
      property: {
        address: document.getElementById('txn-address').value,
        mlsNumber: document.getElementById('txn-mls').value,
        price,
        listPrice: price,
        beds: parseInt(document.getElementById('txn-beds').value) || 0,
        baths: parseInt(document.getElementById('txn-baths').value) || 0,
        sqft: parseInt(document.getElementById('txn-sqft').value) || 0,
        propertyType: 'residential'
      },
      financials: {
        commission: {
          listPrice: price, salePrice: 0, commissionPct: commission, gci,
          splits: { brokerSplit: 20, brokerAmount: brokerAmt, agentSplit: 80, agentAmount: agentAmt, referralSplit: 0, referralAmount: 0 },
          netCommission: agentAmt
        },
        totalExpenses: 0, netProfit: agentAmt
      },
      createdAt: Date.now(), updatedAt: Date.now(), createdBy: currentUser.uid
    };

    if (type === 'listing') {
      txnData.listingPipeline = { stage: 'pre-list', stageHistory: [{ stage: 'pre-list', timestamp: Date.now(), changedBy: currentUser.uid }] };
    } else {
      txnData.buyerPipeline = { stage: 'lead', stageHistory: [{ stage: 'lead', timestamp: Date.now(), changedBy: currentUser.uid }] };
    }

    const newRef = db.ref('transactions').push();
    newRef.set(txnData).then(() => {
      toast('Transaction created');
      closeModal();
      // Auto-generate doc checklist
      generateDocChecklist(newRef.key);
    });
  });
}

// ══════════════════════════════════════
// CONTACTS (CRM)
// ══════════════════════════════════════
function renderContacts() {
  const tbody = document.getElementById('contacts-tbody');
  const empty = document.getElementById('contacts-empty');
  const search = (document.getElementById('contacts-search').value || '').toLowerCase();
  const typeFilter = document.getElementById('contacts-type-filter').value;
  const statusFilter = document.getElementById('contacts-status-filter').value;

  let entries = Object.entries(contactCache);
  if (search) entries = entries.filter(([, c]) => `${c.firstName} ${c.lastName} ${c.email} ${c.phone}`.toLowerCase().includes(search));
  if (typeFilter) entries = entries.filter(([, c]) => c.type === typeFilter);
  if (statusFilter) entries = entries.filter(([, c]) => c.status === statusFilter);

  entries.sort((a, b) => `${a[1].firstName} ${a[1].lastName}`.localeCompare(`${b[1].firstName} ${b[1].lastName}`));

  if (entries.length === 0) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    document.querySelector('#contacts-table').classList.add('hidden');
    return;
  }
  empty.classList.add('hidden');
  document.querySelector('#contacts-table').classList.remove('hidden');

  tbody.innerHTML = entries.map(([id, c]) => `
    <tr class="clickable-row" onclick="openContactDetail('${id}')">
      <td><strong>${c.firstName} ${c.lastName}</strong></td>
      <td><span class="tag tag-${c.type}">${c.type || '—'}</span></td>
      <td><span class="status-dot status-${c.status}"></span> ${c.status || '—'}</td>
      <td>${c.phone || '—'}</td>
      <td>${c.email || '—'}</td>
      <td>${c.source || '—'}</td>
      <td>${isRyan() ? `<button class="btn-xs btn-danger" onclick="event.stopPropagation();deleteContact('${id}')">×</button>` : ''}</td>
    </tr>
  `).join('');
}

// Contact filters
document.addEventListener('input', e => {
  if (['contacts-search','contacts-type-filter','contacts-status-filter'].includes(e.target.id)) renderContacts();
});
document.addEventListener('change', e => {
  if (['contacts-type-filter','contacts-status-filter'].includes(e.target.id)) renderContacts();
});

document.addEventListener('click', e => {
  if (e.target.id === 'btn-new-contact') showNewContactForm();
});

function showNewContactForm(prefill) {
  const p = prefill || {};
  openModal(`
    <button class="modal-close" onclick="closeModal()">×</button>
    <h2>${p.id ? 'Edit Contact' : 'New Contact'}</h2>
    <form id="contact-form" class="form-stack">
      <div class="form-row">
        <div class="input-group"><label>First Name</label><input type="text" id="ct-first" value="${p.firstName||''}" required></div>
        <div class="input-group"><label>Last Name</label><input type="text" id="ct-last" value="${p.lastName||''}" required></div>
      </div>
      <div class="form-row">
        <div class="input-group"><label>Email</label><input type="email" id="ct-email" value="${p.email||''}"></div>
        <div class="input-group"><label>Phone</label><input type="tel" id="ct-phone" value="${p.phone||''}"></div>
      </div>
      <div class="form-row">
        <div class="input-group"><label>Type</label>
          <select id="ct-type" class="form-select">${CONTACT_TYPES.map(t => `<option value="${t}" ${p.type===t?'selected':''}>${t}</option>`).join('')}</select>
        </div>
        <div class="input-group"><label>Status</label>
          <select id="ct-status" class="form-select">${CONTACT_STATUSES.map(s => `<option value="${s}" ${(p.status||'lead')===s?'selected':''}>${s}</option>`).join('')}</select>
        </div>
        <div class="input-group"><label>Source</label>
          <select id="ct-source" class="form-select">${CONTACT_SOURCES.map(s => `<option value="${s}" ${p.source===s?'selected':''}>${s}</option>`).join('')}</select>
        </div>
      </div>
      <div class="input-group"><label>Address</label><input type="text" id="ct-address" value="${p.address||''}"></div>
      <div class="input-group"><label>Notes</label><textarea id="ct-notes" rows="3">${p.notes||''}</textarea></div>
      <div class="form-row">
        <div class="input-group"><label>Pre-approval Amount</label><input type="number" id="ct-preapproval" value="${p.preapprovalAmount||''}"></div>
        <div class="input-group"><label>Price Min</label><input type="number" id="ct-pricemin" value="${p.priceMin||''}"></div>
        <div class="input-group"><label>Price Max</label><input type="number" id="ct-pricemax" value="${p.priceMax||''}"></div>
      </div>
      <button type="submit" class="btn-primary btn-full">${p.id ? 'Save Changes' : 'Create Contact'}</button>
    </form>
  `);
  document.getElementById('contact-form').addEventListener('submit', e => {
    e.preventDefault();
    const data = {
      firstName: document.getElementById('ct-first').value.trim(),
      lastName: document.getElementById('ct-last').value.trim(),
      email: document.getElementById('ct-email').value.trim(),
      phone: document.getElementById('ct-phone').value.trim(),
      type: document.getElementById('ct-type').value,
      status: document.getElementById('ct-status').value,
      source: document.getElementById('ct-source').value,
      address: document.getElementById('ct-address').value.trim(),
      notes: document.getElementById('ct-notes').value.trim(),
      preapprovalAmount: parseFloat(document.getElementById('ct-preapproval').value) || 0,
      priceMin: parseFloat(document.getElementById('ct-pricemin').value) || 0,
      priceMax: parseFloat(document.getElementById('ct-pricemax').value) || 0,
      updatedAt: Date.now()
    };
    if (p.id) {
      db.ref(`contacts/${p.id}`).update(data);
      toast('Contact updated');
    } else {
      data.createdAt = Date.now();
      data.createdBy = currentUser.uid;
      data.assignedTo = 'ryan-001';
      data.tags = [];
      data.portalEnabled = false;
      const newContactRef = db.ref('contacts').push(data);
      notifyContactAdded(newContactRef.key, `${data.firstName} ${data.lastName}`);
      toast('Contact created');
    }
    closeModal();
  });
}

function openContactDetail(contactId) {
  const c = contactCache[contactId];
  if (!c) return;
  // Find linked transactions
  const linkedTxns = Object.entries(txnCache).filter(([,t]) => t.contactId === contactId || (t.contactIds && t.contactIds.includes(contactId)));
  showNewContactForm({ ...c, id: contactId });
}

function deleteContact(id) {
  if (!isRyan()) return;
  if (!confirm('Delete this contact?')) return;
  db.ref(`contacts/${id}`).remove();
  toast('Contact deleted');
}

// ══════════════════════════════════════
// APPOINTMENTS
// ══════════════════════════════════════
function renderAppointments() {
  const list = document.getElementById('appointments-list');
  const entries = Object.entries(apptCache).sort((a, b) => (a[1].scheduledAt || a[1].date || 0) - (b[1].scheduledAt || b[1].date || 0));

  if (entries.length === 0) {
    list.innerHTML = '<p class="empty-msg">No appointments. Create one to get started.</p>';
    return;
  }

  list.innerHTML = entries.map(([id, a]) => {
    const d = new Date(a.scheduledAt || a.date);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const isPast = d < new Date();
    const prepTasks = a.allyPrep?.tasks || {};
    const prepDone = Object.values(prepTasks).filter(v => v === true).length;
    const prepTotal = Object.keys(prepTasks).length || 7;

    return `
      <div class="appt-card">
        <div class="appt-date-block">
          <span class="appt-date-month">${months[d.getMonth()]}</span>
          <span class="appt-date-day">${d.getDate()}</span>
        </div>
        <div class="appt-info">
          <h4>${a.address || 'TBD'}</h4>
          <p><span class="appt-time">${timeStr}</span> · ${a.contactName || a.client || '—'}</p>
          ${a.notes ? `<p class="appt-notes">${a.notes}</p>` : ''}
          <div class="prep-bar"><span>Ally Prep: ${prepDone}/${prepTotal}</span><div class="progress-bar sm"><div class="progress-fill" style="width:${prepTotal>0?Math.round(prepDone/prepTotal*100):0}%"></div></div></div>
        </div>
        <div class="appt-actions">
          <span class="appt-status ${a.status}">${a.status}</span>
          ${a.status === 'scheduled' && isRyan() ? `<button class="btn-xs" onclick="convertToListing('${id}')">Convert →</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

document.addEventListener('click', e => {
  if (e.target.id === 'btn-new-appt') showNewApptForm();
});

function showNewApptForm() {
  const contacts = Object.entries(contactCache).map(([id, c]) => `<option value="${id}">${c.firstName} ${c.lastName}</option>`).join('');
  openModal(`
    <button class="modal-close" onclick="closeModal()">×</button>
    <h2>New Listing Appointment</h2>
    <form id="appt-form" class="form-stack">
      <div class="input-group"><label>Contact</label>
        <select id="appt-contact" class="form-select"><option value="">-- Select --</option>${contacts}</select>
      </div>
      <div class="input-group"><label>Client Name</label><input type="text" id="appt-client" required></div>
      <div class="input-group"><label>Property Address</label><input type="text" id="appt-address" required></div>
      <div class="input-group"><label>Date & Time</label><input type="datetime-local" id="appt-datetime" required></div>
      <div class="input-group"><label>Notes</label><textarea id="appt-notes" rows="3"></textarea></div>
      <button type="submit" class="btn-primary btn-full">Create Appointment</button>
    </form>
  `);
  document.getElementById('appt-form').addEventListener('submit', e => {
    e.preventDefault();
    const dt = new Date(document.getElementById('appt-datetime').value);
    db.ref('listingAppointments').push({
      contactId: document.getElementById('appt-contact').value,
      contactName: document.getElementById('appt-client').value,
      address: document.getElementById('appt-address').value,
      scheduledAt: dt.getTime(),
      duration: 60,
      status: 'scheduled',
      notes: document.getElementById('appt-notes').value,
      allyPrep: {
        status: 'pending',
        tasks: { pullComps: false, pullTaxRecord: false, pullGIS: false, pullFloodMap: false, prepCMA: false, prepListingPacket: false, confirmAppointment: false }
      },
      createdAt: Date.now(), createdBy: currentUser.uid
    });
    toast('Appointment created');
    closeModal();
  });
}

function convertToListing(apptId) {
  const appt = apptCache[apptId];
  if (!appt) return;
  db.ref(`listingAppointments/${apptId}/status`).set('converted');
  // Create transaction
  showNewTxnForm('listing');
  // Pre-fill after modal opens
  setTimeout(() => {
    const addr = document.getElementById('txn-address');
    if (addr) addr.value = appt.address || '';
    if (appt.contactId) {
      const sel = document.getElementById('txn-contact');
      if (sel) sel.value = appt.contactId;
    }
  }, 100);
}

// ══════════════════════════════════════
// TASKS (Global View)
// ══════════════════════════════════════
function renderTasks() {
  const container = document.getElementById('tasks-sections');
  const assigneeFilter = document.getElementById('tasks-filter-assignee').value;
  const allTasks = [];

  Object.entries(getVisibleTxns()).forEach(([txnId, txn]) => {
    if (txn.tasks) {
      Object.entries(txn.tasks).forEach(([tid, task]) => {
        allTasks.push({ ...task, txnId, taskId: tid, address: txn.property?.address || 'Unknown' });
      });
    }
  });

  let filtered = allTasks;
  if (assigneeFilter) filtered = filtered.filter(t => t.assignedTo === assigneeFilter);

  const overdue = filtered.filter(t => t.status !== 'complete' && t.status !== 'skipped' && t.dueDate && new Date(t.dueDate) < new Date());
  const today = filtered.filter(t => t.status !== 'complete' && t.status !== 'skipped' && t.dueDate === localDateStr());
  const upcoming = filtered.filter(t => t.status !== 'complete' && t.status !== 'skipped' && t.dueDate && new Date(t.dueDate) >= new Date() && t.dueDate !== localDateStr());
  const noDue = filtered.filter(t => t.status !== 'complete' && t.status !== 'skipped' && !t.dueDate);
  const completed = filtered.filter(t => t.status === 'complete');

  upcoming.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  const renderSection = (label, icon, tasks, cls) => {
    if (tasks.length === 0) return '';
    return `
      <div class="task-section">
        <h4 class="section-label">${icon} ${label} (${tasks.length})</h4>
        ${tasks.map(t => `
          <div class="task-row ${cls || ''}">
            <button class="task-check" onclick="completeTask('${t.txnId}','${t.taskId}')">☐</button>
            <div class="task-info">
              <span class="task-title">${t.title}</span>
              <span class="task-meta">${t.address} · ${t.assignedTo === 'ally-001' ? 'Ally' : 'Ryan'} · ${t.dueDate || 'No date'} · <span class="priority-${t.priority}">${t.priority}</span></span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  };

  container.innerHTML = [
    renderSection('Overdue', '⚠️', overdue, 'overdue'),
    renderSection('Today', '📅', today),
    renderSection('Upcoming', '📋', upcoming),
    renderSection('No Due Date', '📌', noDue),
    completed.length > 0 ? `<details class="task-section"><summary class="section-label">✅ Completed (${completed.length})</summary>${completed.map(t => `<div class="task-row done"><span class="task-check-done">✓</span><div class="task-info"><span class="task-title">${t.title}</span><span class="task-meta">${t.address}</span></div></div>`).join('')}</details>` : ''
  ].join('');

  if (allTasks.length === 0) container.innerHTML = '<p class="empty-msg">No tasks yet. Tasks are auto-created when transactions move through the pipeline.</p>';
}

document.addEventListener('change', e => {
  if (e.target.id === 'tasks-filter-assignee') renderTasks();
});

document.addEventListener('click', e => {
  if (e.target.id === 'btn-new-task') showGlobalAddTaskForm();
});

function showGlobalAddTaskForm() {
  const txns = Object.entries(getVisibleTxns()).map(([id, t]) => `<option value="${id}">${t.property?.address || 'Unknown'}</option>`).join('');
  openModal(`
    <button class="modal-close" onclick="closeModal()">×</button>
    <h2>New Task</h2>
    <form id="global-task-form" class="form-stack">
      <div class="input-group"><label>Transaction</label><select id="gt-txn" class="form-select"><option value="">-- Select --</option>${txns}</select></div>
      <div class="input-group"><label>Title</label><input type="text" id="gt-title" required></div>
      <div class="form-row">
        <div class="input-group"><label>Assigned To</label><select id="gt-assignee" class="form-select"><option value="ryan-001">Ryan</option><option value="ally-001">Ally</option></select></div>
        <div class="input-group"><label>Due Date</label><input type="date" id="gt-due"></div>
        <div class="input-group"><label>Priority</label><select id="gt-priority" class="form-select"><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option><option value="low">Low</option></select></div>
      </div>
      <button type="submit" class="btn-primary btn-full">Create Task</button>
    </form>
  `);
  document.getElementById('global-task-form').addEventListener('submit', e => {
    e.preventDefault();
    const txnId = document.getElementById('gt-txn').value;
    if (!txnId) { toast('Select a transaction'); return; }
    db.ref(`transactions/${txnId}/tasks`).push({
      title: document.getElementById('gt-title').value.trim(),
      assignedTo: document.getElementById('gt-assignee').value,
      dueDate: document.getElementById('gt-due').value,
      priority: document.getElementById('gt-priority').value,
      status: 'pending', category: 'general', createdAt: Date.now(), createdBy: currentUser.uid
    });
    toast('Task created');
    closeModal();
    renderTasks();
  });
}

// ══════════════════════════════════════
// FINANCIALS (Global)
// ══════════════════════════════════════
function renderFinancials() {
  const period = document.getElementById('fin-period').value;
  const now = new Date();
  const txns = Object.entries(getVisibleTxns());

  let filtered = txns;
  // Filter by period
  if (period !== 'all') {
    filtered = txns.filter(([, t]) => {
      const stage = t.type === 'listing' ? t.listingPipeline?.stage : t.buyerPipeline?.stage;
      const closeDate = t.listingPipeline?.actualCloseDate || t.buyerPipeline?.actualCloseDate;
      if (stage === 'closed' && closeDate) {
        const d = new Date(closeDate);
        if (period === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        if (period === 'quarter') return Math.floor(d.getMonth() / 3) === Math.floor(now.getMonth() / 3) && d.getFullYear() === now.getFullYear();
        if (period === 'year') return d.getFullYear() === now.getFullYear();
      }
      return true; // include non-closed
    });
  }

  let totalGCI = 0, totalExp = 0, totalNet = 0, pendingGCI = 0, closedCount = 0;
  const rows = [];

  filtered.forEach(([txnId, t]) => {
    const fin = t.financials?.commission || {};
    const gci = fin.gci || 0;
    const expenses = t.financials?.expenses ? Object.values(t.financials.expenses).reduce((s, e) => s + (e.amount || 0), 0) : 0;
    const net = (fin.netCommission || 0) - expenses;
    const stage = t.type === 'listing' ? t.listingPipeline?.stage : t.buyerPipeline?.stage;
    const isClosed = stage === 'closed';

    if (isClosed) { totalGCI += gci; totalExp += expenses; totalNet += net; closedCount++; }
    else if (['under-contract','due-diligence','pending'].includes(stage)) { pendingGCI += gci; }

    if (gci > 0 || expenses > 0) {
      rows.push({ address: t.property?.address || 'Unknown', gci, expenses, net, status: isClosed ? '✅ Closed' : `⏳ ${stage}` });
    }
  });

  document.getElementById('fin-stats').innerHTML = `
    <div class="stat-card"><div class="stat-number">${formatPriceShort(totalGCI)}</div><div class="stat-label">GCI (Closed)</div></div>
    <div class="stat-card"><div class="stat-number">${formatPriceShort(totalExp)}</div><div class="stat-label">Total Expenses</div></div>
    <div class="stat-card"><div class="stat-number">${formatPriceShort(totalNet)}</div><div class="stat-label">Net Profit</div></div>
    <div class="stat-card accent"><div class="stat-number">${formatPriceShort(pendingGCI)}</div><div class="stat-label">Pending GCI</div></div>
  `;

  document.getElementById('fin-deals-tbody').innerHTML = rows.map(r => `
    <tr>
      <td>${r.address}</td>
      <td>${formatPrice(r.gci)}</td>
      <td>${formatPrice(r.expenses)}</td>
      <td>${formatPrice(r.net)}</td>
      <td>${r.status}</td>
    </tr>
  `).join('') || '<tr><td colspan="5" class="empty-msg">No financial data yet.</td></tr>';
}

document.addEventListener('change', e => {
  if (e.target.id === 'fin-period') renderFinancials();
});

// ══════════════════════════════════════
// SHOWINGS
// ══════════════════════════════════════
function renderShowings() {
  const container = document.getElementById('showings-by-listing');
  const summaryEl = document.getElementById('showings-summary');
  let totalShowings = 0, totalFeedback = 0;
  const byListing = [];

  Object.entries(getVisibleTxns()).forEach(([txnId, txn]) => {
    if (txn.type !== 'listing' || !txn.showings) return;
    const showings = Object.values(txn.showings);
    const fb = showings.filter(s => s.feedback?.received);
    totalShowings += showings.length;
    totalFeedback += fb.length;
    byListing.push({
      address: txn.property?.address || 'Unknown',
      total: showings.length,
      fbRate: showings.length > 0 ? Math.round(fb.length / showings.length * 100) : 0,
      interest: showings.reduce((acc, s) => {
        const lvl = s.feedback?.interestLevel || 'no-feedback';
        acc[lvl] = (acc[lvl] || 0) + 1;
        return acc;
      }, {}),
      txnId
    });
  });

  summaryEl.innerHTML = `
    <div class="stat-card"><div class="stat-number">${totalShowings}</div><div class="stat-label">Total Showings</div></div>
    <div class="stat-card"><div class="stat-number">${totalFeedback}</div><div class="stat-label">Feedback Received</div></div>
    <div class="stat-card"><div class="stat-number">${totalShowings > 0 ? Math.round(totalFeedback / totalShowings * 100) : 0}%</div><div class="stat-label">Feedback Rate</div></div>
    <div class="stat-card"><div class="stat-number">${byListing.length}</div><div class="stat-label">Active Listings</div></div>
  `;

  if (byListing.length === 0) {
    container.innerHTML = '<p class="empty-msg">No showing data yet. Showings appear here when added to listing transactions.</p>';
    return;
  }

  container.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Listing</th><th>Total</th><th>Feedback Rate</th><th>Interest Breakdown</th><th></th></tr></thead>
      <tbody>
        ${byListing.map(l => `
          <tr class="clickable-row" onclick="openTransactionDetail('${l.txnId}')">
            <td><strong>${l.address}</strong></td>
            <td>${l.total}</td>
            <td>${l.fbRate}%</td>
            <td>
              ${l.interest['very-interested'] ? `🟢${l.interest['very-interested']} ` : ''}
              ${l.interest['interested'] ? `🔵${l.interest['interested']} ` : ''}
              ${l.interest['somewhat-interested'] ? `🟡${l.interest['somewhat-interested']} ` : ''}
              ${l.interest['not-interested'] ? `🔴${l.interest['not-interested']}` : ''}
            </td>
            <td>→</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

document.addEventListener('click', e => {
  if (e.target.id === 'btn-add-showing') showAddShowingForm();
});

function showAddShowingForm() {
  const listings = Object.entries(getVisibleTxns()).filter(([,t]) => t.type === 'listing').map(([id, t]) => `<option value="${id}">${t.property?.address || 'Unknown'}</option>`).join('');
  openModal(`
    <button class="modal-close" onclick="closeModal()">×</button>
    <h2>Add Showing</h2>
    <form id="showing-form" class="form-stack">
      <div class="input-group"><label>Listing</label><select id="sh-txn" class="form-select" required>${listings}</select></div>
      <div class="form-row">
        <div class="input-group"><label>Date</label><input type="date" id="sh-date" required></div>
        <div class="input-group"><label>Time</label><input type="time" id="sh-time" required></div>
      </div>
      <div class="input-group"><label>Buyer Agent Name</label><input type="text" id="sh-agent" required></div>
      <div class="form-row">
        <div class="input-group"><label>Brokerage</label><input type="text" id="sh-brokerage"></div>
        <div class="input-group"><label>Phone</label><input type="tel" id="sh-phone"></div>
      </div>
      <div class="input-group"><label>Interest Level</label>
        <select id="sh-interest" class="form-select">
          <option value="no-feedback">No Feedback Yet</option>
          <option value="very-interested">Very Interested</option>
          <option value="interested">Interested</option>
          <option value="somewhat-interested">Somewhat Interested</option>
          <option value="not-interested">Not Interested</option>
        </select>
      </div>
      <div class="input-group"><label>Feedback Comments</label><textarea id="sh-comments" rows="2"></textarea></div>
      <button type="submit" class="btn-primary btn-full">Add Showing</button>
    </form>
  `);
  document.getElementById('showing-form').addEventListener('submit', e => {
    e.preventDefault();
    const txnId = document.getElementById('sh-txn').value;
    const interest = document.getElementById('sh-interest').value;
    db.ref(`transactions/${txnId}/showings`).push({
      date: document.getElementById('sh-date').value,
      time: document.getElementById('sh-time').value,
      startTime: new Date(`${document.getElementById('sh-date').value}T${document.getElementById('sh-time').value}`).getTime(),
      buyerAgentName: document.getElementById('sh-agent').value,
      buyerAgentPhone: document.getElementById('sh-phone').value,
      buyerAgentBrokerage: document.getElementById('sh-brokerage').value,
      status: 'completed',
      feedback: {
        received: interest !== 'no-feedback',
        interestLevel: interest,
        comments: document.getElementById('sh-comments').value
      },
      source: 'manual', createdAt: Date.now(), createdBy: currentUser.uid
    });
    const showAddr = txnCache[txnId]?.property?.address || 'Unknown';
    notifyShowingEvent(txnId, showAddr, 'recorded');
    toast('Showing added');
    closeModal();
    renderShowings();
  });
}

// ══════════════════════════════════════
// VENDORS
// ══════════════════════════════════════
function renderVendors() {
  const grid = document.getElementById('vendors-grid');
  const search = (document.getElementById('vendors-search').value || '').toLowerCase();
  const catFilter = document.getElementById('vendors-cat-filter').value;

  let entries = Object.entries(vendorCache);
  if (search) entries = entries.filter(([,v]) => `${v.name} ${v.company} ${v.specialty}`.toLowerCase().includes(search));
  if (catFilter) entries = entries.filter(([,v]) => v.category === catFilter);

  if (entries.length === 0) {
    grid.innerHTML = '<p class="empty-msg">No vendors yet. Add your first vendor.</p>';
    return;
  }

  // Group by category
  const grouped = {};
  entries.forEach(([id, v]) => {
    const cat = v.category || 'other';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push([id, v]);
  });

  grid.innerHTML = Object.entries(grouped).map(([cat, vendors]) => {
    const catObj = VENDOR_CATS.find(c => c.id === cat);
    return `
      <div class="vendor-category">
        <h4>${catObj ? catObj.label : cat}</h4>
        <div class="vendor-cards">
          ${vendors.map(([id, v]) => `
            <div class="vendor-card" onclick="openVendorDetail('${id}')">
              <div class="vendor-name">${v.name}</div>
              ${v.company ? `<div class="vendor-company">${v.company}</div>` : ''}
              <div class="vendor-meta">
                ${v.phone ? `<span>📞 ${v.phone}</span>` : ''}
                ${v.email ? `<span>✉️ ${v.email}</span>` : ''}
              </div>
              <div class="vendor-rating">${'⭐'.repeat(v.rating || 0)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}

document.addEventListener('input', e => { if (e.target.id === 'vendors-search') renderVendors(); });
document.addEventListener('change', e => { if (e.target.id === 'vendors-cat-filter') renderVendors(); });

document.addEventListener('click', e => {
  if (e.target.id === 'btn-new-vendor') showVendorForm();
});

function showVendorForm(prefill) {
  const p = prefill || {};
  openModal(`
    <button class="modal-close" onclick="closeModal()">×</button>
    <h2>${p.id ? 'Edit Vendor' : 'New Vendor'}</h2>
    <form id="vendor-form" class="form-stack">
      <div class="form-row">
        <div class="input-group"><label>Name</label><input type="text" id="vd-name" value="${p.name||''}" required></div>
        <div class="input-group"><label>Company</label><input type="text" id="vd-company" value="${p.company||''}"></div>
      </div>
      <div class="form-row">
        <div class="input-group"><label>Phone</label><input type="tel" id="vd-phone" value="${p.phone||''}"></div>
        <div class="input-group"><label>Email</label><input type="email" id="vd-email" value="${p.email||''}"></div>
      </div>
      <div class="form-row">
        <div class="input-group"><label>Category</label>
          <select id="vd-cat" class="form-select">${VENDOR_CATS.map(c => `<option value="${c.id}" ${p.category===c.id?'selected':''}>${c.label}</option>`).join('')}</select>
        </div>
        <div class="input-group"><label>Rating (1-5)</label><input type="number" id="vd-rating" min="1" max="5" value="${p.rating||5}"></div>
      </div>
      <div class="input-group"><label>Specialty</label><input type="text" id="vd-specialty" value="${p.specialty||''}"></div>
      <div class="input-group"><label>Notes</label><textarea id="vd-notes" rows="2">${p.notes||''}</textarea></div>
      <button type="submit" class="btn-primary btn-full">${p.id ? 'Save' : 'Add Vendor'}</button>
      ${p.id && isRyan() ? `<button type="button" class="btn-outline btn-full btn-danger-text" onclick="deleteVendor('${p.id}')">Delete Vendor</button>` : ''}
    </form>
  `);
  document.getElementById('vendor-form').addEventListener('submit', e => {
    e.preventDefault();
    const data = {
      name: document.getElementById('vd-name').value.trim(),
      company: document.getElementById('vd-company').value.trim(),
      phone: document.getElementById('vd-phone').value.trim(),
      email: document.getElementById('vd-email').value.trim(),
      category: document.getElementById('vd-cat').value,
      rating: parseInt(document.getElementById('vd-rating').value) || 5,
      specialty: document.getElementById('vd-specialty').value.trim(),
      notes: document.getElementById('vd-notes').value.trim(),
      active: true
    };
    if (p.id) {
      db.ref(`vendors/${p.id}`).update(data);
      toast('Vendor updated');
    } else {
      data.createdAt = Date.now();
      data.createdBy = currentUser.uid;
      db.ref('vendors').push(data);
      toast('Vendor added');
    }
    closeModal();
  });
}

function openVendorDetail(id) {
  const v = vendorCache[id];
  if (v) showVendorForm({ ...v, id });
}

function deleteVendor(id) {
  if (!isRyan() || !confirm('Delete this vendor?')) return;
  db.ref(`vendors/${id}`).remove();
  toast('Vendor deleted');
  closeModal();
}

// ══════════════════════════════════════
// CALENDAR MODULE
// ══════════════════════════════════════

function buildCalendarEvents() {
  const events = [];
  const visible = getVisibleTxns();

  Object.entries(visible).forEach(([txnId, txn]) => {
    const addr = txn.property?.address || 'Unknown';
    const pipeline = txn.type === 'listing' ? txn.listingPipeline : txn.buyerPipeline;
    if (!pipeline) return;

    // DD Deadline
    if (pipeline.ddEndDate) {
      events.push({ date: pipeline.ddEndDate, title: `DD Deadline — ${addr}`, type: 'dd', txnId, allDay: true });
    }
    // DD Start
    if (pipeline.ddStartDate) {
      events.push({ date: pipeline.ddStartDate, title: `DD Start — ${addr}`, type: 'dd', txnId, allDay: true });
    }
    // Closing Date
    if (pipeline.closingDate) {
      events.push({ date: pipeline.closingDate, title: `Closing — ${addr}`, type: 'closing', txnId, allDay: true });
    }
    // List Date
    if (pipeline.listDate) {
      events.push({ date: pipeline.listDate, title: `List Date — ${addr}`, type: 'other', txnId, allDay: true });
    }
    // Contract Date
    if (pipeline.contractDate) {
      events.push({ date: pipeline.contractDate, title: `Contract Date — ${addr}`, type: 'other', txnId, allDay: true });
    }
    // List Expiration
    if (pipeline.listExpiration) {
      events.push({ date: pipeline.listExpiration, title: `List Expiration — ${addr}`, type: 'dd', txnId, allDay: true });
    }

    // Tasks with due dates
    if (txn.tasks) {
      Object.entries(txn.tasks).forEach(([, task]) => {
        if (task.dueDate && task.status !== 'complete' && task.status !== 'skipped') {
          let type = 'other';
          if (task.category === 'inspection' || task.title.toLowerCase().includes('inspection')) type = 'inspection';
          else if (task.category === 'appraisal' || task.title.toLowerCase().includes('appraisal')) type = 'appraisal';
          events.push({ date: task.dueDate, title: `${task.title} — ${addr}`, type, txnId, allDay: true, isTask: true });
        }
      });
    }

    // Showings
    if (txn.showings) {
      Object.entries(txn.showings).forEach(([, showing]) => {
        if (showing.date) {
          events.push({ date: showing.date, title: `Showing — ${addr} (${showing.buyerAgentName || '?'})`, type: 'other', txnId, time: showing.time });
        }
      });
    }
  });

  // Listing Appointments
  Object.entries(apptCache).forEach(([apptId, appt]) => {
    if (appt.scheduledAt) {
      const d = new Date(appt.scheduledAt);
      events.push({
        date: localDateStr(d),
        title: `Listing Appt — ${appt.address || 'TBD'} (${appt.contactName || appt.client || ''})`,
        type: 'appointment',
        time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        apptId
      });
    }
  });

  // Calendar events from Firebase (/calendarEvents)
  Object.entries(calEventCache).forEach(([id, evt]) => {
    events.push({ ...evt, calEventId: id });
  });

  return events;
}

function renderCalendar() {
  const mode = calViewMode;
  const grid = document.getElementById('calendar-grid');
  const list = document.getElementById('calendar-list');

  // Update label
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('cal-month-label').textContent = `${months[calMonth]} ${calYear}`;

  const events = buildCalendarEvents();

  if (mode === 'list') {
    grid.classList.add('hidden');
    list.classList.remove('hidden');
    renderCalendarList(list, events);
  } else if (mode === 'week') {
    list.classList.add('hidden');
    grid.classList.remove('hidden');
    grid.classList.add('week-view');
    renderCalendarWeek(grid, events);
  } else {
    list.classList.add('hidden');
    grid.classList.remove('hidden');
    grid.classList.remove('week-view');
    renderCalendarMonth(grid, events);
  }
}

function renderCalendarMonth(grid, events) {
  const firstDay = new Date(calYear, calMonth, 1);
  const lastDay = new Date(calYear, calMonth + 1, 0);
  const startDow = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const today = localDateStr();

  // Previous month filler
  const prevMonthLast = new Date(calYear, calMonth, 0).getDate();

  let html = '';
  // Header row
  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d => {
    html += `<div class="cal-header-cell">${d}</div>`;
  });

  // Group events by date
  const eventsByDate = {};
  events.forEach(e => {
    if (!eventsByDate[e.date]) eventsByDate[e.date] = [];
    eventsByDate[e.date].push(e);
  });

  // Calendar cells
  let dayNum = 1;
  let nextMonthDay = 1;
  const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;

  for (let i = 0; i < totalCells; i++) {
    let dateStr, num, outside = false;

    if (i < startDow) {
      // Previous month
      num = prevMonthLast - startDow + i + 1;
      const pm = calMonth === 0 ? 11 : calMonth - 1;
      const py = calMonth === 0 ? calYear - 1 : calYear;
      dateStr = `${py}-${String(pm + 1).padStart(2, '0')}-${String(num).padStart(2, '0')}`;
      outside = true;
    } else if (dayNum > daysInMonth) {
      // Next month
      num = nextMonthDay++;
      const nm = calMonth === 11 ? 0 : calMonth + 1;
      const ny = calMonth === 11 ? calYear + 1 : calYear;
      dateStr = `${ny}-${String(nm + 1).padStart(2, '0')}-${String(num).padStart(2, '0')}`;
      outside = true;
    } else {
      num = dayNum++;
      dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(num).padStart(2, '0')}`;
    }

    const isToday = dateStr === today;
    const dayEvents = eventsByDate[dateStr] || [];
    const maxShow = 3;

    html += `<div class="cal-day${outside ? ' outside' : ''}${isToday ? ' today' : ''}" data-date="${dateStr}">
      <span class="cal-day-num">${num}</span>
      ${dayEvents.slice(0, maxShow).map(e => `<span class="cal-event type-${e.type}" title="${e.title}${e.time ? ' @ ' + e.time : ''}" onclick="event.stopPropagation();${e.txnId ? `openTransactionDetail('${e.txnId}')` : ''}">${e.time ? e.time + ' ' : ''}${e.title.split('—')[0].trim()}</span>`).join('')}
      ${dayEvents.length > maxShow ? `<span class="cal-more">+${dayEvents.length - maxShow} more</span>` : ''}
    </div>`;
  }

  grid.innerHTML = html;

  // Click day to add event
  grid.querySelectorAll('.cal-day').forEach(cell => {
    cell.addEventListener('click', () => {
      const date = cell.dataset.date;
      showNewCalEventForm(date);
    });
  });
}

function renderCalendarWeek(grid, events) {
  // Show current week (Mon-Sun) of calYear/calMonth
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());

  const eventsByDate = {};
  events.forEach(e => {
    if (!eventsByDate[e.date]) eventsByDate[e.date] = [];
    eventsByDate[e.date].push(e);
  });

  let html = '';
  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d => {
    html += `<div class="cal-header-cell">${d}</div>`;
  });

  const todayStr = localDateStr(today);

  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    const dateStr = localDateStr(d);
    const isToday = dateStr === todayStr;
    const dayEvents = eventsByDate[dateStr] || [];

    html += `<div class="cal-day${isToday ? ' today' : ''}" data-date="${dateStr}">
      <span class="cal-day-num">${d.getDate()}</span>
      ${dayEvents.map(e => `<span class="cal-event type-${e.type}" title="${e.title}" onclick="event.stopPropagation();${e.txnId ? `openTransactionDetail('${e.txnId}')` : ''}">${e.time ? e.time + ' ' : ''}${e.title}</span>`).join('')}
    </div>`;
  }

  grid.innerHTML = html;
}

function renderCalendarList(container, events) {
  const now = localDateStr();
  const upcoming = events
    .filter(e => e.date >= now)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 30);

  if (upcoming.length === 0) {
    container.innerHTML = '<p class="empty-msg">No upcoming events</p>';
    return;
  }

  const colorMap = { dd: '#a0342e', closing: '#2d6a4f', inspection: '#3a6ea5', appraisal: '#6b4c9a', appointment: '#b8860b', other: '#9a9590' };
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  container.innerHTML = upcoming.map(e => {
    const d = new Date(e.date + 'T12:00:00');
    return `
      <div class="cal-list-item" onclick="${e.txnId ? `openTransactionDetail('${e.txnId}')` : ''}">
        <span class="cal-list-dot" style="background:${colorMap[e.type] || '#9a9590'}"></span>
        <span class="cal-list-date">${months[d.getMonth()]} ${d.getDate()}</span>
        <span class="cal-list-title">${e.title}</span>
        ${e.time ? `<span class="cal-list-address">${e.time}</span>` : ''}
      </div>
    `;
  }).join('');
}

// Calendar navigation
document.addEventListener('click', e => {
  if (e.target.id === 'cal-prev') {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    renderCalendar();
  }
  if (e.target.id === 'cal-next') {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    renderCalendar();
  }
  if (e.target.id === 'cal-today') {
    calYear = new Date().getFullYear();
    calMonth = new Date().getMonth();
    renderCalendar();
  }
  if (e.target.id === 'btn-new-cal-event') {
    showNewCalEventForm(localDateStr());
  }
});

document.addEventListener('change', e => {
  if (e.target.id === 'cal-view-mode') {
    calViewMode = e.target.value;
    renderCalendar();
  }
});

function showNewCalEventForm(prefillDate) {
  const txns = Object.entries(getVisibleTxns()).map(([id, t]) => `<option value="${id}">${t.property?.address || 'Unknown'}</option>`).join('');
  openModal(`
    <button class="modal-close" onclick="closeModal()">×</button>
    <h2>New Calendar Event</h2>
    <form id="cal-event-form" class="form-stack">
      <div class="input-group"><label>Title</label><input type="text" id="ce-title" required placeholder="e.g. DD Deadline, Inspection, Closing"></div>
      <div class="form-row">
        <div class="input-group"><label>Date</label><input type="date" id="ce-date" value="${prefillDate || ''}" required></div>
        <div class="input-group"><label>Time (optional)</label><input type="time" id="ce-time"></div>
      </div>
      <div class="form-row">
        <div class="input-group"><label>Type</label>
          <select id="ce-type" class="form-select">
            <option value="dd">DD Deadline</option>
            <option value="closing">Closing</option>
            <option value="inspection">Inspection</option>
            <option value="appraisal">Appraisal</option>
            <option value="appointment">Appointment</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div class="input-group"><label>Transaction (optional)</label>
          <select id="ce-txn" class="form-select"><option value="">-- None --</option>${txns}</select>
        </div>
      </div>
      <div class="input-group"><label>Notes</label><textarea id="ce-notes" rows="2"></textarea></div>
      <button type="submit" class="btn-primary btn-full">Create Event</button>
    </form>
  `);
  document.getElementById('cal-event-form').addEventListener('submit', e => {
    e.preventDefault();
    const txnId = document.getElementById('ce-txn').value;
    const addr = txnId && txnCache[txnId] ? txnCache[txnId].property?.address : '';
    const title = document.getElementById('ce-title').value.trim();
    const evtData = {
      title: addr ? `${title} — ${addr}` : title,
      date: document.getElementById('ce-date').value,
      time: document.getElementById('ce-time').value || '',
      type: document.getElementById('ce-type').value,
      txnId: txnId || '',
      notes: document.getElementById('ce-notes').value.trim(),
      allDay: !document.getElementById('ce-time').value,
      createdAt: Date.now(),
      createdBy: currentUser.uid
    };
    db.ref('calendarEvents').push(evtData);
    toast('Event created');
    closeModal();
    renderCalendar();
  });
}

// Auto-create calendar events on stage changes
function createCalendarEventsForStage(txnId, newStage, type) {
  const txn = txnCache[txnId];
  if (!txn) return;
  const addr = txn.property?.address || 'Unknown';
  const pipeline = type === 'listing' ? txn.listingPipeline : txn.buyerPipeline;

  // When entering under-contract: create DD deadline + closing events
  if (newStage === 'under-contract' || newStage === 'due-diligence') {
    if (pipeline?.ddEndDate) {
      db.ref('calendarEvents').push({
        title: `DD Deadline — ${addr}`, date: pipeline.ddEndDate, type: 'dd',
        txnId, allDay: true, autoCreated: true, createdAt: Date.now(), createdBy: 'system'
      });
      // Reminder 3 days before
      const remind = new Date(pipeline.ddEndDate);
      remind.setDate(remind.getDate() - 3);
      db.ref('calendarEvents').push({
        title: `DD Deadline in 3 Days — ${addr}`, date: localDateStr(remind), type: 'dd',
        txnId, allDay: true, autoCreated: true, createdAt: Date.now(), createdBy: 'system'
      });
    }
    if (pipeline?.closingDate) {
      db.ref('calendarEvents').push({
        title: `Closing — ${addr}`, date: pipeline.closingDate, type: 'closing',
        txnId, allDay: true, autoCreated: true, createdAt: Date.now(), createdBy: 'system'
      });
      // Reminder 7 days before
      const remind = new Date(pipeline.closingDate);
      remind.setDate(remind.getDate() - 7);
      db.ref('calendarEvents').push({
        title: `Closing in 1 Week — ${addr}`, date: localDateStr(remind), type: 'closing',
        txnId, allDay: true, autoCreated: true, createdAt: Date.now(), createdBy: 'system'
      });
    }
  }
}

// ══════════════════════════════════════
// AUTOMATIONS
// ══════════════════════════════════════
function runAutomations(txnId, newStage, type) {
  const txn = txnCache[txnId];
  if (!txn) return;
  const addr = txn.property?.address || 'Unknown';
  const tasksRef = db.ref(`transactions/${txnId}/tasks`);

  if (type === 'listing') {
    if (newStage === 'listed') {
      createAutoTask(tasksRef, 'Upload to MLS', 'ryan-001', 0, 'high');
      createAutoTask(tasksRef, 'Schedule photography', 'ally-001', 1, 'high');
      createAutoTask(tasksRef, 'Schedule video walkthrough', 'ally-001', 2, 'medium');
      createAutoTask(tasksRef, 'Order sign', 'ally-001', 1, 'medium');
      createAutoTask(tasksRef, 'Send listing live email to seller', 'ryan-001', 0, 'high');
    } else if (newStage === 'under-contract') {
      createAutoTask(tasksRef, 'Change MLS status to Under Contract', 'ally-001', 0, 'high');
      createAutoTask(tasksRef, 'Send UC confirmation email to seller', 'ryan-001', 0, 'high');
      createAutoTask(tasksRef, 'Verify earnest money & DD fee received', 'ally-001', 1, 'high');
      createAutoTask(tasksRef, 'Send contract to attorney', 'ally-001', 1, 'high');
      createAutoTask(tasksRef, 'Log commission details in financials', 'ally-001', 2, 'medium');
    } else if (newStage === 'due-diligence') {
      createAutoTask(tasksRef, 'Schedule home inspection', 'ally-001', 2, 'high');
      createAutoTask(tasksRef, 'Coordinate appraisal access', 'ally-001', 5, 'high');
      createAutoTask(tasksRef, 'Follow up on inspection results', 'ryan-001', 7, 'medium');
    } else if (newStage === 'pending') {
      createAutoTask(tasksRef, 'Confirm appraisal received', 'ally-001', 2, 'high');
      createAutoTask(tasksRef, 'Verify all docs complete', 'ally-001', 3, 'high');
      createAutoTask(tasksRef, 'Schedule final walkthrough', 'ally-001', -2, 'high');
    } else if (newStage === 'closed') {
      createAutoTask(tasksRef, 'Update MLS to Closed', 'ally-001', 0, 'high');
      createAutoTask(tasksRef, 'Send closing congratulations email', 'ryan-001', 0, 'medium');
      createAutoTask(tasksRef, 'Request review/testimonial', 'ryan-001', 7, 'medium');
      createAutoTask(tasksRef, 'Archive transaction documents', 'ally-001', 3, 'medium');
      createAutoTask(tasksRef, 'Finalize financials — verify commission received', 'ally-001', 2, 'high');
    }
  } else if (type === 'buyer') {
    if (newStage === 'hot-lead') {
      createAutoTask(tasksRef, 'Send pre-approval resources', 'ryan-001', 0, 'medium');
      createAutoTask(tasksRef, 'Set up property search alerts', 'ally-001', 1, 'medium');
    } else if (newStage === 'active-buyer') {
      createAutoTask(tasksRef, 'Execute buyer agency agreement', 'ryan-001', 0, 'high');
      createAutoTask(tasksRef, 'Send WWREA disclosure', 'ryan-001', 0, 'high');
    } else if (newStage === 'under-contract') {
      createAutoTask(tasksRef, 'Verify earnest money delivery', 'ally-001', 1, 'high');
      createAutoTask(tasksRef, 'Verify DD fee delivery', 'ally-001', 1, 'high');
      createAutoTask(tasksRef, 'Send contract to buyer\'s attorney', 'ally-001', 1, 'high');
      createAutoTask(tasksRef, 'Schedule home inspection', 'ally-001', 3, 'high');
      createAutoTask(tasksRef, 'Change MLS to Under Contract', 'ally-001', 0, 'high');
    } else if (newStage === 'closed') {
      createAutoTask(tasksRef, 'Confirm clear to close', 'ally-001', 0, 'high');
      createAutoTask(tasksRef, 'Send congratulations + review request', 'ryan-001', 7, 'medium');
      createAutoTask(tasksRef, 'Update MLS to Closed', 'ally-001', 0, 'high');
      createAutoTask(tasksRef, 'Finalize financials — verify commission received', 'ally-001', 2, 'high');
    }
  }
}

function createAutoTask(ref, title, assignedTo, dueDaysOffset, priority) {
  const due = new Date();
  due.setDate(due.getDate() + dueDaysOffset);
  ref.push({
    title, assignedTo, dueDate: localDateStr(due), priority,
    status: 'pending', category: 'general', dueDateSource: 'auto',
    automationRule: true, createdAt: Date.now(), createdBy: 'system'
  });
}

// ══════════════════════════════════════
// ACTIVITY LOG
// ══════════════════════════════════════
let activityCache = {};

function logActivity(type, title, detail, userId) {
  db.ref('activityLog').push({
    type, title, detail, userId,
    userName: currentUser?.name || 'System',
    timestamp: Date.now()
  });
}

function renderActivity() {
  const dateInput = document.getElementById('activity-date');
  if (!dateInput.value) dateInput.value = localDateStr();
  const selectedDate = dateInput.value;
  const startOfDay = new Date(selectedDate + 'T00:00:00').getTime();
  const endOfDay = new Date(selectedDate + 'T23:59:59').getTime();

  db.ref('activityLog').orderByChild('timestamp').startAt(startOfDay).endAt(endOfDay).once('value', snap => {
    const entries = [];
    snap.forEach(child => {
      const a = child.val();
      // Filter: broker sees all, agents see only their own
      if (currentUser.role !== 'agent-lead' && currentUser.role !== 'partner' && a.userId !== currentUser.uid) return;
      entries.push(a);
    });
    entries.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    const el = document.getElementById('activity-feed-full');

    if (entries.length === 0) {
      el.innerHTML = '<p class="empty-msg">No activity for this date.</p>';
      return;
    }

    const iconMap = {
      'stage-change': '🔄', 'doc-upload': '📄', 'note-added': '📝',
      'contact-created': '👤', 'task-completed': '✅', 'deal-created': '🏠',
      'expense-added': '💰', 'showing-added': '👁️'
    };

    el.innerHTML = entries.map(a => `
      <div class="activity-card">
        <div class="activity-icon">${iconMap[a.type] || '⚡'}</div>
        <div class="activity-body">
          <div class="activity-body-title">${a.title}</div>
          ${a.detail ? `<div class="activity-body-detail">${a.detail}</div>` : ''}
          <div class="activity-body-time">${new Date(a.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div>
        </div>
        <span class="activity-user-tag">${a.userName || 'System'}</span>
      </div>
    `).join('');
  });
}

document.addEventListener('change', e => {
  if (e.target.id === 'activity-date') renderActivity();
});

// ══════════════════════════════════════
// REPORTS MODULE
// ══════════════════════════════════════
let reportCharts = {};

function renderReports() {
  const startInput = document.getElementById('report-start');
  const endInput = document.getElementById('report-end');
  const now = new Date();
  if (!startInput.value) {
    startInput.value = `${now.getFullYear()}-01-01`;
    endInput.value = localDateStr(now);
  }
  generateReport();
}

function generateReport() {
  const startDate = document.getElementById('report-start').value;
  const endDate = document.getElementById('report-end').value;
  const txns = Object.values(getVisibleTxns());

  // Closed deals in range
  const closedDeals = txns.filter(t => {
    const stage = t.type === 'listing' ? t.listingPipeline?.stage : t.buyerPipeline?.stage;
    if (stage !== 'closed') return false;
    const closeDate = t.listingPipeline?.actualCloseDate || t.buyerPipeline?.actualCloseDate || t.listingPipeline?.closingDate || t.buyerPipeline?.closingDate;
    if (!closeDate) return true;
    return closeDate >= startDate && closeDate <= endDate;
  });

  const totalVolume = closedDeals.reduce((s, t) => s + (t.property?.price || t.financials?.commission?.salePrice || 0), 0);
  const totalGCI = closedDeals.reduce((s, t) => s + (t.financials?.commission?.gci || 0), 0);

  // Conversion rates
  const allListings = txns.filter(t => t.type === 'listing');
  const allBuyers = txns.filter(t => t.type === 'buyer');
  const ucListings = allListings.filter(t => ['under-contract','due-diligence','pending','closed'].includes(t.listingPipeline?.stage));
  const closedListings = allListings.filter(t => t.listingPipeline?.stage === 'closed');

  // Avg DOM
  let totalDOM = 0, domCount = 0;
  allListings.forEach(t => {
    const lp = t.listingPipeline;
    if (lp?.listDate && (lp?.contractDate || lp?.closingDate)) {
      const listed = new Date(lp.listDate);
      const sold = new Date(lp.contractDate || lp.closingDate);
      const days = Math.ceil((sold - listed) / 86400000);
      if (days > 0) { totalDOM += days; domCount++; }
    }
  });
  const avgDOM = domCount > 0 ? Math.round(totalDOM / domCount) : 0;

  // Stats cards
  document.getElementById('report-stats').innerHTML = `
    <div class="stat-card"><div class="stat-number">${closedDeals.length}</div><div class="stat-label">Deals Closed</div></div>
    <div class="stat-card"><div class="stat-number">${formatPriceShort(totalVolume)}</div><div class="stat-label">Volume</div></div>
    <div class="stat-card"><div class="stat-number">${formatPriceShort(totalGCI)}</div><div class="stat-label">GCI</div></div>
    <div class="stat-card accent"><div class="stat-number">${avgDOM}d</div><div class="stat-label">Avg DOM</div></div>
  `;

  // Charts
  renderProductionChart(txns, startDate, endDate);
  renderFunnelChart(allListings, allBuyers);
  renderDOMChart(allListings);
  renderAgentChart(txns);
}

function renderProductionChart(txns, startDate, endDate) {
  const ctx = document.getElementById('chart-production');
  if (reportCharts.production) reportCharts.production.destroy();

  // Group closed deals by month
  const months = {};
  const start = new Date(startDate);
  const end = new Date(endDate);
  for (let d = new Date(start); d <= end; d.setMonth(d.getMonth() + 1)) {
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    months[key] = { count: 0, volume: 0 };
  }
  txns.forEach(t => {
    const stage = t.type === 'listing' ? t.listingPipeline?.stage : t.buyerPipeline?.stage;
    if (stage !== 'closed') return;
    const cd = t.listingPipeline?.actualCloseDate || t.buyerPipeline?.actualCloseDate || t.listingPipeline?.closingDate || t.buyerPipeline?.closingDate;
    if (!cd) return;
    const key = cd.slice(0, 7);
    if (months[key]) {
      months[key].count++;
      months[key].volume += (t.property?.price || 0);
    }
  });

  const labels = Object.keys(months).map(k => { const [y,m] = k.split('-'); return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m)-1] + ' ' + y.slice(2); });

  reportCharts.production = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Deals Closed',
        data: Object.values(months).map(m => m.count),
        backgroundColor: '#7A3B14',
        borderRadius: 6,
        yAxisID: 'y'
      }, {
        label: 'Volume ($)',
        data: Object.values(months).map(m => m.volume),
        type: 'line',
        borderColor: '#2d6a4f',
        backgroundColor: 'rgba(45,106,79,0.1)',
        tension: 0.3,
        yAxisID: 'y1'
      }]
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom' } },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: 'Deals' } },
        y1: { position: 'right', beginAtZero: true, title: { display: true, text: 'Volume' }, ticks: { callback: v => formatPriceShort(v) }, grid: { drawOnChartArea: false } }
      }
    }
  });
}

function renderFunnelChart(listings, buyers) {
  const ctx = document.getElementById('chart-funnel');
  if (reportCharts.funnel) reportCharts.funnel.destroy();

  const all = [...listings, ...buyers];
  const leads = all.length;
  const active = all.filter(t => {
    const s = t.type === 'listing' ? t.listingPipeline?.stage : t.buyerPipeline?.stage;
    return !['closed'].includes(s);
  }).length;
  const uc = all.filter(t => {
    const s = t.type === 'listing' ? t.listingPipeline?.stage : t.buyerPipeline?.stage;
    return ['under-contract','due-diligence','pending','closed'].includes(s);
  }).length;
  const closed = all.filter(t => {
    const s = t.type === 'listing' ? t.listingPipeline?.stage : t.buyerPipeline?.stage;
    return s === 'closed';
  }).length;

  reportCharts.funnel = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Total Leads', 'Active', 'Under Contract', 'Closed'],
      datasets: [{
        data: [leads, active, uc, closed],
        backgroundColor: ['#9a9590', '#3a6ea5', '#b8860b', '#2d6a4f'],
        borderRadius: 6
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true } }
    }
  });
}

function renderDOMChart(listings) {
  const ctx = document.getElementById('chart-dom');
  if (reportCharts.dom) reportCharts.dom.destroy();

  const data = [];
  listings.forEach(t => {
    const lp = t.listingPipeline;
    if (lp?.listDate && (lp?.contractDate || lp?.closingDate)) {
      const listed = new Date(lp.listDate);
      const sold = new Date(lp.contractDate || lp.closingDate);
      const days = Math.ceil((sold - listed) / 86400000);
      if (days > 0) data.push({ label: (t.property?.address || 'Unknown').split(',')[0], days });
    }
  });

  if (data.length === 0) {
    reportCharts.dom = new Chart(ctx, { type: 'bar', data: { labels: ['No data'], datasets: [{ data: [0] }] }, options: { responsive: true } });
    return;
  }

  reportCharts.dom = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => d.label),
      datasets: [{ label: 'Days on Market', data: data.map(d => d.days), backgroundColor: '#7A3B14', borderRadius: 6 }]
    },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });
}

function renderAgentChart(txns) {
  const ctx = document.getElementById('chart-agents');
  if (reportCharts.agents) reportCharts.agents.destroy();

  const agents = {};
  txns.forEach(t => {
    const a = t.assignedTo || 'unassigned';
    if (!agents[a]) agents[a] = { closed: 0, active: 0, volume: 0 };
    const stage = t.type === 'listing' ? t.listingPipeline?.stage : t.buyerPipeline?.stage;
    if (stage === 'closed') { agents[a].closed++; agents[a].volume += (t.property?.price || 0); }
    else agents[a].active++;
  });

  const nameMap = {};
  Object.values(USERS).forEach(u => { nameMap[u.uid] = u.name.split(' ')[0]; });

  const labels = Object.keys(agents).map(a => nameMap[a] || a);

  reportCharts.agents = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Closed', data: Object.values(agents).map(a => a.closed), backgroundColor: '#2d6a4f', borderRadius: 6 },
        { label: 'Active', data: Object.values(agents).map(a => a.active), backgroundColor: '#3a6ea5', borderRadius: 6 }
      ]
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } }
  });
}

document.addEventListener('click', e => {
  if (e.target.id === 'btn-run-report') generateReport();
});

// ══════════════════════════════════════
// NOTIFICATION CENTER
// ══════════════════════════════════════
let notifCache = {};
let notifListener = null;
let notifPrefs = null;
let notifInitialLoad = true;

function getNotifPrefs() {
  if (notifPrefs) return notifPrefs;
  const saved = localStorage.getItem('rra_notif_prefs');
  notifPrefs = saved ? JSON.parse(saved) : {
    'stage-change': true, 'doc-uploaded': true, 'deadline-approaching': true,
    'task-assigned': true, 'contact-added': true, 'showing': true, 'sound': true
  };
  return notifPrefs;
}

function saveNotifPrefs() {
  localStorage.setItem('rra_notif_prefs', JSON.stringify(notifPrefs));
}

function initNotifications() {
  if (!currentUser) return;
  notifInitialLoad = true;
  const prefs = getNotifPrefs();

  // Restore checkbox states
  document.querySelectorAll('[data-notif-type]').forEach(cb => {
    const type = cb.dataset.notifType;
    cb.checked = prefs[type] !== false;
    cb.addEventListener('change', () => {
      notifPrefs[type] = cb.checked;
      saveNotifPrefs();
    });
  });

  // Ryan sees all notifications; agents see only their own
  const isLead = currentUser.role === 'agent-lead' || currentUser.role === 'partner';

  if (notifListener) {
    // Clean up previous listener
    db.ref('notifications').off('value', notifListener);
  }

  if (isLead) {
    // Listen to ALL notifications
    notifListener = db.ref('notifications').orderByChild('createdAt').limitToLast(50).on('value', snap => {
      const allNotifs = {};
      snap.forEach(userSnap => {
        // Each child could be userId node or direct notif
        const val = userSnap.val();
        if (val && typeof val === 'object' && val.type) {
          // Direct notification
          allNotifs[userSnap.key] = val;
        } else if (val && typeof val === 'object') {
          // userId node containing notifications
          Object.entries(val).forEach(([nid, n]) => {
            if (n && typeof n === 'object' && n.type) allNotifs[nid] = n;
          });
        }
      });
      processNotifications(allNotifs);
    });
  } else {
    // Agent: listen to own notifications
    notifListener = db.ref(`notifications/${currentUser.uid}`).orderByChild('createdAt').limitToLast(50).on('value', snap => {
      processNotifications(snap.val() || {});
    });
  }

  // Setup bell click
  document.getElementById('notif-bell').addEventListener('click', e => {
    e.stopPropagation();
    const panel = document.getElementById('notif-panel');
    panel.classList.toggle('hidden');
  });

  // Close panel on outside click
  document.addEventListener('click', e => {
    const panel = document.getElementById('notif-panel');
    if (!panel.classList.contains('hidden') && !panel.contains(e.target) && e.target.id !== 'notif-bell') {
      panel.classList.add('hidden');
    }
  });

  // Mark all read
  document.getElementById('notif-mark-all-read').addEventListener('click', () => {
    markAllNotifsRead();
  });

  // Run deadline check
  setTimeout(() => checkDeadlinesAndCreateNotifs(), 3000);
}

function processNotifications(notifs) {
  const oldKeys = Object.keys(notifCache);
  notifCache = notifs;
  const prefs = getNotifPrefs();

  // Filter by prefs
  const filtered = {};
  Object.entries(notifs).forEach(([id, n]) => {
    if (prefs[n.type] !== false) filtered[id] = n;
  });

  // Read state from localStorage
  const readSet = getReadNotifs();

  // Count unread
  const unread = Object.entries(filtered).filter(([id, n]) => !n.read && !readSet.has(id)).length;
  const countEl = document.getElementById('notif-count');
  countEl.textContent = unread > 99 ? '99+' : unread;
  countEl.classList.toggle('hidden', unread === 0);

  // Flash + sound for new notifications
  if (!notifInitialLoad && Object.keys(filtered).length > oldKeys.length) {
    const bell = document.getElementById('notif-bell');
    bell.classList.add('flash');
    setTimeout(() => bell.classList.remove('flash'), 600);
    if (prefs.sound !== false) {
      try { document.getElementById('notif-sound').play().catch(() => {}); } catch(e) {}
    }
  }
  notifInitialLoad = false;

  // Render panel
  renderNotifPanel(filtered, readSet);
}

function getReadNotifs() {
  const stored = localStorage.getItem('rra_read_notifs');
  return new Set(stored ? JSON.parse(stored) : []);
}

function markNotifRead(notifId) {
  const readSet = getReadNotifs();
  readSet.add(notifId);
  localStorage.setItem('rra_read_notifs', JSON.stringify([...readSet]));
  processNotifications(notifCache);
}

function markAllNotifsRead() {
  const readSet = getReadNotifs();
  Object.keys(notifCache).forEach(id => readSet.add(id));
  localStorage.setItem('rra_read_notifs', JSON.stringify([...readSet]));
  processNotifications(notifCache);
}

function renderNotifPanel(notifs, readSet) {
  const list = document.getElementById('notif-panel-list');
  const entries = Object.entries(notifs).sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));

  if (entries.length === 0) {
    list.innerHTML = '<p class="empty-msg" style="padding:24px;text-align:center">No notifications</p>';
    return;
  }

  const iconMap = {
    'stage-change': '🔄', 'doc-uploaded': '📄', 'deadline-approaching': '⏰',
    'task-assigned': '☐', 'contact-added': '👤', 'showing': '🏠'
  };

  list.innerHTML = entries.slice(0, 30).map(([id, n]) => {
    const isUnread = !n.read && !readSet.has(id);
    return `
      <div class="notif-item${isUnread ? ' unread' : ''}" data-notif-id="${id}" data-link-type="${n.linkType || ''}" data-link-id="${n.linkId || ''}">
        <div class="notif-item-icon">${iconMap[n.type] || '🔔'}</div>
        <div class="notif-item-body">
          <div class="notif-item-title">${n.message || n.title || ''}</div>
          <div class="notif-item-time">${timeAgo(n.createdAt)}</div>
        </div>
        <div class="notif-item-mark"></div>
      </div>
    `;
  }).join('');

  // Click handlers
  list.querySelectorAll('.notif-item').forEach(el => {
    el.addEventListener('click', () => {
      const nid = el.dataset.notifId;
      markNotifRead(nid);
      // Navigate
      const linkType = el.dataset.linkType;
      const linkId = el.dataset.linkId;
      if (linkType === 'transaction' && linkId) {
        document.getElementById('notif-panel').classList.add('hidden');
        openTransactionDetail(linkId);
      } else if (linkType === 'contact' && linkId) {
        document.getElementById('notif-panel').classList.add('hidden');
        navigateTo('contacts');
        setTimeout(() => openContactDetail(linkId), 200);
      } else if (linkType === 'task' && linkId) {
        document.getElementById('notif-panel').classList.add('hidden');
        navigateTo('tasks');
      }
    });
  });
}

// ── Create notification helper ──
function createNotification(opts) {
  // opts: { type, message, userId (target), linkType, linkId }
  const userId = opts.userId || 'all';
  const data = {
    type: opts.type,
    message: opts.message,
    linkType: opts.linkType || '',
    linkId: opts.linkId || '',
    createdAt: Date.now(),
    createdBy: currentUser ? currentUser.uid : 'system',
    read: false
  };
  db.ref(`notifications/${userId}`).push(data);
}

// ── Hook into existing actions to auto-generate notifications ──

// Wrap stage change drops (already in pipeline drop handler) — we hook via logActivity override
const _origLogActivity = typeof logActivity === 'function' ? logActivity : null;

function hookNotificationsIntoActions() {
  // We'll monkey-patch key functions to emit notifications

  // 1. Stage changes — patch the drop handler's logActivity call
  //    (already calls logActivity('stage-change', ...))
  //    We override logActivity to also create notifications
  const origLog = window._origLogActivity || logActivity;
  window._origLogActivity = origLog;

  // We can't easily override logActivity since it's used everywhere,
  // so instead we intercept at the Firebase write level.
  // Better approach: override specific action functions.
}

// Override logActivity to also create notifications
const __originalLogActivity = logActivity;
window.logActivity = logActivity; // ensure it's accessible

function logActivityWithNotif(type, title, detail, userId) {
  // Call original
  __originalLogActivity(type, title, detail, userId);

  // Map activity types to notification types
  const typeMap = {
    'stage-change': 'stage-change',
    'doc-upload': 'doc-uploaded',
    'note-added': null,
    'contact-created': 'contact-added',
    'task-completed': 'task-assigned',
    'deal-created': 'stage-change',
    'showing-added': 'showing'
  };

  const notifType = typeMap[type];
  if (!notifType) return;

  // Create notification for relevant users
  // Ryan always gets notified; specific agent gets notified
  const targetUsers = ['ryan-001'];
  if (userId && userId !== 'ryan-001') targetUsers.push(userId);

  targetUsers.forEach(uid => {
    createNotification({
      type: notifType,
      message: `${title}${detail ? ' — ' + detail : ''}`,
      userId: uid,
      linkType: detail ? 'transaction' : '',
      linkId: ''
    });
  });
}

// Replace logActivity globally
function logActivity(type, title, detail, userId) {
  logActivityWithNotif(type, title, detail, userId);
}

// ── Enhanced notification creators for specific actions ──

function notifyStageChange(txnId, stageName, address) {
  ['ryan-001', 'ally-001'].forEach(uid => {
    createNotification({
      type: 'stage-change',
      message: `Deal moved to ${stageName} — ${address}`,
      userId: uid,
      linkType: 'transaction',
      linkId: txnId
    });
  });
}

function notifyDocUploaded(txnId, docName, address) {
  ['ryan-001', 'ally-001'].forEach(uid => {
    createNotification({
      type: 'doc-uploaded',
      message: `${docName} uploaded — ${address}`,
      userId: uid,
      linkType: 'transaction',
      linkId: txnId
    });
  });
}

function notifyTaskAssigned(txnId, taskTitle, assigneeId) {
  createNotification({
    type: 'task-assigned',
    message: `New task: ${taskTitle}`,
    userId: assigneeId,
    linkType: 'transaction',
    linkId: txnId
  });
  if (assigneeId !== 'ryan-001') {
    createNotification({
      type: 'task-assigned',
      message: `Task assigned: ${taskTitle}`,
      userId: 'ryan-001',
      linkType: 'transaction',
      linkId: txnId
    });
  }
}

function notifyContactAdded(contactId, contactName) {
  createNotification({
    type: 'contact-added',
    message: `New contact: ${contactName}`,
    userId: 'ryan-001',
    linkType: 'contact',
    linkId: contactId
  });
}

function notifyShowingEvent(txnId, address, showType) {
  ['ryan-001', 'ally-001'].forEach(uid => {
    createNotification({
      type: 'showing',
      message: `Showing ${showType} — ${address}`,
      userId: uid,
      linkType: 'transaction',
      linkId: txnId
    });
  });
}

// ── Deadline checker ──
function checkDeadlinesAndCreateNotifs() {
  if (!currentUser) return;
  const today = new Date();
  const todayStr = localDateStr(today);

  // Check if already ran today
  const lastCheck = localStorage.getItem('rra_deadline_check');
  if (lastCheck === todayStr) return;
  localStorage.setItem('rra_deadline_check', todayStr);

  const txns = Object.entries(getVisibleTxns());

  txns.forEach(([txnId, txn]) => {
    const addr = txn.property?.address || 'Unknown';
    const pipeline = txn.type === 'listing' ? txn.listingPipeline : txn.buyerPipeline;
    const stage = pipeline?.stage;
    if (!pipeline || stage === 'closed') return;

    // DD End Date warnings
    if (pipeline.ddEndDate) {
      const ddEnd = new Date(pipeline.ddEndDate + 'T23:59:59');
      const daysUntil = Math.ceil((ddEnd - today) / 86400000);
      if (daysUntil === 3 || daysUntil === 1) {
        ['ryan-001', 'ally-001'].forEach(uid => {
          createNotification({
            type: 'deadline-approaching',
            message: `⚠️ DD deadline in ${daysUntil} day${daysUntil > 1 ? 's' : ''} — ${addr}`,
            userId: uid,
            linkType: 'transaction',
            linkId: txnId
          });
        });
      }
      if (daysUntil < 0) {
        createNotification({
          type: 'deadline-approaching',
          message: `🚨 DD deadline OVERDUE — ${addr}`,
          userId: 'ryan-001',
          linkType: 'transaction',
          linkId: txnId
        });
      }
    }

    // Closing date warnings
    if (pipeline.closingDate) {
      const closing = new Date(pipeline.closingDate + 'T23:59:59');
      const daysUntil = Math.ceil((closing - today) / 86400000);
      if (daysUntil === 7 || daysUntil === 3 || daysUntil === 1) {
        ['ryan-001', 'ally-001'].forEach(uid => {
          createNotification({
            type: 'deadline-approaching',
            message: `📅 Closing in ${daysUntil} day${daysUntil > 1 ? 's' : ''} — ${addr}`,
            userId: uid,
            linkType: 'transaction',
            linkId: txnId
          });
        });
      }
    }

    // Overdue tasks
    if (txn.tasks) {
      Object.entries(txn.tasks).forEach(([taskId, task]) => {
        if (task.status === 'complete' || task.status === 'skipped' || !task.dueDate) return;
        const due = new Date(task.dueDate + 'T23:59:59');
        if (due < today) {
          const assignee = task.assignedTo || 'ryan-001';
          createNotification({
            type: 'deadline-approaching',
            message: `⚠️ Overdue task: ${task.title} — ${addr}`,
            userId: assignee,
            linkType: 'transaction',
            linkId: txnId
          });
        }
      });
    }
  });
}

// ══════════════════════════════════════
// MODAL SYSTEM
// ══════════════════════════════════════
function openModal(html, cls) {
  const overlay = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  content.className = 'modal-content' + (cls ? ' ' + cls : '');
  content.innerHTML = html;
  overlay.classList.remove('hidden');
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); }, { once: true });
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

// ══════════════════════════════════════
// TOAST
// ══════════════════════════════════════
function toast(msg) {
  const container = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3000);
}

// ══════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════
function formatPrice(n) {
  if (!n && n !== 0) return '—';
  return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function formatPriceShort(n) {
  if (!n) return '$0';
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'k';
  return '$' + n;
}

function formatDocStatus(s) {
  return { 'not-started': 'Not Started', 'sent-for-signature': 'Sent for Signature', 'signed': 'Signed', 'uploaded': 'Uploaded', 'verified': 'Verified ✓', 'na': 'N/A' }[s] || s;
}

function formatInterest(lvl) {
  return { 'very-interested': 'Very Interested', 'interested': 'Interested', 'somewhat-interested': 'Somewhat', 'not-interested': 'Not Interested', 'no-feedback': 'Pending' }[lvl] || 'Pending';
}

function getContactName(contactId) {
  if (!contactId) return '—';
  const c = contactCache[contactId];
  return c ? `${c.firstName} ${c.lastName}` : '—';
}

function timeAgo(ts) {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ══════════════════════════════════════
// SEED DATA (run once)
// ══════════════════════════════════════
window.seedVendors = function() {
  const vendors = [
    { name: "Michael Hellinger", phone: "+13157099648", email: "mhellinger2@gmail.com", category: "photographer", specialty: "Real estate photography + floor plans", notes: "Schedule via group text with Ally + Mike", rating: 5, active: true, createdAt: Date.now(), createdBy: 'ryan-001' },
    { name: "Cameron Glenn", company: "Sky Visions USA", email: "cameron@skyvisionsusa.com", category: "videographer", specialty: "Video walkthroughs, drone footage", rating: 5, active: true, createdAt: Date.now(), createdBy: 'ryan-001' },
    { name: "Ali Dubois-Youngling", company: "Atlantic Bay Mortgage", email: "alidubois@atlanticbay.com", phone: "(269) 599-3395", category: "lender", specialty: "Preferred lender", rating: 5, active: true, createdAt: Date.now(), createdBy: 'ryan-001' },
    { name: "Jon Puente", company: "Edge Home Finance", email: "jon.puente@edgehomefinance.com", category: "lender", specialty: "Preferred lender", rating: 5, active: true, createdAt: Date.now(), createdBy: 'ryan-001' },
    { name: "Armstrong & Stokes", category: "attorney", specialty: "Preferred buyer attorney", rating: 5, active: true, createdAt: Date.now(), createdBy: 'ryan-001' }
  ];
  vendors.forEach(v => db.ref('vendors').push(v));
  toast('Vendors seeded');
};

// ══════════════════════════════════════
// GOOGLE CALENDAR SYNC
// ══════════════════════════════════════
// Dashboard ↔ Firebase ↔ Google Calendar (via sync script)
// Events created in dashboard get flagged for Google Calendar push.
// The sync script (gcal_sync.sh) reads pending events from Firebase
// and pushes them to Google Calendar via gog CLI, then marks them synced.

// Patch the calendar event creation to flag for Google sync
const _originalPushCalEvent = db.ref('calendarEvents').push;

// Watch for new calendar events that need Google Calendar sync
db.ref('calendarEvents').on('child_added', snap => {
  const evt = snap.val();
  // If event was created in dashboard (not from Google) and not yet synced
  if (evt && !evt.source && !evt.synced && !evt.googleEventId) {
    // Flag it for sync
    db.ref(`calendarEvents/${snap.key}/pendingGoogleSync`).set(true);
  }
});

// ══════════════════════════════════════
// ADMIN PANEL
// ══════════════════════════════════════

function renderAdminUsers() {
  if (!isAdmin()) return;
  const tbody = document.getElementById('admin-users-tbody');
  const entries = Object.entries(usersCache);

  if (entries.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-msg">No users yet. Click "+ New User" to create one.</td></tr>';
    return;
  }

  entries.sort((a, b) => (a[1].name || '').localeCompare(b[1].name || ''));

  tbody.innerHTML = entries.map(([id, u]) => {
    const lastLogin = u.lastLogin ? new Date(u.lastLogin).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Never';
    const statusCls = u.status === 'active' ? 'user-status-active' : 'user-status-inactive';
    return `
      <tr>
        <td><strong>${u.name || '—'}</strong></td>
        <td>${u.email || '—'}</td>
        <td><span class="role-badge ${u.role}">${u.role}</span></td>
        <td><span class="${statusCls}">${u.status || 'active'}</span></td>
        <td>${lastLogin}</td>
        <td>
          <button class="btn-xs" onclick="showEditUserForm('${id}')">✏️</button>
          <button class="btn-xs" onclick="showResetPasswordForm('${id}')">🔑</button>
          ${u.status === 'active'
            ? `<button class="btn-xs btn-danger-outline" onclick="toggleUserStatus('${id}','inactive')">Deactivate</button>`
            : `<button class="btn-xs btn-success-outline" onclick="toggleUserStatus('${id}','active')">Reactivate</button>`}
        </td>
      </tr>
    `;
  }).join('');
}

document.addEventListener('click', e => {
  if (e.target.id === 'btn-new-user') showNewUserForm();
});

function showNewUserForm() {
  if (!isAdmin()) return;
  openModal(`
    <button class="modal-close" onclick="closeModal()">×</button>
    <h2>New User</h2>
    <form id="new-user-form" class="form-stack">
      <div class="form-row">
        <div class="input-group"><label>Full Name</label><input type="text" id="nu-name" required></div>
        <div class="input-group"><label>Email</label><input type="email" id="nu-email" required></div>
      </div>
      <div class="form-row">
        <div class="input-group"><label>Phone</label><input type="tel" id="nu-phone"></div>
        <div class="input-group"><label>Role</label>
          <select id="nu-role" class="form-select">
            <option value="agent">Agent</option>
            <option value="broker">Broker</option>
            <option value="partner">Partner</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="input-group"><label>License #</label><input type="text" id="nu-license"></div>
        <div class="input-group"><label>Firm</label><input type="text" id="nu-firm" value="Corcoran HM Properties"></div>
      </div>
      <div class="input-group"><label>Password (min 8 chars)</label><input type="password" id="nu-password" required minlength="8"></div>
      <div class="input-group"><label>Profile Photo URL</label><input type="url" id="nu-photo" placeholder="https://..."></div>
      <button type="submit" class="btn-primary btn-full">Create User</button>
    </form>
  `);
  document.getElementById('new-user-form').addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('nu-email').value.trim().toLowerCase();
    const pw = document.getElementById('nu-password').value;
    if (pw.length < 8) { toast('Password must be at least 8 characters'); return; }

    // Check if email already exists
    const snap = await db.ref('users').orderByChild('email').equalTo(email).once('value');
    if (snap.val()) { toast('A user with that email already exists'); return; }

    const hashedPw = await sha256(pw);
    const newRef = db.ref('users').push();
    await newRef.set({
      name: document.getElementById('nu-name').value.trim(),
      email,
      phone: document.getElementById('nu-phone').value.trim(),
      role: document.getElementById('nu-role').value,
      status: 'active',
      passwordHash: hashedPw,
      licenseNumber: document.getElementById('nu-license').value.trim(),
      firm: document.getElementById('nu-firm').value.trim(),
      profilePhotoUrl: document.getElementById('nu-photo').value.trim(),
      createdAt: Date.now(),
      lastLogin: null,
      createdBy: currentUser.uid
    });
    toast('User created');
    closeModal();
  });
}

function showEditUserForm(userId) {
  if (!isAdmin()) return;
  const u = usersCache[userId];
  if (!u) return;
  openModal(`
    <button class="modal-close" onclick="closeModal()">×</button>
    <h2>Edit User</h2>
    <form id="edit-user-form" class="form-stack">
      <div class="form-row">
        <div class="input-group"><label>Full Name</label><input type="text" id="eu-name" value="${u.name || ''}" required></div>
        <div class="input-group"><label>Email</label><input type="email" id="eu-email" value="${u.email || ''}" required></div>
      </div>
      <div class="form-row">
        <div class="input-group"><label>Phone</label><input type="tel" id="eu-phone" value="${u.phone || ''}"></div>
        <div class="input-group"><label>Role</label>
          <select id="eu-role" class="form-select">
            <option value="agent" ${u.role==='agent'?'selected':''}>Agent</option>
            <option value="broker" ${u.role==='broker'?'selected':''}>Broker</option>
            <option value="partner" ${u.role==='partner'?'selected':''}>Partner</option>
            <option value="admin" ${u.role==='admin'?'selected':''}>Admin</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="input-group"><label>License #</label><input type="text" id="eu-license" value="${u.licenseNumber || ''}"></div>
        <div class="input-group"><label>Firm</label><input type="text" id="eu-firm" value="${u.firm || ''}"></div>
      </div>
      <div class="input-group"><label>Profile Photo URL</label><input type="url" id="eu-photo" value="${u.profilePhotoUrl || ''}" placeholder="https://..."></div>
      <button type="submit" class="btn-primary btn-full">Save Changes</button>
    </form>
  `);
  document.getElementById('edit-user-form').addEventListener('submit', async e => {
    e.preventDefault();
    await db.ref(`users/${userId}`).update({
      name: document.getElementById('eu-name').value.trim(),
      email: document.getElementById('eu-email').value.trim().toLowerCase(),
      phone: document.getElementById('eu-phone').value.trim(),
      role: document.getElementById('eu-role').value,
      licenseNumber: document.getElementById('eu-license').value.trim(),
      firm: document.getElementById('eu-firm').value.trim(),
      profilePhotoUrl: document.getElementById('eu-photo').value.trim()
    });
    toast('User updated');
    closeModal();
  });
}

function showResetPasswordForm(userId) {
  if (!isAdmin()) return;
  const u = usersCache[userId];
  if (!u) return;
  openModal(`
    <button class="modal-close" onclick="closeModal()">×</button>
    <h2>Reset Password</h2>
    <p style="margin-bottom:16px;color:var(--muted)">Resetting password for <strong>${u.name}</strong> (${u.email})</p>
    <form id="admin-reset-pw-form" class="form-stack">
      <div class="input-group"><label>New Password (min 8 chars)</label><input type="password" id="arp-pw" required minlength="8"></div>
      <div class="input-group"><label>Confirm Password</label><input type="password" id="arp-pw2" required minlength="8"></div>
      <button type="submit" class="btn-primary btn-full">Reset Password</button>
    </form>
  `, 'modal-sm');
  document.getElementById('admin-reset-pw-form').addEventListener('submit', async e => {
    e.preventDefault();
    const pw = document.getElementById('arp-pw').value;
    const pw2 = document.getElementById('arp-pw2').value;
    if (pw.length < 8) { toast('Password must be at least 8 characters'); return; }
    if (pw !== pw2) { toast('Passwords do not match'); return; }
    const hashedPw = await sha256(pw);
    await db.ref(`users/${userId}/passwordHash`).set(hashedPw);
    toast('Password reset successfully');
    closeModal();
  });
}

async function toggleUserStatus(userId, newStatus) {
  if (!isAdmin()) return;
  await db.ref(`users/${userId}/status`).set(newStatus);
  toast(`User ${newStatus === 'active' ? 'reactivated' : 'deactivated'}`);
}

// ══════════════════════════════════════
// MY PROFILE
// ══════════════════════════════════════

function renderMyProfile() {
  const panel = document.getElementById('profile-panel');
  if (!currentUser) return;

  // Get full user data from Firebase
  const fbUser = usersCache[currentUser.uid] || {};
  const u = { ...currentUser, ...fbUser };
  const initials = (u.name || '').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const createdDate = u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';
  const lastLogin = u.lastLogin ? new Date(u.lastLogin).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

  panel.innerHTML = `
    <div class="profile-header">
      <div class="profile-avatar-lg">${u.profilePhotoUrl ? `<img src="${u.profilePhotoUrl}" alt="${u.name}">` : initials}</div>
      <div class="profile-info">
        <h3>${u.name}</h3>
        <p>${u.email} · <span class="role-badge ${u.role}">${u.role}</span></p>
        <p style="font-size:0.78rem;color:var(--muted)">Member since ${createdDate} · Last login ${lastLogin}</p>
      </div>
    </div>
    <form id="profile-form" class="form-stack">
      <div class="form-row">
        <div class="input-group"><label>Full Name</label><input type="text" id="pf-name" value="${u.name || ''}" required></div>
        <div class="input-group"><label>Email</label><input type="email" id="pf-email" value="${u.email || ''}" required></div>
      </div>
      <div class="form-row">
        <div class="input-group"><label>Phone</label><input type="tel" id="pf-phone" value="${u.phone || ''}"></div>
        <div class="input-group"><label>Role</label><input type="text" id="pf-role" value="${u.role || ''}" disabled></div>
      </div>
      <div class="form-row">
        <div class="input-group"><label>License #</label><input type="text" id="pf-license" value="${u.licenseNumber || ''}"></div>
        <div class="input-group"><label>Firm</label><input type="text" id="pf-firm" value="${u.firm || ''}"></div>
      </div>
      <div class="input-group"><label>Profile Photo URL</label><input type="url" id="pf-photo" value="${u.profilePhotoUrl || ''}" placeholder="https://..."></div>
      <button type="submit" class="btn-primary">Save Profile</button>
    </form>
    <div style="margin-top:28px;padding-top:20px;border-top:1px solid var(--border-light)">
      <h4 style="margin-bottom:12px">Change Password</h4>
      <form id="change-pw-form" class="form-stack">
        <div class="form-row">
          <div class="input-group"><label>Current Password</label><input type="password" id="cp-current" required></div>
          <div class="input-group"><label>New Password (min 8)</label><input type="password" id="cp-new" required minlength="8"></div>
          <div class="input-group"><label>Confirm</label><input type="password" id="cp-confirm" required minlength="8"></div>
        </div>
        <button type="submit" class="btn-outline">Update Password</button>
      </form>
    </div>
  `;

  document.getElementById('profile-form').addEventListener('submit', async e => {
    e.preventDefault();
    if (!currentUser.uid) { toast('No Firebase user found'); return; }
    const updates = {
      name: document.getElementById('pf-name').value.trim(),
      email: document.getElementById('pf-email').value.trim().toLowerCase(),
      phone: document.getElementById('pf-phone').value.trim(),
      licenseNumber: document.getElementById('pf-license').value.trim(),
      firm: document.getElementById('pf-firm').value.trim(),
      profilePhotoUrl: document.getElementById('pf-photo').value.trim()
    };
    await db.ref(`users/${currentUser.uid}`).update(updates);
    // Update local session
    currentUser.name = updates.name;
    currentUser.email = updates.email;
    currentUser.initials = updates.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    localStorage.setItem('rra_user', JSON.stringify(currentUser));
    document.getElementById('sidebar-name').textContent = currentUser.name;
    document.getElementById('sidebar-avatar').textContent = currentUser.initials;
    document.getElementById('topbar-name').textContent = currentUser.name;
    document.getElementById('topbar-avatar').textContent = currentUser.initials;
    toast('Profile updated');
  });

  document.getElementById('change-pw-form').addEventListener('submit', async e => {
    e.preventDefault();
    const currentPw = document.getElementById('cp-current').value;
    const newPw = document.getElementById('cp-new').value;
    const confirmPw = document.getElementById('cp-confirm').value;

    if (newPw.length < 8) { toast('Password must be at least 8 characters'); return; }
    if (newPw !== confirmPw) { toast('Passwords do not match'); return; }

    // Verify current password
    const fbUser = usersCache[currentUser.uid];
    if (fbUser) {
      const currentHash = await sha256(currentPw);
      if (currentHash !== fbUser.passwordHash) { toast('Current password is incorrect'); return; }
    }

    const hashedPw = await sha256(newPw);
    await db.ref(`users/${currentUser.uid}/passwordHash`).set(hashedPw);
    document.getElementById('cp-current').value = '';
    document.getElementById('cp-new').value = '';
    document.getElementById('cp-confirm').value = '';
    toast('Password updated');
  });
}

// ══════════════════════════════════════
// SEED ADMIN USER (run once to bootstrap)
// ══════════════════════════════════════
window.seedAdminUser = async function() {
  const hashedPw = await sha256('rra2026!');
  await db.ref('users/ryan-001').set({
    name: 'Ryan Palmer',
    email: 'ryan@realtyryan.com',
    phone: '508-954-2159',
    role: 'admin',
    status: 'active',
    passwordHash: hashedPw,
    licenseNumber: '315654',
    firm: 'Corcoran HM Properties',
    profilePhotoUrl: '',
    createdAt: Date.now(),
    lastLogin: null,
    createdBy: 'system'
  });
  await db.ref('users/ally-001').set({
    name: 'Ally Doerr',
    email: 'ally@realtyryan.com',
    phone: '',
    role: 'partner',
    status: 'active',
    passwordHash: hashedPw,
    licenseNumber: '',
    firm: 'Corcoran HM Properties',
    profilePhotoUrl: '',
    createdAt: Date.now(),
    lastLogin: null,
    createdBy: 'system'
  });
  toast('Admin users seeded!');
};

// Auto-seed if no users exist
db.ref('users').once('value', snap => {
  if (!snap.val()) {
    console.log('No users found — auto-seeding admin users...');
    window.seedAdminUser();
  }
});

// Expose for console
window.db = db;
window.txnCache = () => txnCache;
window.contactCache = () => contactCache;
