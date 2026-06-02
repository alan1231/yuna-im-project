# Project Status

## Branch Workflow

- `main`: cloud deployment branch. Render and Vercel deploy from this branch.
- `dev`: local development and testing branch.

Recommended flow:

```bash
git checkout dev
git merge main
# edit and test locally
git add .
git commit -m "Describe the change"
git push origin dev
```

Rules:

- Start new code changes from `dev`, not `main`.
- Before editing, sync `dev` from the latest `main`.
- Keep untested work on `dev`.
- Push `main` only when the change is ready to deploy.

When the change is ready for cloud deployment:

```bash
git checkout main
git merge dev
git push origin main
```

## Current Deployment

- Frontend: Vercel, repo root directory `frontend-vue`.
- Go API/WebSocket: Render, repo root directory `backend-go`.
- MongoDB: MongoDB Atlas M0.
- Redis: Upstash Redis with TLS.
- Python stock bot: Render-ready from `backend-python`; confirm service is live before relying on bot replies.

## Production URLs

- Go API: `https://yuna-im-project.onrender.com`
- Go API smoke test: `https://yuna-im-project.onrender.com/users`
- Frontend: Vercel project URL configured with:
  - `VITE_API_URL=https://yuna-im-project.onrender.com`
  - `VITE_WS_URL=wss://yuna-im-project.onrender.com/ws`

## Completed

- Go backend deploys on Render and connects to MongoDB Atlas.
- Go Redis config supports Upstash TLS through `REDIS_USERNAME` and `REDIS_TLS`.
- Vue frontend deploys on Vercel and reads API endpoints from Vite env vars.
- Python stock bot reads `MONGO_URI` and `DATABASE_NAME`, and exposes `/healthz` for Render.
- Stock bot chat now shows a three-dot pending state after sending a query.

## Follow-Ups

- Replace exposed MongoDB database password and update Render `MONGO_URI`.
- Replace exposed `ADMIN_TOKEN` in the Go Render service.
- Set Go Render `ALLOWED_ORIGINS` to the actual Vercel frontend URL instead of `*`.
- Be aware that Render Free services sleep when inactive; this can delay Go API startup and pause the Python stock bot.
