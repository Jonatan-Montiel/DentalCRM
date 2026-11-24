// Formularios y utilerías compartidas entre vistas.
import { db } from '../db.js';
import { modal, formHtml, leerForm, toast, esc, dinero, nombreCompleto, fecha, hora, isoDia, confirmar, $ } from '../ui.js';
import { descargar, imprimirHtml, abrirExterno } from '../nativo.js';
import { ETAPAS_PROSPECTO, ETAPAS_TRATAMIENTO, ESTADOS_CITA, ORIGENES, METODOS_PAGO } from '../catalogos.js';

export async function catalogos() {
  const [doctores, sillones, pacientes, procedimientos] = await Promise.all([
    db.list('doctores'), db.list('sillones'), db.list('pacientes'), db.list('procedimientos')
  ]);
  const mapa = (l) => Object.fromEntries(l.map(x => [x.id, x]));
  pacientes.sort((a, b) => nombreCompleto(a).localeCompare(nombreCompleto(b)));
  return { doctores, sillones, pacientes, procedimientos, D: mapa(doctores), S: mapa(sillones), P: mapa(pacientes), PR: mapa(procedimientos) };
}

const opsDe = (lista, txt = x => x.nombre) => lista.map(x => ({ v: x.id, t: txt(x) }));

// ---------- WhatsApp ----------
export function telefonoMx(t) {
  const d = String(t || '').replace(/\D/g, '');
  if (!d) return '';
  return d.length === 10 ? '52' + d : d;
}
export function linkWhatsApp(tel, texto) {
  return `https://wa.me/${telefonoMx(tel)}?text=${encodeURIComponent(texto || '')}`;
}
export async function textoRecordatorio(cita, cat) {
  const clinica = await db.getConfig('clinica', {});
  const p = cat.P[cita.paciente_id]; const d = cat.D[cita.doctor_id];
  return (clinica.plantilla_recordatorio || 'Hola {paciente}, te recordamos tu cita el {fecha} a las {hora}.')
    .replaceAll('{paciente}', p?.nombre || '').replaceAll('{clinica}', clinica.nombre || '')
    .replaceAll('{fecha}', new Date(cita.inicio).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }))
    .replaceAll('{hora}', hora(cita.inicio)).replaceAll('{doctor}', d?.nombre || '').replaceAll('{motivo}', cita.motivo || '');
}

// ---------- Calendario (.ics) para Google / Apple / Outlook ----------
export function descargarIcs(cita, cat) {
  const f = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const p = cat.P[cita.paciente_id];
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DentalCRM//ES', 'BEGIN:VEVENT',
    `UID:${cita.id}@dentalcrm`, `DTSTAMP:${f(new Date())}`, `DTSTART:${f(cita.inicio)}`, `DTEND:${f(cita.fin)}`,
    `SUMMARY:Cita dental - ${nombreCompleto(p)}`, `DESCRIPTION:${(cita.motivo || '').replace(/\n/g, ' ')}`,
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  descargar(`cita-${isoDia(cita.inicio)}.ics`, ics, 'text/calendar');
}

