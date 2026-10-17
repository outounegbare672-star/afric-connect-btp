const adminTokenKey = 'afric-connect-admin-token';
const adminApi = async (path, options = {}) => {
  const token = localStorage.getItem(adminTokenKey);
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Erreur administrateur.');
  return data;
};const adminNotice = (message, type = 'success') => { let notice = document.querySelector('.runtime-notice'); if (!notice) { notice = document.createElement('div'); notice.className = 'runtime-notice'; document.body.appendChild(notice); } notice.className = `runtime-notice ${type}`; notice.textContent = message; setTimeout(() => notice.remove(), 4000); };
function escapeAdminHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

const statusLabel = status => ({ approved: 'Approuvée', pending: 'En attente', suspended: 'Suspendue' }[status] || status);

async function loadAdmin() {
  const data = await adminApi('/admin/overview');
  document.querySelector('[data-admin-stats]').innerHTML = `
    <div class="metric-box"><span>Utilisateurs</span><strong>${escapeAdminHtml(data.stats.users)}</strong></div>
    <div class="metric-box"><span>Offres</span><strong>${escapeAdminHtml(data.stats.offers)}</strong></div>
    <div class="metric-box"><span>Candidatures</span><strong>${escapeAdminHtml(data.stats.applications)}</strong></div>
    <div class="metric-box"><span>À modérer</span><strong>${escapeAdminHtml(data.stats.pending)}</strong></div>`;
  document.querySelector('[data-admin-offers]').innerHTML = data.offers.length
    ? data.offers.map(offer => `<tr><td><strong>${escapeAdminHtml(offer.title)}</strong><small>${escapeAdminHtml(offer.category)}</small></td><td>${escapeAdminHtml(offer.city)}</td><td>${escapeAdminHtml(offer.budgetLabel)}</td><td><span class="status ${escapeAdminHtml(offer.status)}">${escapeAdminHtml(statusLabel(offer.status))}</span></td><td><select class="admin-status" data-id="${escapeAdminHtml(offer.id)}"><option value="approved" ${offer.status === 'approved' ? 'selected' : ''}>Approuver</option><option value="pending" ${offer.status === 'pending' ? 'selected' : ''}>Mettre en attente</option><option value="suspended" ${offer.status === 'suspended' ? 'selected' : ''}>Suspendre</option></select></td></tr>`).join('')
    : '<tr><td colspan="5">Aucune offre à modérer.</td></tr>';
  document.querySelector('[data-admin-users]').innerHTML = data.users.length
    ? data.users.map(user => `<tr><td>${escapeAdminHtml(user.name)}</td><td>${escapeAdminHtml(user.email)}</td><td>${escapeAdminHtml(user.country || 'Non renseigné')}</td><td>${escapeAdminHtml(user.role)}</td></tr>`).join('')
    : '<tr><td colspan="4">Aucun utilisateur inscrit.</td></tr>';
  const kycTarget = document.querySelector('[data-admin-kyc]');
  if (kycTarget) {
    try {
      const { submissions } = await adminApi('/admin/kyc');
      kycTarget.innerHTML = submissions.length ? submissions.map(submission => `
        <article class="dashboard-item admin-kyc-card">
          <div><strong>${escapeAdminHtml(submission.user?.name || 'Utilisateur')}</strong>
            <p>${escapeAdminHtml(submission.user?.email || '')} · ${escapeAdminHtml(submission.user?.country || '')} · ${escapeAdminHtml(submission.documentType)}</p>
            <div class="dashboard-actions">${submission.documents.map((url, index) => `<a class="btn btn-outline" href="${escapeAdminHtml(url)}" target="_blank" rel="noopener noreferrer">Justificatif ${index + 1}</a>`).join('')}</div>
          </div>
          <form class="form-grid" data-kyc-review data-id="${escapeAdminHtml(submission.id)}">
            <label>Note de vérification<textarea name="reviewNote" maxlength="1000" placeholder="Motif en cas de refus, conseils de correction…"></textarea></label>
            <div class="dashboard-actions">
              <button class="btn btn-primary" name="status" value="approved">Approuver</button>
              <button class="btn btn-outline" name="status" value="rejected">Refuser</button>
            </div>
          </form>
        </article>`).join('') : '<p class="empty-state">Aucun dossier KYC en attente.</p>';
      kycTarget.querySelectorAll('[data-kyc-review]').forEach(form => form.addEventListener('submit', async event => {
        event.preventDefault();
        const status = event.submitter?.value;
        if (!['approved', 'rejected'].includes(status)) return;
        const reviewNote = new FormData(form).get('reviewNote');
        try {
          await adminApi(`/admin/kyc/${form.dataset.id}/status`, {
            method: 'POST',
            body: JSON.stringify({ status, reviewNote })
          });
          adminNotice(status === 'approved' ? 'Profil vérifié.' : 'Dossier KYC refusé.');
          await loadAdmin();
        } catch (error) { adminNotice(error.message, 'error'); }
      }));
    } catch (error) {
      kycTarget.innerHTML = `<p class="empty-state">${escapeAdminHtml(error.message)}</p>`;
    }
  }
  document.querySelectorAll('.admin-status').forEach(select => select.addEventListener('change', async event => {
    try {
      await adminApi(`/admin/offers/${event.target.dataset.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: event.target.value })
      });
      adminNotice('Statut de l’offre mis à jour.');
      await loadAdmin();
    } catch (error) {
      adminNotice(error.message, 'error');
    }
  }));
}

document.addEventListener('DOMContentLoaded', () => {
  const loginPanel = document.querySelector('[data-admin-login-panel]');
  const app = document.querySelector('[data-admin-app]');
  const showApp = async () => {
    loginPanel.hidden = true;
    app.hidden = false;
    try { await loadAdmin(); }
    catch (error) {
      localStorage.removeItem(adminTokenKey);
      loginPanel.hidden = false;
      app.hidden = true;
      adminNotice(error.message, 'error');
    }
  };
  document.querySelector('[data-admin-login]').addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const data = await adminApi('/admin/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.target))) });
      localStorage.setItem(adminTokenKey, data.token);
      await showApp();
    } catch (error) { adminNotice(error.message, 'error'); }
  });
  document.querySelector('[data-admin-logout]').addEventListener('click', () => {
    localStorage.removeItem(adminTokenKey);
    location.reload();
  });
  document.querySelector('[data-retry-notifications]')?.addEventListener('click', async event => {
    event.currentTarget.disabled = true;
    try {
      const result = await adminApi('/admin/notifications/retry', { method: 'POST', body: '{}' });
      adminNotice(`${result.sent} alerte(s) envoyée(s), ${result.failed} en échec.`);
    } catch (error) { adminNotice(error.message, 'error'); }
    finally { event.currentTarget.disabled = false; }
  });
  if (localStorage.getItem(adminTokenKey)) showApp();
});
