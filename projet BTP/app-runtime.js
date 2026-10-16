const API = '/api';
const sessionKey = 'afric-connect-token';
const refreshTokenKey = 'afric-connect-refresh-token';

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

async function api(path, options = {}) {
  const token = localStorage.getItem(sessionKey);
  let response = await fetch(`${API}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    },
    ...options
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
}function notice(message, type = 'success') { let element = document.querySelector('.runtime-notice'); if (!element) { element = document.createElement('div'); element.className = 'runtime-notice'; document.body.appendChild(element); } element.className = `runtime-notice ${type}`; element.textContent = message; setTimeout(() => element.remove(), 4200); }
function storeSession(data) {
  if (data.token) localStorage.setItem(sessionKey, data.token);
  if (data.refreshToken) localStorage.setItem(refreshTokenKey, data.refreshToken);
  if (data.user) localStorage.setItem('afric-connect-user', JSON.stringify(data.user));
}
function currentUser() { try { return JSON.parse(localStorage.getItem('afric-connect-user')); } catch { return null; } }
function offerCard(offer) { return `<article class="offer-card"><div class="offer-top"><span class="offer-badge">${offer.urgency}</span><span class="text-link">${offer.category}</span></div><h3>${offer.title}</h3><div class="meta-list"><div class="meta-item"><span>Ville</span><strong>${offer.city}</strong></div><div class="meta-item"><span>Budget</span><strong>${offer.budgetLabel}</strong></div><div class="meta-item"><span>Ã‰chÃ©ance</span><strong>${offer.deadline}</strong></div></div><div class="offer-meta"><span class="offer-price">${offer.applicationsCount} candidature(s)</span><button class="btn btn-secondary apply-offer" data-id="${offer.id}" type="button">Postuler</button></div></article>`; }
function professionalCard(user) { return `<article class="pro-card"><div class="pro-cover" style="background:linear-gradient(135deg, rgba(10,37,64,.78), rgba(255,107,0,.5)), url('https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=800&q=80') center/cover no-repeat"></div><div class="pro-body"><div class="pro-head"><h3>${user.name}</h3><span class="badge">${user.country || 'UEMOA'}</span></div><div class="badges"><span class="badge">${user.verified ? 'KYC VÃ©rifiÃ©' : 'Profil actif'}</span><span class="badge">${user.role === 'professional' ? 'Top Pro' : 'Client'}</span></div><p>${user.expertise || 'Expertise gÃ©nÃ©rale'} Â· ${user.bio || 'Professionnel actif sur AFRIC-CONNECT'}</p><div class="rating">â˜… 4.9 <span>(120 missions)</span></div><div class="pro-footer"><strong>${user.rate || '18 000 FCFA/j'}</strong><span class="badge">CoordonnÃ©es protÃ©gÃ©es</span></div></div></article>`; }

async function loadProfessionals() {
  const grid = document.querySelector('[data-pro-grid]');
  if (!grid) return;
  try {
    const { professionals } = await api('/professionals');
    const users = professionals && professionals.length ? professionals : [];
    const render = (list) => {
      if (!list.length) {
        grid.innerHTML = '<div class="empty-state">Aucun professionnel ne correspond Ã  votre recherche.</div>';
        return;
      }
      grid.innerHTML = list.map(professionalCard).join('');
    };

    const params = new URLSearchParams(window.location.search);
    const initialQuery = params.get('query') || '';
    const initialCity = params.get('city') || '';
    render(users.filter((user) => {
      const text = normalizeText(`${user.name} ${user.country} ${user.expertise} ${user.bio}`);
      const query = normalizeText(initialQuery);
      const city = normalizeText(initialCity);
      return (!query || text.includes(query)) && (!city || normalizeText(user.country).includes(city));
    }));

    const form = document.querySelector('[data-pro-search-form]');
    if (form) {
      const queryField = form.querySelector('[name="query"]');
      const cityField = form.querySelector('[name="city"]');
      if (queryField && initialQuery) queryField.value = initialQuery;
      if (cityField && initialCity) cityField.value = initialCity;
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        const query = String(formData.get('query') || '');
        const city = String(formData.get('city') || '');
        const nextParams = new URLSearchParams();
        if (query) nextParams.set('query', query);
        if (city) nextParams.set('city', city);
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

  return offers.filter((offer) => {
    const matchesCategory = !category || category === 'metier' || category === 'tous' || normalizeText(offer.category).includes(category) || normalizeText(offer.title).includes(category);
    const matchesCity = !city || city === 'ville' || city === 'toutes' || normalizeText(offer.city).includes(city);
    const matchesQuery = !query || normalizeText(`${offer.title} ${offer.category} ${offer.city} ${offer.description || ''}`).includes(query);
    return matchesCategory && matchesCity && matchesQuery;
  });
}

async function loadOffers() {
  const target = document.querySelector('[data-live-offers]');
  if (!target) return;
  try {
    const { offers } = await api('/offers');
    const render = (items) => {
      if (!items.length) {
        target.innerHTML = '<div class="empty-state">Aucune offre ne correspond Ã  votre recherche.</div>';
        return;
      }
      target.innerHTML = items.map(offerCard).join('');
      target.querySelectorAll('.apply-offer').forEach((button) => {
        button.addEventListener('click', async event => {
          const id = event.currentTarget.dataset.id;
          try {
            await api(`/offers/${id}/apply`, { method: 'POST', body: JSON.stringify({}) });
            event.currentTarget.textContent = 'Candidature envoyÃ©e';
            event.currentTarget.disabled = true;
            notice('Votre candidature a Ã©tÃ© envoyÃ©e.');
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
      query: params.get('query') || ''
    };

    const form = document.querySelector('[data-offer-search-form]');
    if (form) {
      const categoryField = form.querySelector('[name="category"]');
      const cityField = form.querySelector('[name="city"]');
      const queryField = form.querySelector('[name="query"]');
      if (categoryField && initialFilters.category) categoryField.value = initialFilters.category;
      if (cityField && initialFilters.city) cityField.value = initialFilters.city;
      if (queryField && initialFilters.query) queryField.value = initialFilters.query;

      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        const filters = {
          category: String(formData.get('category') || ''),
          city: String(formData.get('city') || ''),
          query: String(formData.get('query') || '')
        };
        const nextParams = new URLSearchParams();
        if (filters.category) nextParams.set('category', filters.category);
        if (filters.city) nextParams.set('city', filters.city);
        if (filters.query) nextParams.set('query', filters.query);
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
    location.href = 'dashboard-client.html';
    return;
  }
  if (login) login.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const data = await api('/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(login))) });
      storeSession(data);
      location.href = 'dashboard-client.html';
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
      location.href = 'dashboard-client.html';
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
  const form = document.querySelector('[data-offer-form]');
  const user = currentUser();
  const name = document.querySelector('[data-user-name]');
  if (name && user) name.textContent = user.name;
  if (!form) return;
  if (!user) {
    notice('Connectez-vous pour publier une offre.', 'error');
    location.href = 'auth.html';
    return;
  }
  form.addEventListener('submit', async event => { event.preventDefault(); try { await api('/offers', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) }); notice('Votre appel dâ€™offre est publiÃ© et visible par les professionnels.'); form.reset(); } catch (error) { notice(error.message, 'error'); } });
}

function wireGlobalSearch() {
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

  const proSearch = document.querySelector('[data-pro-search-form]');
  if (proSearch) {
    proSearch.addEventListener('submit', event => {
      event.preventDefault();
      const formData = new FormData(proSearch);
      const query = normalizeText(String(formData.get('query') || ''));
      const city = normalizeText(String(formData.get('city') || ''));
      document.querySelectorAll('.pro-card').forEach((card) => {
        const text = normalizeText(card.textContent);
        const matches = (!query || text.includes(query)) && (!city || text.includes(city));
        card.style.display = matches ? '' : 'none';
      });
    });
  }

  document.querySelectorAll('[data-logout]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      localStorage.removeItem(sessionKey);
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
