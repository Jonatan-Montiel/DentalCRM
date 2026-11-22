import { db } from '../db.js';
import { esc, fecha, isoDia, chip, $ } from '../ui.js';
import { ETAPAS_PROSPECTO } from '../catalogos.js';
import { catalogos, editarProspecto, convertirProspecto, editarCita, linkWhatsApp } from './comun.js';
import { kanban } from './kanban.js';

export async function render(el) {
  const cat = await catalogos();
  const prospectos = await db.list('prospectos');
  const hoy = isoDia();
  el.innerHTML = `
    <div class="cabecera"><div><h1>Prospectos</h1><small>Personas interesadas que aún no son pacientes</small></div>
      <div class="acciones"><button class="btn primario" id="nuevo">+ Prospecto</button></div></div>
    <div id="tablero"></div>`;
  const recargar = () => render(el);

  kanban($('#tablero', el), {
    etapas: ETAPAS_PROSPECTO,
    registros: prospectos,
    tarjeta: (p) => `<b>${esc(p.nombre)}</b><small>${esc(p.interes || 'Sin especificar')}</small>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px">${p.origen ? chip(p.origen) : ''}${p.doctor_id ? chip(cat.D[p.doctor_id]?.nombre?.split(' ').slice(0, 2).join(' ') || '', 'azul') : ''}${p.proximo_contacto && p.proximo_contacto <= hoy && !['convertido', 'perdido'].includes(p.etapa) ? chip('Contactar hoy', 'naranja') : ''}</div>
      <div style="display:flex;gap:6px;margin-top:8px">${p.telefono ? `<a class="btn chico verde" target="_blank" href="${linkWhatsApp(p.telefono, `Hola ${p.nombre.split(' ')[0]}, te escribimos de la clínica dental.`)}">💬</a>` : ''}
      ${p.paciente_id ? `<a class="btn chico" href="#/paciente/${p.paciente_id}">Ver paciente</a>` : `<button class="btn chico" data-conv="${p.id}">Convertir</button>`}</div>`,
    alMover: async (p, etapa) => {
      if (etapa === 'convertido' && !p.paciente_id) { await convertirProspecto(p); }
      else await db.update('prospectos', p.id, { etapa });
      if (etapa === 'cita_agendada') {
        const actualizado = await db.get('prospectos', p.id);
        let pacienteId = actualizado.paciente_id;
        if (!pacienteId) pacienteId = (await convertirProspecto(actualizado)).id, await db.update('prospectos', p.id, { etapa: 'cita_agendada' });
        const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0);
        await editarCita(null, { paciente_id: pacienteId, inicio: d.toISOString(), doctor_id: p.doctor_id, motivo: p.interes });
      }
      recargar();
    },
    alAbrir: async (p) => { if (await editarProspecto(p)) recargar(); }
  });

  el.querySelectorAll('[data-conv]').forEach(b => b.onclick = async (e) => {
    e.stopPropagation();
    const p = await convertirProspecto(prospectos.find(x => x.id === b.dataset.conv));
    location.hash = `#/paciente/${p.id}`;
  });
  $('#nuevo', el).onclick = async () => { if (await editarProspecto()) recargar(); };
}
