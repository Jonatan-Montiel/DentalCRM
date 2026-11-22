import { db } from '../db.js';
import { esc, dinero, nombreCompleto, $ } from '../ui.js';
import { ETAPAS_TRATAMIENTO } from '../catalogos.js';
import { catalogos, editarTratamiento } from './comun.js';
import { kanban } from './kanban.js';

export async function render(el) {
  const cat = await catalogos();
  let trats = await db.list('tratamientos');
  if (db.usuario.rol === 'doctor' && db.usuario.doctor_id) trats = trats.filter(t => t.doctor_id === db.usuario.doctor_id);
  const pagos = await db.list('pagos');
  const pagado = {}; pagos.forEach(p => { if (p.tratamiento_id) pagado[p.tratamiento_id] = (pagado[p.tratamiento_id] || 0) + Number(p.monto); });
  const suma = (l) => dinero(l.reduce((s, t) => s + Number(t.total || 0), 0));

  el.innerHTML = `
    <div class="cabecera"><div><h1>Tratamientos</h1><small>Pipeline de presupuestos y planes de tratamiento</small></div>
      <div class="acciones"><button class="btn primario" id="nuevo">+ Presupuesto</button></div></div>
    <div id="tablero"></div>`;
  const recargar = () => render(el);
  kanban($('#tablero', el), {
    etapas: ETAPAS_TRATAMIENTO,
    registros: trats,
    totalColumna: suma,
    tarjeta: (t) => {
      const hechos = t.items.filter(i => i.estado === 'realizado').length;
      const pct = Math.round(100 * (pagado[t.id] || 0) / (t.total || 1));
      return `<b>${esc(t.titulo)}</b><small>${esc(nombreCompleto(cat.P[t.paciente_id]))} · ${esc(cat.D[t.doctor_id]?.nombre || '')}</small>
        <div style="display:flex;justify-content:space-between;margin-top:8px"><b>${dinero(t.total)}</b><small>${hechos}/${t.items.length} proc.</small></div>
        <div class="barra" style="margin-top:6px" title="Pagado ${pct}%"><div style="width:${Math.min(pct, 100)}%"></div></div><small>Pagado ${dinero(pagado[t.id] || 0)}</small>`;
    },
    alMover: async (t, etapa) => { await db.update('tratamientos', t.id, { etapa }); recargar(); },
    alAbrir: async (t) => { if (await editarTratamiento(t)) recargar(); }
  });
  $('#nuevo', el).onclick = async () => { if (await editarTratamiento(null, { doctor_id: db.usuario.doctor_id })) recargar(); };
}
