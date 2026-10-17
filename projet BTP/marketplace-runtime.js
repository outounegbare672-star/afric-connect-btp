const serviceApi = window.africConnectApi;
const serviceCategories = {
  equipment_rental: ['Pelle hydraulique', 'Bulldozer', 'Grue', 'Camion benne', 'Bétonnière', 'Compacteur', 'Groupe électrogène', 'Nacelle', 'Autre engin'],
  material_sale: ['Gravier', 'Sable', 'Fer à béton', 'Ciment', 'Bois', 'Briques', 'Carrelage', 'Autre matériau']
};
const serviceUnits = {
  equipment_rental: ['jour', 'semaine', 'mois'],
  material_sale: ['tonne', 'm³', 'sac', 'kg', 'barre', 'pièce']
};
const serviceStatusLabels = { new: 'Nouvelle', contacted: 'Contactée', closed: 'Clôturée' };
const serviceEscape = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);
const serviceNotice = (message, type = 'success') => {
  let node = document.querySelector('.runtime-notice');
  if (!node) {
    node = document.createElement('div');
    node.className = 'runtime-notice';
    document.body.appendChild(node);
  }
  node.className = `runtime-notice ${type}`;
  node.textContent = message;
  setTimeout(() => node.remove(), 4200);
};

function updateServiceFields(form) {
  const kind = form.elements.kind.value;
  const category = form.querySelector('[data-service-category]');
  const unit = form.querySelector('[data-service-unit]');
  const condition = form.querySelector('[data-condition-field]');
  const quantityLabel = form.querySelector('[data-quantity-label]');
  category.innerHTML = serviceCategories[kind].map(value => `<option>${serviceEscape(value)}</option>`).join('');
  unit.innerHTML = serviceUnits[kind].map(value => `<option>${serviceEscape(value)}</option>`).join('');
  condition.hidden = kind !== 'equipment_rental';
  quantityLabel.firstChild.textContent = kind === 'equipment_rental' ? 'Nombre d’engins disponibles' : 'Quantité en stock';
  if (kind === 'material_sale') form.elements.condition.value = '';
}

function serviceCard(listing) {
  const isEquipment = listing.kind === 'equipment_rental';
  const detail = isEquipment
    ? `État : ${listing.condition || 'Non précisé'} · ${listing.quantityAvailable} disponible(s)`
    : `Stock : ${listing.quantityAvailable} ${listing.priceUnit}`;
  return `<article class="service-card">
    <div class="service-card-top"><span class="badge">${isEquipment ? 'Location d’engin' : 'Vente de matériaux'}</span><span class="badge">${serviceEscape(listing.country)}</span></div>
    <h3>${serviceEscape(listing.title)}</h3>
    <p class="service-category">${serviceEscape(listing.category)} · ${serviceEscape(listing.city)}</p>
    <p>${serviceEscape(listing.description || 'Contactez le fournisseur pour obtenir les détails de disponibilité.')}</p>
    <div class="service-price">${serviceEscape(Number(listing.price).toLocaleString('fr-FR'))} FCFA <span>/ ${serviceEscape(listing.priceUnit)}</span></div>
    <div class="service-meta"><span>${serviceEscape(detail)}</span>${listing.deliveryAvailable ? '<span>Livraison possible</span>' : ''}</div>
    <button class="btn btn-primary" type="button" data-request-service="${serviceEscape(listing.id)}">Demander disponibilité / contact</button>
    <form class="service-inquiry-form" data-inquiry-form="${serviceEscape(listing.id)}" hidden>
      <label>Quantité demandée<input name="quantity" type="number" min="0.01" step="0.01" max="${serviceEscape(listing.quantityAvailable)}" required value="1" /></label>
      ${isEquipment ? '<label>Date souhaitée (facultatif)<input name="neededFrom" type="date" /></label>' : ''}
      <label>Votre demande<textarea name="message" maxlength="1500" required placeholder="Précisez votre besoin et les modalités souhaitées."></textarea></label>
      <label class="service-consent"><input name="contactShared" type="checkbox" required /> J’autorise le partage de mon nom, email et téléphone avec ce fournisseur pour cette demande.</label>
      <button class="btn btn-secondary" type="submit">Envoyer ma demande</button>
    </form>
  </article>`;
}

