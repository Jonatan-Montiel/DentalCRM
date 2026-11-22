// Edge Function: recibe prospectos desde tu sitio web, landing page, Facebook Lead Ads (vía Zapier/Make/n8n), etc.
// Despliegue:  supabase functions deploy captura-prospecto --no-verify-jwt
// Uso:         POST https://TU-PROYECTO.supabase.co/functions/v1/captura-prospecto
//              { "nombre": "...", "telefono": "...", "email": "...", "origen": "Facebook", "interes": "Ortodoncia" }
// Opcional: define el secreto CAPTURA_TOKEN y envíalo en el header x-token para evitar spam.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const token = Deno.env.get('CAPTURA_TOKEN');
  if (token && req.headers.get('x-token') !== token) return json({ error: 'No autorizado' }, 401);

  let d: Record<string, string>;
  try { d = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

  const nombre = String(d.nombre ?? '').trim().slice(0, 120);
  const telefono = String(d.telefono ?? '').replace(/\D/g, '').slice(-10);
  if (!nombre || telefono.length < 10) return json({ error: 'nombre y telefono (10 dígitos) son obligatorios' }, 422);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Evita duplicados: si ya existe un prospecto abierto con ese teléfono, solo agrega nota
  const { data: existente } = await sb.from('prospectos').select('id, notas')
    .eq('telefono', telefono).not('etapa', 'in', '(convertido,perdido)').maybeSingle();
  if (existente) {
    await sb.from('prospectos').update({ notas: `${existente.notas ?? ''}\n[${new Date().toISOString().slice(0, 10)}] Volvió a escribir: ${d.interes ?? ''}`.trim() }).eq('id', existente.id);
    return json({ ok: true, id: existente.id, duplicado: true });
  }

  // Asignación round-robin al doctor con menos prospectos abiertos
  const { data: doctores } = await sb.from('doctores').select('id').eq('activo', true);
  const { data: abiertos } = await sb.from('prospectos').select('doctor_id').not('etapa', 'in', '(convertido,perdido)');
  const carga = (id: string) => (abiertos ?? []).filter((p) => p.doctor_id === id).length;
  const doctor = (doctores ?? []).sort((a, b) => carga(a.id) - carga(b.id))[0];

  const { data, error } = await sb.from('prospectos').insert({
    nombre, telefono, email: d.email || null, origen: d.origen || 'Sitio web',
    interes: d.interes || null, notas: d.mensaje || null, etapa: 'nuevo', doctor_id: doctor?.id ?? null
  }).select('id').single();
  if (error) return json({ error: error.message }, 500);

  await sb.from('bitacora').insert({ entidad: 'prospectos', registro_id: data.id, accion: 'crear', usuario: 'captura-prospecto', cambios: { nombre, origen: d.origen } });
  return json({ ok: true, id: data.id });
});