// ---------- Paciente ----------
export async function editarPaciente(p = null) {
  const campos = [
    { clave: 'nombre', etiqueta: 'Nombre(s)', requerido: true },
    { clave: 'apellidos', etiqueta: 'Apellidos', requerido: true },
    { clave: 'fecha_nac', etiqueta: 'Fecha de nacimiento', tipo: 'date' },
    { clave: 'sexo', etiqueta: 'Sexo', tipo: 'select', opciones: [{ v: 'F', t: 'Femenino' }, { v: 'M', t: 'Masculino' }, { v: 'O', t: 'Otro' }] },
    { clave: 'telefono', etiqueta: 'Teléfono (WhatsApp)', tipo: 'tel', requerido: true },
    { clave: 'email', etiqueta: 'Correo', tipo: 'email' },
    { clave: 'direccion', etiqueta: 'Dirección', ancho: 'completo' },
    { clave: 'tutor', etiqueta: 'Tutor / responsable (menores)' },
    { clave: 'aseguradora', etiqueta: 'Aseguradora' },
    { clave: 'origen', etiqueta: '¿Cómo nos conoció?', tipo: 'select', opciones: ORIGENES },
    { clave: 'alergias', etiqueta: 'Alergias', placeholder: 'Ej. penicilina, látex' },
    { clave: 'antecedentes', etiqueta: 'Antecedentes médicos', tipo: 'textarea', ancho: 'completo', placeholder: 'Diabetes, hipertensión, embarazo, medicamentos…' }
  ];
  return new Promise(res => modal({
    titulo: p ? 'Editar paciente' : 'Nuevo paciente', ancho: 'ancho', cuerpo: formHtml(campos, p || {}),
    acciones: [{ texto: 'Cancelar', onClick: () => res(null) }, {
      texto: 'Guardar', clase: 'primario', onClick: async (m) => {
        const datos = leerForm(m, campos);
        const r = p ? await db.update('pacientes', p.id, datos) : await db.create('pacientes', datos);
        toast('Paciente guardado'); res(r);
      }
    }]
  }));
}

// ---------- Cita ----------
export async function validarEmpalme(cita) {
  const todas = await db.list('citas');
  const ini = new Date(cita.inicio), fin = new Date(cita.fin);
  if (fin <= ini) throw new Error('La hora de fin debe ser posterior al inicio');
  const activas = todas.filter(c => c.id !== cita.id && !['cancelada', 'no_asistio'].includes(c.estado) && new Date(c.inicio) < fin && new Date(c.fin) > ini);
  if (activas.some(c => c.doctor_id === cita.doctor_id)) throw new Error('El doctor ya tiene una cita en ese horario');
  if (cita.sillon_id && activas.some(c => c.sillon_id === cita.sillon_id)) throw new Error('El sillón ya está ocupado en ese horario');
}

