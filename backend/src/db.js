import pg from 'pg';

const { Pool } = pg;

export function createPool(databaseUrl) {
  return new Pool({
    connectionString: databaseUrl,
    ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined
  });
}

export async function migrate(pool) {
  await pool.query(`
    create table if not exists users (
      id bigserial primary key,
      microsoft_subject text not null unique,
      email text,
      name text,
      created_at timestamptz not null default now(),
      last_login_at timestamptz not null default now()
    );

    create table if not exists profiles (
      user_id bigint primary key references users(id) on delete cascade,
      display_name text,
      settings_json jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now()
    );

    create table if not exists progress (
      user_id bigint not null references users(id) on delete cascade,
      slot text not null default 'default',
      save_json jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now(),
      primary key (user_id, slot)
    );

    create table if not exists "session" (
      "sid" varchar not null collate "default",
      "sess" json not null,
      "expire" timestamp(6) not null,
      constraint "session_pkey" primary key ("sid")
    );

    create index if not exists "IDX_session_expire" on "session" ("expire");
  `);
}

export async function upsertUser(pool, claims) {
  const subject = claims.sub;
  const email = claims.preferred_username || claims.email || null;
  const name = claims.name || email || null;

  const result = await pool.query(
    `
      insert into users (microsoft_subject, email, name, last_login_at)
      values ($1, $2, $3, now())
      on conflict (microsoft_subject)
      do update set email = excluded.email, name = excluded.name, last_login_at = now()
      returning id, microsoft_subject, email, name, created_at, last_login_at
    `,
    [subject, email, name]
  );

  await pool.query(
    `
      insert into profiles (user_id, display_name)
      values ($1, $2)
      on conflict (user_id) do nothing
    `,
    [result.rows[0].id, name]
  );

  return result.rows[0];
}
