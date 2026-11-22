# 🦷 DentalCRM

CRM para clínica dental (1 sucursal, hasta 5 doctores y 5 sillones), inspirado en Oracle CX Sales pero a escala de consultorio.
100 % JavaScript: el frontend se publica en **GitHub Pages** y el backend es **Supabase** (PostgreSQL + Auth + API REST + Edge Functions).

## Módulos

| Módulo | Equivalente en CX Sales | Qué hace |
|---|---|---|
| Prospectos | Leads | Kanban por etapa, asignación round-robin, WhatsApp, conversión a paciente |
| Pacientes | Cuentas / Contactos | Ficha, alergias, antecedentes, campos personalizados, historial |
| Tratamientos | Oportunidades | Presupuestos con procedimientos por pieza, pipeline, avance y saldo, impresión |
| Agenda | Actividades | Vista por doctor o por sillón, validación de empalmes, recordatorio WhatsApp, .ics |
| Expediente | — | Notas SOAP con signos vitales (solo doctores y admin) |
| Odontograma | — | FDI adulto/infantil, condiciones por cara y por diente, notas por pieza |
| Pagos | — | Abonos por tratamiento, métodos, CFDI, exportación CSV |
| Configuración | Setup | Clínica, doctores, sillones, catálogo de precios, usuarios y roles, respaldo, bitácora |

Roles: **Administrador** (todo), **Doctor** (sin pagos ni configuración) y **Recepción** (sin expediente clínico ni configuración).

## Probarlo (modo demo)

Abre `index.html` con cualquier servidor estático (`npx serve .`) o publícalo en GitHub Pages.
En el modo demo los datos se guardan **solo en el navegador** y trae datos de ejemplo.
PIN demo: `1234` administrador · `0000` recepción · `1111` doctor.

> ⚠️ No guardes datos reales de pacientes en modo demo. Para producción conecta Supabase.

## Publicar en GitHub Pages

1. Sube el repo a GitHub.
2. Settings → Pages → *Deploy from a branch* → `main` / `root`.
3. Queda en `https://TU-USUARIO.github.io/NOMBRE-REPO/`.

## Conectar Supabase (producción)

1. Crea un proyecto en [supabase.com](https://supabase.com) (región más cercana: `us-east` o `us-west`).
2. **SQL Editor** → pega y ejecuta `supabase/schema.sql` (antes cambia el correo del administrador al final).
3. **Authentication → Users → Add user**: crea el usuario con ese mismo correo y una contraseña.
4. En **Authentication → URL Configuration** agrega la URL de tu GitHub Pages.
5. En la app: *Configuración → Datos y conexión* → pega la **Project URL** y la **anon key** (Settings → API) → Conectar.
6. Entra con tu correo. La primera vez se carga la configuración inicial y el catálogo de procedimientos.
7. Para cada persona del equipo: créala en Authentication y luego en *Configuración → Usuarios* con el mismo correo y su rol.

La seguridad vive en la base de datos (Row Level Security): aunque alguien tenga la anon key, sin un usuario válido no puede leer nada,
y recepción no puede leer expedientes ni odontogramas. También hay restricciones que impiden empalmar citas del mismo doctor o sillón.

## Personalización e integraciones

Los cambios se hacen en el código, no desde la app, para mantener el sistema limpio y versionado en Git:

- **Reglas de negocio** (equivalente a los triggers en Groovy): `js/reglas.js`, por objeto y evento (`beforeInsert`, `afterInsert`, `beforeUpdate`, `afterUpdate`, `beforeDelete`).
  Reglas actuales: horario de la clínica en citas, asignación round-robin de prospectos y tratamiento liquidado al completar pagos.
- **Campos nuevos:** se agregan al formulario (`js/vistas/comun.js`), a la ficha y como columna en `supabase/schema.sql`.
- **Integraciones:** como Edge Functions en `supabase/functions/` o como reglas `after*` en `js/reglas.js`.
- **API REST entrante:** cada tabla tiene su endpoint automático en `https://TU-PROYECTO.supabase.co/rest/v1/<tabla>` (protegido por RLS).

### Integraciones incluidas

- **`captura-prospecto`:** endpoint público para formularios web, Facebook Lead Ads (vía Zapier, Make o n8n), etc. Evita duplicados y asigna doctor.
- **`recordatorios-whatsapp`:** recordatorios automáticos un día antes con WhatsApp Cloud API (plantilla aprobada por Meta) y programación con `pg_cron`.
- **WhatsApp manual:** botón de recordatorio con un toque (wa.me).
- **Calendario:** exportación `.ics` desde cada cita.

```bash
# Desplegar Edge Functions (requiere Supabase CLI)
supabase login
supabase link --project-ref TU_REF
supabase functions deploy captura-prospecto --no-verify-jwt
supabase functions deploy recordatorios-whatsapp
supabase secrets set WHATSAPP_TOKEN=... WHATSAPP_PHONE_ID=... WHATSAPP_TEMPLATE=recordatorio_cita CAPTURA_TOKEN=...
```

## Estructura

```
index.html
css/app.css
js/
  app.js          login, layout, router y roles
  db.js           capa de datos (demo/localStorage y Supabase) + bitácora
  reglas.js       reglas de negocio (triggers) por objeto y evento
  ui.js           formularios, modales y formatos
  catalogos.js    etapas, estados y piezas dentales
  seed.js         datos de ejemplo
  vistas/         dashboard, agenda, pacientes, paciente, odontograma, prospectos, tratamientos, pagos, config
supabase/
  schema.sql      tablas, RLS, restricciones y primer admin
  functions/      Edge Functions (Deno / TypeScript)
```

## Cumplimiento (México)

- **LFPDPPP:** los datos de salud son datos personales sensibles. Publica un aviso de privacidad y recaba el consentimiento expreso por escrito.
- **NOM-004-SSA3-2012 (expediente clínico):** conserva el expediente al menos 5 años. La bitácora registra quién cambió qué.
- **NOM-013-SSA2-2015 (salud bucal):** el odontograma y las notas cubren el registro clínico básico. Valida los formatos con tu responsable sanitario.
