require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const root = __dirname;
const dbPath = path.join(root, 'data', 'db.json');
const port = Number(process.env.PORT || 8000);
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const adminPassword = process.env.ADMIN_PASSWORD || '';
const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : null;
const adminSupabase = supabaseUrl && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : null;
const uemoaCountries = new Set(['Bénin', 'Burkina Faso', "Côte d'Ivoire", 'Guinée-Bissau', 'Mali', 'Niger', 'Sénégal', 'Togo']);
const serviceCategories = {
  equipment_rental: new Set(['Pelle hydraulique', 'Bulldozer', 'Grue', 'Camion benne', 'Bétonnière', 'Compacteur', 'Groupe électrogène', 'Nacelle', 'Autre engin']),
  material_sale: new Set(['Gravier', 'Sable', 'Fer à béton', 'Ciment', 'Bois', 'Briques', 'Carrelage', 'Autre matériau'])
};
const servicePriceUnits = {
  equipment_rental: new Set(['jour', 'semaine', 'mois']),
  material_sale: new Set(['tonne', 'm³', 'sac', 'kg', 'barre', 'pièce'])
};
const serviceConditions = new Set(['', 'Neuf', 'Très bon état', 'Bon état', 'État correct']);
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg'
};

function readDb() {
  if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.writeFileSync(dbPath, JSON.stringify({ users: [], offers: [], sessions: [] }, null, 2));
  }
  return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
}

function writeDb(db) {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  });
  res.end(JSON.stringify(payload));
}

function id() {
  return crypto.randomUUID();
}

function ensureSeedData() {
  const db = readDb();
  if (!Array.isArray(db.users)) db.users = [];
  if (!Array.isArray(db.offers)) db.offers = [];
  if (!Array.isArray(db.sessions)) db.sessions = [];

  const seededUsers = [
    { name: 'Moussa Diop', email: 'moussa.diop@afric-connect.africa', phone: '+2250701010101', country: 'Côte d\'Ivoire', role: 'professional', password: hashPassword('Pro123456'), verified: true, expertise: 'Chef de chantier', rate: '18 000 FCFA/j', bio: '11 ans d’expérience en gros œuvre et coordination de chantiers.' },
    { name: 'Awa Touré', email: 'awa.toure@afric-connect.africa', phone: '+221771234567', country: 'Sénégal', role: 'professional', password: hashPassword('Pro123456'), verified: true, expertise: 'Électricienne', rate: '20 000 FCFA/j', bio: 'Spécialiste en installation électrique et maintenance industrielle.' },
    { name: 'Koffi N’Guessan', email: 'koffi.nguessan@afric-connect.africa', phone: '+2250505050505', country: 'Côte d\'Ivoire', role: 'professional', password: hashPassword('Pro123456'), verified: true, expertise: 'Géomètre', rate: '25 000 FCFA/j', bio: 'Expert en topographie, planimétrie et suivi de chantier.' },
    { name: 'Mariam Sanogo', email: 'mariam.sanogo@afric-connect.africa', phone: '+22370123456', country: 'Mali', role: 'professional', password: hashPassword('Pro123456'), verified: true, expertise: 'Architecte', rate: '35 000 FCFA/j', bio: 'Architecte de projets résidentiels et de bâtiments publics.' },
    { name: 'Client Demo', email: 'client@afric-connect.africa', phone: '+22890000000', country: 'Togo', role: 'client', password: hashPassword('Client123'), verified: false, expertise: '', rate: '', bio: '' }
  ];

  for (const user of seededUsers) {
    if (!db.users.some(item => item.email.toLowerCase() === user.email.toLowerCase())) {
      db.users.push({ id: id(), createdAt: new Date().toISOString(), ...user });
    }
  }

  const demoOffers = [
    { id: 'demo-1', title: 'Construction d’une villa familiale', category: 'Bâtiment', city: 'Abidjan', budget: '18500000', deadline: '12 jours', urgency: 'Urgent', description: 'Construction complète d’une villa familiale.', status: 'approved', ownerId: 'demo', applications: [] },
    { id: 'demo-2', title: 'Rénovation de centre de santé', category: 'Rénovation', city: 'Dakar', budget: '25000000', deadline: '21 jours', urgency: 'Moyen', description: 'Rénovation et mise aux normes d’un centre de santé.', status: 'approved', ownerId: 'demo', applications: [] },
    { id: 'demo-3', title: 'Aménagement de voie d’accès', category: 'Route', city: 'Bamako', budget: '56000000', deadline: '24 jours', urgency: 'Urgent', description: 'Travaux de voirie et drainage sur voie d’accès.', status: 'approved', ownerId: 'demo', applications: [] }
  ];

  for (const offer of demoOffers) {
    if (!db.offers.some(item => item.id === offer.id)) db.offers.push(offer);
  }

  writeDb(db);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

function body(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let received = 0;
    let tooLarge = false;
    req.on('data', chunk => {
      if (tooLarge) return;
      received += chunk.length;
      if (received > maxBytes) {
        tooLarge = true;
        const error = new Error('Requête trop volumineuse.');
        error.statusCode = 413;
        reject(error);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) return;
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('JSON invalide.'));
      }
    });
    req.on('error', reject);
  });
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

function safeUser(profile) {
  return profile && {
    id: profile.id,
    name: profile.full_name,
    email: profile.email,
    phone: profile.phone || '',
    country: profile.country || '',
    role: profile.role,
    verified: Boolean(profile.verified)
  };
}

function safeProfessional(profile) {
  return profile && {
    id: profile.id,
    name: profile.full_name || profile.name,
    country: profile.country || 'Non renseigné',
    role: profile.role,
    verified: Boolean(profile.verified),
    expertise: profile.expertise || 'Expertise générale',
    rate: profile.rate || '18 000 FCFA/j',
    bio: profile.bio || 'Professionnel vérifié sur AFRIC-CONNECT.',
    averageRating: Number(profile.average_rating) || 0,
    reviewCount: Number(profile.review_count) || 0
  };
}

function formatOffer(offer) {
  const budget = offer.budget || 0;
  return {
    id: offer.id,
    title: offer.title,
    category: offer.category,
    city: offer.city,
    country: offer.country || '',
    budgetLabel: `${Number(budget).toLocaleString('fr-FR')} FCFA`,
    deadline: offer.deadline || 'À définir',
    urgency: offer.urgency || 'Moyen',
    description: offer.description || '',
    status: offer.status,
    applicationsCount: Number(offer.applications_count ?? offer.applications?.length ?? 0),
    createdAt: offer.created_at || offer.createdAt
  };
}

function mapOfferRow(row) {
  return {
    ...row,
    ownerId: row.owner_id,
    applications_count: row.applications_count || 0
  };
}

