# Part 3 — Code Quality & Production Readiness

## What I found and what I changed

### 11. API design & security
- **Auth was a no-op** — `authenticateToken` just called `next()`. Protected routes now verify a Bearer JWT and set `req.user`.
- **Missing login** — added `POST /api/login` so clients can obtain tokens. Register also returns a token.
- **Secrets in source** — DB host/user/password and JWT secret moved to `.env` (see `.env.example`).
- **Password hashes never returned** — user list/profile still exclude `password_hash`.
- **Input guards** — password min length, title max length, search query length, LIKE wildcard escaping, JSON body size limit.
- **CORS** — explicit allowlist via `CORS_ORIGIN` instead of open browser defaults.
- **Error messages** — production mode avoids leaking internal stack details.

### 12. Backend inefficiencies & dead code
- User profile loaded posts/comments with an invalid `through` (belongsToMany style) then counted again — replaced with `Promise.all` counts only.
- Inline `require('sequelize')` / `Op` in trending & search — imported once at the top.
- Like associations were missing despite FKs on the model — wired User/Post/Comment ↔ Like.
- Logging gated by `NODE_ENV` so production is quieter.

### 13. Frontend robustness
- Added login/register UI, logout, and session restore from `localStorage`.
- Removed hardcoded `userId = 1`.
- Axios interceptor attaches the token; UI shows API errors instead of only `console.error`.
- Empty states for feed/trending/search; loading and error banners; safe avatars when URLs are missing.
- Like toggles to unlike when already liked; create/comment actions require auth.
- Defensive reads for both flattened (`username`) and nested (`author.username`) shapes.

### 14. Environment / configuration
- Backend: `DB_*`, `JWT_SECRET`, `PORT`, `CORS_ORIGIN`, `NODE_ENV`.
- Frontend: `VITE_API_URL` (falls back to `http://localhost:3000/api`).
- Note: seed `password_hash` values are not bcrypt hashes — register a new user to test auth against this codebase.

### 15. How I’d structure this for a real project
Keep the single-file interview layout for review, but in production I’d split roughly like:

```
backend/
  config/db.js
  models/ (User, Post, Comment, Like + index associations)
  middleware/auth.js
  routes/ (users, posts, comments, likes, search)
  controllers/
  app.js / server.js
frontend/
  src/
    api/client.js
    components/ (Feed, Post, AuthForm, ...)
    hooks/
    App.jsx
```

Also: migrations (not `sync`), request validation library, rate limiting, refresh tokens or shorter JWT + refresh, structured logging, and tests for auth + ownership paths.

## Part 2 bug checklist (fixed)

| # | Issue | Fix |
|---|--------|-----|
| 1 | Auth middleware did nothing | JWT verify + `req.user` |
| 2 | Protected routes crashed on `req.user.id` | Applied `authenticateToken` |
| 3 | No login endpoint | `POST /api/login` |
| 4 | Wrong include (`through` on hasMany) | Removed; used counts |
| 5 | Nested `author` vs flat `username` | `flattenAuthor` helper |
| 6 | Hardcoded DB credentials | dotenv / `.env` |
| 7 | Inline Sequelize requires | Top-level `Op` import |
| 8 | Missing Like associations | Added hasMany/belongsTo |
| 9 | Frontend auth/UX gaps | Login, logout, errors, pagination UI |
| 10 | Unbounded feed | `page` / `limit` + `findAndCountAll` |
