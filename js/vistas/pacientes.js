import { db } from '../db.js';
import { esc, edad, nombreCompleto, fecha, vacio, $ } from '../ui.js';
import { editarPaciente } from './comun.js';

let filtro = '';

export async function render(el) {
  const [pacientes, citas] = await Promise.all([db.list('pacientes'), db.list('citas')]);
  const proxima = {}, ultima = {};
  const ahora = new Date().toISOString();
  for (const c of citas) {
    if (['cancelada'].includes(c.estado)) continue;
    if (c.inicio >= ahora) { if (!proxima[c.paciente_id] || c.inicio < proxima[c.paciente_id]) proxima[c.paciente_id] = c.inicio; }
    else if (!ultima[c.paciente_id] || c.inicio > ultima[c.paciente_id]) ultima[c.paciente_id] = c.inicio;
  }
  pacientes.sort((a, b) => nombreCompleto(a).localeCompare(nombreCompleto(b)));

  el.innerHTML = `
    <div class="cabecera"><div><h1>Pacientes</h1><small>${pacientes.length} registrados</small></div>
      <div class="acciones"><input class="buscador" id="buscar" type="search" placeholder="Buscar por nombre o teléfono…" value="${esc(filtro)}"><button class="btn primario" id="nuevo">+ Paciente</button></div></div>
    <div class="tarjeta"><div class="tabla-wrap" id="tabla"></div></div>`;

  const pintar = () => {
    const q = filtro.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    const lista = pacientes.filter(p => !q || norm(nombreCompleto(p)).includes(q) || String(p.telefono || '').includes(q) || norm(p.email).includes(q));
    $('#tabla', el).innerHTML = lista.length ? `<table><thead><tr><th>Paciente</th><th>Edad</th><th class="ocultar-movil">Teléfono</th><th class="ocultar-movil">Última visita</th><th>Próxima cita</th></tr></thead><tbody>
      ${lista.map(p => `<tr class="clic" data-id="${p.id}"><td><b>${esc(nombreCompleto(p))}</b>${p.alergias ? ' <span title="Alergias" style="color:var(--rojo)">⚠</span>' : ''}</td><td>${edad(p.fecha_nac)}</td><td class="ocultar-movil">${esc(p.telefono || '')}</td><td class="ocultar-movil">${fecha(ultima[p.id]) || '—'}</td><td>${fecha(proxima[p.id]) || '<span class="sutil">—</span>'}</td></tr>`).join('')}
      </tbody></table>` : vacio(filtro ? 'Sin resultados' : 'Aún no hay pacientes');
    el.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => location.hash = `#/paciente/${tr.dataset.id}`);
  };
  $('#buscar', el).oninput = (e) => { filtro = e.target.value; pintar(); };
  $('#nuevo', el).onclick = async () => { const p = await editarPaciente(); if (p) location.hash = `#/paciente/${p.id}`; };
  pintar();
}
