/* ═══════════════════════════════════════════════════════════════
   RRA COMMAND CENTER — App Logic
   ═══════════════════════════════════════════════════════════════ */

// ── Firebase Config ──
const firebaseConfig = {
  databaseURL: "https://realty-ryan-dashboard-default-rtdb.firebaseio.com"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ── Simulated Auth ──
const USERS = {
  'ryan@realtyryan.com': { password: 'rra2026', uid: 'ryan-001', name: 'Ryan Palmer', initials: 'RP', role: 'agent-lead', email: 'ryanpalmer@hmproperties.com' },
  'ally@realtyryan.com':  { password: 'rra2026', uid: 'ally-001', name: 'Ally Doerr', initials: 'AD', role: 'partner', email: 'ally@realtyryan.com' }
};

let currentUser = null;

// ── SAMPLE DATA ──
const LISTING_STAGES = [
  { id: 'pre-list', label: 'Pre-List' },
  { id: 'listed', label: 'Listed' },
  { id: 'under-contract', label: 'Under Contract' },
  { id: 'due-diligence', label: 'Due Diligence' },
  { id: 'pending', label: 'Pending' },
  { id: 'closed', label: 'Closed' }
];

const BUYER_STAGES = [
  { id: 'lead', label: 'Leads' },
  { id: 'hot-lead', label: 'Hot Leads' },
  { id: 'contingent', label: 'Contingent' },
  { id: 'active-buyer', label: 'Active Buyers' },
  { id: 'under-contract', label: 'Under Contract' },
  { id: 'closed', label: 'Closed' }
];

const sampleListings = [
  { id: 'l1', address: '5834 Timbertop Lane', client: 'Smith Family', price: 525000, stage: 'listed', date: 'Listed 03/01', badges: ['new-construction'], mlsNumber: '4123456', listDate: '03/01/2026' },
  { id: 'l2', address: '456 Oak Lane', client: 'John & Maria Davis', price: 435000, stage: 'listed', date: 'Listed 02/15', badges: [], mlsNumber: '4123457', listDate: '02/15/2026' },
  { id: 'l3', address: '789 Elm Street', client: 'Sarah Chen', price: 380000, stage: 'under-contract', date: 'Contract 03/05', badges: [], contractDate: '03/05/2026', ddEnd: '03/19/2026' },
  { id: 'l4', address: '123 Pine Drive', client: 'Tom & Lisa Brown', price: 290000, stage: 'due-diligence', date: 'DD ends 03/12', badges: [], ddEnd: '03/12/2026' },
  { id: 'l5', address: '901 Main Street', client: 'Robert Wilson', price: 450000, stage: 'pending', date: 'Close 03/28', badges: [], closingDate: '03/28/2026' },
  { id: 'l6', address: '234 Cedar Court', client: 'Jennifer Walsh', price: 510000, stage: 'closed', date: 'Closed 02/20', badges: [] },
  { id: 'l7', address: '567 Maple Avenue', client: 'The Hendersons', price: 410000, stage: 'listed', date: 'Listed 02/28', badges: [], listDate: '02/28/2026' },
  { id: 'l8', address: '345 Birch Lane', client: 'Sopeli Builders', price: 475000, stage: 'pre-list', date: 'Appt 03/15', badges: ['new-construction'] },
  { id: 'l9', address: '678 Willow Creek', client: 'Angela Martinez', price: 350000, stage: 'pre-list', date: 'Appt 03/10', badges: [] },
  { id: 'l10', address: '112 River Road', client: 'David Park', price: 375000, stage: 'pending', date: 'Close 04/01', badges: [], closingDate: '04/01/2026' },
  { id: 'l11', address: '445 Lakeview Dr', client: 'Sopeli Builders', price: 498000, stage: 'pre-list', date: 'Coming Soon', badges: ['new-construction'] },
  { id: 'l12', address: '890 Summit Way', client: 'Karen Lee', price: 620000, stage: 'closed', date: 'Closed 01/30', badges: [] },
];

const sampleBuyers = [
  { id: 'b1', address: 'Searching Mooresville', client: 'Mike & Jenny Taylor', price: 400000, stage: 'active-buyer', date: '$350-450k', badges: [] },
  { id: 'b2', address: 'Searching Huntersville', client: 'Chris Anderson', price: 325000, stage: 'hot-lead', date: '$300-350k', badges: ['hot'] },
  { id: 'b3', address: '321 Oak Knoll Ct', client: 'Patricia Nguyen', price: 385000, stage: 'under-contract', date: 'Contract 03/02', badges: [], contractDate: '03/02/2026' },
  { id: 'b4', address: 'Searching Lake Norman', client: 'James & Amy Ross', price: 550000, stage: 'active-buyer', date: '$500-600k', badges: [] },
  { id: 'b5', address: 'Relocating from NY', client: 'Daniel & Sara Kim', price: 475000, stage: 'lead', date: 'New 03/08', badges: [] },
  { id: 'b6', address: '555 Harvest Ln', client: 'Mark Thompson', price: 310000, stage: 'closed', date: 'Closed 02/14', badges: [] },
  { id: 'b7', address: 'Searching Mooresville', client: 'Emily Rivera', price: 280000, stage: 'lead', date: 'New 03/10', badges: [] },
  { id: 'b8', address: 'Contingent Sale', client: 'The Whites', price: 425000, stage: 'contingent', date: 'Sale pending', badges: [] },
];

const sampleAppointments = [
  { id: 'a1', client: 'Angela Martinez', address: '678 Willow Creek Dr, Mooresville', date: new Date(2026, 2, 10, 14, 0), notes: 'Referred by Tom at Wells Fargo', status: 'scheduled' },
  { id: 'a2', client: 'Sopeli Builders (Fiorella)', address: '345 Birch Lane, Mooresville', date: new Date(2026, 2, 15, 10, 0), notes: 'New construction spec home', status: 'scheduled' },
  { id: 'a3', client: 'The Hendersons', address: '567 Maple Avenue, Huntersville', date: new Date(2026, 1, 28, 15, 30), notes: 'Downsizing, motivated sellers', status: 'completed' },
];

// ── INIT ──
document.addEventListener('DOMContentLoaded', init);

function init() {
  setupLogin();
  setupNavigation();
  setupModals();
  setupDashboardDate();

  // Check for saved session
  const saved = localStorage.getItem('rra_user');
  if (saved) {
    currentUser = JSON.parse(saved);
    showApp();
  }
}

// ── LOGIN ──
function setupLogin() {
  document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');

    const user = USERS[email];
    if (!user || user.password !== password) {
      errEl.textContent = 'Invalid email or password';
      return;
    }

    currentUser = { ...user };
    delete currentUser.password;
    localStorage.setItem('rra_user', JSON.stringify(currentUser));
    errEl.textContent = '';
    showApp();
  });

  document.getElementById('btn-signout').addEventListener('click', () => {
    currentUser = null;
    localStorage.removeItem('rra_user');
    document.getElementById('app-shell').classList.add('hidden');
    document.getElementById('login-screen').style.display = '';
    document.getElementById('login-email').value = '';
    document.getElementById('login-password').value = '';
  });
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-shell').classList.remove('hidden');

  // Set user info
  document.getElementById('sidebar-name').textContent = currentUser.name;
  document.getElementById('sidebar-avatar').textContent = currentUser.initials;
  document.getElementById('sidebar-role').textContent = currentUser.role === 'agent-lead' ? 'Agent Lead' : 'Partner';
  document.getElementById('topbar-name').textContent = currentUser.name;
  document.getElementById('topbar-avatar').textContent = currentUser.initials;

  // Render views
  renderListingPipeline();
  renderBuyerPipeline();
  renderAppointments();
  applyRoleRestrictions();
}