export async function editarCita(cita = null, defaults = {}) {
  const cat = await catalogos();
  const clinica = await db.getConfig('clinica', {});
  const v = cita || { estado: 'programada', ...defaults };
  if (!cita && v.inicio && !v.fin) v.fin = new Date(new Date(v.inicio).getTime() + (clinica.duracion_cita || 30) * 60000).toISOString();
  const campos = [
    { clave: 'paciente_id', etiqueta: 'Paciente', tipo: 'select', requerido: true, ancho: 'completo', opciones: opsDe(cat.pacientes, nombreCompleto) },
    { clave: 'doctor_id', etiqueta: 'Doctor', tipo: 'select', requerido: true, opciones: opsDe(cat.doctores.filter(d => d.activo !== false)) },
    { clave: 'sillon_id', etiqueta: 'Sillón', tipo: 'select', opciones: opsDe(cat.sillones.filter(s => s.activo !== false)) },
    { clave: 'inicio', etiqueta: 'Inicio', tipo: 'datetime', requerido: true },
    { clave: 'fin', etiqueta: 'Fin', tipo: 'datetime', requerido: true },
    { clave: 'motivo', etiqueta: 'Motivo / procedimiento', ancho: 'completo' },
    { clave: 'estado', etiqueta: 'Estado', tipo: 'select', requerido: true, opciones: ESTADOS_CITA },
    { clave: 'notas', etiqueta: 'Notas', tipo: 'textarea', ancho: 'completo', filas: 2 }
  ];
  let resolver = () => {};
  const acciones = [{ texto: 'Cancelar', onClick: () => null }];
  if (cita) {
    acciones.unshift({
      texto: '🗑', clase: 'chico', onClick: async () => {
        if (!(await confirmar('¿Eliminar esta cita?'))) return resolver(null);
        await db.remove('citas', cita.id); toast('Cita eliminada'); resolver(true);
      }
    });
    acciones.splice(1, 0, { texto: '💬 Recordatorio', clase: 'verde', onClick: async () => { await enviarRecordatorio(cita, cat); return false; } });
    acciones.splice(2, 0, { texto: '📅 .ics', onClick: () => { descargarIcs(cita, cat); return false; } });
  }
  return new Promise(res => {
    resolver = res;
    acciones.push({
      texto: 'Guardar', clase: 'primario', onClick: async (m) => {
        const datos = leerForm(m, campos);
        await validarEmpalme({ ...datos, id: cita?.id });
        const r = cita ? await db.update('citas', cita.id, datos) : await db.create('citas', datos);
        toast('Cita guardada'); res(r);
      }
    });
    acciones[acciones.length - 2].onClick = () => res(null);
    const m = modal({ titulo: cita ? 'Cita' : 'Nueva cita', cuerpo: formHtml(campos, v) + (cat.pacientes.length ? '' : '<p class="sutil">Primero registra un paciente.</p>') + '<p class="sutil" style="margin-top:10px">¿Paciente nuevo? <a href="#" id="nuevoPac">Regístralo aquí</a></p>', acciones });
    // Ajustar fin automáticamente al cambiar inicio
    const fIni = m.querySelector('[name=inicio]'), fFin = m.querySelector('[name=fin]');
    fIni.addEventListener('change', () => {
      const dur = fFin.value && fIni.dataset.prev ? new Date(fFin.value) - new Date(fIni.dataset.prev) : (clinica.duracion_cita || 30) * 60000;
      const nf = new Date(new Date(fIni.value).getTime() + Math.max(dur, 15 * 60000));
      nf.setMinutes(nf.getMinutes() - nf.getTimezoneOffset()); fFin.value = nf.toISOString().slice(0, 16);
      fIni.dataset.prev = fIni.value;
    });
    fIni.dataset.prev = fIni.value;
    m.querySelector('#nuevoPac').onclick = async (e) => {
      e.preventDefault();
      const snapshot = leerSinValidar(m);
      const p = await editarPaciente();
      editarCita(cita, { ...v, ...snapshot, paciente_id: p?.id || snapshot.paciente_id }).then(res);
    };
  });
}
function leerSinValidar(m) {
  const f = m.querySelector('form'); const o = {};
  for (const el of f.elements) if (el.name) o[el.name] = el.type === 'datetime-local' ? (el.value ? new Date(el.value).toISOString() : '') : el.value;
  return o;
}

export async function enviarRecordatorio(cita, cat) {
  cat ||= await catalogos();
  const p = cat.P[cita.paciente_id];
  if (!p?.telefono) return toast('El paciente no tiene teléfono', 'error');
  abrirExterno(linkWhatsApp(p.telefono, await textoRecordatorio(cita, cat)));
  await db.update('citas', cita.id, { recordatorio_enviado: new Date().toISOString() }, { sinTriggers: true });
}

// ---------- Prospecto ----------
export async function editarProspecto(pr = null) {
  const cat = await catalogos();
  const campos = [
    { clave: 'nombre', etiqueta: 'Nombre', requerido: true, ancho: 'completo' },
    { clave: 'telefono', etiqueta: 'Teléfono', tipo: 'tel', requerido: true },
    { clave: 'email', etiqueta: 'Correo', tipo: 'email' },
    { clave: 'origen', etiqueta: 'Origen', tipo: 'select', opciones: ORIGENES },
    { clave: 'interes', etiqueta: 'Le interesa', placeholder: 'Ej. ortodoncia, limpieza' },
    { clave: 'etapa', etiqueta: 'Etapa', tipo: 'select', requerido: true, opciones: ETAPAS_PROSPECTO, defecto: 'nuevo' },
    { clave: 'doctor_id', etiqueta: 'Asignado a', tipo: 'select', opciones: opsDe(cat.doctores) },
    { clave: 'proximo_contacto', etiqueta: 'Próximo contacto', tipo: 'date' },
    { clave: 'notas', etiqueta: 'Notas', tipo: 'textarea', ancho: 'completo' }
  ];
  return new Promise(res => modal({
    titulo: pr ? 'Prospecto' : 'Nuevo prospecto', cuerpo: formHtml(campos, pr || {}),
    acciones: [
      ...(pr ? [{ texto: '🗑', clase: 'chico', onClick: async () => { if (await confirmar('¿Eliminar prospecto?')) { await db.remove('prospectos', pr.id); res(true); } } }] : []),
      { texto: 'Cancelar', onClick: () => res(null) },
      {
        texto: 'Guardar', clase: 'primario', onClick: async (m) => {
          const datos = leerForm(m, campos);
          const r = pr ? await db.update('prospectos', pr.id, datos) : await db.create('prospectos', datos);
          toast('Prospecto guardado'); res(r);
        }
      }]
  }));
}

