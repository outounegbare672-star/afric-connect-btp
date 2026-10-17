const API = '/api';
const sessionKey = 'afric-connect-token';
const refreshTokenKey = 'afric-connect-refresh-token';

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

async function api(path, options = {}) {
  const token = localStorage.getItem(sessionKey);
  let response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  let data = await response.json().catch(() => ({}));
  if (response.status === 401 && token && path !== '/refresh' && path !== '/login' && path !== '/register') {
    const refreshToken = localStorage.getItem(refreshTokenKey);
    if (refreshToken) {
      const refreshed = await fetch(`${API}/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });
      const refreshedData = await refreshed.json().catch(() => ({}));
      if (refreshed.ok) {
        storeSession(refreshedData);
        response = await fetch(`${API}${path}`, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${refreshedData.token}`,
            ...(options.headers || {})
          }
        });
        data = await response.json().catch(() => ({}));
      } else {
        localStorage.removeItem(sessionKey);
        localStorage.removeItem(refreshTokenKey);
        localStorage.removeItem('afric-connect-user');
      }
    }
  }
  if (!response.ok) throw new Error(data.error || 'Une erreur est survenue.');
  return data;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function matchesExpertise(value, selected) {
  const key = normalizeText(selected);
  const aliases = {
    maconnerie: ['maconnerie', 'macon'],
    electricite: ['electricite', 'electricien'],
    menuiserie: ['menuiserie', 'menuisier'],
    route: ['route', 'voirie', 'genie civil'],
    architecture: ['architecture', 'architecte'],
    renovation: ['renovation', 'rehabilitation'],
    geometre: ['geometre', 'topographie'],
    'chef de chantier': ['chef de chantier']
  };
  const text = normalizeText(value);
  return (aliases[key] || [key]).some(term => text.includes(term));
}

function renderOfferCard(offer) {
  const user = currentUser();
  const action = String(offer.id).startsWith('demo-')
    ? '<button class="btn btn-secondary" type="button" disabled>Offre de démonstration</button>'
    : !user
      ? '<a class="btn btn-secondary" href="auth.html">Se connecter pour postuler</a>'
      : user.role === 'professional'
        ? `<button class="btn btn-secondary apply-offer" data-id="${escapeHtml(offer.id)}" type="button">Postuler</button>`
        : '<button class="btn btn-secondary" type="button" disabled>Réservé aux professionnels</button>';
  return `<article class="offer-card"><div class="offer-top"><span class="offer-badge">${escapeHtml(offer.urgency)}</span><span class="text-link">${escapeHtml(offer.category)}</span></div><h3>${escapeHtml(offer.title)}</h3><div class="meta-list"><div class="meta-item"><span>Ville</span><strong>${escapeHtml(offer.city)}</strong></div><div class="meta-item"><span>Budget</span><strong>${escapeHtml(offer.budgetLabel)}</strong></div><div class="meta-item"><span>Échéance</span><strong>${escapeHtml(offer.deadline)}</strong></div></div><div class="offer-meta"><span class="offer-price">${escapeHtml(offer.applicationsCount)} candidature(s)</span>${action}</div></article>`;
}

function renderProfessionalCard(user) {
  const rating = Number(user.averageRating) > 0
    ? `★ ${escapeHtml(Number(user.averageRating).toFixed(1))} <span>(${escapeHtml(user.reviewCount)} avis vérifiés)</span>`
    : 'Aucun avis pour le moment';
  return `<article class="pro-card"><div class="pro-cover" style="background:linear-gradient(135deg, rgba(10,37,64,.78), rgba(255,107,0,.5)), url('https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=800&q=80') center/cover no-repeat"></div><div class="pro-body"><div class="pro-head"><h3>${escapeHtml(user.name)}</h3><span class="badge">${escapeHtml(user.country || 'UEMOA')}</span></div><div class="badges"><span class="badge">${user.verified ? 'KYC vérifié' : 'Profil actif'}</span><span class="badge">Professionnel</span></div><p>${escapeHtml(user.expertise || 'Expertise générale')} · ${escapeHtml(user.bio || 'Professionnel actif sur AFRIC-CONNECT')}</p><div class="rating">${rating}</div><div class="pro-footer"><strong>${escapeHtml(user.rate || '18 000 FCFA/j')}</strong><span class="badge">Coordonnées protégées</span></div></div></article>`;
}

