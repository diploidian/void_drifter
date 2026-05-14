# Void Drifter Backend

Small Express service for Microsoft sign-in, profiles, and cloud progress.

## Required configuration

- `PUBLIC_BASE_URL`: public backend URL, used for the Microsoft redirect URI.
- `FRONTEND_ORIGIN`: GitHub Pages origin, for example `https://diploidian.github.io`.
- `FRONTEND_REDIRECT_URL`: full game URL after login, for example `https://diploidian.github.io/void_drifter/`.
- `DATABASE_URL`: Postgres connection string.
- `SESSION_SECRET`: long random value for session signing.
- `MICROSOFT_TENANT_ID`: `common`, `organizations`, or a tenant id.
- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`

Register this redirect URI in the Microsoft app:

```text
https://your-backend.example.com/auth/microsoft/callback
```

In production the session cookie is `Secure; SameSite=None`, so the backend must be served over HTTPS.