// Convierte prospecto -> paciente (como "Convert Lead" en CX Sales)
export async function convertirProspecto(pr) {
  const [nombre, ...resto] = String(pr.nombre).trim().split(/\s+/);
  const p = await db.create('pacientes', { nombre, apellidos: resto.join(' '), telefono: pr.telefono, email: pr.email, origen: pr.origen, prospecto_id: pr.id });
  await db.update('prospectos', pr.id, { etapa: 'convertido', paciente_id: p.id });
  toast('Prospecto convertido en paciente');
  return p;
}

// ---------- Pago ----------
export async function editarPago(pago = null, defaults = {}) {
  const cat = await catalogos();
  const trats = await db.list('tratamientos');
  const campos = [
    { clave: 'paciente_id', etiqueta: 'Paciente', tipo: 'select', requerido: true, ancho: 'completo', opciones: opsDe(cat.pacientes, nombreCompleto) },
    { clave: 'tratamiento_id', etiqueta: 'Tratamiento (opcional)', tipo: 'select', ancho: 'completo', opciones: trats.map(t => ({ v: t.id, t: `${t.titulo} · ${nombreCompleto(cat.P[t.paciente_id])}` })) },
    { clave: 'monto', etiqueta: 'Monto (MXN)', tipo: 'number', requerido: true },
    { clave: 'metodo', etiqueta: 'Método', tipo: 'select', requerido: true, opciones: METODOS_PAGO },
    { clave: 'fecha', etiqueta: 'Fecha', tipo: 'date', requerido: true, defecto: isoDia() },
    { clave: 'referencia', etiqueta: 'Referencia / folio' },
    { clave: 'facturado', etiqueta: 'Facturado (CFDI)', tipo: 'checkbox' },
    { clave: 'notas', etiqueta: 'Concepto / notas', ancho: 'completo' }
  ];
  return new Promise(res => {
    const m = modal({
      titulo: pago ? 'Pago' : 'Registrar pago', cuerpo: formHtml(campos, pago || defaults),
      acciones: [
        ...(pago ? [{ texto: '🗑', clase: 'chico', onClick: async () => { if (await confirmar('¿Eliminar pago?')) { await db.remove('pagos', pago.id); res(true); } } }] : []),
        { texto: 'Cancelar', onClick: () => res(null) },
        {
          texto: 'Guardar', clase: 'primario', onClick: async (m) => {
            const datos = leerForm(m, campos);
            if (!(datos.monto > 0)) throw new Error('El monto debe ser mayor a cero');
            datos.tratamiento_id ||= null;
            const r = pago ? await db.update('pagos', pago.id, datos) : await db.create('pagos', datos);
            toast('Pago registrado'); res(r);
          }
        }]
    });
    // Filtrar tratamientos por paciente
    const sp = m.querySelector('[name=paciente_id]'), st = m.querySelector('[name=tratamiento_id]');
    const filtrar = () => { for (const o of st.options) if (o.value) o.hidden = trats.find(t => t.id === o.value)?.paciente_id !== sp.value; };
    sp.addEventListener('change', () => { st.value = ''; filtrar(); }); filtrar();
  });
}

