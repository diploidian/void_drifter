import cors from 'cors';
import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { exchangeMicrosoftCode, microsoftLoginUrl } from './auth.js';
import { upsertUser } from './db.js';

const PgSession = connectPgSimple(session);

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'not_authenticated' });
  }
  next();
}

function publicUser(user) {
  return {
    id: String(user.id),
    email: user.email,
    name: user.name
  };
}

export function createApp({ config, pool }) {
  const app = express();

  app.set('trust proxy', 1);
  app.use(cors({
    origin: config.frontendOrigin,
    credentials: true
  }));
  app.use(express.json({ limit: '512kb' }));
  app.use(session({
    store: new PgSession({ pool, tableName: 'session' }),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: config.nodeEnv === 'production' ? 'none' : 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 30
    }
  }));

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/auth/microsoft/login', (req, res) => {
    res.redirect(microsoftLoginUrl(config, req));
  });

  app.get('/auth/microsoft/callback', async (req, res, next) => {
    try {
      const { code, state } = req.query;
      if (!code || !state) {
        return res.status(400).send('Missing OAuth callback parameters');
      }

      const claims = await exchangeMicrosoftCode(config, req, String(code), String(state));
      const user = await upsertUser(pool, claims);
      req.session.user = publicUser(user);
      res.redirect(config.frontendRedirectUrl);
    } catch (err) {
      next(err);
    }
  });

  app.post('/auth/logout', (req, res, next) => {
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie('connect.sid');
      res.status(204).end();
    });
  });

  app.get('/api/me', requireAuth, (req, res) => {
    res.json({ user: req.session.user });
  });

  app.get('/api/profile', requireAuth, async (req, res, next) => {
    try {
      const result = await pool.query(
        'select display_name, settings_json, updated_at from profiles where user_id = $1',
        [req.session.user.id]
      );
      res.json(result.rows[0] || { display_name: req.session.user.name, settings_json: {} });
    } catch (err) {
      next(err);
    }
  });

  app.put('/api/profile', requireAuth, async (req, res, next) => {
    try {
      const displayName = typeof req.body.display_name === 'string' ? req.body.display_name.trim() : null;
      const settings = req.body.settings_json && typeof req.body.settings_json === 'object'
        ? req.body.settings_json
        : {};

      const result = await pool.query(
        `
          insert into profiles (user_id, display_name, settings_json, updated_at)
          values ($1, $2, $3, now())
          on conflict (user_id)
          do update set display_name = excluded.display_name,
                        settings_json = excluded.settings_json,
                        updated_at = now()
          returning display_name, settings_json, updated_at
        `,
        [req.session.user.id, displayName || req.session.user.name, settings]
      );
      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/progress', requireAuth, async (req, res, next) => {
    try {
      const slot = String(req.query.slot || 'default');
      const result = await pool.query(
        'select slot, save_json, updated_at from progress where user_id = $1 and slot = $2',
        [req.session.user.id, slot]
      );
      res.json(result.rows[0] || { slot, save_json: null, updated_at: null });
    } catch (err) {
      next(err);
    }
  });

  app.put('/api/progress', requireAuth, async (req, res, next) => {
    try {
      const slot = String(req.body.slot || 'default');
      const saveJson = req.body.save_json;
      if (!saveJson || typeof saveJson !== 'object' || Array.isArray(saveJson)) {
        return res.status(400).json({ error: 'save_json must be an object' });
      }

      const result = await pool.query(
        `
          insert into progress (user_id, slot, save_json, updated_at)
          values ($1, $2, $3, now())
          on conflict (user_id, slot)
          do update set save_json = excluded.save_json, updated_at = now()
          returning slot, save_json, updated_at
        `,
        [req.session.user.id, slot, saveJson]
      );
      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  });

  app.use((err, _req, res, _next) => {
    const status = err.status || 500;
    if (status >= 500) {
      console.error(err);
    }
    res.status(status).json({ error: err.message || 'internal_server_error' });
  });

  return app;
}
