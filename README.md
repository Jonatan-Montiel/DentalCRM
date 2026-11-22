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
| Configuración | Application Composer | Campos personalizados, scripts/triggers en JS, webhooks, usuarios y roles, bitácora |

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
5. En la app: *Configuración → Integraciones* → pega la **Project URL** y la **anon key** (Settings → API) → Conectar.
6. Entra con tu correo. La primera vez se carga la configuración inicial y el catálogo de procedimientos.
7. Para cada persona del equipo: créala en Authentication y luego en *Configuración → Usuarios* con el mismo correo y su rol.

La seguridad vive en la base de datos (Row Level Security): aunque alguien tenga la anon key, sin un usuario válido no puede leer nada,
y recepción no puede leer expedientes ni odontogramas. También hay restricciones que impiden empalmar citas del mismo doctor o sillón.

## Extensibilidad (estilo Application Composer)

### Campos personalizados
*Configuración → Campos personalizados*. Se guardan en la columna `custom` (jsonb) y aparecen solos en formularios y fichas.

### Scripts / triggers
*Configuración → Scripts*. Equivalen a los *Object Triggers* de Groovy, pero en JavaScript (se permite `await`).

Eventos: `beforeInsert`, `afterInsert`, `beforeUpdate`, `afterUpdate` y `beforeDelete` sobre pacientes, prospectos, citas, tratamientos, pagos, notas clínicas y odontogramas.

```js
// citas.beforeInsert: no agendar pacientes con saldo vencido
const trats = await api.buscar('tratamientos', { paciente_id: registro.paciente_id });
const pagos = await api.buscar('pagos', { paciente_id: registro.paciente_id });
const deuda = trats.reduce((s, t) => s + Number(t.total), 0) - pagos.reduce((s, p) => s + Number(p.monto), 0);
if (deuda > 10000) api.error(`El paciente tiene un saldo de $${deuda}. Autoriza con administración.`);
```

API disponible: `registro`, `anterior`, `api.error()`, `api.log()`, `api.buscar()`, `api.obtener()`, `api.crear()`,
`api.actualizar()`, `api.config()`, `api.webhook()`, `api.usuario` y `api.hoy()`. El editor incluye un botón **▶ Probar**.

> En esta versión los scripts se ejecutan en el navegador, igual que la lógica de UI de VBS. Las reglas críticas (empalmes, permisos, límites) también están en la base de datos.

## Integraciones

- **API REST entrante:** cada tabla tiene su endpoint automático en `https://TU-PROYECTO.supabase.co/rest/v1/<tabla>`.
- **Webhooks salientes:** *Configuración → Integraciones*, por evento (`pagos.afterInsert`, `*`, …). Envía POST JSON con `{ evento, fecha, registro, anterior }`.
- **Edge Function `captura-prospecto`:** endpoint público para formularios web, Facebook Lead Ads (vía Zapier, Make o n8n), etc. Evita duplicados y asigna doctor.
- **Edge Function `recordatorios-whatsapp`:** recordatorios automáticos un día antes con WhatsApp Cloud API (plantilla aprobada por Meta) y programación con `pg_cron`.
- **Facturación CFDI 4.0:** webhook `pagos.afterInsert` hacia tu PAC (Facturama, FacturAPI, etc.); la clave SAT de cada procedimiento se configura en el catálogo.
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
  scripts.js      motor de scripts/triggers y webhooks
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