// ---------- Tratamiento / presupuesto ----------
export async function editarTratamiento(t = null, defaults = {}) {
  const cat = await catalogos();
  const v = t ? structuredClone(t) : { etapa: 'presupuesto', items: [], descuento: 0, ...defaults };
  const campos = [
    { clave: 'paciente_id', etiqueta: 'Paciente', tipo: 'select', requerido: true, opciones: opsDe(cat.pacientes, nombreCompleto) },
    { clave: 'doctor_id', etiqueta: 'Doctor', tipo: 'select', requerido: true, opciones: opsDe(cat.doctores) },
    { clave: 'titulo', etiqueta: 'Título', requerido: true, placeholder: 'Ej. Rehabilitación sector posterior' },
    { clave: 'etapa', etiqueta: 'Etapa', tipo: 'select', requerido: true, opciones: ETAPAS_TRATAMIENTO },
    { clave: 'descuento', etiqueta: 'Descuento (MXN)', tipo: 'number' },
    { clave: 'notas', etiqueta: 'Notas / condiciones de pago', ancho: 'completo' }
  ];
  let items = v.items || [];
  const filas = () => items.map((it, i) => `<tr>
      <td><input data-i="${i}" data-k="descripcion" value="${esc(it.descripcion)}"></td>
      <td style="width:70px"><input data-i="${i}" data-k="diente" value="${esc(it.diente || '')}" placeholder="Pieza"></td>
      <td style="width:60px"><input data-i="${i}" data-k="cantidad" type="number" min="1" value="${it.cantidad}"></td>
      <td style="width:110px"><input data-i="${i}" data-k="precio" type="number" step="any" value="${it.precio}"></td>
      <td style="width:120px"><select data-i="${i}" data-k="estado"><option value="pendiente" ${it.estado === 'pendiente' ? 'selected' : ''}>Pendiente</option><option value="realizado" ${it.estado === 'realizado' ? 'selected' : ''}>Realizado</option></select></td>
      <td style="width:34px"><button class="btn-icono" data-quitar="${i}">✕</button></td></tr>`).join('');
  const total = () => items.reduce((s, i) => s + Number(i.precio || 0) * Number(i.cantidad || 1), 0);
  const cuerpo = formHtml(campos, v) + `
    <h3 style="margin:18px 0 8px">Procedimientos</h3>
    <div style="display:flex;gap:8px;margin-bottom:8px"><select id="addProc"><option value="">+ Agregar del catálogo…</option>${cat.procedimientos.map(p => `<option value="${p.id}">${esc(p.nombre)} · ${dinero(p.precio)}</option>`).join('')}</select><button class="btn" id="addLibre">+ Libre</button></div>
    <div class="tabla-wrap"><table><thead><tr><th>Descripción</th><th>Pieza</th><th>Cant.</th><th>Precio</th><th>Estado</th><th></th></tr></thead><tbody id="items"></tbody></table></div>
    <p style="text-align:right;margin-top:10px">Subtotal: <b id="sub"></b> · Total: <b id="tot"></b></p>`;
  return new Promise(res => {
    const m = modal({
      titulo: t ? 'Plan de tratamiento' : 'Nuevo presupuesto', ancho: 'ancho', cuerpo,
      acciones: [
        ...(t ? [{ texto: '🗑', clase: 'chico', onClick: async () => { if (await confirmar('¿Eliminar tratamiento?')) { await db.remove('tratamientos', t.id); res(true); } } },
        { texto: '🖨 Imprimir', onClick: () => { imprimirPresupuesto({ ...t, items }, cat); return false; } }] : []),
        { texto: 'Cancelar', onClick: () => res(null) },
        {
          texto: 'Guardar', clase: 'primario', onClick: async (mm) => {
            const datos = leerForm(mm, campos);
            if (!items.length) throw new Error('Agrega al menos un procedimiento');
            datos.items = items.map(i => ({ ...i, cantidad: Number(i.cantidad) || 1, precio: Number(i.precio) || 0 }));
            datos.total = total() - Number(datos.descuento || 0);
            const r = t ? await db.update('tratamientos', t.id, datos) : await db.create('tratamientos', datos);
            toast('Tratamiento guardado'); res(r);
          }
        }]
    });
    const pintar = () => {
      $('#items', m).innerHTML = filas() || '<tr><td colspan="6" class="sutil">Sin procedimientos</td></tr>';
      const desc = Number(m.querySelector('[name=descuento]').value || 0);
      $('#sub', m).textContent = dinero(total()); $('#tot', m).textContent = dinero(total() - desc);
    };
    m.addEventListener('input', (e) => {
      const el = e.target; if (el.dataset.i !== undefined) { items[+el.dataset.i][el.dataset.k] = el.value; }
      $('#sub', m).textContent = dinero(total());
      $('#tot', m).textContent = dinero(total() - Number(m.querySelector('[name=descuento]').value || 0));
    });
    m.addEventListener('change', (e) => { if (e.target.dataset.k === 'estado') items[+e.target.dataset.i].estado = e.target.value; });
    m.addEventListener('click', (e) => { const q = e.target.closest('[data-quitar]'); if (q) { items.splice(+q.dataset.quitar, 1); pintar(); } });
    $('#addProc', m).onchange = (e) => {
      const p = cat.PR[e.target.value]; if (!p) return;
      items.push({ procedimiento_id: p.id, descripcion: p.nombre, diente: '', cantidad: 1, precio: p.precio, estado: 'pendiente' });
      e.target.value = ''; pintar();
    };
    $('#addLibre', m).onclick = () => { items.push({ descripcion: '', diente: '', cantidad: 1, precio: 0, estado: 'pendiente' }); pintar(); };
    pintar();
  });
}