function createUserClient(token) {
  if (!supabase) throw new Error('Supabase n’est pas configuré. Définissez SUPABASE_URL et SUPABASE_ANON_KEY.');
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

function createAnonClient() {
  if (!supabase) throw new Error('Supabase n’est pas configuré. Définissez SUPABASE_URL et SUPABASE_ANON_KEY.');
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

async function authenticatedUser(req) {
  const token = bearerToken(req);
  if (!token) return null;
  const client = createUserClient(token);
  const { data: authData, error: authError } = await client.auth.getUser(token);
  if (authError || !authData.user) return null;
  const { data: profile, error } = await client
    .from('profiles')
    .select('id,full_name,email,phone,country,role,verified,expertise,rate,bio')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (error) throw new Error(`Lecture du profil Supabase impossible : ${error.message}`);
  return profile ? { client, profile } : null;
}

function createAdminToken() {
  const payload = Buffer.from(JSON.stringify({
    exp: Date.now() + 12 * 60 * 60 * 1000,
    nonce: crypto.randomBytes(16).toString('hex')
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', adminPassword).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function authAdmin(req) {
  if (!adminPassword) return false;
  const [payload, signature] = bearerToken(req).split('.');
  if (!payload || !signature) return false;
  const expected = crypto.createHmac('sha256', adminPassword).update(payload).digest();
  let actual;
  try {
    actual = Buffer.from(signature, 'base64url');
  } catch {
    return false;
  }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return false;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).exp > Date.now();
  } catch {
    return false;
  }
}

function requireAdminDatabase(res) {
  if (adminSupabase) return true;
  sendJson(res, 503, { error: 'La clé serveur SUPABASE_SERVICE_ROLE_KEY est nécessaire pour les fonctions administrateur.' });
  return false;
}

function normalized(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function participantOffer(offer) {
  return {
    id: offer.id,
    title: offer.title,
    category: offer.category,
    city: offer.city,
    country: offer.country || '',
    budgetLabel: `${Number(offer.budget || 0).toLocaleString('fr-FR')} FCFA`,
    status: offer.status
  };
}

function formatServiceListing(listing) {
  return {
    id: listing.id,
    kind: listing.kind,
    title: listing.title,
    category: listing.category,
    description: listing.description || '',
    country: listing.country,
    city: listing.city,
    price: Number(listing.price),
    priceUnit: listing.price_unit,
    quantityAvailable: Number(listing.quantity_available),
    condition: listing.item_condition || '',
    deliveryAvailable: Boolean(listing.delivery_available),
    status: listing.status,
    createdAt: listing.created_at
  };
}

async function deliverEmailAlert(recipient, offer) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    throw new Error('Resend n’est pas configuré.');
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(10000),
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL,
      to: [recipient],
      subject: `Nouvel appel d’offres BTP : ${offer.title}`,
      text: `${offer.title}\n${offer.category} - ${offer.city}, ${offer.country}\nBudget : ${Number(offer.budget).toLocaleString('fr-FR')} FCFA\nConsultez AFRIC-CONNECT pour plus de détails.`
    })
  });
  if (!response.ok) throw new Error(`Resend a répondu HTTP ${response.status}.`);
}

