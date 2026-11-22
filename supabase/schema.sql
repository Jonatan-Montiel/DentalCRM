-- =====================================================================
-- DentalCRM · Esquema para Supabase (PostgreSQL)
-- Ejecuta este archivo completo en: Supabase > SQL Editor > New query
-- =====================================================================

-- ---------- Tablas ----------
create table if not exists doctores (
  id text primary key default gen_random_uuid()::text,
  creado timestamptz default now(), actualizado timestamptz,
  nombre text not null, especialidad text, telefono text, cedula text,
  color text default '#0d7377', activo boolean default true
);

create table if not exists sillones (
  id text primary key default gen_random_uuid()::text,
  creado timestamptz default now(), actualizado timestamptz,
  nombre text not null, activo boolean default true
);

create table if not exists procedimientos (
  id text primary key default gen_random_uuid()::text,
  creado timestamptz default now(), actualizado timestamptz,
  clave text, nombre text not null, precio numeric(12,2) not null default 0,
  duracion_min int, categoria text, clave_sat text
);

create table if not exists usuarios (
  id text primary key default gen_random_uuid()::text,
  creado timestamptz default now(), actualizado timestamptz,
  nombre text not null,
  rol text not null check (rol in ('admin','doctor','recepcion')),
  email text unique, pin text,
  doctor_id text references doctores(id) on delete set null
);

create table if not exists pacientes (
  id text primary key default gen_random_uuid()::text,
  creado timestamptz default now(), actualizado timestamptz,
  nombre text not null, apellidos text, fecha_nac date, sexo text,
  telefono text, email text, direccion text, tutor text, aseguradora text,
  origen text, alergias text, antecedentes text,
  prospecto_id text
);
create index if not exists pacientes_telefono_idx on pacientes (telefono);

create table if not exists prospectos (
  id text primary key default gen_random_uuid()::text,
  creado timestamptz default now(), actualizado timestamptz,
  nombre text not null, telefono text, email text, origen text, interes text,
  etapa text not null default 'nuevo' check (etapa in ('nuevo','contactado','cita_agendada','convertido','perdido')),
  doctor_id text references doctores(id) on delete set null,
  paciente_id text references pacientes(id) on delete set null,
  proximo_contacto date, notas text
);

create table if not exists citas (
  id text primary key default gen_random_uuid()::text,
  creado timestamptz default now(), actualizado timestamptz,
  paciente_id text references pacientes(id) on delete cascade,
  doctor_id text references doctores(id) on delete set null,
  sillon_id text references sillones(id) on delete set null,
  inicio timestamptz not null, fin timestamptz not null,
  motivo text, notas text,
  estado text not null default 'programada' check (estado in ('programada','confirmada','en_curso','completada','no_asistio','cancelada')),
  recordatorio_enviado timestamptz,
  check (fin > inicio)
);
create index if not exists citas_inicio_idx on citas (inicio);

-- Evita empalmes a nivel base de datos (además de la validación en la app)
create extension if not exists btree_gist;
alter table citas drop constraint if exists citas_sin_empalme_doctor;
alter table citas add constraint citas_sin_empalme_doctor exclude using gist
  (doctor_id with =, tstzrange(inicio, fin) with &&) where (estado not in ('cancelada','no_asistio'));
alter table citas drop constraint if exists citas_sin_empalme_sillon;
alter table citas add constraint citas_sin_empalme_sillon exclude using gist
  (sillon_id with =, tstzrange(inicio, fin) with &&) where (estado not in ('cancelada','no_asistio') and sillon_id is not null);

create table if not exists tratamientos (
  id text primary key default gen_random_uuid()::text,
  creado timestamptz default now(), actualizado timestamptz,
  paciente_id text references pacientes(id) on delete cascade,
  doctor_id text references doctores(id) on delete set null,
  titulo text not null,
  etapa text not null default 'presupuesto' check (etapa in ('presupuesto','aceptado','en_tratamiento','terminado','rechazado')),
  items jsonb not null default '[]'::jsonb,
  descuento numeric(12,2) default 0, total numeric(12,2) default 0,
  liquidado boolean default false, notas text
);

create table if not exists pagos (
  id text primary key default gen_random_uuid()::text,
  creado timestamptz default now(), actualizado timestamptz,
  paciente_id text references pacientes(id) on delete set null,
  tratamiento_id text references tratamientos(id) on delete set null,
  monto numeric(12,2) not null check (monto > 0), metodo text, fecha date not null default current_date,
  referencia text, facturado boolean default false, notas text
);