function notice(message, type = 'success') { let element = document.querySelector('.runtime-notice'); if (!element) { element = document.createElement('div'); element.className = 'runtime-notice'; document.body.appendChild(element); } element.className = `runtime-notice ${type}`; element.textContent = message; setTimeout(() => element.remove(), 4200); }
function storeSession(data) {
  if (data.token) localStorage.setItem(sessionKey, data.token);
  if (data.refreshToken) localStorage.setItem(refreshTokenKey, data.refreshToken);
  if (data.user) localStorage.setItem('afric-connect-user', JSON.stringify(data.user));
}
function currentUser() { try { return JSON.parse(localStorage.getItem('afric-connect-user')); } catch { return null; } }
async function loadProfessionals() {
  const grid = document.querySelector('[data-pro-grid]');
  if (!grid) return;
  try {
    const { professionals } = await api('/professionals');
    const users = professionals && professionals.length ? professionals : [];
    const render = (list) => {
      if (!list.length) {
        grid.innerHTML = '<div class="empty-state">Aucun professionnel ne correspond à votre recherche.</div>';
        return;
      }
      grid.innerHTML = list.map(renderProfessionalCard).join('');
    };

    const params = new URLSearchParams(window.location.search);
    const initialQuery = params.get('query') || '';
    const initialCountry = params.get('country') || params.get('city') || '';
    const initialExpertise = params.get('metier') || '';
    const initialVerified = params.get('verified') || '';
    render(users.filter((user) => {
      const text = normalizeText(`${user.name} ${user.country} ${user.expertise} ${user.bio}`);
      const query = normalizeText(initialQuery);
      const country = normalizeText(initialCountry);
      const expertise = normalizeText(initialExpertise);
      const matchesVerified = initialVerified === '' || String(Boolean(user.verified)) === initialVerified;
      return (!query || text.includes(query))
        && (!country || normalizeText(user.country).includes(country))
        && (!expertise || matchesExpertise(user.expertise, expertise))
        && matchesVerified;
    }));

    const form = document.querySelector('[data-pro-search-form]');
    if (form) {
      const queryField = form.querySelector('[name="query"]');
      const countryField = form.querySelector('[name="country"]');
      const expertiseField = form.querySelector('[name="metier"]');
      const verifiedField = form.querySelector('[name="verified"]');
      if (queryField && initialQuery) queryField.value = initialQuery;
      if (countryField && initialCountry) countryField.value = initialCountry;
      if (expertiseField && initialExpertise) expertiseField.value = initialExpertise;
      if (verifiedField && initialVerified) verifiedField.value = initialVerified;
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        const query = String(formData.get('query') || '');
        const country = String(formData.get('country') || '');
        const expertise = String(formData.get('metier') || '');
        const verified = String(formData.get('verified') || '');
        const nextParams = new URLSearchParams();
        if (query) nextParams.set('query', query);
        if (country) nextParams.set('country', country);
        if (expertise) nextParams.set('metier', expertise);
        if (verified) nextParams.set('verified', verified);
        window.location.search = nextParams.toString();
      });
    }
  } catch (error) {
    grid.innerHTML = '<div class="empty-state">Aucun professionnel disponible pour le moment.</div>';
    notice(error.message, 'error');
  }
}

function filterOffers(offers, filters = {}) {
  const category = normalizeText(filters.category || '');
  const city = normalizeText(filters.city || '');
  const query = normalizeText(filters.query || '');
  const urgency = normalizeText(filters.urgency || '');
  const budgetRange = filters.budget || '';

  return offers.filter((offer) => {
    const budget = Number(String(offer.budgetLabel || offer.budget || '').replace(/[^\d]/g, ''));
    const matchesCategory = !category || category === 'metier' || category === 'tous' || matchesExpertise(`${offer.category} ${offer.title} ${offer.description || ''}`, category);
    const matchesCity = !city || city === 'ville' || city === 'toutes' || normalizeText(offer.city).includes(city);
    const matchesQuery = !query || normalizeText(`${offer.title} ${offer.category} ${offer.city} ${offer.description || ''}`).includes(query);
    const matchesUrgency = !urgency || normalizeText(offer.urgency) === urgency;
    const matchesBudget = !budgetRange
      || (budgetRange === '10M' && budget < 10000000)
      || (budgetRange === '30M' && budget >= 10000000 && budget < 30000000)
      || (budgetRange === '80M' && budget >= 30000000 && budget <= 80000000);
    return matchesCategory && matchesCity && matchesQuery && matchesUrgency && matchesBudget;
  });
}