async function deliverWhatsAppAlert(recipient, offer) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const templateName = process.env.WHATSAPP_ALERT_TEMPLATE;
  if (!accessToken || !phoneNumberId || !templateName) {
    throw new Error('Meta WhatsApp Cloud API ou son modèle approuvé n’est pas configuré.');
  }
  const version = process.env.WHATSAPP_API_VERSION || 'v23.0';
  const response = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/messages`, {
    method: 'POST',
    signal: AbortSignal.timeout(10000),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: recipient.replace(/[^\d]/g, ''),
      type: 'template',
      template: {
        name: templateName,
        language: { code: process.env.WHATSAPP_ALERT_LANGUAGE || 'fr' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: String(offer.title).slice(0, 256) },
            { type: 'text', text: String(offer.category).slice(0, 128) },
            { type: 'text', text: `${offer.city}, ${offer.country}`.slice(0, 128) },
            { type: 'text', text: `${Number(offer.budget).toLocaleString('fr-FR')} FCFA`.slice(0, 128) }
          ]
        }]
      }
    })
  });
  if (!response.ok) throw new Error(`Meta WhatsApp a répondu HTTP ${response.status}.`);
}

async function dispatchNotification(delivery, offer, profile) {
  const attempt = Number(delivery.attempts || 0) + 1;
  const staleBefore = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: claimed, error: claimError } = await adminSupabase
    .from('notification_deliveries')
    .update({ status: 'sending', attempts: attempt, updated_at: new Date().toISOString() })
    .eq('id', delivery.id)
    .or(`status.in.(pending,failed),and(status.eq.sending,updated_at.lt.${staleBefore})`)
    .select('id')
    .maybeSingle();
  if (claimError) throw new Error(`Réservation de la livraison impossible : ${claimError.message}`);
  if (!claimed) return { sent: false, error: 'Cette alerte a déjà été prise en charge.' };
  try {
    if (delivery.channel === 'email') {
      await deliverEmailAlert(profile.email, offer);
    } else {
      await deliverWhatsAppAlert(profile.phone, offer);
    }
    const { error } = await adminSupabase
      .from('notification_deliveries')
      .update({ status: 'sent', last_error: '', sent_at: new Date().toISOString() })
      .eq('id', delivery.id);
    if (error) throw new Error(`Enregistrement de livraison impossible : ${error.message}`);
    return { sent: true };
  } catch (error) {
    const message = error.message || 'Échec de livraison.';
    const { error: updateError } = await adminSupabase
      .from('notification_deliveries')
      .update({ status: 'failed', last_error: message.slice(0, 500) })
      .eq('id', delivery.id);
    if (updateError) console.error('Échec d’enregistrement de notification :', updateError.message);
    return { sent: false, error: message };
  }
}

async function queueOfferAlerts(offer) {
  if (!adminSupabase || !offer.country) {
    return { sent: 0, failed: 0, skipped: true };
  }
  const { data: preferences, error } = await adminSupabase
    .from('notification_preferences')
    .select('user_id,countries,expertise,email_enabled,whatsapp_enabled');
  if (error) throw new Error(`Chargement des préférences d’alerte impossible : ${error.message}`);
  const matching = (preferences || []).filter(preference => {
    const countryMatches = !preference.countries.length || preference.countries.includes(offer.country);
    const expertiseMatches = !preference.expertise.length
      || preference.expertise.some(item => normalized(item) === normalized(offer.category));
    return countryMatches && expertiseMatches
      && (preference.email_enabled || preference.whatsapp_enabled);
  });
  if (!matching.length) return { sent: 0, failed: 0, skipped: false };

  const userIds = matching.map(preference => preference.user_id);
  const { data: profiles, error: profileError } = await adminSupabase
    .from('profiles')
    .select('id,email,phone')
    .in('id', userIds);
  if (profileError) throw new Error(`Chargement des destinataires d’alerte impossible : ${profileError.message}`);
  const profileById = new Map((profiles || []).map(profile => [profile.id, profile]));
  const pending = [];
  for (const preference of matching) {
    const profile = profileById.get(preference.user_id);
    if (!profile) continue;
    for (const channel of ['email', 'whatsapp']) {
      if (!preference[`${channel}_enabled`]) continue;
      if (channel === 'email' && !profile.email) continue;
      if (channel === 'whatsapp' && !profile.phone) continue;
      const { data, error: queueError } = await adminSupabase
        .from('notification_deliveries')
        .upsert({ offer_id: offer.id, user_id: profile.id, channel }, {
          onConflict: 'offer_id,user_id,channel',
          ignoreDuplicates: true
        })
        .select('id,offer_id,user_id,channel,status,attempts')
        .maybeSingle();
      if (queueError) throw new Error(`Mise en file de l’alerte impossible : ${queueError.message}`);
      if (data) pending.push({ delivery: data, profile });
    }
  }

  const outcomes = await Promise.all(pending.map(({ delivery, profile }) => dispatchNotification(delivery, offer, profile)));
  return {
    sent: outcomes.filter(outcome => outcome.sent).length,
    failed: outcomes.filter(outcome => !outcome.sent).length,
    skipped: false
  };
}

function authSessionResponse(session, profile) {
  return {
    token: session.access_token,
    refreshToken: session.refresh_token,
    user: safeUser(profile)
  };
}

async function profileFor(client, userId) {
  const { data, error } = await client
    .from('profiles')
    .select('id,full_name,email,phone,country,role,verified,expertise,rate,bio')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(`Lecture du profil Supabase impossible : ${error.message}`);
  if (!data) throw new Error('Profil absent dans Supabase. Vérifiez la migration SQL et son déclencheur d’inscription.');
  return data;
}

async function handleApi(req, res, url) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    });
    return res.end();
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    if (!supabase) {
      return sendJson(res, 503, {
        ok: false,
        service: 'afric-connect',
        supabaseConfigured: false
      });
    }
    const { error } = await supabase
      .from('marketplace_offers')
      .select('id,title,category,city,country,budget,deadline,urgency,description,status,applications_count,created_at')
      .limit(1);
    if (error) {
      console.error('Vérification Supabase impossible :', error.message);
      return sendJson(res, 503, {
        ok: false,
        service: 'afric-connect',
        supabaseConfigured: true,
        databaseReady: false
      });
    }
    return sendJson(res, 200, {
      ok: true,
      service: 'afric-connect',
      supabaseConfigured: true,
      databaseReady: true
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/offers') {
    const db = readDb();
    if (!supabase) {
      return sendJson(res, 200, { offers: db.offers.filter(item => item.status === 'approved').map(formatOffer) });
    }
    const { data, error } = await supabase
      .from('marketplace_offers')
      .select('id,title,category,city,country,budget,deadline,urgency,description,status,applications_count,created_at')
      .eq('status', 'approved')
      .order('created_at', { ascending: false });
    if (error) throw new Error(`Chargement des offres Supabase impossible : ${error.message}`);
    const offers = [...(data || []).map(row => formatOffer(mapOfferRow(row)))];
    const seen = new Set(offers.map(offer => offer.id));
    for (const offer of db.offers.filter(item => item.status === 'approved')) {
      if (!seen.has(offer.id)) offers.push(formatOffer(offer));
    }
    return sendJson(res, 200, { offers });
  }

  if (req.method === 'GET' && url.pathname === '/api/professionals') {
    const db = readDb();
    let professionals = [];
    if (supabase) {
      const { data, error } = await supabase
        .from('marketplace_professionals')
        .select('id,full_name,country,role,verified,expertise,rate,bio')
        .order('created_at', { ascending: false });
      if (error) throw new Error(`Chargement des profils Supabase impossible : ${error.message}`);
      const profiles = data || [];
      const { data: ratings, error: ratingsError } = profiles.length
        ? await supabase
          .from('marketplace_professional_ratings')
          .select('professional_id,average_rating,review_count')
          .in('professional_id', profiles.map(profile => profile.id))
        : { data: [], error: null };
      if (ratingsError) throw new Error(`Chargement des avis professionnels impossible : ${ratingsError.message}`);
      const ratingsById = new Map((ratings || []).map(rating => [rating.professional_id, rating]));
      professionals = profiles.map(profile => safeProfessional({
        ...profile,
        ...ratingsById.get(profile.id)
      }));
    }
    const seen = new Set(professionals.map(item => item.id));
    for (const professional of db.users.filter(user => user.role === 'professional').map(safeProfessional)) {
      if (!seen.has(professional.id)) professionals.push(professional);
    }
    return sendJson(res, 200, { professionals });
  }

  if (req.method === 'GET' && url.pathname === '/api/service-listings') {
    if (!supabase) return sendJson(res, 503, { error: 'Supabase doit être configuré pour consulter les annonces.' });
    const kind = url.searchParams.get('kind') || '';
    const country = url.searchParams.get('country') || '';
    const query = String(url.searchParams.get('query') || '')
      .replace(/[^\p{L}\p{N} -]/gu, '')
      .trim()
      .slice(0, 100);
    if (kind && !Object.hasOwn(serviceCategories, kind)) {
      return sendJson(res, 400, { error: 'Type d’annonce invalide.' });
    }
    if (country && !uemoaCountries.has(country)) {
      return sendJson(res, 400, { error: 'Le pays doit faire partie de l’UEMOA.' });
    }
    let request = supabase
      .from('service_listings')
      .select('id,kind,title,category,description,country,city,price,price_unit,quantity_available,item_condition,delivery_available,status,created_at')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(100);
    if (kind) request = request.eq('kind', kind);
    if (country) request = request.eq('country', country);
    if (query) request = request.or(`title.ilike.%${query}%,category.ilike.%${query}%,city.ilike.%${query}%`);
    const { data, error } = await request;
    if (error) throw new Error(`Chargement des annonces de location et matériaux impossible : ${error.message}`);
    return sendJson(res, 200, { listings: (data || []).map(formatServiceListing) });
  }

  if (req.method === 'POST' && url.pathname === '/api/register') {
    const data = await body(req);
    if (!data.name || !data.email || !data.password || data.password.length < 8 || !uemoaCountries.has(data.country)) {
      return sendJson(res, 400, { error: 'Nom, pays UEMOA, email et mot de passe de 8 caractères minimum requis.' });
    }
    if (data.role && !['client', 'professional'].includes(data.role)) {
      return sendJson(res, 400, { error: 'Le rôle doit être client ou professionnel.' });
    }
    if (!supabase) return sendJson(res, 503, { error: 'Supabase est nécessaire pour créer un compte.' });
    const { data: authData, error } = await createAnonClient().auth.signUp({
      email: String(data.email).trim().toLowerCase(),
      password: data.password,
      options: {
        data: {
          full_name: String(data.name).trim(),
          phone: String(data.phone || '').trim(),
          country: data.country,
          role: data.role || 'client'
        }
      }
    });
    if (error) {
      const status = error.status === 422 ? 409 : 400;
      return sendJson(res, status, { error: error.message });
    }
    if (!authData.session) {
      return sendJson(res, 202, {
        confirmationRequired: true,
        message: 'Compte créé. Consultez votre boîte mail pour confirmer votre adresse avant de vous connecter.'
      });
    }
    const profile = await profileFor(createUserClient(authData.session.access_token), authData.user.id);
    return sendJson(res, 201, authSessionResponse(authData.session, profile));
  }

  if (req.method === 'POST' && url.pathname === '/api/login') {
    const data = await body(req);
    if (!supabase) return sendJson(res, 503, { error: 'Supabase est nécessaire pour se connecter.' });
    const { data: authData, error } = await createAnonClient().auth.signInWithPassword({
      email: String(data.email || '').trim().toLowerCase(),
      password: data.password || ''
    });
    if (error || !authData.session || !authData.user) {
      return sendJson(res, 401, { error: 'Email ou mot de passe incorrect. Vérifiez aussi votre confirmation email.' });
    }
    const profile = await profileFor(createUserClient(authData.session.access_token), authData.user.id);
    return sendJson(res, 200, authSessionResponse(authData.session, profile));
  }

  if (req.method === 'POST' && url.pathname === '/api/refresh') {
    const data = await body(req);
    if (!supabase || !data.refreshToken) return sendJson(res, 401, { error: 'Session expirée. Reconnectez-vous.' });
    const { data: authData, error } = await createAnonClient().auth.refreshSession({ refresh_token: data.refreshToken });
    if (error || !authData.session || !authData.user) {
      return sendJson(res, 401, { error: 'Session expirée. Reconnectez-vous.' });
    }
    const profile = await profileFor(createUserClient(authData.session.access_token), authData.user.id);
    return sendJson(res, 200, authSessionResponse(authData.session, profile));
  }

  if (req.method === 'POST' && url.pathname === '/api/password-reset') {
    const data = await body(req);
    if (!supabase) return sendJson(res, 503, { error: 'Supabase est nécessaire pour réinitialiser un mot de passe.' });
    const redirectTo = process.env.SUPABASE_REDIRECT_URL || 'http://localhost:8000/auth.html';
    const { error } = await createAnonClient().auth.resetPasswordForEmail(String(data.email || '').trim().toLowerCase(), { redirectTo });
    if (error) return sendJson(res, 400, { error: error.message });
    return sendJson(res, 200, { message: 'Si ce compte existe, un lien de réinitialisation vient d’être envoyé.' });
  }

  if (req.method === 'POST' && url.pathname === '/api/password-update') {
    const data = await body(req);
    if (!data.password || data.password.length < 8) {
      return sendJson(res, 400, { error: 'Le nouveau mot de passe doit contenir au moins 8 caractères.' });
    }
    const token = bearerToken(req);
    if (!token || !data.refreshToken || !supabase) {
      return sendJson(res, 401, { error: 'Lien de réinitialisation invalide ou expiré.' });
    }
    const client = createUserClient(token);
    const { error: sessionError } = await client.auth.setSession({
      access_token: token,
      refresh_token: data.refreshToken
    });
    if (sessionError) return sendJson(res, 401, { error: 'Lien de réinitialisation invalide ou expiré.' });
    const { data: authData, error } = await client.auth.updateUser({ password: data.password });
    if (error || !authData.user) return sendJson(res, 401, { error: error?.message || 'Lien de réinitialisation invalide ou expiré.' });
    return sendJson(res, 200, { message: 'Mot de passe mis à jour. Vous pouvez vous connecter.' });
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/login') {
    const data = await body(req);
    if (!adminPassword) return sendJson(res, 503, { error: 'Accès administrateur non configuré.' });
    if (!data.password || data.password !== adminPassword) return sendJson(res, 401, { error: 'Identifiants administrateur incorrects.' });
    return sendJson(res, 200, { token: createAdminToken(), admin: true });
  }

  if (url.pathname.startsWith('/api/admin/')) {
    if (!authAdmin(req)) return sendJson(res, 401, { error: 'Accès administrateur requis.' });
    if (!requireAdminDatabase(res)) return;
    if (req.method === 'GET' && url.pathname === '/api/admin/overview') {
      const [usersResult, offersResult, applicationsResult] = await Promise.all([
        adminSupabase.from('profiles').select('id,full_name,email,phone,country,role,verified,expertise,rate,bio,created_at'),
        adminSupabase.from('marketplace_offers').select('id,title,category,city,country,budget,deadline,urgency,description,status,applications_count,created_at'),
        adminSupabase.from('marketplace_applications').select('id', { count: 'exact', head: true })
      ]);
      const error = usersResult.error || offersResult.error || applicationsResult.error;
      if (error) throw new Error(`Chargement de l’administration Supabase impossible : ${error.message}`);
      const users = (usersResult.data || []).map(safeUser);
      const offers = (offersResult.data || []).map(row => formatOffer(mapOfferRow(row)));
      const stats = {
        users: users.length,
        offers: offers.length,
        applications: applicationsResult.count || 0,
        pending: offers.filter(offer => offer.status === 'pending').length
      };
      return sendJson(res, 200, { users, offers, stats });
    }
    const statusMatch = url.pathname.match(/^\/api\/admin\/offers\/([^/]+)\/status$/);
    if (req.method === 'POST' && statusMatch) {
      const data = await body(req);
      if (!['approved', 'pending', 'suspended'].includes(data.status)) {
        return sendJson(res, 400, { error: 'Statut invalide.' });
      }
      const { data: previousOffer, error: previousError } = await adminSupabase
        .from('marketplace_offers')
        .select('id,status')
        .eq('id', statusMatch[1])
        .maybeSingle();
      if (previousError) throw new Error(`Lecture de l’offre impossible : ${previousError.message}`);
      if (!previousOffer) return sendJson(res, 404, { error: 'Offre introuvable.' });
      const { data: offer, error } = await adminSupabase
        .from('marketplace_offers')
        .update({ status: data.status })
        .eq('id', statusMatch[1])
        .select('id,title,category,city,country,budget,deadline,urgency,description,status,applications_count,created_at')
        .maybeSingle();
      if (error) throw new Error(`Mise à jour Supabase impossible : ${error.message}`);
      if (!offer) return sendJson(res, 404, { error: 'Offre introuvable.' });
      let notifications = null;
      if (previousOffer.status !== 'approved' && offer.status === 'approved') {
        notifications = await queueOfferAlerts(offer);
      }
      return sendJson(res, 200, {
        offer: formatOffer(mapOfferRow(offer)),
        notifications
      });
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/kyc') {
      const { data: submissions, error } = await adminSupabase
        .from('kyc_submissions')
        .select('id,user_id,document_type,document_paths,status,review_note,submitted_at')
        .eq('status', 'pending')
        .order('submitted_at', { ascending: true });
      if (error) throw new Error(`Chargement des dossiers KYC impossible : ${error.message}`);
      const userIds = [...new Set((submissions || []).map(submission => submission.user_id))];
      const { data: profiles, error: profilesError } = userIds.length
        ? await adminSupabase.from('profiles').select('id,full_name,email,country,role').in('id', userIds)
        : { data: [], error: null };
      if (profilesError) throw new Error(`Chargement des profils KYC impossible : ${profilesError.message}`);
      const profileById = new Map((profiles || []).map(profile => [profile.id, profile]));
      const kyc = await Promise.all((submissions || []).map(async submission => {
        const documents = await Promise.all(submission.document_paths.map(async filePath => {
          const { data, error: urlError } = await adminSupabase.storage
            .from('kyc-documents')
            .createSignedUrl(filePath, 300);
          if (urlError) throw new Error(`Accès temporaire au justificatif impossible : ${urlError.message}`);
          return data.signedUrl;
        }));
        const profile = profileById.get(submission.user_id);
        return {
          id: submission.id,
          documentType: submission.document_type,
          status: submission.status,
          reviewNote: submission.review_note,
          submittedAt: submission.submitted_at,
          documents,
          user: profile ? {
            id: profile.id,
            name: profile.full_name,
            email: profile.email,
            country: profile.country,
            role: profile.role
          } : null
        };
      }));
      return sendJson(res, 200, { submissions: kyc });
    }
    const kycStatusMatch = url.pathname.match(/^\/api\/admin\/kyc\/([^/]+)\/status$/);
    if (req.method === 'POST' && kycStatusMatch) {
      const data = await body(req);
      if (!['approved', 'rejected'].includes(data.status)) {
        return sendJson(res, 400, { error: 'Le statut KYC doit être approuvé ou rejeté.' });
      }
      const { data: submission, error } = await adminSupabase.rpc('review_afric_connect_kyc', {
        p_submission_id: kycStatusMatch[1],
        p_status: data.status,
        p_review_note: String(data.reviewNote || '').trim().slice(0, 1000)
      });
      if (error) throw new Error(`Mise à jour KYC impossible : ${error.message}`);
      const reviewed = Array.isArray(submission) ? submission[0] : submission;
      if (!reviewed) return sendJson(res, 404, { error: 'Dossier KYC introuvable ou déjà traité.' });
      return sendJson(res, 200, { id: reviewed.id, status: reviewed.status });
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/notifications/retry') {
      const staleBefore = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const { data: deliveries, error } = await adminSupabase
        .from('notification_deliveries')
        .select('id,offer_id,user_id,channel,status,attempts')
        .or(`status.in.(pending,failed),and(status.eq.sending,updated_at.lt.${staleBefore})`)
        .order('created_at', { ascending: true })
        .limit(50);
      if (error) throw new Error(`Chargement des alertes à relancer impossible : ${error.message}`);
      const outcomes = await Promise.all((deliveries || []).map(async delivery => {
        const [offerResult, profileResult] = await Promise.all([
          adminSupabase.from('marketplace_offers').select('id,title,category,city,country,budget').eq('id', delivery.offer_id).maybeSingle(),
          adminSupabase.from('profiles').select('id,email,phone').eq('id', delivery.user_id).maybeSingle()
        ]);
        if (offerResult.error || profileResult.error) {
          return { sent: false, error: offerResult.error?.message || profileResult.error?.message };
        }
        if (!offerResult.data || !profileResult.data) return { sent: false, error: 'Destinataire ou offre introuvable.' };
        return dispatchNotification(delivery, offerResult.data, profileResult.data);
      }));
      return sendJson(res, 200, {
        processed: outcomes.length,
        sent: outcomes.filter(outcome => outcome.sent).length,
        failed: outcomes.filter(outcome => !outcome.sent).length
      });
    }
    return sendJson(res, 404, { error: 'Route administrateur introuvable.' });
  }

  const authenticated = await authenticatedUser(req);
  if (req.method === 'GET' && url.pathname === '/api/me') {
    return authenticated
      ? sendJson(res, 200, { user: safeUser(authenticated.profile) })
      : sendJson(res, 401, { error: 'Session expirée.' });
  }
  if (!authenticated) return sendJson(res, 401, { error: 'Connectez-vous pour continuer.' });

  if (req.method === 'POST' && url.pathname === '/api/service-listings') {
    const data = await body(req);
    const kind = data.kind;
    const title = String(data.title || '').trim();
    const category = String(data.category || '').trim();
    const city = String(data.city || '').trim();
    const country = String(data.country || '');
    const description = String(data.description || '').trim();
    const price = Number(data.price);
    const quantityAvailable = Number(data.quantityAvailable);
    const priceUnit = String(data.priceUnit || '');
    const condition = String(data.condition || '');
    if (!Object.hasOwn(serviceCategories, kind)
      || !serviceCategories[kind].has(category)
      || !servicePriceUnits[kind].has(priceUnit)
      || !uemoaCountries.has(country)
      || !title || title.length > 120
      || city.length < 2 || city.length > 100
      || description.length > 2000
      || !Number.isFinite(price) || price <= 0 || price > 1_000_000_000_000
      || !Number.isFinite(quantityAvailable) || quantityAvailable <= 0 || quantityAvailable > 1_000_000_000
      || !serviceConditions.has(condition)
      || (kind === 'material_sale' && condition && condition !== 'Neuf')) {
      return sendJson(res, 400, { error: 'Vérifiez le type, la catégorie, le prix, la quantité et la localisation de l’annonce.' });
    }
    const { data: listing, error } = await authenticated.client
      .from('service_listings')
      .insert({
        kind,
        title,
        category,
        description,
        country,
        city,
        price,
        price_unit: priceUnit,
        quantity_available: quantityAvailable,
        item_condition: condition,
        delivery_available: data.deliveryAvailable === true,
        owner_id: authenticated.profile.id,
        status: 'approved'
      })
      .select('id,kind,title,category,description,country,city,price,price_unit,quantity_available,item_condition,delivery_available,status,created_at')
      .single();
    if (error) throw new Error(`Publication de l’annonce impossible : ${error.message}`);
    return sendJson(res, 201, { listing: formatServiceListing(listing) });
  }

  if (req.method === 'GET' && url.pathname === '/api/service-listings/mine') {
    const { data, error } = await authenticated.client
      .from('service_listings')
      .select('id,kind,title,category,description,country,city,price,price_unit,quantity_available,item_condition,delivery_available,status,created_at')
      .eq('owner_id', authenticated.profile.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw new Error(`Chargement de vos annonces impossible : ${error.message}`);
    return sendJson(res, 200, { listings: (data || []).map(formatServiceListing) });
  }

  const serviceInquiryMatch = url.pathname.match(/^\/api\/service-listings\/([^/]+)\/inquiries$/);
  if (req.method === 'POST' && serviceInquiryMatch) {
    const data = await body(req);
    const listingId = serviceInquiryMatch[1];
    const quantity = Number(data.quantity);
    const message = String(data.message || '').trim();
    const neededFrom = data.neededFrom ? String(data.neededFrom) : null;
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000_000
      || message.length < 1 || message.length > 1500
      || data.contactShared !== true
      || (neededFrom && !/^\d{4}-\d{2}-\d{2}$/.test(neededFrom))) {
      return sendJson(res, 400, { error: 'Indiquez une quantité, un message et votre accord de partage de coordonnées.' });
    }
    if (neededFrom) {
      const requestedDate = new Date(`${neededFrom}T00:00:00Z`);
      if (Number.isNaN(requestedDate.getTime()) || requestedDate.toISOString().slice(0, 10) !== neededFrom) {
        return sendJson(res, 400, { error: 'La date souhaitée est invalide.' });
      }
    }
    const { data: listing, error: listingError } = await authenticated.client
      .from('service_listings')
      .select('id,owner_id,quantity_available')
      .eq('id', listingId)
      .eq('status', 'approved')
      .maybeSingle();
    if (listingError) throw new Error(`Vérification de l’annonce impossible : ${listingError.message}`);
    if (!listing) return sendJson(res, 404, { error: 'Annonce introuvable ou indisponible.' });
    if (listing.owner_id === authenticated.profile.id) {
      return sendJson(res, 400, { error: 'Vous ne pouvez pas demander votre propre annonce.' });
    }
    if (quantity > Number(listing.quantity_available)) {
      return sendJson(res, 400, { error: 'La quantité demandée dépasse le stock ou le nombre d’engins disponibles.' });
    }
    const { data: inquiry, error } = await authenticated.client
      .from('service_inquiries')
      .insert({
        listing_id: listing.id,
        requester_id: authenticated.profile.id,
        quantity,
        needed_from: neededFrom,
        message,
        contact_shared: true
      })
      .select('id,status,created_at')
      .single();
    if (error?.code === '23505') return sendJson(res, 409, { error: 'Vous avez déjà envoyé une demande pour cette annonce.' });
    if (error) throw new Error(`Envoi de la demande de disponibilité impossible : ${error.message}`);
    return sendJson(res, 201, { inquiry });
  }

  if (req.method === 'GET' && url.pathname === '/api/service-inquiries') {
    if (!requireAdminDatabase(res)) return;
    const { data: inquiries, error } = await authenticated.client
      .from('service_inquiries')
      .select('id,listing_id,requester_id,quantity,needed_from,message,contact_shared,status,created_at,updated_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw new Error(`Chargement des demandes de contact impossible : ${error.message}`);
    if (!inquiries?.length) return sendJson(res, 200, { inquiries: [] });
    const listingIds = [...new Set(inquiries.map(inquiry => inquiry.listing_id))];
    const { data: listings, error: listingError } = await authenticated.client
      .from('service_listings')
      .select('id,kind,title,category,country,city,price,price_unit,owner_id')
      .in('id', listingIds);
    if (listingError) throw new Error(`Chargement des annonces associées impossible : ${listingError.message}`);
    const listingsById = new Map((listings || []).map(listing => [listing.id, listing]));
    const incoming = inquiries.filter(inquiry => listingsById.get(inquiry.listing_id)?.owner_id === authenticated.profile.id);
    let profilesById = new Map();
    if (incoming.length) {
      const requesterIds = [...new Set(incoming.filter(inquiry => inquiry.contact_shared).map(inquiry => inquiry.requester_id))];
      const { data: profiles, error: profileError } = requesterIds.length
        ? await adminSupabase.from('profiles').select('id,full_name,email,phone,country,role').in('id', requesterIds)
        : { data: [], error: null };
      if (profileError) throw new Error(`Chargement des coordonnées des demandeurs impossible : ${profileError.message}`);
      profilesById = new Map((profiles || []).map(profile => [profile.id, profile]));
    }
    return sendJson(res, 200, {
      inquiries: inquiries.map(inquiry => {
        const listing = listingsById.get(inquiry.listing_id);
        const isIncoming = listing?.owner_id === authenticated.profile.id;
        const requester = isIncoming && inquiry.contact_shared ? profilesById.get(inquiry.requester_id) : null;
        return {
          id: inquiry.id,
          quantity: Number(inquiry.quantity),
          neededFrom: inquiry.needed_from,
          message: inquiry.message,
          status: inquiry.status,
          createdAt: inquiry.created_at,
          updatedAt: inquiry.updated_at,
          direction: isIncoming ? 'incoming' : 'outgoing',
          listing: listing ? {
            id: listing.id,
            kind: listing.kind,
            title: listing.title,
            category: listing.category,
            country: listing.country,
            city: listing.city,
            price: Number(listing.price),
            priceUnit: listing.price_unit
          } : null,
          requester: requester ? {
            name: requester.full_name,
            email: requester.email,
            phone: requester.phone,
            country: requester.country,
            role: requester.role
          } : null
        };
      })
    });
  }

  const serviceInquiryStatusMatch = url.pathname.match(/^\/api\/service-inquiries\/([^/]+)\/status$/);
  if (req.method === 'POST' && serviceInquiryStatusMatch) {
    const data = await body(req);
    if (!['contacted', 'closed'].includes(data.status)) {
      return sendJson(res, 400, { error: 'Statut de demande invalide.' });
    }
    const { data: inquiry, error } = await authenticated.client
      .from('service_inquiries')
      .update({ status: data.status })
      .eq('id', serviceInquiryStatusMatch[1])
      .select('id,status,updated_at')
      .maybeSingle();
    if (error) throw new Error(`Mise à jour de la demande impossible : ${error.message}`);
    if (!inquiry) return sendJson(res, 404, { error: 'Demande introuvable ou vous n’êtes pas le vendeur.' });
    return sendJson(res, 200, { inquiry });
  }

  if (req.method === 'GET' && url.pathname === '/api/dashboard') {
    if (!requireAdminDatabase(res)) return;
    const userId = authenticated.profile.id;
    let offers = [];
    let applications = [];
    if (authenticated.profile.role === 'client') {
      const { data, error } = await adminSupabase
        .from('marketplace_offers')
        .select('id,title,category,city,country,budget,deadline,urgency,description,status,applications_count,created_at,owner_id')
        .eq('owner_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(`Chargement de vos offres impossible : ${error.message}`);
      offers = data || [];
      const offerIds = offers.map(offer => offer.id);
      if (offerIds.length) {
        const { data: rows, error: applicationsError } = await adminSupabase
          .from('marketplace_applications')
          .select('id,offer_id,applicant_id,message,status,created_at,updated_at')
          .in('offer_id', offerIds)
          .order('created_at', { ascending: false });
        if (applicationsError) throw new Error(`Chargement des candidatures reçues impossible : ${applicationsError.message}`);
        applications = rows || [];
      }
    } else {
      const { data: rows, error } = await adminSupabase
        .from('marketplace_applications')
        .select('id,offer_id,applicant_id,message,status,created_at,updated_at')
        .eq('applicant_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(`Chargement de vos candidatures impossible : ${error.message}`);
      applications = rows || [];
      const offerIds = [...new Set(applications.map(application => application.offer_id))];
      if (offerIds.length) {
        const { data: rows, error: offersError } = await adminSupabase
          .from('marketplace_offers')
          .select('id,title,category,city,country,budget,deadline,urgency,description,status,applications_count,created_at,owner_id')
          .in('id', offerIds);
        if (offersError) throw new Error(`Chargement des projets associés impossible : ${offersError.message}`);
        offers = rows || [];
      }
    }

    const participantIds = [...new Set([
      userId,
      ...applications.map(application => application.applicant_id),
      ...offers.map(offer => offer.owner_id)
    ])];
    const [profilesResult, reviewsResult] = await Promise.all([
      adminSupabase.from('profiles').select('id,full_name,country,role,verified,expertise').in('id', participantIds),
      applications.length
        ? adminSupabase.from('project_reviews').select('application_id,reviewer_id,reviewee_id,rating,comment,created_at').in('application_id', applications.map(application => application.id))
        : Promise.resolve({ data: [], error: null })
    ]);
    if (profilesResult.error) throw new Error(`Chargement des participants impossible : ${profilesResult.error.message}`);
    if (reviewsResult.error) throw new Error(`Chargement des avis impossible : ${reviewsResult.error.message}`);
    const profilesById = new Map((profilesResult.data || []).map(profile => [profile.id, profile]));
    const offersById = new Map(offers.map(offer => [offer.id, offer]));
    const reviewsByApplication = new Map();
    for (const review of reviewsResult.data || []) {
      const items = reviewsByApplication.get(review.application_id) || [];
      items.push({
        reviewerId: review.reviewer_id,
        revieweeId: review.reviewee_id,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.created_at
      });
      reviewsByApplication.set(review.application_id, items);
    }
    const safeParticipant = profile => profile ? {
      id: profile.id,
      name: profile.full_name,
      country: profile.country,
      role: profile.role,
      verified: Boolean(profile.verified),
      expertise: profile.expertise
    } : null;
    const applicationViews = applications.map(application => {
      const offer = offersById.get(application.offer_id);
      const owner = offer ? profilesById.get(offer.owner_id) : null;
      const applicant = profilesById.get(application.applicant_id);
      return {
        id: application.id,
        message: application.message,
        status: application.status,
        createdAt: application.created_at,
        updatedAt: application.updated_at,
        offer: offer ? participantOffer(offer) : null,
        applicant: safeParticipant(applicant),
        owner: safeParticipant(owner),
        reviews: reviewsByApplication.get(application.id) || []
      };
    });
    return sendJson(res, 200, {
      user: safeUser(authenticated.profile),
      offers: offers.filter(offer => offer.owner_id === userId).map(offer => ({
        ...formatOffer(offer),
        country: offer.country || '',
        applications: applicationViews.filter(application => application.offer?.id === offer.id)
      })),
      applications: applicationViews,
      stats: {
        offers: offers.filter(offer => offer.owner_id === userId).length,
        applications: applicationViews.length,
        pending: applicationViews.filter(application => application.status === 'pending').length,
        accepted: applicationViews.filter(application => application.status === 'accepted').length,
        completed: applicationViews.filter(application => application.status === 'completed').length
      }
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/notifications/preferences') {
    const { data, error } = await authenticated.client
      .from('notification_preferences')
      .select('countries,expertise,email_enabled,whatsapp_enabled,updated_at')
      .eq('user_id', authenticated.profile.id)
      .maybeSingle();
    if (error) throw new Error(`Chargement des préférences de notification impossible : ${error.message}`);
    return sendJson(res, 200, {
      preferences: data || {
        countries: [],
        expertise: [],
        email_enabled: false,
        whatsapp_enabled: false
      }
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/notifications/preferences') {
    if (authenticated.profile.role !== 'professional') {
      return sendJson(res, 403, { error: 'Les alertes d’appels d’offres sont réservées aux professionnels.' });
    }
    const data = await body(req);
    const countries = Array.isArray(data.countries) ? [...new Set(data.countries)] : [];
    const expertise = Array.isArray(data.expertise) ? [...new Set(data.expertise)] : [];
    const allowedExpertise = new Set(['Bâtiment', 'Maçonnerie', 'Électricité', 'Route', 'Architecture', 'Rénovation', 'Étude', 'Forage']);
    if (countries.some(country => !uemoaCountries.has(country))
      || expertise.some(item => !allowedExpertise.has(item))
      || countries.length > 8 || expertise.length > 20) {
      return sendJson(res, 400, { error: 'Pays ou métier invalide dans les préférences.' });
    }
    const emailEnabled = data.emailEnabled === true;
    const whatsappEnabled = data.whatsappEnabled === true;
    if (whatsappEnabled && !authenticated.profile.phone) {
      return sendJson(res, 400, { error: 'Ajoutez un numéro de téléphone à votre profil pour recevoir des alertes WhatsApp.' });
    }
    const { data: preferences, error } = await authenticated.client
      .from('notification_preferences')
      .upsert({
        user_id: authenticated.profile.id,
        countries,
        expertise,
        email_enabled: emailEnabled,
        whatsapp_enabled: whatsappEnabled,
        updated_at: new Date().toISOString()
      })
      .select('countries,expertise,email_enabled,whatsapp_enabled,updated_at')
      .single();
    if (error) throw new Error(`Enregistrement des préférences impossible : ${error.message}`);
    return sendJson(res, 200, { preferences });
  }

  if (req.method === 'GET' && url.pathname === '/api/kyc') {
    const { data, error } = await authenticated.client
      .from('kyc_submissions')
      .select('id,document_type,status,review_note,submitted_at,reviewed_at')
      .eq('user_id', authenticated.profile.id)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Chargement du statut KYC impossible : ${error.message}`);
    return sendJson(res, 200, {
      verified: Boolean(authenticated.profile.verified),
      submission: data || null
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/kyc') {
    if (authenticated.profile.verified) {
      return sendJson(res, 409, { error: 'Votre profil est déjà vérifié.' });
    }
    const data = await body(req, 11 * 1024 * 1024);
    const documentTypes = {
      cni: 'Carte nationale d’identité',
      passport: 'Passeport',
      residence: 'Carte de séjour'
    };
    if (!Object.hasOwn(documentTypes, data.documentType)
      || !Array.isArray(data.documents)
      || data.documents.length < 1
      || data.documents.length > 3) {
      return sendJson(res, 400, { error: 'Type de pièce ou nombre de justificatifs invalide.' });
    }
    const latestResult = await authenticated.client
      .from('kyc_submissions')
      .select('id,status')
      .eq('user_id', authenticated.profile.id)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestResult.error) throw new Error(`Vérification du dossier KYC existant impossible : ${latestResult.error.message}`);
    if (latestResult.data?.status === 'pending') {
      return sendJson(res, 409, { error: 'Un dossier KYC est déjà en cours de vérification.' });
    }
    const preparedDocuments = [];
    let totalBytes = 0;
    for (const document of data.documents) {
      if (typeof document.content !== 'string' || !document.content.startsWith('data:')) {
        return sendJson(res, 400, { error: 'Un fichier justificatif est invalide.' });
      }
      const match = document.content.match(/^data:(application\/pdf|image\/jpeg|image\/png);base64,([A-Za-z0-9+/]*={0,2})$/);
      if (!match) return sendJson(res, 400, { error: 'Seuls les fichiers PDF, JPG et PNG sont acceptés.' });
      const contentType = match[1];
      const buffer = Buffer.from(match[2], 'base64');
      if (!buffer.length || buffer.length > 4 * 1024 * 1024) {
        return sendJson(res, 400, { error: 'Chaque justificatif doit faire au maximum 4 Mo.' });
      }
      const signatureValid = contentType === 'application/pdf'
        ? buffer.subarray(0, 5).toString('ascii') === '%PDF-'
        : contentType === 'image/jpeg'
          ? buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
          : buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      if (!signatureValid) return sendJson(res, 400, { error: 'Le contenu d’un justificatif ne correspond pas à son format déclaré.' });
      totalBytes += buffer.length;
      preparedDocuments.push({
        buffer,
        contentType,
        extension: contentType === 'application/pdf' ? 'pdf' : contentType === 'image/jpeg' ? 'jpg' : 'png'
      });
    }
    if (totalBytes > 8 * 1024 * 1024) {
      return sendJson(res, 400, { error: 'La taille totale des justificatifs ne peut pas dépasser 8 Mo.' });
    }
    const documentPaths = [];
    for (const document of preparedDocuments) {
      const filePath = `${authenticated.profile.id}/${crypto.randomUUID()}.${document.extension}`;
      const { error } = await authenticated.client.storage
        .from('kyc-documents')
        .upload(filePath, document.buffer, {
          contentType: document.contentType,
          upsert: false
        });
      if (error) {
        if (documentPaths.length) {
          const { error: cleanupError } = await authenticated.client.storage
            .from('kyc-documents')
            .remove(documentPaths);
          if (cleanupError) console.error('Nettoyage des justificatifs KYC impossible :', cleanupError.message);
        }
        throw new Error(`Téléversement sécurisé du justificatif impossible : ${error.message}`);
      }
      documentPaths.push(filePath);
    }
    const { data: submission, error } = await authenticated.client
      .from('kyc_submissions')
      .insert({
        user_id: authenticated.profile.id,
        document_type: data.documentType,
        document_paths: documentPaths,
        status: 'pending'
      })
      .select('id,document_type,status,submitted_at')
      .single();
    if (error) {
      const { error: cleanupError } = await authenticated.client.storage
        .from('kyc-documents')
        .remove(documentPaths);
      if (cleanupError) console.error('Nettoyage des justificatifs KYC impossible :', cleanupError.message);
      if (error.code === '23505') {
        return sendJson(res, 409, { error: 'Un dossier KYC est déjà en cours de vérification.' });
      }
      throw new Error(`Enregistrement du dossier KYC impossible : ${error.message}`);
    }
    return sendJson(res, 201, { submission });
  }

  const applicationStatusMatch = url.pathname.match(/^\/api\/applications\/([^/]+)\/status$/);
  if (req.method === 'POST' && applicationStatusMatch) {
    if (authenticated.profile.role !== 'client') {
      return sendJson(res, 403, { error: 'Seuls les clients propriétaires du projet peuvent gérer les candidatures.' });
    }
    const data = await body(req);
    if (!['accepted', 'rejected', 'completed'].includes(data.status)) {
      return sendJson(res, 400, { error: 'Statut de candidature invalide.' });
    }
    const { data: application, error } = await authenticated.client
      .from('marketplace_applications')
      .update({ status: data.status })
      .eq('id', applicationStatusMatch[1])
      .select('id,status,updated_at')
      .maybeSingle();
    if (error) throw new Error(`Mise à jour de la candidature impossible : ${error.message}`);
    if (!application) return sendJson(res, 404, { error: 'Candidature introuvable ou transition non autorisée.' });
    return sendJson(res, 200, { application });
  }

  const applicationMessagesMatch = url.pathname.match(/^\/api\/applications\/([^/]+)\/messages$/);
  if (applicationMessagesMatch && ['GET', 'POST'].includes(req.method)) {
    const applicationId = applicationMessagesMatch[1];
    if (req.method === 'GET') {
      const { data: messages, error } = await authenticated.client
        .from('project_messages')
        .select('id,sender_id,message,created_at')
        .eq('application_id', applicationId)
        .order('created_at', { ascending: true });
      if (error) throw new Error(`Chargement de la messagerie impossible : ${error.message}`);
      return sendJson(res, 200, { messages: messages || [] });
    }
    const data = await body(req);
    const message = String(data.message || '').trim();
    if (!message || message.length > 4000) {
      return sendJson(res, 400, { error: 'Le message doit contenir entre 1 et 4 000 caractères.' });
    }
    const { data: application, error: applicationError } = await authenticated.client
      .from('marketplace_applications')
      .select('id,status')
      .eq('id', applicationId)
      .maybeSingle();
    if (applicationError) throw new Error(`Vérification de la mise en relation impossible : ${applicationError.message}`);
    if (!application || !['accepted', 'completed'].includes(application.status)) {
      return sendJson(res, 403, { error: 'La messagerie est disponible après acceptation de la candidature.' });
    }
    const { data: sent, error } = await authenticated.client
      .from('project_messages')
      .insert({
        application_id: applicationId,
        sender_id: authenticated.profile.id,
        message
      })
      .select('id,sender_id,message,created_at')
      .single();
    if (error) throw new Error(`Envoi du message impossible : ${error.message}`);
    return sendJson(res, 201, { message: sent });
  }

  const reviewMatch = url.pathname.match(/^\/api\/applications\/([^/]+)\/reviews$/);
  if (req.method === 'POST' && reviewMatch) {
    if (!adminSupabase) {
      return sendJson(res, 503, { error: 'La clé serveur SUPABASE_SERVICE_ROLE_KEY est nécessaire pour publier un avis lié au projet.' });
    }
    const data = await body(req);
    const rating = Number(data.rating);
    const comment = String(data.comment || '').trim();
    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || comment.length > 1500) {
      return sendJson(res, 400, { error: 'La note doit être comprise entre 1 et 5 et le commentaire limité à 1 500 caractères.' });
    }
    const { data: application, error: applicationError } = await adminSupabase
      .from('marketplace_applications')
      .select('id,offer_id,applicant_id,status')
      .eq('id', reviewMatch[1])
      .eq('status', 'completed')
      .maybeSingle();
    if (applicationError) throw new Error(`Vérification du projet terminé impossible : ${applicationError.message}`);
    if (!application) return sendJson(res, 404, { error: 'Projet terminé introuvable.' });
    const { data: offer, error: offerError } = await adminSupabase
      .from('marketplace_offers')
      .select('id,owner_id')
      .eq('id', application.offer_id)
      .maybeSingle();
    if (offerError) throw new Error(`Chargement des participants du projet impossible : ${offerError.message}`);
    if (!offer || ![application.applicant_id, offer.owner_id].includes(authenticated.profile.id)) {
      return sendJson(res, 403, { error: 'Seuls les participants au projet peuvent publier un avis.' });
    }
    const revieweeId = authenticated.profile.id === application.applicant_id
      ? offer.owner_id
      : application.applicant_id;
    const { data: review, error } = await authenticated.client
      .from('project_reviews')
      .insert({
        application_id: application.id,
        reviewer_id: authenticated.profile.id,
        reviewee_id: revieweeId,
        rating,
        comment
      })
      .select('id,application_id,reviewer_id,reviewee_id,rating,comment,created_at')
      .single();
    if (error?.code === '23505') return sendJson(res, 409, { error: 'Vous avez déjà évalué ce projet.' });
    if (error) throw new Error(`Publication de l’avis impossible : ${error.message}`);
    return sendJson(res, 201, { review });
  }

  if (req.method === 'POST' && url.pathname === '/api/offers') {
    if (authenticated.profile.role !== 'client') {
      return sendJson(res, 403, { error: 'Seuls les clients peuvent publier un appel d’offres.' });
    }
    const data = await body(req);
    if (!data.title || !data.category || !data.city || !data.country || !data.budget) {
      return sendJson(res, 400, { error: 'Titre, catégorie, ville, pays et budget sont requis.' });
    }
    if (!uemoaCountries.has(data.country)) return sendJson(res, 400, { error: 'Le pays doit faire partie de l’UEMOA.' });
    const budget = Number(String(data.budget).replace(/[^0-9]/g, ''));
    if (!Number.isSafeInteger(budget) || budget <= 0) return sendJson(res, 400, { error: 'Le budget doit être un montant valide.' });
    const { data: row, error } = await authenticated.client
      .from('marketplace_offers')
      .insert({
        title: String(data.title).trim(),
        category: String(data.category).trim(),
        city: String(data.city).trim(),
        country: data.country,
        budget,
        deadline: String(data.deadline || 'À définir').trim(),
        urgency: String(data.urgency || 'Moyen').trim(),
        description: String(data.description || '').trim(),
        status: 'pending',
        owner_id: authenticated.profile.id
      })
      .select('id,title,category,city,country,budget,deadline,urgency,description,status,applications_count,created_at')
      .single();
    if (error) throw new Error(`Publication Supabase impossible : ${error.message}`);
    return sendJson(res, 201, { offer: formatOffer(mapOfferRow(row)) });
  }

  const applicationMatch = url.pathname.match(/^\/api\/offers\/([^/]+)\/apply$/);
  if (req.method === 'POST' && applicationMatch) {
    if (authenticated.profile.role !== 'professional') {
      return sendJson(res, 403, { error: 'Seuls les professionnels peuvent postuler à une offre.' });
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(applicationMatch[1])) {
      return sendJson(res, 404, { error: 'Offre introuvable.' });
    }
    const data = await body(req);
    const { data: offer, error: offerError } = await authenticated.client
      .from('marketplace_offers')
      .select('id,owner_id')
      .eq('id', applicationMatch[1])
      .eq('status', 'approved')
      .maybeSingle();
    if (offerError) throw new Error(`Vérification de l’offre impossible : ${offerError.message}`);
    if (!offer) return sendJson(res, 404, { error: 'Offre introuvable.' });
    if (offer.owner_id === authenticated.profile.id) {
      return sendJson(res, 400, { error: 'Vous ne pouvez pas postuler à votre propre offre.' });
    }
    const { error } = await authenticated.client
      .from('marketplace_applications')
      .insert({
        offer_id: offer.id,
        applicant_id: authenticated.profile.id,
        message: String(data.message || '').trim()
      });
    if (error && error.code !== '23505') throw new Error(`Envoi de la candidature impossible : ${error.message}`);
    return sendJson(res, 201, { message: 'Votre candidature a été envoyée.' });
  }

  return sendJson(res, 404, { error: 'Route API introuvable.' });
}

