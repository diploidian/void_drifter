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
