create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(), google_sub text unique not null, email text unique not null,
  name text not null, avatar_url text, google_refresh_token_enc text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id) on delete cascade,
  token_hash text unique not null, expires_at timestamptz not null, created_at timestamptz not null default now()
);
create index if not exists sessions_user_idx on sessions(user_id,expires_at);

create table if not exists study_profiles (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id) on delete cascade,
  exam_id text not null, exam_year integer, subject text, test_date date not null, target_grade numeric not null,
  daily_minutes integer not null, confirmed_at timestamptz, plan_json jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table study_profiles add column if not exists exam_year integer;
create table if not exists materials (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id) on delete cascade, profile_id uuid references study_profiles(id) on delete cascade,
  kind text not null, original_name text, source_url text, storage_key text, mime_type text, extracted_text text, metadata jsonb not null default '{}'::jsonb,
  sha256 text, status text not null default 'queued', error text, created_at timestamptz not null default now()
);
create index if not exists materials_profile_idx on materials(profile_id);
create table if not exists material_chunks (
  id uuid primary key default gen_random_uuid(), material_id uuid not null references materials(id) on delete cascade,
  chunk_index integer not null, content text not null, token_estimate integer not null default 0, created_at timestamptz not null default now(), unique(material_id,chunk_index)
);
create table if not exists study_tasks (
  id uuid primary key default gen_random_uuid(), profile_id uuid not null references study_profiles(id) on delete cascade,
  study_date date not null, task_type text not null, title text not null, minutes integer not null, topic text,
  payload jsonb not null default '{}'::jsonb, completed_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists study_tasks_due_idx on study_tasks(profile_id,study_date,completed_at);
create table if not exists questions (
  id uuid primary key default gen_random_uuid(), profile_id uuid not null references study_profiles(id) on delete cascade,
  material_refs uuid[] not null default '{}', type text not null, difficulty numeric not null, skill text not null, prompt text not null,
  choices jsonb, answer jsonb not null, rubric jsonb, explanation text not null, provenance jsonb not null default '{}'::jsonb,
  verified boolean not null default false, ai_verified boolean not null default false, calibration_verified boolean not null default false, created_at timestamptz not null default now()
);
create index if not exists questions_profile_idx on questions(profile_id,skill,difficulty);
create table if not exists attempts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id) on delete cascade,
  question_id uuid references questions(id) on delete set null, task_type text not null, response jsonb not null,
  score numeric, max_score numeric, strict_errors jsonb not null default '[]'::jsonb, ai_feedback text,
  grading jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
alter table attempts add column if not exists grading jsonb not null default '{}'::jsonb;
alter table questions add column if not exists ai_verified boolean not null default false;
alter table questions add column if not exists calibration_verified boolean not null default false;
alter table questions add column if not exists max_score numeric;
update questions set max_score=coalesce((provenance->>'maxScore')::numeric,1) where max_score is null;
create index if not exists attempts_user_idx on attempts(user_id,created_at desc);
create table if not exists cards (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id) on delete cascade, profile_id uuid not null references study_profiles(id) on delete cascade,
  question_id uuid references questions(id) on delete set null, front text not null, back text not null, source_refs uuid[] not null default '{}',
  due_at timestamptz not null default now(), stability real not null default 1, difficulty real not null default 5, retrievability real not null default 1,
  reps integer not null default 0, lapses integer not null default 0, last_rating integer, last_reviewed_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists cards_due_idx on cards(user_id,profile_id,due_at);
create table if not exists card_reviews (
  id uuid primary key default gen_random_uuid(), card_id uuid not null references cards(id) on delete cascade, user_id uuid not null references users(id) on delete cascade,
  rating integer not null check (rating between 1 and 4), elapsed_ms integer, retrievability numeric, created_at timestamptz not null default now()
);
alter table card_reviews add column if not exists retrievability numeric;
create table if not exists mastery (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id) on delete cascade, profile_id uuid not null references study_profiles(id) on delete cascade,
  skill text not null, mastery real not null default 0.2, confidence real not null default 0.2, attempts integer not null default 0, correct integer not null default 0,
  last_seen_at timestamptz, unique(user_id,profile_id,skill)
);
alter table mastery add column if not exists attempts integer not null default 0;
alter table mastery add column if not exists correct integer not null default 0;
create table if not exists mock_exams (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id) on delete cascade, profile_id uuid not null references study_profiles(id) on delete cascade,
  title text not null, mode text not null default 'full', status text not null default 'draft', started_at timestamptz, submitted_at timestamptz,
  duration_minutes integer, blueprint jsonb not null default '{}'::jsonb, question_ids uuid[] not null default '{}', total_score numeric, max_score numeric,
  result jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
alter table mock_exams add column if not exists ends_at timestamptz;
create table if not exists mock_answers (
  id uuid primary key default gen_random_uuid(), mock_id uuid not null references mock_exams(id) on delete cascade, question_id uuid not null references questions(id) on delete cascade,
  response jsonb, score numeric, max_score numeric, grading jsonb not null default '{}'::jsonb, submitted_at timestamptz, unique(mock_id,question_id)
);
create table if not exists diagnostic_runs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id) on delete cascade, profile_id uuid not null references study_profiles(id) on delete cascade,
  status text not null default 'draft', question_ids uuid[] not null default '{}', result jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), completed_at timestamptz
);
create table if not exists games (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id) on delete cascade, profile_id uuid not null references study_profiles(id) on delete cascade,
  game_type text not null, payload jsonb not null, skill text, score numeric, completed_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists jobs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id) on delete cascade, profile_id uuid references study_profiles(id) on delete cascade,
  kind text not null, status text not null default 'queued', input jsonb not null default '{}'::jsonb, output jsonb, error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists exam_calibration_items (
  id uuid primary key default gen_random_uuid(),
  exam_id text not null,
  exam_year integer,
  subject text,
  source_kind text not null,
  source_locator text,
  authorization text not null default 'unknown',
  item_type text not null,
  topic text,
  skill text,
  archetype text,
  difficulty numeric,
  marks numeric,
  rubric jsonb,
  item_json jsonb not null,
  human_verified boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists exam_calibration_idx on exam_calibration_items(exam_id,exam_year,subject,skill,difficulty);

create table if not exists exam_evaluations (
  id uuid primary key default gen_random_uuid(),
  exam_id text not null,
  exam_year integer,
  subject text,
  benchmark_name text not null,
  metric text not null,
  value numeric,
  pass boolean not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists exam_evaluations_idx on exam_evaluations(exam_id,exam_year,subject,benchmark_name);