create table if not exists notas_clinicas (
  id text primary key default gen_random_uuid()::text,
  creado timestamptz default now(), actualizado timestamptz,
  paciente_id text references pacientes(id) on delete cascade,
  doctor_id text references doctores(id) on delete set null,
  fecha date not null default current_date,
  motivo text, subjetivo text, objetivo text, diagnostico text, plan text, ta text, fc text
);

create table if not exists odontogramas (
  id text primary key default gen_random_uuid()::text,
  creado timestamptz default now(), actualizado timestamptz,
  paciente_id text unique references pacientes(id) on delete cascade,
  tipo text default 'adulto', dientes jsonb not null default '{}'::jsonb
);

create table if not exists bitacora (
  id text primary key default gen_random_uuid()::text,
  creado timestamptz default now(),
  entidad text, registro_id text, accion text, usuario text, cambios jsonb
);
create index if not exists bitacora_registro_idx on bitacora (registro_id);

create table if not exists config (
  id text primary key default gen_random_uuid()::text,
  clave text unique not null, valor jsonb
);

-- ---------- Seguridad (Row Level Security) ----------
-- Rol del usuario autenticado, según su correo en la tabla usuarios
create or replace function rol_actual() returns text
language sql stable security definer set search_path = public as $$
  select rol from usuarios where lower(email) = lower(auth.jwt() ->> 'email') limit 1
$$;

do $$
declare t text;
begin
  foreach t in array array['doctores','sillones','procedimientos','usuarios','pacientes','prospectos','citas','tratamientos','pagos','notas_clinicas','odontogramas','bitacora','config']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "lectura" on %I', t);
    execute format('drop policy if exists "escritura" on %I', t);
  end loop;
end $$;

-- Lectura: cualquier usuario con perfil. Expediente y odontograma: solo admin y doctores.
create policy "lectura" on usuarios for select to authenticated
  using (rol_actual() is not null or lower(email) = lower(auth.jwt() ->> 'email'));
do $$
declare t text;
begin
  foreach t in array array['doctores','sillones','procedimientos','pacientes','prospectos','citas','tratamientos','pagos','bitacora','config']
  loop
    execute format('create policy "lectura" on %I for select to authenticated using (rol_actual() is not null)', t);
    execute format('create policy "escritura" on %I for all to authenticated using (rol_actual() is not null) with check (rol_actual() is not null)', t);
  end loop;
  foreach t in array array['notas_clinicas','odontogramas']
  loop
    execute format('create policy "lectura" on %I for select to authenticated using (rol_actual() in (''admin'',''doctor''))', t);
    execute format('create policy "escritura" on %I for all to authenticated using (rol_actual() in (''admin'',''doctor'')) with check (rol_actual() in (''admin'',''doctor''))', t);
  end loop;
end $$;
-- Catálogos y usuarios: solo el administrador los modifica
create policy "escritura" on usuarios for all to authenticated using (rol_actual() = 'admin') with check (rol_actual() = 'admin');
drop policy if exists "escritura" on doctores;
create policy "escritura" on doctores for all to authenticated using (rol_actual() = 'admin') with check (rol_actual() = 'admin');
drop policy if exists "escritura" on sillones;
create policy "escritura" on sillones for all to authenticated using (rol_actual() = 'admin') with check (rol_actual() = 'admin');
drop policy if exists "escritura" on procedimientos;
create policy "escritura" on procedimientos for all to authenticated using (rol_actual() = 'admin') with check (rol_actual() = 'admin');
-- config: todos leen; solo admin escribe
drop policy if exists "escritura" on config;
create policy "escritura" on config for all to authenticated using (rol_actual() = 'admin') with check (rol_actual() = 'admin');

-- Límite del plan: 5 doctores y 5 sillones
create or replace function limite_registros() returns trigger language plpgsql as $$
begin
  if (select count(*) from (select 1 from doctores where TG_TABLE_NAME = 'doctores' union all select 1 from sillones where TG_TABLE_NAME = 'sillones') x) >= 5 then
    raise exception 'Límite de 5 % alcanzado', TG_TABLE_NAME;
  end if;
  return new;
end $$;
drop trigger if exists limite_doctores on doctores;
create trigger limite_doctores before insert on doctores for each row execute function limite_registros();
drop trigger if exists limite_sillones on sillones;
create trigger limite_sillones before insert on sillones for each row execute function limite_registros();

-- ---------- Primer usuario administrador ----------
-- 1) Crea el usuario en Authentication > Users (correo + contraseña)
-- 2) Cambia el correo aquí y ejecuta:
insert into usuarios (nombre, rol, email)
values ('Administrador', 'admin', 'TU_CORREO@ejemplo.com')
on conflict (email) do nothing;
