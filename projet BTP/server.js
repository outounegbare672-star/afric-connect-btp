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

function body(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error('Requête trop volumineuse.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
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
    bio: profile.bio || 'Professionnel vérifié sur AFRIC-CONNECT.'
  };
}

function formatOffer(offer) {
  const budget = offer.budget || 0;
  return {
    id: offer.id,
    title: offer.title,
    category: offer.category,
    city: offer.city,
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
      .select('id,title,category,city,budget,deadline,urgency,description,status,applications_count,created_at')
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
      .select('id,title,category,city,budget,deadline,urgency,description,status,applications_count,created_at')
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
      professionals = (data || []).map(safeProfessional);
    }
    const seen = new Set(professionals.map(item => item.id));
    for (const professional of db.users.filter(user => user.role === 'professional').map(safeProfessional)) {
      if (!seen.has(professional.id)) professionals.push(professional);
    }
    return sendJson(res, 200, { professionals });
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
        adminSupabase.from('marketplace_offers').select('id,title,category,city,budget,deadline,urgency,description,status,applications_count,created_at'),
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
      const { data: offer, error } = await adminSupabase
        .from('marketplace_offers')
        .update({ status: data.status })
        .eq('id', statusMatch[1])
        .select('id,title,category,city,budget,deadline,urgency,description,status,applications_count,created_at')
        .maybeSingle();
      if (error) throw new Error(`Mise à jour Supabase impossible : ${error.message}`);
      if (!offer) return sendJson(res, 404, { error: 'Offre introuvable.' });
      return sendJson(res, 200, { offer: formatOffer(mapOfferRow(offer)) });
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

  if (req.method === 'POST' && url.pathname === '/api/offers') {
    const data = await body(req);
    if (!data.title || !data.category || !data.city || !data.budget) {
      return sendJson(res, 400, { error: 'Titre, catégorie, ville et budget sont requis.' });
    }
    const budget = Number(String(data.budget).replace(/[^0-9]/g, ''));
    if (!Number.isSafeInteger(budget) || budget <= 0) return sendJson(res, 400, { error: 'Le budget doit être un montant valide.' });
    const { data: row, error } = await authenticated.client
      .from('marketplace_offers')
      .insert({
        title: String(data.title).trim(),
        category: String(data.category).trim(),
        city: String(data.city).trim(),
        budget,
        deadline: String(data.deadline || 'À définir').trim(),
        urgency: String(data.urgency || 'Moyen').trim(),
        description: String(data.description || '').trim(),
        owner_id: authenticated.profile.id
      })
      .select('id,title,category,city,budget,deadline,urgency,description,status,applications_count,created_at')
      .single();
    if (error) throw new Error(`Publication Supabase impossible : ${error.message}`);
    return sendJson(res, 201, { offer: formatOffer(mapOfferRow(row)) });
  }

  const applicationMatch = url.pathname.match(/^\/api\/offers\/([^/]+)\/apply$/);
  if (req.method === 'POST' && applicationMatch) {
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
      if (!res.headersSent) return sendJson(res, 500, { error: 'Une erreur serveur est survenue. Consultez les journaux pour plus de détails.' });
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