async function loadOffers() {
  const target = document.querySelector('[data-live-offers]');
  if (!target) return;
  try {
    const { offers } = await api('/offers');
    const render = (items) => {
      if (!items.length) {
        target.innerHTML = '<div class="empty-state">Aucune offre ne correspond à votre recherche.</div>';
        return;
      }
      target.innerHTML = items.map(renderOfferCard).join('');
      target.querySelectorAll('.apply-offer').forEach((button) => {
        button.addEventListener('click', async event => {
          const id = event.currentTarget.dataset.id;
          try {
            await api(`/offers/${id}/apply`, { method: 'POST', body: JSON.stringify({}) });
            event.currentTarget.textContent = 'Candidature envoyée';
            event.currentTarget.disabled = true;
            notice('Votre candidature a été envoyée.');
          } catch (error) {
            notice(error.message, 'error');
          }
        });
      });
    };

    const initialData = offers || [];
    const params = new URLSearchParams(window.location.search);
    const initialFilters = {
      category: params.get('category') || '',
      city: params.get('city') || '',
      query: params.get('query') || '',
      budget: params.get('budget') || '',
      urgency: params.get('urgency') || ''
    };

    const form = document.querySelector('[data-offer-search-form]');
    if (form) {
      const categoryField = form.querySelector('[name="category"]');
      const cityField = form.querySelector('[name="city"]');
      const queryField = form.querySelector('[name="query"]');
      const budgetField = form.querySelector('[name="budget"]');
      const urgencyField = form.querySelector('[name="urgency"]');
      if (categoryField && initialFilters.category) categoryField.value = initialFilters.category;
      if (cityField && initialFilters.city) cityField.value = initialFilters.city;
      if (queryField && initialFilters.query) queryField.value = initialFilters.query;
      if (budgetField && initialFilters.budget) budgetField.value = initialFilters.budget;
      if (urgencyField && initialFilters.urgency) urgencyField.value = initialFilters.urgency;

      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        const filters = {
          category: String(formData.get('category') || ''),
          city: String(formData.get('city') || ''),
          query: String(formData.get('query') || ''),
          budget: String(formData.get('budget') || ''),
          urgency: String(formData.get('urgency') || '')
        };
        const nextParams = new URLSearchParams();
        if (filters.category) nextParams.set('category', filters.category);
        if (filters.city) nextParams.set('city', filters.city);
        if (filters.query) nextParams.set('query', filters.query);
        if (filters.budget) nextParams.set('budget', filters.budget);
        if (filters.urgency) nextParams.set('urgency', filters.urgency);
        window.location.search = nextParams.toString();
      });
    }

    render(filterOffers(initialData, initialFilters));
  } catch (error) {
    target.innerHTML = '<div class="empty-state">Impossible de charger les offres pour le moment.</div>';
    notice(error.message, 'error');
  }
}