async function loadServiceListings(form, target) {
  const params = new URLSearchParams(new FormData(form));
  for (const [key, value] of [...params.entries()]) if (!value) params.delete(key);
  try {
    const { listings } = await serviceApi(`/service-listings${params.size ? `?${params}` : ''}`);
    target.innerHTML = listings.length
      ? listings.map(serviceCard).join('')
      : '<p class="empty-state">Aucune annonce ne correspond à ces critères.</p>';
    target.querySelectorAll('[data-request-service]').forEach(button => button.addEventListener('click', () => {
      const form = target.querySelector(`[data-inquiry-form="${CSS.escape(button.dataset.requestService)}"]`);
      form.hidden = !form.hidden;
      button.textContent = form.hidden ? 'Demander disponibilité / contact' : 'Fermer la demande';
    }));
    target.querySelectorAll('[data-inquiry-form]').forEach(form => form.addEventListener('submit', async event => {
      event.preventDefault();
      const values = new FormData(form);
      try {
        await serviceApi(`/service-listings/${form.dataset.inquiryForm}/inquiries`, {
          method: 'POST',
          body: JSON.stringify({
            quantity: values.get('quantity'),
            neededFrom: values.get('neededFrom') || null,
            message: values.get('message'),
            contactShared: values.has('contactShared')
          })
        });
        form.reset();
        form.hidden = true;
        serviceNotice('Demande envoyée. Le fournisseur pourra vous contacter via les coordonnées partagées.');
      } catch (error) { serviceNotice(error.message, 'error'); }
    }));
  } catch (error) {
    target.innerHTML = `<p class="empty-state">${serviceEscape(error.message)}</p>`;
  }
}

function serviceInquiryCard(inquiry) {
  const listing = inquiry.listing || {};
  const incoming = inquiry.direction === 'incoming';
  const contact = inquiry.requester;
  const contactDetails = contact
    ? `<div class="service-contact"><strong>Coordonnées partagées avec accord :</strong>
        <span>${serviceEscape(contact.name)} · ${serviceEscape(contact.country)}</span>
        <a href="mailto:${serviceEscape(encodeURIComponent(contact.email || ''))}">${serviceEscape(contact.email)}</a>
        ${contact.phone ? `<a href="tel:${serviceEscape(contact.phone.replace(/[^\d+]/g, ''))}">${serviceEscape(contact.phone)}</a>` : ''}
      </div>`
    : '';
  const actions = incoming && inquiry.status !== 'closed'
    ? `<button class="btn btn-outline" type="button" data-inquiry-status="${inquiry.status === 'new' ? 'contacted' : 'closed'}" data-id="${serviceEscape(inquiry.id)}">${inquiry.status === 'new' ? 'Marquer contactée' : 'Clôturer la demande'}</button>`
    : '';
  return `<article class="dashboard-item service-inquiry">
    <div class="application-heading">
      <div><strong>${incoming ? 'Demande reçue' : 'Demande envoyée'} · ${serviceEscape(listing.title)}</strong>
          <p>${serviceEscape(listing.city)}, ${serviceEscape(listing.country)} · ${serviceEscape(inquiry.quantity)} ${listing.kind === 'equipment_rental' ? 'engin(s)' : serviceEscape(listing.priceUnit)} · ${inquiry.neededFrom ? `À partir du ${serviceEscape(inquiry.neededFrom)}` : 'Date non précisée'}</p></div>
      <span class="status ${serviceEscape(inquiry.status)}">${serviceEscape(serviceStatusLabels[inquiry.status] || inquiry.status)}</span>
    </div>
    <p class="application-message">${serviceEscape(inquiry.message)}</p>${contactDetails}${actions}
  </article>`;
}