export async function imprimirPresupuesto(t, cat) {
  cat ||= await catalogos();
  const clinica = await db.getConfig('clinica', {});
  const p = cat.P[t.paciente_id], d = cat.D[t.doctor_id];
  const sub = t.items.reduce((s, i) => s + i.precio * i.cantidad, 0);
  await imprimirHtml(`<!DOCTYPE html><html><head><title>Presupuesto</title><style>body{font-family:system-ui;padding:32px;color:#222}table{width:100%;border-collapse:collapse;margin-top:16px}td,th{border-bottom:1px solid #ddd;padding:8px;text-align:left}.r{text-align:right}h1{color:#0d7377;margin:0}</style></head><body>
    <h1>${esc(clinica.nombre)}</h1><p>${esc(clinica.direccion || '')} · ${esc(clinica.telefono || '')}</p><hr>
    <h2>Presupuesto: ${esc(t.titulo)}</h2>
    <p><b>Paciente:</b> ${esc(nombreCompleto(p))}<br><b>Doctor:</b> ${esc(d?.nombre || '')}<br><b>Fecha:</b> ${fecha(t.creado || new Date())}</p>
    <table><tr><th>Procedimiento</th><th>Pieza</th><th class="r">Cant.</th><th class="r">Precio</th><th class="r">Importe</th></tr>
    ${t.items.map(i => `<tr><td>${esc(i.descripcion)}</td><td>${esc(i.diente || '')}</td><td class="r">${i.cantidad}</td><td class="r">${dinero(i.precio)}</td><td class="r">${dinero(i.precio * i.cantidad)}</td></tr>`).join('')}
    <tr><td colspan="4" class="r">Subtotal</td><td class="r">${dinero(sub)}</td></tr>
    ${t.descuento ? `<tr><td colspan="4" class="r">Descuento</td><td class="r">-${dinero(t.descuento)}</td></tr>` : ''}
    <tr><td colspan="4" class="r"><b>Total</b></td><td class="r"><b>${dinero(sub - (t.descuento || 0))}</b></td></tr></table>
    ${t.notas ? `<p><b>Notas:</b> ${esc(t.notas)}</p>` : ''}<p style="margin-top:40px;font-size:12px;color:#666">Presupuesto válido por 30 días. Los precios incluyen IVA cuando aplique.</p>
    </body></html>`, `presupuesto-${t.titulo.replace(/\W+/g, '-').toLowerCase()}.html`);
}
