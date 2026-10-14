# AFRIC-CONNECT

Prototype fonctionnel d'une marketplace BTP réservée aux huit pays de l'UEMOA : comptes utilisateurs, sessions, publication d'appels d'offres, candidatures et stockage persistant local.

## Démarrage

Ouvrez le fichier `index.html` dans un navigateur, ou lancez un petit serveur local :

```powershell
cd "c:\Users\LENOVO\Desktop\afric-connect\projet BTP"
npm.cmd start
```

Puis ouvrez : <http://localhost:8000>

Lien public Render : <https://afric-connect.onrender.com>

Le serveur est sans dépendance externe. Les données de démonstration et les nouveaux comptes sont enregistrés dans `data/db.json`. Pour une mise en production, remplacer ce stockage par PostgreSQL, ajouter une gestion de secrets et activer HTTPS.

## Contenu

- Inscription et connexion avec mots de passe hashés
- Session persistante par token
- Catalogue d'appels d'offres en temps réel
- Publication d'offres par les clients
- Candidature des professionnels
- Pages de confiance, tarifs, FAQ et vérification KYC
- Accès réservé au Bénin, Burkina Faso, Côte d'Ivoire, Guinée-Bissau, Mali, Niger, Sénégal et Togo

## Données et accès

- Les candidatures et l'identifiant du propriétaire ne sont pas exposés par l'API publique des offres.
- Les coordonnées privées des professionnels ne sont pas publiées dans l'annuaire.
- L'administration reste désactivée tant que `ADMIN_PASSWORD` n'est pas défini. Configurez-le comme secret dans Render avant d'utiliser `admin.html`.