function wireAuth() {
  const login = document.querySelector('[data-login-form]');
  const register = document.querySelector('[data-register-form]');
  const resetRequest = document.querySelector('[data-password-reset-form]');
  const passwordUpdate = document.querySelector('[data-password-update-form]');
  const showReset = document.querySelector('[data-show-password-reset]');
  const showForm = (selector) => {
    document.querySelectorAll('[data-auth-panel]').forEach(panel => { panel.hidden = true; });
    const panel = document.querySelector(selector);
    if (panel) panel.hidden = false;
  };
  if (document.body.dataset.page === 'auth.html' && currentUser() && !window.location.hash.includes('type=recovery')) {
    location.href = currentUser().role === 'professional' ? 'offres.html' : 'dashboard-client.html';
    return;
  }
  if (login) login.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const data = await api('/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(login))) });
      storeSession(data);
      location.href = data.user.role === 'professional' ? 'offres.html' : 'dashboard-client.html';
    } catch (error) {
      notice(error.message, 'error');
    }
  });
  if (register) register.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const data = await api('/register', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(register))) });
      if (data.confirmationRequired) {
        notice(data.message);
        return;
      }
      storeSession(data);
      location.href = data.user.role === 'professional' ? 'offres.html' : 'dashboard-client.html';
    } catch (error) {
      notice(error.message, 'error');
    }
  });
  if (showReset) showReset.addEventListener('click', () => showForm('[data-reset-panel]'));
  if (resetRequest) resetRequest.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const data = await api('/password-reset', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(new FormData(resetRequest)))
      });
      notice(data.message);
      resetRequest.reset();
    } catch (error) {
      notice(error.message, 'error');
    }
  });
  if (window.location.hash.includes('type=recovery')) {
    const recovery = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = recovery.get('access_token');
    if (accessToken) {
      localStorage.setItem(sessionKey, accessToken);
      const refreshToken = recovery.get('refresh_token');
      if (refreshToken) localStorage.setItem(refreshTokenKey, refreshToken);
      showForm('[data-password-update-panel]');
      history.replaceState(null, '', `${location.pathname}${location.search}`);
    } else {
      notice('Le lien de réinitialisation est invalide ou expiré.', 'error');
    }
  }
  if (passwordUpdate) passwordUpdate.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const data = await api('/password-update', {
        method: 'POST',
        body: JSON.stringify({
          ...Object.fromEntries(new FormData(passwordUpdate)),
          refreshToken: localStorage.getItem(refreshTokenKey)
        })
      });
      localStorage.removeItem(sessionKey);
      localStorage.removeItem(refreshTokenKey);
      localStorage.removeItem('afric-connect-user');
      showForm('[data-login-panel]');
      notice(data.message);
    } catch (error) {
      notice(error.message, 'error');
    }
  });
}
function wireDashboard() {
  const dashboard = document.querySelector('[data-dashboard-stats]');
  const kycForm = document.querySelector('[data-kyc-form]');
  if (!dashboard && !kycForm) return;

  const user = currentUser();
  if (!user) {
    notice('Connectez-vous pour accéder à cet espace.', 'error');
    location.href = 'auth.html';
    return;
  }

  const name = document.querySelector('[data-user-name]');
  if (name) name.textContent = user.name;

  const escape = escapeHtml;
  const statusLabels = {
    pending: 'En attente',
    accepted: 'Acceptée',
    rejected: 'Refusée',
    completed: 'Terminée'
  };
  const formatDate = value => value ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(value)) : '—';

  const loadDashboard = async () => {
    if (!dashboard) return;
    try {
      const data = await api('/dashboard');
      const isClient = data.user.role === 'client';
      document.querySelector('[data-dashboard-role]').textContent = isClient ? 'Espace client' : 'Espace professionnel';
      document.querySelector('[data-applications-heading]').textContent = isClient ? 'Candidatures reçues' : 'Mes candidatures';
      document.querySelectorAll('[data-client-only]').forEach(element => { element.hidden = !isClient; });
      document.querySelectorAll('[data-professional-only]').forEach(element => { element.hidden = isClient; });
      const proLink = document.querySelector('[data-professional-link]');
      if (proLink) proLink.hidden = isClient;
      const stats = data.stats;
      dashboard.innerHTML = isClient
        ? `<div class="metric-box"><span>Offres publiées</span><strong>${escape(stats.offers)}</strong></div>
          <div class="metric-box"><span>Candidatures reçues</span><strong>${escape(stats.applications)}</strong></div>
          <div class="metric-box"><span>À traiter</span><strong>${escape(stats.pending)}</strong></div>
          <div class="metric-box"><span>Projets terminés</span><strong>${escape(stats.completed)}</strong></div>`
        : `<div class="metric-box"><span>Mes candidatures</span><strong>${escape(stats.applications)}</strong></div>
          <div class="metric-box"><span>En attente</span><strong>${escape(stats.pending)}</strong></div>
          <div class="metric-box"><span>Mises en relation</span><strong>${escape(stats.accepted)}</strong></div>
          <div class="metric-box"><span>Projets terminés</span><strong>${escape(stats.completed)}</strong></div>`;

      const offersTarget = document.querySelector('[data-dashboard-offers]');
      if (offersTarget) {
        offersTarget.innerHTML = data.offers.length ? data.offers.map(offer => `
          <article class="dashboard-item">
            <div><strong>${escape(offer.title)}</strong><p>${escape(offer.category)} · ${escape(offer.city)}, ${escape(offer.country)} · ${escape(offer.budgetLabel)}</p></div>
            <span class="status ${escape(offer.status)}">${escape(offer.status === 'approved' ? 'Publiée' : offer.status === 'pending' ? 'En modération' : 'Suspendue')}</span>
          </article>`).join('') : '<p class="empty-state">Vous n’avez pas encore publié d’appel d’offres.</p>';
      }

      const applicationsTarget = document.querySelector('[data-dashboard-applications]');
      if (applicationsTarget) {
        applicationsTarget.innerHTML = data.applications.length ? data.applications.map(application => {
          const alreadyReviewed = application.reviews.some(review => review.reviewerId === data.user.id);
          const canMessage = ['accepted', 'completed'].includes(application.status);
          const clientActions = isClient && application.status === 'pending'
            ? `<button class="btn btn-primary" data-application-status="accepted" data-id="${escape(application.id)}">Accepter</button>
              <button class="btn btn-outline" data-application-status="rejected" data-id="${escape(application.id)}">Refuser</button>`
            : isClient && application.status === 'accepted'
              ? `<button class="btn btn-outline" data-application-status="completed" data-id="${escape(application.id)}">Marquer le projet terminé</button>`
              : '';
          const reviewForm = application.status === 'completed' && !alreadyReviewed
            ? `<form class="form-grid review-form" data-review-form data-id="${escape(application.id)}">
                <label>Votre note<select name="rating" required><option value="5">5 — Excellent</option><option value="4">4 — Très bien</option><option value="3">3 — Bien</option><option value="2">2 — Moyen</option><option value="1">1 — À améliorer</option></select></label>
                <label>Votre avis (facultatif)<textarea name="comment" maxlength="1500"></textarea></label>
                <button class="btn btn-primary">Publier mon avis</button>
              </form>` : '';
          const reviews = application.reviews.length
            ? `<div class="review-list">${application.reviews.map(review => `<p><strong>${escape(review.rating)}/5</strong> · ${escape(review.comment || 'Avis sans commentaire')}</p>`).join('')}</div>`
            : '';
          return `<article class="dashboard-item application-item">
            <div class="application-heading"><div><strong>${escape(application.offer?.title || 'Projet')}</strong>
              <p>${escape(isClient ? application.applicant?.name || 'Professionnel' : application.owner?.name || 'Client')} · ${escape(application.offer?.city || '')}, ${escape(application.offer?.country || '')}</p></div>
              <span class="status ${escape(application.status)}">${escape(statusLabels[application.status] || application.status)}</span></div>
            <p class="application-message">${escape(application.message || 'Aucun message de candidature.')}</p>
            <div class="dashboard-actions">${clientActions}
              ${canMessage ? `<button class="btn btn-secondary" data-open-messages="${escape(application.id)}">Messagerie</button>` : ''}
              ${application.status === 'completed' && !alreadyReviewed ? '<span>Partagez votre avis sur ce projet terminé.</span>' : ''}
            </div>
            ${canMessage ? `<section class="message-panel" data-messages-panel="${escape(application.id)}" hidden>
              <div class="message-list" data-messages-list="${escape(application.id)}">Chargement des messages…</div>
              <form class="message-form" data-message-form data-id="${escape(application.id)}">
                <label class="visually-hidden" for="message-${escape(application.id)}">Votre message</label>
                <textarea id="message-${escape(application.id)}" name="message" maxlength="4000" required placeholder="Écrire un message…"></textarea>
                <button class="btn btn-primary">Envoyer</button>
              </form>
            </section>` : ''}
            ${reviewForm}${reviews}
          </article>`;
        }).join('') : '<p class="empty-state">Aucune candidature pour le moment.</p>';
        wireApplicationActions(applicationsTarget, data.user.id);
      }

      if (user.role === 'professional') await loadNotificationPreferences();
      const offerForm = document.querySelector('[data-offer-form]');
      if (offerForm) {
        offerForm.onsubmit = async event => {
          event.preventDefault();
          try {
            await api('/offers', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(offerForm))) });
            notice('Votre appel d’offre a été envoyé pour validation.');
            offerForm.reset();
            await loadDashboard();
          } catch (error) { notice(error.message, 'error'); }
        };
      }
    } catch (error) {
      dashboard.innerHTML = `<p class="empty-state">${escape(error.message)}</p>`;
      notice(error.message, 'error');
    }
  };

  async function loadNotificationPreferences() {
    const form = document.querySelector('[data-notification-preferences]');
    if (!form) return;
    try {
      const { preferences } = await api('/notifications/preferences');
      for (const checkbox of form.querySelectorAll('input[type="checkbox"]')) {
        if (checkbox.name === 'countries') checkbox.checked = preferences.countries.includes(checkbox.value);
        if (checkbox.name === 'expertise') checkbox.checked = preferences.expertise.includes(checkbox.value);
        if (checkbox.name === 'emailEnabled') checkbox.checked = preferences.email_enabled;
        if (checkbox.name === 'whatsappEnabled') checkbox.checked = preferences.whatsapp_enabled;
      }
      form.onsubmit = async event => {
        event.preventDefault();
        const values = new FormData(form);
        try {
          await api('/notifications/preferences', {
            method: 'POST',
            body: JSON.stringify({
              countries: values.getAll('countries'),
              expertise: values.getAll('expertise'),
              emailEnabled: values.has('emailEnabled'),
              whatsappEnabled: values.has('whatsappEnabled')
            })
          });
          notice('Vos préférences d’alertes ont été enregistrées.');
        } catch (error) { notice(error.message, 'error'); }
      };
    } catch (error) { notice(error.message, 'error'); }
  }

  function wireApplicationActions(target, currentUserId) {
    target.querySelectorAll('[data-application-status]').forEach(button => button.addEventListener('click', async () => {
      try {
        await api(`/applications/${button.dataset.id}/status`, {
          method: 'POST',
          body: JSON.stringify({ status: button.dataset.applicationStatus })
        });
        notice(button.dataset.applicationStatus === 'accepted' ? 'Candidature acceptée : la messagerie est ouverte.' : 'Statut de la candidature mis à jour.');
        await loadDashboard();
      } catch (error) { notice(error.message, 'error'); }
    }));
    target.querySelectorAll('[data-open-messages]').forEach(button => button.addEventListener('click', async () => {
      const id = button.dataset.openMessages;
      const panel = target.querySelector(`[data-messages-panel="${CSS.escape(id)}"]`);
      const list = target.querySelector(`[data-messages-list="${CSS.escape(id)}"]`);
      panel.hidden = !panel.hidden;
      if (panel.hidden || panel.dataset.loaded === 'true') return;
      try {
        const { messages } = await api(`/applications/${id}/messages`);
        list.innerHTML = messages.length ? messages.map(message => `<p class="message-bubble ${message.sender_id === currentUserId ? 'own-message' : ''}"><span>${message.sender_id === currentUserId ? 'Vous' : 'Participant'} · ${escape(formatDate(message.created_at))}</span>${escape(message.message)}</p>`).join('') : '<p>Aucun message. Vous pouvez commencer la conversation.</p>';
        panel.dataset.loaded = 'true';
      } catch (error) { list.textContent = error.message; }
    }));
    target.querySelectorAll('[data-message-form]').forEach(form => form.addEventListener('submit', async event => {
      event.preventDefault();
      const field = form.elements.message;
      try {
        const { message } = await api(`/applications/${form.dataset.id}/messages`, {
          method: 'POST',
          body: JSON.stringify({ message: field.value })
        });
        const list = target.querySelector(`[data-messages-list="${CSS.escape(form.dataset.id)}"]`);
        const bubble = document.createElement('p');
        bubble.className = 'message-bubble own-message';
        bubble.textContent = `Vous · ${formatDate(message.created_at)}\n${message.message}`;
        list.appendChild(bubble);
        field.value = '';
      } catch (error) { notice(error.message, 'error'); }
    }));
    target.querySelectorAll('[data-review-form]').forEach(form => form.addEventListener('submit', async event => {
      event.preventDefault();
      const values = new FormData(form);
      try {
        await api(`/applications/${form.dataset.id}/reviews`, {
          method: 'POST',
          body: JSON.stringify({ rating: values.get('rating'), comment: values.get('comment') })
        });
        notice('Merci, votre avis a été publié.');
        await loadDashboard();
      } catch (error) { notice(error.message, 'error'); }
    }));
  }

  if (dashboard) loadDashboard();
  if (kycForm) wireKycForm(kycForm);
}

