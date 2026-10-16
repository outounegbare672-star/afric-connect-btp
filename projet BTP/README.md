# AFRIC-CONNECT

Marketplace BTP pour les huit pays de l'UEMOA : authentification Supabase, profils professionnels, appels d'offres et candidatures.

## Démarrage

Le serveur Node.js doit être lancé pour utiliser les API. Configurez d'abord Supabase :

```powershell
cd "c:\Users\LENOVO\Desktop\afric-connect\projet BTP"
Copy-Item .env.example .env
# Renseignez SUPABASE_URL, SUPABASE_ANON_KEY et ADMIN_PASSWORD dans .env
npm.cmd start
```

Appliquez le script `supabase/migrations/20261014000100_auth_and_marketplace.sql` dans l'éditeur SQL du projet Supabase. Ajoutez ensuite `http://localhost:8000/auth.html` aux URL de redirection autorisées dans les paramètres Auth de Supabase. Ouvrez <http://localhost:8000>.

Les nouveaux comptes et sessions sont gérés par Supabase Auth. Les profils, offres et candidatures sont enregistrés dans Supabase avec des politiques RLS. Les données démo locales restent disponibles pour le catalogue. Les comptes de l'ancien système JSON ne sont pas transférés automatiquement : ils doivent être recréés dans Supabase Auth avec leur adresse email ; leur ancien mot de passe ne sera pas réutilisable.

## Contenu

- Inscription et connexion Supabase Auth avec renouvellement des sessions
- Récupération de mot de passe par email
- Catalogue d'appels d'offres en temps réel
- Publication d'offres par les clients
- Candidature des professionnels
- Pages de confiance, tarifs, FAQ et vérification KYC
- Accès réservé au Bénin, Burkina Faso, Côte d'Ivoire, Guinée-Bissau, Mali, Niger, Sénégal et Togo

## Données et accès

- Les nouveaux mots de passe sont gérés par Supabase Auth. La migration révoque l'accès des rôles `PUBLIC`, `anon` et `authenticated` à l'ancienne table `users` et supprime ses politiques RLS existantes.
- Les coordonnées privées des professionnels ne sont pas publiées dans l'annuaire public.
- L'administration nécessite `ADMIN_PASSWORD` et la clé serveur `SUPABASE_SERVICE_ROLE_KEY`. Configurez-les uniquement comme secrets dans Render ; ne publiez jamais cette clé dans le navigateur ni dans Git.
- Render utilise `render.yaml`. Renseignez les secrets Supabase dans le service et autorisez `https://afric-connect.onrender.com/auth.html` comme URL de redirection Auth.
