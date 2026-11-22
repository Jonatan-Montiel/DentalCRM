import { db } from '../db.js';
import { esc, dinero, hora, isoDia, chip, nombreCompleto, $ } from '../ui.js';
import { ESTADOS_CITA, ETAPAS_TRATAMIENTO, etiqueta, colorDe } from '../catalogos.js';
import { catalogos, editarCita, enviarRecordatorio } from './comun.js';
import { salir } from '../app.js';

export async function render(el) {
  const cat = await catalogos();
  const [citas, pagos, trats, prospectos] = await Promise.all([db.list('citas'), db.list('pagos'), db.list('tratamientos'), db.list('prospectos')]);
  const hoy = isoDia();
  const esDoctor = db.usuario.rol === 'doctor';
  const mias = (c) => !esDoctor || c.doctor_id === db.usuario.doctor_id;

  const citasHoy = citas.filter(c => isoDia(c.inicio) === hoy && mias(c)).sort((a, b) => a.inicio.localeCompare(b.inicio));
  const mes = hoy.slice(0, 7);
  const ingresosMes = pagos.filter(p => String(p.fecha).startsWith(mes)).reduce((s, p) => s + Number(p.monto), 0);
  const pipeline = trats.filter(t => ['presupuesto', 'aceptado', 'en_tratamiento'].includes(t.etapa));
  const pipelineMonto = pipeline.reduce((s, t) => s + Number(t.total || 0), 0);
  const cerrados = prospectos.filter(p => ['convertido', 'perdido'].includes(p.etapa));
  const conv = cerrados.length ? Math.round(100 * prospectos.filter(p => p.etapa === 'convertido').length / cerrados.length) : 0;
  const pasadas = citas.filter(c => new Date(c.inicio) < new Date() && c.estado !== 'cancelada');
  const noShow = pasadas.length ? Math.round(100 * pasadas.filter(c => c.estado === 'no_asistio').length / pasadas.length) : 0;

  // Saldos por cobrar: tratamientos aceptados/en curso/terminados menos pagos
  const pagadoPor = {}; pagos.forEach(p => { if (p.tratamiento_id) pagadoPor[p.tratamiento_id] = (pagadoPor[p.tratamiento_id] || 0) + Number(p.monto); });
  const porCobrar = trats.filter(t => ['aceptado', 'en_tratamiento', 'terminado'].includes(t.etapa))
    .map(t => ({ t, saldo: Number(t.total || 0) - (pagadoPor[t.id] || 0) })).filter(x => x.saldo > 0);

  // Ingresos últimos 6 meses
  const meses = [];
  for (let i = 5; i >= 0; i--) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); meses.push(isoDia(d).slice(0, 7)); }
  const porMes = meses.map(m => pagos.filter(p => String(p.fecha).startsWith(m)).reduce((s, p) => s + Number(p.monto), 0));
  const max = Math.max(...porMes, 1);

  // Seguimiento de prospectos
  const seguimiento = prospectos.filter(p => !['convertido', 'perdido'].includes(p.etapa) && (!p.proximo_contacto || p.proximo_contacto <= hoy)).slice(0, 6);

  const saludo = new Date().getHours() < 12 ? 'Buenos días' : new Date().getHours() < 19 ? 'Buenas tardes' : 'Buenas noches';
  el.innerHTML = `
    <div class="cabecera"><div><h1>${saludo}, ${esc(db.usuario.nombre.split(' ')[0])}</h1><small>${new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}</small></div>
      <div class="acciones"><button class="btn primario" id="nueva">+ Nueva cita</button><button class="btn" id="salir2" title="Cerrar sesión">⎋ Salir</button></div></div>
    <div class="grid-kpi">
      <div class="kpi"><small>Citas hoy</small><b>${citasHoy.length}</b><span>${citasHoy.filter(c => c.estado === 'confirmada').length} confirmadas</span></div>
      ${db.usuario.rol !== 'doctor' ? `<div class="kpi"><small>Ingresos del mes</small><b>${dinero(ingresosMes)}</b><span>${pagos.filter(p => String(p.fecha).startsWith(mes)).length} pagos</span></div>` : ''}
      <div class="kpi"><small>Pipeline de tratamientos</small><b>${dinero(pipelineMonto)}</b><span>${pipeline.length} planes abiertos</span></div>
      <div class="kpi"><small>Conversión de prospectos</small><b>${conv}%</b><span>${prospectos.filter(p => !['convertido', 'perdido'].includes(p.etapa)).length} abiertos</span></div>
      <div class="kpi"><small>Inasistencias</small><b>${noShow}%</b><span>de citas pasadas</span></div>
    </div>
    <div class="grid-2">
      <div class="tarjeta"><h2>Agenda de hoy</h2>
        ${citasHoy.length ? `<div class="lista-simple">${citasHoy.map(c => `<div>
          <div><b>${hora(c.inicio)}</b> · ${esc(nombreCompleto(cat.P[c.paciente_id]))}<br><small>${esc(c.motivo || '')} · ${esc(cat.D[c.doctor_id]?.nombre || '')}</small></div>
          <div style="display:flex;gap:6px;align-items:center">${chip(etiqueta(ESTADOS_CITA, c.estado), colorDe(ESTADOS_CITA, c.estado))}
          <button class="btn chico verde" data-wa="${c.id}" title="Recordatorio WhatsApp">💬</button><button class="btn chico" data-cita="${c.id}">Abrir</button></div></div>`).join('')}</div>` : '<p class="sutil">No hay citas para hoy.</p>'}
      </div>
      <div class="tarjeta"><h2>Prospectos por contactar</h2>
        ${seguimiento.length ? `<div class="lista-simple">${seguimiento.map(p => `<div><div><b>${esc(p.nombre)}</b><br><small>${esc(p.interes || '')} · ${esc(p.origen || '')}</small></div><a class="btn chico" href="#/prospectos">Ver</a></div>`).join('')}</div>` : '<p class="sutil">Todo al día 🎉</p>'}
      </div>
    </div>
    <div class="grid-2" style="margin-top:16px">
      ${db.usuario.rol !== 'doctor' ? `<div class="tarjeta"><h2>Ingresos (6 meses)</h2>
        <div class="grafica">${meses.map((m, i) => `<div class="col"><span>${porMes[i] ? dinero(porMes[i]).replace('.00', '') : ''}</span><div style="height:${(porMes[i] / max) * 100}%"></div><small>${new Date(m + '-15').toLocaleDateString('es-MX', { month: 'short' })}</small></div>`).join('')}</div></div>` : ''}
      <div class="tarjeta"><h2>Saldos por cobrar</h2>
        ${porCobrar.length ? `<div class="lista-simple">${porCobrar.map(({ t, saldo }) => `<div><div><b>${esc(nombreCompleto(cat.P[t.paciente_id]))}</b><br><small>${esc(t.titulo)} · ${chip(etiqueta(ETAPAS_TRATAMIENTO, t.etapa), colorDe(ETAPAS_TRATAMIENTO, t.etapa))}</small></div><b>${dinero(saldo)}</b></div>`).join('')}</div>` : '<p class="sutil">Sin saldos pendientes.</p>'}
      </div>
    </div>`;

  $('#nueva', el).onclick = async () => { if (await editarCita(null, { inicio: proximaMediaHora() })) render(el); };
  $('#salir2', el).onclick = salir;
  el.querySelectorAll('[data-cita]').forEach(b => b.onclick = async () => { if (await editarCita(citas.find(c => c.id === b.dataset.cita))) render(el); });
  el.querySelectorAll('[data-wa]').forEach(b => b.onclick = () => enviarRecordatorio(citas.find(c => c.id === b.dataset.wa), cat));
}

function proximaMediaHora() { const d = new Date(); d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0); return d.toISOString(); }
