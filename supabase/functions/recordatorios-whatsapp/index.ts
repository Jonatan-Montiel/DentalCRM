// Edge Function: envía recordatorios automáticos por WhatsApp Cloud API (Meta) para las citas de mañana.
// Secretos necesarios (supabase secrets set ...):
//   WHATSAPP_TOKEN       token permanente de tu app de Meta
//   WHATSAPP_PHONE_ID    ID del número de WhatsApp Business
//   WHATSAPP_TEMPLATE    nombre de la plantilla aprobada (ej. recordatorio_cita) con 4 variables:
//                        {{1}} paciente, {{2}} fecha, {{3}} hora, {{4}} doctor
// Programación diaria (SQL Editor, requiere extensiones pg_cron y pg_net):
//   select cron.schedule('recordatorios', '0 17 * * *', $$
//     select net.http_post(url := 'https://TU-PROYECTO.supabase.co/functions/v1/recordatorios-whatsapp',
//       headers := '{"Authorization": "Bearer TU_SERVICE_ROLE_KEY"}'::jsonb) $$);
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TZ = 'America/Mexico_City';

Deno.serve(async () => {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const token = Deno.env.get('WHATSAPP_TOKEN');
  const phoneId = Deno.env.get('WHATSAPP_PHONE_ID');
  const plantilla = Deno.env.get('WHATSAPP_TEMPLATE') ?? 'recordatorio_cita';
  if (!token || !phoneId) return new Response('Faltan secretos de WhatsApp', { status: 500 });

  // Rango "mañana" en hora de CDMX (UTC-6)
  const ahora = new Date();
  const manana = new Date(ahora.toLocaleString('en-US', { timeZone: TZ }));
  manana.setDate(manana.getDate() + 1);
  const dia = manana.toISOString().slice(0, 10);
  const desde = new Date(`${dia}T00:00:00-06:00`).toISOString();
  const hasta = new Date(`${dia}T23:59:59-06:00`).toISOString();

  const { data: citas, error } = await sb.from('citas')
    .select('id, inicio, motivo, paciente:pacientes(nombre, telefono), doctor:doctores(nombre)')
    .gte('inicio', desde).lte('inicio', hasta)
    .in('estado', ['programada', 'confirmada']).is('recordatorio_enviado', null);
  if (error) return new Response(error.message, { status: 500 });

  const resultados = [];
  for (const c of citas ?? []) {
    // deno-lint-ignore no-explicit-any
    const p = (c as any).paciente, d = (c as any).doctor;
    const tel = String(p?.telefono ?? '').replace(/\D/g, '');
    if (tel.length < 10) continue;
    const inicio = new Date(c.inicio);
    const r = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', to: tel.length === 10 ? `52${tel}` : tel, type: 'template',
        template: {
          name: plantilla, language: { code: 'es_MX' },
          components: [{ type: 'body', parameters: [
            { type: 'text', text: p.nombre },
            { type: 'text', text: inicio.toLocaleDateString('es-MX', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }) },
            { type: 'text', text: inicio.toLocaleTimeString('es-MX', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }) },
            { type: 'text', text: d?.nombre ?? 'tu doctor' }
          ] }]
        }
      })
    });
    if (r.ok) await sb.from('citas').update({ recordatorio_enviado: new Date().toISOString() }).eq('id', c.id);
    resultados.push({ cita: c.id, ok: r.ok, status: r.status });
  }
  return new Response(JSON.stringify({ dia, enviados: resultados.filter((x) => x.ok).length, resultados }), { headers: { 'Content-Type': 'application/json' } });
});