function wireKycForm(form) {
  const statusTarget = document.querySelector('[data-kyc-status]');
  const user = currentUser();
  if (!user) return;
  const loadStatus = async () => {
    try {
      const { verified, submission } = await api('/kyc');
      statusTarget.innerHTML = verified
        ? '<p><span class="status approved">Profil vérifié</span></p>'
        : submission
          ? `<p><span class="status ${escapeHtml(submission.status === 'pending' ? 'pending' : submission.status === 'rejected' ? 'blocked' : 'review')}">${escapeHtml(submission.status === 'pending' ? 'En attente de vérification' : submission.status === 'rejected' ? 'Dossier à corriger' : 'Dossier reçu')}</span></p>
             <p>Pièce : ${escapeHtml(submission.document_type)} · Soumis le ${escapeHtml(new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(submission.submitted_at)))}</p>
             ${submission.review_note ? `<p>Note de l’équipe : ${escapeHtml(submission.review_note)}</p>` : ''}`
          : '<p>Aucun dossier soumis.</p>';
      form.hidden = verified || submission?.status === 'pending';
    } catch (error) { statusTarget.textContent = error.message; }
  };
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const submitButton = form.querySelector('button[type="submit"], button:not([type])');
    submitButton.disabled = true;
    try {
      const documents = [];
      for (const [name, field] of [['recto', form.elements.front], ['verso', form.elements.back], ['selfie', form.elements.selfie]]) {
        const file = field.files[0];
        if (!file) continue;
        if (file.size > 4 * 1024 * 1024) throw new Error(`${file.name} dépasse la limite de 4 Mo.`);
        documents.push({ name, content: await readFileAsDataUrl(file) });
      }
      if (!documents.length) throw new Error('Ajoutez au moins un justificatif.');
      const totalSize = documents.reduce((sum, document) => {
        const payload = document.content.slice(document.content.indexOf(',') + 1);
        const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
        return sum + Math.floor((payload.length * 3) / 4) - padding;
      }, 0);
      if (totalSize > 8 * 1024 * 1024) {
        throw new Error('La taille totale des justificatifs dépasse 8 Mo.');
      }
      await api('/kyc', {
        method: 'POST',
        body: JSON.stringify({
          documentType: form.elements.documentType.value,
          documents
        })
      });
      notice('Votre dossier a été transmis de manière sécurisée.');
      form.reset();
      await loadStatus();
    } catch (error) { notice(error.message, 'error'); }
    finally { submitButton.disabled = false; }
  });
  loadStatus();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Lecture du justificatif impossible.'));
    reader.onerror = () => reject(new Error(`Lecture du fichier ${file.name} impossible.`));
    reader.readAsDataURL(file);
  });
}

