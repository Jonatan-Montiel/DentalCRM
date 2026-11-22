import { db } from '../db.js';
import { esc, edad, nombreCompleto, fecha, fechaHora, dinero, chip, vacio, modal, formHtml, leerForm, toast, isoDia, confirmar, puede, $ } from '../ui.js';
import { ESTADOS_CITA, ETAPAS_TRATAMIENTO, etiqueta, colorDe } from '../catalogos.js';
import { catalogos, editarPaciente, editarCita, editarPago, editarTratamiento, linkWhatsApp, enviarRecordatorio } from './comun.js';
import { renderOdontograma } from './odontograma.js';

let pestana = 'resumen';

export async function render(el, [id]) {
  const p = await db.get('pacientes', id);
  if (!p) { el.innerHTML = vacio('Paciente no encontrado', '<a class="btn" href="#/pacientes">Volver</a>'); return; }
  const cat = await catalogos();
  const [citas, trats, pagos, notas, bitacora] = await Promise.all([
    db.list('citas', { paciente_id: id }), db.list('tratamientos', { paciente_id: id }),
    db.list('pagos', { paciente_id: id }), db.list('notas_clinicas', { paciente_id: id }), db.list('bitacora', { registro_id: id })
  ]);
  const clinico = puede('admin', 'doctor');
  const totalTrat = trats.filter(t => !['presupuesto', 'rechazado'].includes(t.etapa)).reduce((s, t) => s + Number(t.total || 0), 0);
  const totalPag = pagos.reduce((s, x) => s + Number(x.monto), 0);
  const tabs = [['resumen', 'Resumen'], ...(clinico ? [['expediente', `Expediente (${notas.length})`], ['odontograma', 'Odontograma']] : []),
    ['tratamientos', `Tratamientos (${trats.length})`], ['pagos', `Pagos (${pagos.length})`], ['citas', `Citas (${citas.length})`], ['historial', 'Historial']];
  if (!tabs.some(t => t[0] === pestana)) pestana = 'resumen';
  const iniciales = (p.nombre?.[0] || '') + (p.apellidos?.[0] || '');

  el.innerHTML = `
    <div class="cabecera">
      <div class="ficha"><a href="#/pacientes" class="btn-icono">‹</a><div class="avatar">${esc(iniciales.toUpperCase())}</div>
        <div><h1>${esc(nombreCompleto(p))}</h1><small>${p.fecha_nac ? `${edad(p.fecha_nac)} años · ` : ''}${esc(p.telefono || '')}${p.aseguradora ? ' · ' + esc(p.aseguradora) : ''}</small></div></div>
      <div class="acciones">
        ${p.telefono ? `<a class="btn verde" target="_blank" href="${linkWhatsApp(p.telefono, `Hola ${p.nombre}, `)}">💬 WhatsApp</a>` : ''}
        <button class="btn" id="editar">Editar</button><button class="btn primario" id="cita">+ Cita</button>
      </div></div>
    ${p.alergias ? `<div class="alerta" style="margin:-6px 0 14px">⚠ Alergias: ${esc(p.alergias)}</div>` : ''}
    <div class="pestanas">${tabs.map(([k, t]) => `<button data-tab="${k}" class="${pestana === k ? 'activo' : ''}">${t}</button>`).join('')}</div>
    <div id="contenido"></div>`;

  const c = $('#contenido', el);
  const recargar = () => render(el, [id]);
  const vistas = {
    resumen() {
      const prox = citas.filter(x => x.inicio >= new Date().toISOString() && x.estado !== 'cancelada').sort((a, b) => a.inicio.localeCompare(b.inicio))[0];
      c.innerHTML = `<div class="grid-kpi">
          <div class="kpi"><small>Próxima cita</small><b style="font-size:16px">${prox ? fechaHora(prox.inicio) : '—'}</b><span>${prox ? esc(prox.motivo || '') : ''}</span></div>
          <div class="kpi"><small>Tratamientos aceptados</small><b>${dinero(totalTrat)}</b></div>
          <div class="kpi"><small>Pagado</small><b>${dinero(totalPag)}</b></div>
          <div class="kpi"><small>Saldo</small><b style="color:${totalTrat - totalPag > 0 ? 'var(--rojo)' : 'inherit'}">${dinero(Math.max(totalTrat - totalPag, 0))}</b></div></div>
        <div class="tarjeta"><h2>Datos generales</h2><div class="datos-lista">
          ${[['Fecha de nacimiento', fecha(p.fecha_nac)], ['Sexo', { F: 'Femenino', M: 'Masculino', O: 'Otro' }[p.sexo]], ['Correo', p.email], ['Dirección', p.direccion], ['Tutor', p.tutor], ['Aseguradora', p.aseguradora], ['Origen', p.origen], ['Paciente desde', fecha(p.creado)]]
            .map(([k, v]) => `<div><small>${esc(k)}</small>${esc(v || '—')}</div>`).join('')}
        </div>${clinico && p.antecedentes ? `<h3 style="margin-top:16px">Antecedentes médicos</h3><p style="white-space:pre-wrap">${esc(p.antecedentes)}</p>` : ''}</div>`;
    },
    expediente() {
      notas.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
      c.innerHTML = `<div class="cabecera"><h2>Notas de evolución (SOAP)</h2><button class="btn primario" id="nn">+ Nota clínica</button></div>
        ${notas.length ? notas.map(n => `<div class="tarjeta"><div class="cabecera" style="margin-bottom:8px"><div><b>${fecha(n.fecha)}</b> · ${esc(cat.D[n.doctor_id]?.nombre || '')}<br><small>${esc(n.motivo || '')}</small></div><button class="btn chico" data-nota="${n.id}">Editar</button></div>
          <div class="datos-lista">${[['S · Subjetivo', n.subjetivo], ['O · Objetivo / exploración', n.objetivo], ['A · Diagnóstico', n.diagnostico], ['P · Plan', n.plan]].map(([k, v]) => `<div><small>${k}</small><span style="white-space:pre-wrap">${esc(v || '—')}</span></div>`).join('')}</div>
          ${n.ta || n.fc ? `<p class="sutil" style="margin:10px 0 0">TA ${esc(n.ta || '—')} · FC ${esc(n.fc || '—')}</p>` : ''}</div>`).join('') : vacio('Sin notas clínicas')}`;
      $('#nn', c).onclick = () => editarNota(null);
      c.querySelectorAll('[data-nota]').forEach(b => b.onclick = () => editarNota(notas.find(n => n.id === b.dataset.nota)));
    },
    odontograma() { c.innerHTML = '<div class="tarjeta" id="odo"></div>'; renderOdontograma($('#odo', c), id, !clinico); },
    tratamientos() {
      const pagado = {}; pagos.forEach(x => { if (x.tratamiento_id) pagado[x.tratamiento_id] = (pagado[x.tratamiento_id] || 0) + Number(x.monto); });
      c.innerHTML = `<div class="cabecera"><h2>Planes de tratamiento</h2><button class="btn primario" id="nt">+ Presupuesto</button></div>
        ${trats.length ? `<div class="tarjeta"><div class="tabla-wrap"><table><thead><tr><th>Tratamiento</th><th>Etapa</th><th class="num">Total</th><th class="num">Pagado</th><th class="num">Avance</th></tr></thead><tbody>
        ${trats.map(t => { const hechos = t.items.filter(i => i.estado === 'realizado').length; return `<tr class="clic" data-t="${t.id}"><td><b>${esc(t.titulo)}</b><br><small>${esc(cat.D[t.doctor_id]?.nombre || '')} · ${fecha(t.creado)}</small></td><td>${chip(etiqueta(ETAPAS_TRATAMIENTO, t.etapa), colorDe(ETAPAS_TRATAMIENTO, t.etapa))}${t.liquidado ? ' ' + chip('Liquidado', 'verde') : ''}</td><td class="num">${dinero(t.total)}</td><td class="num">${dinero(pagado[t.id] || 0)}</td><td class="num">${hechos}/${t.items.length}</td></tr>`; }).join('')}
        </tbody></table></div></div>` : vacio('Sin tratamientos')}`;
      $('#nt', c).onclick = async () => { if (await editarTratamiento(null, { paciente_id: id, doctor_id: db.usuario.doctor_id })) recargar(); };
      c.querySelectorAll('[data-t]').forEach(r => r.onclick = async () => { if (await editarTratamiento(trats.find(t => t.id === r.dataset.t))) recargar(); });
    },
    pagos() {
      pagos.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
      c.innerHTML = `<div class="cabecera"><h2>Pagos · ${dinero(totalPag)}</h2>${puede('admin', 'recepcion') ? '<button class="btn primario" id="np">+ Pago</button>' : ''}</div>
        ${pagos.length ? `<div class="tarjeta"><div class="tabla-wrap"><table><thead><tr><th>Fecha</th><th>Concepto</th><th>Método</th><th class="num">Monto</th></tr></thead><tbody>
        ${pagos.map(x => `<tr class="clic" data-p="${x.id}"><td>${fecha(x.fecha + 'T12:00')}</td><td>${esc(trats.find(t => t.id === x.tratamiento_id)?.titulo || x.notas || '—')}${x.facturado ? ' ' + chip('CFDI', 'azul') : ''}</td><td>${esc(x.metodo)}</td><td class="num"><b>${dinero(x.monto)}</b></td></tr>`).join('')}
        </tbody></table></div></div>` : vacio('Sin pagos')}`;
      $('#np', c)?.addEventListener('click', async () => { if (await editarPago(null, { paciente_id: id, fecha: isoDia() })) recargar(); });
      if (puede('admin', 'recepcion')) c.querySelectorAll('[data-p]').forEach(r => r.onclick = async () => { if (await editarPago(pagos.find(x => x.id === r.dataset.p))) recargar(); });
    },
    citas() {
      citas.sort((a, b) => b.inicio.localeCompare(a.inicio));
      c.innerHTML = citas.length ? `<div class="tarjeta"><div class="tabla-wrap"><table><thead><tr><th>Fecha</th><th>Motivo</th><th class="ocultar-movil">Doctor</th><th>Estado</th><th></th></tr></thead><tbody>
        ${citas.map(x => `<tr class="clic" data-c="${x.id}"><td>${fechaHora(x.inicio)}</td><td>${esc(x.motivo || '')}</td><td class="ocultar-movil">${esc(cat.D[x.doctor_id]?.nombre || '')}</td><td>${chip(etiqueta(ESTADOS_CITA, x.estado), colorDe(ESTADOS_CITA, x.estado))}</td><td>${x.inicio > new Date().toISOString() ? `<button class="btn chico verde" data-wa="${x.id}">💬</button>` : ''}</td></tr>`).join('')}
        </tbody></table></div></div>` : vacio('Sin citas');
      c.querySelectorAll('[data-c]').forEach(r => r.onclick = async (e) => {
        if (e.target.closest('[data-wa]')) return enviarRecordatorio(citas.find(x => x.id === e.target.closest('[data-wa]').dataset.wa), cat);
        if (await editarCita(citas.find(x => x.id === r.dataset.c))) recargar();
      });
    },
    historial() {
      bitacora.sort((a, b) => b.creado.localeCompare(a.creado));
      c.innerHTML = `<div class="tarjeta"><h2>Bitácora de cambios</h2>${bitacora.length ? `<div class="lista-simple">${bitacora.map(b => `<div><div><b>${esc(b.accion)}</b> por ${esc(b.usuario)}<br><small>${esc(b.accion === 'actualizar' ? Object.keys(b.cambios || {}).join(', ') : '')}</small></div><small>${fechaHora(b.creado)}</small></div>`).join('')}</div>` : '<p class="sutil">Sin cambios registrados.</p>'}
        ${puede('admin') ? '<button class="btn peligro" id="borrar" style="margin-top:14px">Eliminar paciente</button>' : ''}</div>`;
      $('#borrar', c)?.addEventListener('click', async () => {
        if (!(await confirmar('¿Eliminar al paciente? Sus citas, pagos y notas quedarán sin paciente asociado.'))) return;
        await db.remove('pacientes', id); toast('Paciente eliminado'); location.hash = '#/pacientes';
      });
    }
  };

  async function editarNota(n) {
    const campos = [
      { clave: 'fecha', etiqueta: 'Fecha', tipo: 'date', requerido: true, defecto: isoDia() },
      { clave: 'doctor_id', etiqueta: 'Doctor', tipo: 'select', requerido: true, opciones: cat.doctores.map(d => ({ v: d.id, t: d.nombre })), defecto: db.usuario.doctor_id },
      { clave: 'motivo', etiqueta: 'Motivo de consulta', ancho: 'completo' },
      { clave: 'subjetivo', etiqueta: 'S · Subjetivo (lo que refiere el paciente)', tipo: 'textarea', ancho: 'completo' },
      { clave: 'objetivo', etiqueta: 'O · Objetivo (exploración)', tipo: 'textarea', ancho: 'completo' },
      { clave: 'diagnostico', etiqueta: 'A · Diagnóstico', tipo: 'textarea', ancho: 'completo', filas: 2 },
      { clave: 'plan', etiqueta: 'P · Plan', tipo: 'textarea', ancho: 'completo', filas: 2 },
      { clave: 'ta', etiqueta: 'Tensión arterial', placeholder: '120/80' },
      { clave: 'fc', etiqueta: 'Frecuencia cardiaca', placeholder: 'lpm' }
    ];
    modal({
      titulo: n ? 'Nota clínica' : 'Nueva nota clínica', ancho: 'ancho', cuerpo: formHtml(campos, n || {}),
      acciones: [{ texto: 'Cancelar' }, {
        texto: 'Guardar', clase: 'primario', onClick: async (m) => {
          const d = leerForm(m, campos);
          n ? await db.update('notas_clinicas', n.id, d) : await db.create('notas_clinicas', { ...d, paciente_id: id });
          toast('Nota guardada'); recargar();
        }
      }]
    });
  }

  el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { pestana = b.dataset.tab; el.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('activo', x === b)); vistas[pestana](); });
  $('#editar', el).onclick = async () => { if (await editarPaciente(p)) recargar(); };
  $('#cita', el).onclick = async () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); if (await editarCita(null, { paciente_id: id, inicio: d.toISOString() })) recargar(); };
  vistas[pestana]();
}