async function loadServiceDashboard(target) {
  target.innerHTML = '<p>Chargement de vos annonces et demandes…</p>';
  try {
    const [listingResult, inquiryResult] = await Promise.all([
      serviceApi('/service-listings/mine'),
      serviceApi('/service-inquiries')
    ]);
    const listings = listingResult.listings.length
      ? `<h3>Mes annonces</h3>${listingResult.listings.map(listing => `<article class="dashboard-item">
          <div class="application-heading"><div><strong>${serviceEscape(listing.title)}</strong><p>${listing.kind === 'equipment_rental' ? 'Location' : 'Vente'} · ${serviceEscape(listing.city)}, ${serviceEscape(listing.country)} · ${serviceEscape(Number(listing.price).toLocaleString('fr-FR'))} FCFA / ${serviceEscape(listing.priceUnit)}</p></div>
          <span class="status ${serviceEscape(listing.status)}">${listing.status === 'approved' ? 'En ligne' : serviceEscape(listing.status)}</span></div></article>`).join('')}`
      : '<p>Vous n’avez pas encore publié d’annonce.</p>';
    const inquiries = inquiryResult.inquiries.length
      ? `<h3>Demandes de disponibilité et de contact</h3>${inquiryResult.inquiries.map(serviceInquiryCard).join('')}`
      : '<p>Vous n’avez pas encore de demande de contact.</p>';
    target.innerHTML = `${listings}<div class="service-dashboard-inquiries">${inquiries}</div>`;
    target.querySelectorAll('[data-inquiry-status]').forEach(button => button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await serviceApi(`/service-inquiries/${button.dataset.id}/status`, {
          method: 'POST',
          body: JSON.stringify({ status: button.dataset.inquiryStatus })
        });
        serviceNotice('Statut de la demande mis à jour.');
        await loadServiceDashboard(target);
      } catch (error) {
        button.disabled = false;
        serviceNotice(error.message, 'error');
      }
    }));
  } catch (error) {
    target.innerHTML = `<p class="empty-state">${serviceEscape(error.message)}</p>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const filters = document.querySelector('[data-service-filters]');
  const listingTarget = document.querySelector('[data-service-listings]');
  const publishForm = document.querySelector('[data-service-publish]');
  const dashboard = document.querySelector('[data-service-dashboard]');
  if (filters && listingTarget) {
    const params = new URLSearchParams(location.search);
    for (const field of filters.elements) if (field.name && params.has(field.name)) field.value = params.get(field.name);
    filters.addEventListener('submit', event => {
      event.preventDefault();
      const params = new URLSearchParams(new FormData(filters));
      for (const [key, value] of [...params.entries()]) if (!value) params.delete(key);
      history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}#catalogue`);
      loadServiceListings(filters, listingTarget);
    });
    loadServiceListings(filters, listingTarget);
  }
  if (publishForm) {
    updateServiceFields(publishForm);
    publishForm.elements.kind.addEventListener('change', () => updateServiceFields(publishForm));
    publishForm.addEventListener('submit', async event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(publishForm));
      data.deliveryAvailable = publishForm.elements.deliveryAvailable.checked;
      data.price = Number(data.price);
      data.quantityAvailable = Number(data.quantityAvailable);
      try {
        await serviceApi('/service-listings', { method: 'POST', body: JSON.stringify(data) });
        publishForm.reset();
        updateServiceFields(publishForm);
        serviceNotice('Votre annonce est publiée.');
        if (filters && listingTarget) loadServiceListings(filters, listingTarget);
        if (dashboard) loadServiceDashboard(dashboard);
      } catch (error) { serviceNotice(error.message, 'error'); }
    });
  }
  if (dashboard) loadServiceDashboard(dashboard);
});