function wireGlobalSearch() {
  const user = currentUser();
  const headerActions = document.querySelector('.header-actions');
  if (user && headerActions && !headerActions.querySelector('[data-dashboard-link]')) {
    const dashboardLink = document.createElement('a');
    dashboardLink.href = 'dashboard-client.html';
    dashboardLink.className = 'btn btn-outline';
    dashboardLink.dataset.dashboardLink = '';
    dashboardLink.textContent = 'Mon espace';
    headerActions.prepend(dashboardLink);
  }

  const homeSearch = document.querySelector('[data-home-search-form]');
  if (homeSearch) {
    homeSearch.addEventListener('submit', event => {
      event.preventDefault();
      const formData = new FormData(homeSearch);
      const params = new URLSearchParams();
      const category = String(formData.get('category') || '');
      const city = String(formData.get('city') || '');
      if (category) params.set('category', category);
      if (city) params.set('city', city);
      window.location.href = `offres.html${params.toString() ? `?${params.toString()}` : ''}`;
    });
  }

  document.querySelectorAll('[data-logout]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      localStorage.removeItem(sessionKey);
      localStorage.removeItem(refreshTokenKey);
      localStorage.removeItem('afric-connect-user');
      location.href = 'index.html';
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.body) {
    document.body.dataset.page = location.pathname.split('/').pop() || 'index.html';
  }
  wireAuth();
  wireDashboard();
  wireGlobalSearch();
  loadOffers();
  loadProfessionals();
});

window.africConnectApi = api;