ensureSeedData();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    try {
      return await handleApi(req, res, url);
    } catch (error) {
      console.error('Erreur API AFRIC-CONNECT :', error.message);
      if (!res.headersSent) {
        const missingServiceMarketplaceSchema = /Could not find the table 'public\.(?:service_listings|service_inquiries)' in the schema cache/.test(String(error.message));
        const status = Number.isInteger(error.statusCode) ? error.statusCode : missingServiceMarketplaceSchema ? 503 : 500;
        return sendJson(res, status, {
          error: status === 413
            ? 'La requête dépasse la taille autorisée.'
            : missingServiceMarketplaceSchema
              ? 'Le catalogue d’engins et matériaux n’est pas encore configuré. Appliquez la migration Supabase 20261017000200_service_marketplace.sql.'
              : 'Une erreur serveur est survenue. Consultez les journaux pour plus de détails.'
        });
      }
      return res.end();
    }
  }

  let requested;
  try {
    requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  } catch {
    return res.writeHead(400).end('Requête invalide');
  }
  const filePath = path.resolve(root, `.${requested}`);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) return res.writeHead(403).end('Forbidden');
  fs.readFile(filePath, (error, content) => {
    if (error) return res.writeHead(404).end('Fichier introuvable');
    res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream' });
    res.end(content);
  });
});

server.listen(port, () => {
  console.log(`AFRIC-CONNECT disponible sur http://localhost:${port}`);
  if (!supabase) console.warn('Supabase non configuré : les pages et les données de démonstration restent disponibles.');
});