function applyRoleRestrictions() {
  if (currentUser.role === 'partner') {
    // Ally can't drag pipeline cards or delete
    document.querySelectorAll('.pipeline-card').forEach(card => {
      card.draggable = false;
      card.style.cursor = 'pointer';
    });
    // Hide delete buttons (when they exist)
    document.querySelectorAll('.btn-delete').forEach(btn => btn.classList.add('hidden'));
  }
}

// ── NAVIGATION ──
function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const hamburger = document.getElementById('hamburger');
  const sidebar = document.getElementById('sidebar');
  const sidebarClose = document.getElementById('sidebar-close');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const view = item.dataset.view;
      if (!view) return;

      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      const target = document.getElementById(`view-${view}`);
      if (target) {
        target.classList.remove('active');
        // Force reflow for animation
        void target.offsetWidth;
        target.classList.add('active');
      }

      // Close sidebar on mobile
      sidebar.classList.remove('open');
    });
  });

  hamburger.addEventListener('click', () => sidebar.classList.toggle('open'));
  sidebarClose.addEventListener('click', () => sidebar.classList.remove('open'));
}

function setupDashboardDate() {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const now = new Date();
  document.getElementById('dashboard-date').textContent = `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
}

// ── PIPELINE RENDERING ──
function renderListingPipeline() {
  const board = document.getElementById('listing-pipeline');
  board.innerHTML = '';

  LISTING_STAGES.forEach(stage => {
    const cards = sampleListings.filter(l => l.stage === stage.id);
    board.appendChild(createColumn(stage, cards, 'listing'));
  });
}

function renderBuyerPipeline() {
  const board = document.getElementById('buyer-pipeline');
  board.innerHTML = '';

  BUYER_STAGES.forEach(stage => {
    const cards = sampleBuyers.filter(b => b.stage === stage.id);
    board.appendChild(createColumn(stage, cards, 'buyer'));
  });
}

function createColumn(stage, cards, type) {
  const col = document.createElement('div');
  col.className = 'pipeline-column';
  col.dataset.stage = stage.id;
  col.dataset.type = type;

  col.innerHTML = `
    <div class="column-header">
      <span class="column-title">${stage.label}</span>
      <span class="column-count">${cards.length}</span>
    </div>
    <div class="column-cards" data-stage="${stage.id}" data-type="${type}"></div>
  `;

  const cardsContainer = col.querySelector('.column-cards');

  cards.forEach(card => {
    cardsContainer.appendChild(createCard(card, type));
  });

  // Drag & drop events on column
  cardsContainer.addEventListener('dragover', (e) => {
    e.preventDefault();
    cardsContainer.classList.add('drag-over');
  });

  cardsContainer.addEventListener('dragleave', () => {
    cardsContainer.classList.remove('drag-over');
  });

  cardsContainer.addEventListener('drop', (e) => {
    e.preventDefault();
    cardsContainer.classList.remove('drag-over');

    if (currentUser.role === 'partner') return; // Ally can't move cards

    const cardId = e.dataTransfer.getData('text/plain');
    const cardType = e.dataTransfer.getData('card-type');
    const newStage = cardsContainer.dataset.stage;

    if (cardType !== type) return;

    // Update data
    const dataArr = type === 'listing' ? sampleListings : sampleBuyers;
    const item = dataArr.find(d => d.id === cardId);
    if (item) {
      item.stage = newStage;
      if (type === 'listing') renderListingPipeline();
      else renderBuyerPipeline();
      applyRoleRestrictions();
    }
  });

  return col;
}

function createCard(data, type) {
  const card = document.createElement('div');
  card.className = 'pipeline-card';
  card.draggable = true;
  card.dataset.id = data.id;

  let badgesHTML = '';
  if (data.badges) {
    data.badges.forEach(b => {
      if (b === 'new-construction') badgesHTML += '<span class="card-badge badge-new-construction">New Construction</span>';
      if (b === 'hot') badgesHTML += '<span class="card-badge badge-hot">Hot Lead</span>';
    });
  }

  card.innerHTML = `
    <div class="card-address">${data.address}</div>
    <div class="card-client">${data.client}</div>
    <div class="card-price">${formatPrice(data.price)}</div>
    <div class="card-meta">
      ${badgesHTML}
      <span class="card-date">${data.date}</span>
    </div>
  `;

  // Drag events
  card.addEventListener('dragstart', (e) => {
    card.classList.add('dragging');
    e.dataTransfer.setData('text/plain', data.id);
    e.dataTransfer.setData('card-type', type);
    e.dataTransfer.effectAllowed = 'move';
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
  });

  // Click → modal
  card.addEventListener('click', () => openTransactionModal(data, type));

  return card;
}

function formatPrice(n) {
  if (!n) return '—';
  return '$' + n.toLocaleString('en-US');
}

// ── APPOINTMENTS ──
function renderAppointments() {
  const list = document.getElementById('appointments-list');
  list.innerHTML = '';

  const sorted = [...sampleAppointments].sort((a, b) => a.date - b.date);

  sorted.forEach(appt => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const d = appt.date;
    const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const isPast = d < new Date();

    const card = document.createElement('div');
    card.className = 'appt-card';
    card.innerHTML = `
      <div class="appt-date-block">
        <span class="appt-date-month">${months[d.getMonth()]}</span>
        <span class="appt-date-day">${d.getDate()}</span>
      </div>
      <div class="appt-info">
        <h4>${appt.address}</h4>
        <p><span class="appt-time">${timeStr}</span> · ${appt.client}</p>
        ${appt.notes ? `<p style="margin-top:4px;font-size:0.8rem;color:var(--muted)">${appt.notes}</p>` : ''}
      </div>
      <div class="appt-actions">
        <span class="appt-status ${appt.status}">${appt.status}</span>
        ${!isPast ? '<span class="ally-todo">⚡ Ally: Prepare</span>' : ''}
      </div>
    `;

    list.appendChild(card);
  });

  // Empty state
  if (sorted.length === 0) {
    list.innerHTML = '<p class="placeholder-text">No upcoming appointments</p>';
  }
}

// ── NEW APPOINTMENT ──
document.getElementById('btn-new-appt')?.addEventListener('click', () => {
  document.getElementById('appt-modal').classList.remove('hidden');
});

document.querySelector('.appt-modal-close')?.addEventListener('click', () => {
  document.getElementById('appt-modal').classList.add('hidden');
});

document.getElementById('appt-form')?.addEventListener('submit', (e) => {
  e.preventDefault();

  const client = document.getElementById('appt-client').value;
  const address = document.getElementById('appt-address').value;
  const datetime = new Date(document.getElementById('appt-datetime').value);
  const notes = document.getElementById('appt-notes').value;

  sampleAppointments.push({
    id: 'a' + Date.now(),
    client,
    address,
    date: datetime,
    notes,
    status: 'scheduled'
  });

  renderAppointments();
  document.getElementById('appt-modal').classList.add('hidden');
  document.getElementById('appt-form').reset();

  // Also save to Firebase
  saveAppointmentToFirebase({ client, address, date: datetime.getTime(), notes, status: 'scheduled' });
});

function saveAppointmentToFirebase(appt) {
  try {
    db.ref('listingAppointments').push(appt);
  } catch (e) {
    console.log('Firebase write (appointments):', e.message);
  }
}

// ── TRANSACTION MODAL ──
function setupModals() {
  document.getElementById('modal-close').addEventListener('click', () => {
    document.getElementById('txn-modal').classList.add('hidden');
  });

  document.getElementById('txn-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      document.getElementById('txn-modal').classList.add('hidden');
    }
  });

  document.getElementById('appt-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      document.getElementById('appt-modal').classList.add('hidden');
    }
  });

  // Modal tabs
  document.querySelectorAll('.modal-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });
}

function openTransactionModal(data, type) {
  const modal = document.getElementById('txn-modal');
  document.getElementById('modal-address').textContent = data.address;
  document.getElementById('modal-price').textContent = formatPrice(data.price);
  document.getElementById('modal-stage').textContent = data.stage.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  document.getElementById('modal-client').textContent = data.client;
  document.getElementById('modal-list-date').textContent = data.listDate || '—';
  document.getElementById('modal-contract-date').textContent = data.contractDate || '—';
  document.getElementById('modal-dd-end').textContent = data.ddEnd || '—';
  document.getElementById('modal-closing-date').textContent = data.closingDate || '—';
  document.getElementById('modal-phone').textContent = '—';
  document.getElementById('modal-email').textContent = '—';

  // Reset to overview tab
  document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelector('.modal-tab[data-tab="overview"]').classList.add('active');
  document.getElementById('tab-overview').classList.add('active');

  modal.classList.remove('hidden');
}

// ── FIREBASE LISTENERS (for real-time sync when data exists) ──
function initFirebaseListeners() {
  try {
    db.ref('transactions').on('value', (snapshot) => {
      const data = snapshot.val();
      if (data) {
        console.log('Firebase transactions loaded:', Object.keys(data).length);
      }
    });

    db.ref('listingAppointments').on('value', (snapshot) => {
      const data = snapshot.val();
      if (data) {
        console.log('Firebase appointments loaded:', Object.keys(data).length);
      }
    });
  } catch (e) {
    console.log('Firebase listeners:', e.message);
  }
}

// Initialize Firebase listeners
initFirebaseListeners();
