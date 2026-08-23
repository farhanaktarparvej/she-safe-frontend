// Frontend and backend are two separate servers — the API base URL
// comes from config.js (window.SHE_SAFE_API_BASE) so it's set in one place.
const API_BASE = window.SHE_SAFE_API_BASE;

let map;
let markers = [];

// ---------- Map setup ----------
function initMap() {
  map = L.map('map', { zoomControl: false }).setView([22.5726, 88.3639], 12); // Kolkata default
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);
}

function clearMarkers() {
  markers.forEach((m) => map.removeLayer(m));
  markers = [];
}

function plotAlertsOnMap(alerts) {
  clearMarkers();
  const bounds = [];

  alerts.forEach((alert) => {
    if (typeof alert.lat !== 'number' || typeof alert.long !== 'number') return;

    const color = alert.status === 'Active' ? '#d94f7a' : '#8a3fe4';
    const icon = L.divIcon({
      className: '',
      html: `<div style="
        width:16px;height:16px;border-radius:50% 50% 50% 0;
        background:${color};transform:rotate(-45deg);
        border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4);
      "></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 16],
    });

    const marker = L.marker([alert.lat, alert.long], { icon }).addTo(map);
    marker.bindPopup(
      `<strong>${alert.name || 'Unknown'}</strong><br/>${alert.location || ''}<br/>${alert.date} ${alert.time}<br/>Status: ${alert.status}`
    );
    markers.push(marker);
    bounds.push([alert.lat, alert.long]);
  });

  if (bounds.length) {
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }
}

// ---------- Data fetching ----------
async function fetchAlerts() {
  try {
    const res = await fetch(`${API_BASE}/alerts`, { credentials: 'include' });
    if (res.status === 401) {
      redirectToLogin();
      return [];
    }
    if (!res.ok) throw new Error('Failed to fetch alerts');
    return await res.json();
  } catch (err) {
    console.error(err);
    return [];
  }
}

async function fetchStats() {
  try {
    const res = await fetch(`${API_BASE}/alerts/stats/summary`, { credentials: 'include' });
    if (res.status === 401) {
      redirectToLogin();
      return { total: 0, active: 0, resolved: 0 };
    }
    if (!res.ok) throw new Error('Failed to fetch stats');
    return await res.json();
  } catch (err) {
    console.error(err);
    return { total: 0, active: 0, resolved: 0 };
  }
}

// ---------- Auth ----------
function redirectToLogin() {
  window.location.href = 'admin-login.html';
}

async function checkAuth() {
  try {
    const res = await fetch(`${API_BASE}/admin/check`, { credentials: 'include' });
    if (!res.ok) {
      redirectToLogin();
      return false;
    }
    return true;
  } catch (err) {
    console.error(err);
    redirectToLogin();
    return false;
  }
}

async function logout() {
  try {
    await fetch(`${API_BASE}/admin/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch (err) {
    console.error(err);
  } finally {
    redirectToLogin();
  }
}

function renderStats(stats) {
  document.getElementById('statTotal').textContent = stats.total ?? 0;
  document.getElementById('statActive').textContent = stats.active ?? 0;
  document.getElementById('statResolved').textContent = stats.resolved ?? 0;
}

function formatLatLong(alert) {
  if (typeof alert.lat !== 'number' || typeof alert.long !== 'number') return '-';
  return `${alert.lat.toFixed(4)}, ${alert.long.toFixed(4)}`;
}

function renderTable(alerts) {
  const tbody = document.getElementById('alertsTableBody');
  tbody.innerHTML = '';

  alerts.slice(0, 8).forEach((alert) => {
    const tr = document.createElement('tr');
    tr.dataset.id = alert._id;
    const pillClass = alert.status === 'Active' ? 'active' : 'resolved';
    const isResolved = alert.status === 'Resolved';
    tr.innerHTML = `
      <td>${alert.name || 'Unknown'}</td>
      <td>${formatLatLong(alert)}</td>
      <td>${alert.time || '-'}</td>
      <td><span class="status-pill ${pillClass}">${alert.status}</span></td>
      <td><input type="checkbox" class="resolve-checkbox" ${isResolved ? 'checked disabled' : ''} /></td>
    `;
    tbody.appendChild(tr);
  });

  if (!alerts.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="color:#8a7ba3;padding-top:14px;">No alerts yet.</td></tr>`;
  }
}

// ---------- Resolve SOS via checkbox ----------
async function resolveAlert(id) {
  const res = await fetch(`${API_BASE}/alerts/${id}/resolve`, {
    method: 'PATCH',
    credentials: 'include',
  });
  if (res.status === 401) {
    redirectToLogin();
    return null;
  }
  if (!res.ok) throw new Error('Failed to resolve alert');
  return res.json();
}

document.getElementById('alertsTableBody').addEventListener('change', async (e) => {
  const checkbox = e.target;
  if (!checkbox.classList.contains('resolve-checkbox')) return;

  const tr = checkbox.closest('tr');
  if (!tr) return;
  const id = tr.dataset.id;

  checkbox.disabled = true;
  try {
    await resolveAlert(id);
    // Remove the row from the SOS alerts box, then refresh the stat cards.
    tr.remove();
    const stats = await fetchStats();
    renderStats(stats);
    const alerts = await fetchAlerts();
    plotAlertsOnMap(alerts);
  } catch (err) {
    alert(err.message);
    checkbox.checked = false;
    checkbox.disabled = false;
  }
});

async function refreshDashboard() {
  const [alerts, stats] = await Promise.all([fetchAlerts(), fetchStats()]);
  renderTable(alerts);
  renderStats(stats);
  plotAlertsOnMap(alerts);
}

// ---------- Simulate SOS modal ----------
const modalOverlay = document.getElementById('modalOverlay');
const sosForm = document.getElementById('sosForm');

document.getElementById('cancelModal').addEventListener('click', () => {
  modalOverlay.classList.add('hidden');
});

document.getElementById('useMyLocation').addEventListener('click', () => {
  if (!navigator.geolocation) {
    alert('Geolocation is not supported by this browser.');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      sosForm.lat.value = pos.coords.latitude;
      sosForm.long.value = pos.coords.longitude;
    },
    (err) => alert('Could not get location: ' + err.message)
  );
});

sosForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    name: sosForm.name.value,
    location: sosForm.location.value,
    date: sosForm.date.value,
    time: sosForm.time.value,
    lat: parseFloat(sosForm.lat.value),
    long: parseFloat(sosForm.long.value),
  };

  try {
    const res = await fetch(`${API_BASE}/alerts`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to send alert');
    }
    modalOverlay.classList.add('hidden');
    sosForm.reset();
    await refreshDashboard();
  } catch (err) {
    alert(err.message);
  }
});

// ---------- Logout ----------
document.querySelector('.logout').addEventListener('click', (e) => {
  e.preventDefault();
  logout();
});

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', async () => {
  const authed = await checkAuth();
  if (!authed) return;

  initMap();
  await refreshDashboard();
  // Poll for new alerts every 15s so the "Live Alerts Map" feels live
  setInterval(refreshDashboard, 15000);
});