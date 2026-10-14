---
name: afric-connect
description: Use this skill when working on the AFRIC-CONNECT BTP marketplace prototype, including the Node.js backend, static storefront pages, offers workflow, KYC flows, and Render deployment setup.
---

# AFRIC-CONNECT Skill

## Project overview
AFRIC-CONNECT is a functional BTP marketplace prototype for the eight UEMOA countries. The project combines a Node.js backend with a static front-end built from HTML, CSS, and JavaScript files. It stores user accounts, sessions, and offers in `data/db.json` and exposes JSON APIs used by the browser UI.

## Repository layout
- `projet BTP/server.js`: central HTTP server and REST API logic
- `projet BTP/index.html`: landing page and main entry point
- `projet BTP/*.html`: marketing, auth, dashboard, KYC, offers, and account pages
- `projet BTP/styles.css`: shared styling
- `projet BTP/script.js`: client-side logic and state management
- `projet BTP/data/db.json`: persistent local datastore
- `render.yaml`: deployment configuration for Render

## Stack and runtime constraints
- Runtime: Node.js
- No external dependencies are required for local development
- Server entry point: `node server.js`
- Default port: `8000` unless overridden by `PORT`
- Admin access requires the `ADMIN_PASSWORD` environment variable; no default password is configured.
- Storage is file-based JSON; do not assume a database or ORM is present

## Core behaviors to preserve
- UEMOA-only country validation using the defined African regional list
- Registration and login with hashed passwords and token-based sessions
- Client and professional user roles with different workflows
- Offer publication and application flows
- KYC and verification states
- Static pages served directly by the Node HTTP server

## Important implementation notes
- Keep API routes compatible with the existing front-end fetch calls.
- When changing the database shape, update both the server logic and any client logic that reads or writes the same fields.
- Do not remove the seed data for demo professionals and sample offers unless you intend to update the UX accordingly.
- Preserve JSON parsing and `Authorization: Bearer <token>` session handling.
- Any change involving security or user data should still keep hashed password storage and token validation in place.

## Development workflow
1. Make changes inside the `projet BTP` folder unless a deployment or config change requires the project root.
2. Run the app locally with `npm start` from `projet BTP`.
3. Verify the behavior through the browser and the server APIs.
4. Keep the app compatible with Render deployment settings defined in `render.yaml`.

## Suggested tasks for this project
- Add or adjust landing-page content and product positioning
- Extend the offers marketplace with richer filters or statuses
- Improve the auth and KYC flow without breaking current sessions
- Add validation and UX enhancements for professional applications
- Replace the JSON file store with a production-grade backend when the project moves beyond the prototype

## Safety guidance
- Never hard-code secrets into the app or commit local environment values.
- Prefer existing patterns over introducing frameworks or heavy dependencies unless there is an explicit project decision to do so.
- Keep the implementation lightweight and consistent with a static-site-plus-API prototype.
