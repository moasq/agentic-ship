# Deploy — Vercel

Reference for the service-connections, production-preflight, and convex-structure skills.

---

## 🚀 Overview

Vercel provides native Next.js deployment with global Edge network routing and continuous integration from GitHub.

---

## 🛠️ Project Provisioning

1. **Authentication**:
   ```bash
   pnpm provider:login vercel
   # or
   npx vercel login
   ```

2. **Link Project**:
   ```bash
   npx vercel link
   ```

3. **Deploy Key**:
   Set `CONVEX_DEPLOY_KEY` in production environment:
   ```bash
   npx vercel env add CONVEX_DEPLOY_KEY production
   ```

4. **Ship**:
   ```bash
   npx vercel --prod
   ```

---

## 🛡️ Secret Isolation

| Variable | Location | Notes |
| :--- | :--- | :--- |
| `CONVEX_DEPLOY_KEY` | **Vercel** Project Env | Authorizes production builds |
| `NEXT_PUBLIC_CONVEX_URL` | **Vercel** Project Env | Client connection pointer |
| `BETTER_AUTH_SECRET`, `SITE_URL` | **prod Convex** deployment env | Backend only |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | **prod Convex** deployment env | Backend only |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` | **prod Convex** deployment env | Backend only |
