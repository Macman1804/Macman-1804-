create table if not exists desk_profiles (
  user_id text primary key,
  alias text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists desk_lines (
  id text primary key,
  user_id text not null,
  channel text not null check (channel in ('desk', 'voice', 'mail', 'text')),
  role text not null check (role in ('person', 'macman')),
  body text not null,
  subject text,
  created_at timestamptz not null default now()
);

create index if not exists desk_lines_user_channel_idx
  on desk_lines (user_id, channel, created_at);

create table if not exists desk_memory (
  user_id text primary key,
  content text not null,
  updated_at timestamptz not null default now()
);
