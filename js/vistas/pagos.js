import { db } from '../db.js';
import { esc, dinero, fecha, isoDia, nombreCompleto, chip, vacio, $ } from '../ui.js';
import { METODOS_PAGO } from '../catalogos.js';
import { catalogos, editarPago } from './comun.js';
import { descargar } from '../nativo.js';

let filtro = { desde: isoDia(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), hasta: isoDia(), metodo: '' };

export async function render(el) {
  const cat = await catalogos();
  const [pagos, trats] = await Promise.all([db.list('pagos'), db.list('tratamientos')]);
  const T = Object.fromEntries(trats.map(t => [t.id, t]));
  const lista = pagos.filter(p => p.fecha >= filtro.desde && p.fecha <= filtro.hasta && (!filtro.metodo || p.metodo === filtro.metodo))
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  const total = lista.reduce((s, p) => s + Number(p.monto), 0);
  const porMetodo = {}; lista.forEach(p => porMetodo[p.metodo] = (porMetodo[p.metodo] || 0) + Number(p.monto));

  el.innerHTML = `
    <div class="cabecera"><div><h1>Pagos</h1><small>Cobranza y abonos</small></div>
      <div class="acciones"><button class="btn" id="csv">⬇ CSV</button><button class="btn primario" id="nuevo">+ Pago</button></div></div>
    <div class="tarjeta" style="margin-bottom:16px"><div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
      <div class="campo"><label>Desde</label><input type="date" id="desde" value="${filtro.desde}"></div>
      <div class="campo"><label>Hasta</label><input type="date" id="hasta" value="${filtro.hasta}"></div>
      <div class="campo"><label>Método</label><select id="metodo"><option value="">Todos</option>${METODOS_PAGO.map(m => `<option ${m === filtro.metodo ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
    </div></div>
    <div class="grid-kpi"><div class="kpi"><small>Total del periodo</small><b>${dinero(total)}</b><span>${lista.length} pagos</span></div>
      ${Object.entries(porMetodo).map(([m, v]) => `<div class="kpi"><small>${esc(m)}</small><b>${dinero(v)}</b></div>`).join('')}</div>
    <div class="tarjeta">${lista.length ? `<div class="tabla-wrap"><table><thead><tr><th>Fecha</th><th>Paciente</th><th class="ocultar-movil">Concepto</th><th class="ocultar-movil">Método</th><th class="num">Monto</th></tr></thead><tbody>
      ${lista.map(p => `<tr class="clic" data-id="${p.id}"><td>${fecha(p.fecha + 'T12:00')}</td><td>${esc(nombreCompleto(cat.P[p.paciente_id]))}</td><td class="ocultar-movil">${esc(T[p.tratamiento_id]?.titulo || p.notas || '—')}${p.facturado ? ' ' + chip('CFDI', 'azul') : ''}</td><td class="ocultar-movil">${esc(p.metodo)}</td><td class="num"><b>${dinero(p.monto)}</b></td></tr>`).join('')}
      </tbody></table></div>` : vacio('Sin pagos en este periodo')}</div>`;

  const recargar = () => render(el);
  ['desde', 'hasta', 'metodo'].forEach(k => $('#' + k, el).onchange = (e) => { filtro[k] = e.target.value; recargar(); });
  $('#nuevo', el).onclick = async () => { if (await editarPago(null, { fecha: isoDia() })) recargar(); };
  el.querySelectorAll('[data-id]').forEach(r => r.onclick = async () => { if (await editarPago(pagos.find(p => p.id === r.dataset.id))) recargar(); });
  $('#csv', el).onclick = () => {
    const filas = [['Fecha', 'Paciente', 'Concepto', 'Método', 'Referencia', 'Facturado', 'Monto'],
      ...lista.map(p => [p.fecha, nombreCompleto(cat.P[p.paciente_id]), T[p.tratamiento_id]?.titulo || p.notas || '', p.metodo, p.referencia || '', p.facturado ? 'Sí' : 'No', p.monto])];
    const csv = '﻿' + filas.map(f => f.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    descargar(`pagos_${filtro.desde}_${filtro.hasta}.csv`, csv, 'text/csv');
  };
}
