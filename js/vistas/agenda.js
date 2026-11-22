import { db } from '../db.js';
import { esc, isoDia, hora, nombreCompleto, $ } from '../ui.js';
import { catalogos, editarCita } from './comun.js';

const ALTO = 36; // px por cada 30 minutos
let estado = { dia: isoDia(), por: 'doctor' };

export async function render(el) {
  const cat = await catalogos();
  const clinica = await db.getConfig('clinica', {});
  const abre = clinica.hora_apertura ?? 8, cierra = clinica.hora_cierre ?? 20;
  const citas = (await db.list('citas')).filter(c => isoDia(c.inicio) === estado.dia);
  const columnas = estado.por === 'doctor' ? cat.doctores.filter(d => d.activo !== false) : cat.sillones.filter(s => s.activo !== false);
  const slots = (cierra - abre) * 2;
  const diaTxt = new Date(estado.dia + 'T12:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });

  el.innerHTML = `
    <div class="cabecera"><div><h1>Agenda</h1><small>${diaTxt.charAt(0).toUpperCase() + diaTxt.slice(1)} · ${citas.filter(c => !['cancelada'].includes(c.estado)).length} citas</small></div>
      <div class="acciones">
        <div class="agenda-nav"><button class="btn" id="ant">‹</button><button class="btn" id="hoy">Hoy</button><button class="btn" id="sig">›</button>
        <input type="date" id="dia" value="${estado.dia}"></div>
        <select id="por" style="width:auto"><option value="doctor" ${estado.por === 'doctor' ? 'selected' : ''}>Por doctor</option><option value="sillon" ${estado.por === 'sillon' ? 'selected' : ''}>Por sillón</option></select>
        <button class="btn primario" id="nueva">+ Cita</button>
      </div></div>
    ${columnas.length ? `<div class="agenda" style="grid-template-columns:56px repeat(${columnas.length}, minmax(150px,1fr))">
      <div class="esquina"></div>
      ${columnas.map(c => `<div class="celda-h">${c.color ? `<i style="background:${esc(c.color)}"></i>` : ''}${esc(c.nombre)}</div>`).join('')}
      <div class="horas">${Array.from({ length: slots }, (_, i) => `<div class="hora" style="height:${ALTO}px">${i % 2 ? '' : `${String(abre + i / 2).padStart(2, '0')}:00`}</div>`).join('')}</div>
      ${columnas.map(col => `<div class="col-dia" data-col="${col.id}" style="position:relative;height:${slots * ALTO}px">
        ${Array.from({ length: slots }, (_, i) => `<div class="slot ${i % 2 ? 'media' : ''}" style="height:${ALTO}px" data-min="${abre * 60 + i * 30}"></div>`).join('')}
        ${citas.filter(c => (estado.por === 'doctor' ? c.doctor_id : c.sillon_id) === col.id).map(c => {
          const ini = new Date(c.inicio), fin = new Date(c.fin);
          const top = ((ini.getHours() * 60 + ini.getMinutes()) - abre * 60) / 30 * ALTO;
          const h = Math.max(((fin - ini) / 60000) / 30 * ALTO - 2, 18);
          const color = cat.D[c.doctor_id]?.color || '#0d7377';
          const otro = estado.por === 'doctor' ? cat.S[c.sillon_id]?.nombre : cat.D[c.doctor_id]?.nombre;
          return `<div class="cita ${c.estado}" data-id="${c.id}" style="top:${top}px;height:${h}px;left:3px;right:3px;background:${esc(color)}">
            <b>${esc(nombreCompleto(cat.P[c.paciente_id]))}</b>${hora(c.inicio)}–${hora(c.fin)} · ${esc(c.motivo || '')}<br><small style="color:#fff;opacity:.85">${esc(otro || '')}${c.estado === 'confirmada' ? ' · ✓' : ''}</small></div>`;
        }).join('')}
      </div>`).join('')}
    </div>` : `<div class="tarjeta vacio">Registra ${estado.por === 'doctor' ? 'doctores' : 'sillones'} en Configuración.</div>`}`;

  const mover = (d) => { const x = new Date(estado.dia + 'T12:00'); x.setDate(x.getDate() + d); estado.dia = isoDia(x); render(el); };
  $('#ant', el).onclick = () => mover(-1);
  $('#sig', el).onclick = () => mover(1);
  $('#hoy', el).onclick = () => { estado.dia = isoDia(); render(el); };
  $('#dia', el).onchange = (e) => { if (e.target.value) { estado.dia = e.target.value; render(el); } };
  $('#por', el).onchange = (e) => { estado.por = e.target.value; render(el); };
  $('#nueva', el).onclick = async () => { const d = new Date(estado.dia + 'T00:00'); d.setHours(Math.max(abre, new Date().getHours() + 1)); if (await editarCita(null, { inicio: d.toISOString() })) render(el); };

  el.querySelectorAll('.slot').forEach(s => s.onclick = async () => {
    const col = s.parentElement.dataset.col; const min = +s.dataset.min;
    const d = new Date(estado.dia + 'T00:00'); d.setMinutes(min);
    const def = { inicio: d.toISOString() };
    if (estado.por === 'doctor') def.doctor_id = col; else def.sillon_id = col;
    if (await editarCita(null, def)) render(el);
  });
  el.querySelectorAll('.cita').forEach(c => c.onclick = async (e) => {
    e.stopPropagation();
    if (await editarCita(citas.find(x => x.id === c.dataset.id))) render(el);
  });
  // Desplazar a la hora actual
  const ag = $('.agenda', el);
  if (ag && estado.dia === isoDia()) ag.scrollTop = Math.max(0, ((new Date().getHours() - abre - 1) * 2) * ALTO);
}
