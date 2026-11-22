import { db } from '../db.js';
import { esc, dinero, modal, formHtml, leerForm, toast, confirmar, fechaHora, chip, vacio, $ } from '../ui.js';
import { ROLES, etiqueta } from '../catalogos.js';
import { EVENTOS, ejecutarCodigo, invalidarCacheScripts, logsScripts } from '../scripts.js';

let pestana = 'clinica';
const ENT_SCRIPTS = ['pacientes', 'prospectos', 'citas', 'tratamientos', 'pagos', 'notas_clinicas', 'odontogramas'];

// Definición de catálogos simples (CRUD genérico)
const CATALOGOS = {
  doctores: {
    titulo: 'Doctores', limite: 5,
    campos: [{ clave: 'nombre', etiqueta: 'Nombre', requerido: true, ancho: 'completo' }, { clave: 'especialidad', etiqueta: 'Especialidad' }, { clave: 'telefono', etiqueta: 'Teléfono', tipo: 'tel' }, { clave: 'cedula', etiqueta: 'Cédula profesional' }, { clave: 'color', etiqueta: 'Color en agenda', tipo: 'color', defecto: '#0d7377' }, { clave: 'activo', etiqueta: 'Activo', tipo: 'checkbox', defecto: true }],
    cols: (r) => [`<i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${esc(r.color)}"></i> <b>${esc(r.nombre)}</b>`, esc(r.especialidad || ''), r.activo === false ? chip('Inactivo', 'rojo') : chip('Activo', 'verde')],
    enc: ['Nombre', 'Especialidad', 'Estado']
  },
  sillones: {
    titulo: 'Sillones', limite: 5,
    campos: [{ clave: 'nombre', etiqueta: 'Nombre', requerido: true }, { clave: 'activo', etiqueta: 'Activo', tipo: 'checkbox', defecto: true }],
    cols: (r) => [`<b>${esc(r.nombre)}</b>`, r.activo === false ? chip('Inactivo', 'rojo') : chip('Activo', 'verde')], enc: ['Nombre', 'Estado']
  },
  procedimientos: {
    titulo: 'Catálogo de procedimientos',
    campos: [{ clave: 'clave', etiqueta: 'Clave' }, { clave: 'nombre', etiqueta: 'Nombre', requerido: true }, { clave: 'precio', etiqueta: 'Precio (MXN)', tipo: 'number', requerido: true }, { clave: 'duracion_min', etiqueta: 'Duración (min)', tipo: 'number' }, { clave: 'categoria', etiqueta: 'Categoría' }, { clave: 'clave_sat', etiqueta: 'Clave SAT (CFDI)', placeholder: '85121800' }],
    cols: (r) => [esc(r.clave || ''), `<b>${esc(r.nombre)}</b>`, esc(r.categoria || ''), `<span class="num">${dinero(r.precio)}</span>`], enc: ['Clave', 'Nombre', 'Categoría', 'Precio']
  },
  usuarios: {
    titulo: 'Usuarios',
    campos: [{ clave: 'nombre', etiqueta: 'Nombre', requerido: true }, { clave: 'rol', etiqueta: 'Rol', tipo: 'select', requerido: true, opciones: ROLES }, { clave: 'email', etiqueta: 'Correo (modo Supabase)', tipo: 'email' }, { clave: 'pin', etiqueta: 'PIN (modo demo)', tipo: 'password' }, { clave: 'doctor_id', etiqueta: 'Vincular a doctor', tipo: 'select', opciones: [] }],
    cols: (r) => [`<b>${esc(r.nombre)}</b>`, esc(etiqueta(ROLES, r.rol)), esc(r.email || '')], enc: ['Nombre', 'Rol', 'Correo']
  }
};

export async function render(el) {
  const tabs = [['clinica', 'Clínica'], ['doctores', 'Doctores'], ['sillones', 'Sillones'], ['procedimientos', 'Procedimientos'], ['usuarios', 'Usuarios'],
    ['campos', 'Campos personalizados'], ['scripts', 'Scripts'], ['integraciones', 'Integraciones'], ['datos', 'Datos'], ['bitacora', 'Bitácora']];
  el.innerHTML = `<div class="cabecera"><h1>Configuración</h1></div>
    <div class="pestanas">${tabs.map(([k, t]) => `<button data-tab="${k}" class="${k === pestana ? 'activo' : ''}">${t}</button>`).join('')}</div><div id="cfg"></div>`;
  el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { pestana = b.dataset.tab; render(el); });
  const c = $('#cfg', el);
  const recargar = () => render(el);
  if (CATALOGOS[pestana]) return catalogo(c, pestana, recargar);
  await ({ clinica, campos, scripts, integraciones, datos, bitacora })[pestana](c, recargar);
}

async function catalogo(c, ent, recargar) {
  const def = CATALOGOS[ent];
  const regs = await db.list(ent);
  if (ent === 'usuarios') def.campos.find(f => f.clave === 'doctor_id').opciones = (await db.list('doctores')).map(d => ({ v: d.id, t: d.nombre }));
  c.innerHTML = `<div class="tarjeta"><div class="cabecera"><h2>${def.titulo}${def.limite ? ` <small>(${regs.length}/${def.limite})</small>` : ''}</h2><button class="btn primario" id="nuevo" ${def.limite && regs.length >= def.limite ? 'disabled title="Límite del plan alcanzado"' : ''}>+ Agregar</button></div>
    ${regs.length ? `<div class="tabla-wrap"><table><thead><tr>${def.enc.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${regs.map(r => `<tr class="clic" data-id="${r.id}">${def.cols(r).map(v => `<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : vacio('Sin registros')}</div>`;
  const editar = (r) => modal({
    titulo: r ? `Editar` : `Agregar`, cuerpo: formHtml(def.campos, r || {}),
    acciones: [...(r ? [{ texto: '🗑', clase: 'chico', onClick: async () => { if (await confirmar('¿Eliminar registro?')) { await db.remove(ent, r.id); recargar(); } } }] : []),
      { texto: 'Cancelar' }, {
        texto: 'Guardar', clase: 'primario', onClick: async (m) => {
          const d = leerForm(m, def.campos);
          if (ent === 'usuarios' && r && !d.pin) delete d.pin;
          r ? await db.update(ent, r.id, d) : await db.create(ent, d);
          toast('Guardado'); recargar();
        }
      }]
  });
  $('#nuevo', c).onclick = () => editar(null);
  c.querySelectorAll('[data-id]').forEach(tr => tr.onclick = () => editar(regs.find(r => r.id === tr.dataset.id)));
}

async function clinica(c) {
  const v = await db.getConfig('clinica', {});
  const campos = [
    { clave: 'nombre', etiqueta: 'Nombre de la clínica', requerido: true }, { clave: 'telefono', etiqueta: 'Teléfono' },
    { clave: 'direccion', etiqueta: 'Dirección', ancho: 'completo' }, { clave: 'rfc', etiqueta: 'RFC (facturación)' },
    { clave: 'cofepris', etiqueta: 'Aviso de funcionamiento / COFEPRIS' },
    { clave: 'hora_apertura', etiqueta: 'Hora de apertura', tipo: 'number' }, { clave: 'hora_cierre', etiqueta: 'Hora de cierre', tipo: 'number' },
    { clave: 'duracion_cita', etiqueta: 'Duración de cita por defecto (min)', tipo: 'number' },
    { clave: 'plantilla_recordatorio', etiqueta: 'Mensaje de recordatorio (WhatsApp). Variables: {paciente} {clinica} {fecha} {hora} {doctor} {motivo}', tipo: 'textarea', ancho: 'completo' }
  ];
  c.innerHTML = `<div class="tarjeta">${formHtml(campos, v)}<div style="margin-top:14px;text-align:right"><button class="btn primario" id="g">Guardar</button></div></div>`;
  $('#g', c).onclick = async () => {
    try { await db.setConfig('clinica', { ...v, ...leerForm(c, campos) }); toast('Configuración guardada'); } catch (e) { toast(e.message, 'error'); }
  };
}

async function campos(c, recargar) {
  const lista = await db.getConfig('campos_personalizados', []);
  c.innerHTML = `<div class="tarjeta"><div class="cabecera"><div><h2>Campos personalizados</h2><small>Como en Application Composer: agrega campos a cualquier objeto sin programar.</small></div><button class="btn primario" id="n">+ Campo</button></div>
    ${lista.length ? `<table><thead><tr><th>Objeto</th><th>Etiqueta</th><th>Clave API</th><th>Tipo</th></tr></thead><tbody>${lista.map((f, i) => `<tr class="clic" data-i="${i}"><td>${esc(f.entidad)}</td><td><b>${esc(f.etiqueta)}</b></td><td><code>${esc(f.clave)}</code></td><td>${esc(f.tipo)}</td></tr>`).join('')}</tbody></table>` : vacio('Sin campos personalizados')}</div>`;
  const def = [
    { clave: 'entidad', etiqueta: 'Objeto', tipo: 'select', requerido: true, opciones: ['pacientes', 'prospectos'] },
    { clave: 'etiqueta', etiqueta: 'Etiqueta', requerido: true },
    { clave: 'clave', etiqueta: 'Clave API (sin espacios)', requerido: true, placeholder: 'ej. numero_poliza' },
    { clave: 'tipo', etiqueta: 'Tipo', tipo: 'select', requerido: true, opciones: ['text', 'number', 'date', 'select', 'checkbox', 'textarea'] },
    { clave: 'opciones', etiqueta: 'Opciones (para select, separadas por coma)', ancho: 'completo' },
    { clave: 'requerido', etiqueta: 'Obligatorio', tipo: 'checkbox' }
  ];
  const editar = (i) => modal({
    titulo: i == null ? 'Nuevo campo' : 'Editar campo', cuerpo: formHtml(def, i == null ? {} : lista[i]),
    acciones: [...(i != null ? [{ texto: '🗑', clase: 'chico', onClick: async () => { lista.splice(i, 1); await db.setConfig('campos_personalizados', lista); recargar(); } }] : []),
      { texto: 'Cancelar' }, {
        texto: 'Guardar', clase: 'primario', onClick: async (m) => {
          const d = leerForm(m, def);
          d.clave = d.clave.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_]/g, '_');
          if (lista.some((f, j) => j !== i && f.entidad === d.entidad && f.clave === d.clave)) throw new Error('Ya existe un campo con esa clave');
          i == null ? lista.push(d) : (lista[i] = d);
          await db.setConfig('campos_personalizados', lista); toast('Campo guardado'); recargar();
        }
      }]
  });
  $('#n', c).onclick = () => editar(null);
  c.querySelectorAll('[data-i]').forEach(r => r.onclick = () => editar(+r.dataset.i));
}

async function scripts(c, recargar) {
  const lista = await db.getConfig('scripts', []);
  c.innerHTML = `<div class="tarjeta"><div class="cabecera"><div><h2>Scripts y triggers</h2><small>Lógica de negocio en JavaScript, equivalente a los triggers de objeto en Groovy.</small></div><button class="btn primario" id="n">+ Script</button></div>
    ${lista.map((s, i) => `<div class="script-item"><div><b>${esc(s.nombre)}</b><br><small><code>${esc(s.entidad)}.${esc(s.evento)}</code></small></div>
      <div style="display:flex;gap:8px;align-items:center">${s.activo ? chip('Activo', 'verde') : chip('Inactivo')}<button class="btn chico" data-i="${i}">Editar</button></div></div>`).join('') || vacio('Sin scripts')}
    </div>
    <div class="tarjeta"><div class="cabecera"><h2>Log de ejecución</h2><button class="btn chico" id="rl">Actualizar</button></div><div class="logs" id="logs">${logsScripts.map(l => `[${fechaHora(l.fecha)}] ${esc(l.nombre)}: ${esc(l.mensaje)}`).join('\n') || 'Sin registros todavía. Usa api.log() en tus scripts.'}</div></div>
    <div class="tarjeta"><h2>Referencia rápida</h2><div class="logs">registro            // el registro que se guarda (modificable en before*)
anterior            // valores previos (update / delete)
api.error('msg')    // bloquea el guardado con un mensaje (validación)
api.log(...)        // escribe en el log
await api.buscar('citas', { paciente_id: registro.id })
await api.obtener('pacientes', id)
await api.crear('prospectos', { nombre: 'x' })
await api.actualizar('tratamientos', id, { etapa: 'aceptado' })
await api.config('clinica')
await api.webhook(url, payload)   // integración saliente (POST JSON)
api.usuario, api.hoy()</div></div>`;
  const editar = (i) => {
    const s = i == null ? { nombre: '', entidad: 'citas', evento: 'beforeInsert', activo: true, codigo: "// registro, anterior, api\nif (!registro.motivo) api.error('Captura el motivo de la cita');" } : lista[i];
    const def = [
      { clave: 'nombre', etiqueta: 'Nombre', requerido: true, ancho: 'completo' },
      { clave: 'entidad', etiqueta: 'Objeto', tipo: 'select', requerido: true, opciones: ENT_SCRIPTS },
      { clave: 'evento', etiqueta: 'Evento', tipo: 'select', requerido: true, opciones: EVENTOS },
      { clave: 'activo', etiqueta: 'Activo', tipo: 'checkbox' }
    ];
    const m = modal({
      titulo: i == null ? 'Nuevo script' : 'Editar script', ancho: 'ancho',
      cuerpo: formHtml(def, s) + `<div class="campo" style="margin-top:12px"><label>Código (JavaScript, async permitido)</label><textarea class="codigo" id="codigo" rows="14" spellcheck="false">${esc(s.codigo)}</textarea></div>
        <div class="campo" style="margin-top:12px"><label>Registro de prueba (JSON)</label><textarea class="codigo" id="prueba" rows="4" spellcheck="false">${esc(JSON.stringify({ inicio: new Date().toISOString(), motivo: '' }, null, 2))}</textarea></div>
        <div id="res" class="logs" style="margin-top:8px;display:none"></div>`,
      acciones: [...(i != null ? [{ texto: '🗑', clase: 'chico', onClick: async () => { if (await confirmar('¿Eliminar script?')) { lista.splice(i, 1); await db.setConfig('scripts', lista); invalidarCacheScripts(); recargar(); } } }] : []),
        {
          texto: '▶ Probar', onClick: async (mm) => {
            const res = $('#res', mm); res.style.display = 'block';
            try {
              const reg = JSON.parse($('#prueba', mm).value || '{}');
              const out = await ejecutarCodigo($('#codigo', mm).value, reg, null, 'prueba');
              res.textContent = '✓ Sin errores. Registro resultante:\n' + JSON.stringify(out, null, 2);
            } catch (e) { res.textContent = '✕ ' + e.message; }
            return false;
          }
        },
        { texto: 'Cancelar' }, {
          texto: 'Guardar', clase: 'primario', onClick: async (mm) => {
            const d = leerForm(mm, def); d.codigo = $('#codigo', mm).value;
            try { new (Object.getPrototypeOf(async function () {}).constructor)('registro', 'anterior', 'api', d.codigo); } catch (e) { throw new Error('Error de sintaxis: ' + e.message); }
            d.id = s.id || db.uid();
            i == null ? lista.push(d) : (lista[i] = d);
            await db.setConfig('scripts', lista); invalidarCacheScripts(); toast('Script guardado'); recargar();
          }
        }]
    });
    // Tab inserta espacios en el editor
    $('#codigo', m).addEventListener('keydown', (e) => { if (e.key === 'Tab') { e.preventDefault(); const t = e.target, p = t.selectionStart; t.value = t.value.slice(0, p) + '  ' + t.value.slice(t.selectionEnd); t.selectionStart = t.selectionEnd = p + 2; } });
  };
  $('#n', c).onclick = () => editar(null);
  $('#rl', c).onclick = recargar;
  c.querySelectorAll('[data-i]').forEach(b => b.onclick = () => editar(+b.dataset.i));
}

async function integraciones(c, recargar) {
  const hooks = await db.getConfig('webhooks', []);
  const conexion = JSON.parse(localStorage.getItem('dentalcrm_conexion') || 'null') || {};
  const eventos = ['*', ...ENT_SCRIPTS.flatMap(e => [`${e}.afterInsert`, `${e}.afterUpdate`])];
  c.innerHTML = `
    <div class="tarjeta"><h2>Backend (Supabase)</h2>
      <p class="sutil">Modo actual: <b>${db.modo === 'local' ? 'Demo (datos en este navegador)' : 'Supabase'}</b>. Para datos reales de pacientes conecta tu proyecto de Supabase (ver README).</p>
      <div class="form-grid"><div class="campo completo"><label>URL del proyecto</label><input id="sburl" placeholder="https://xxxx.supabase.co" value="${esc(conexion.url || '')}"></div>
      <div class="campo completo"><label>Anon key (pública)</label><input id="sbkey" value="${esc(conexion.anonKey || '')}"></div></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">${db.modo === 'supabase' ? '<button class="btn" id="sbdes">Volver a demo</button>' : ''}<button class="btn primario" id="sbcon">Conectar</button></div></div>
    <div class="tarjeta"><div class="cabecera"><div><h2>Webhooks salientes</h2><small>Envía un POST JSON a otro sistema cuando ocurre un evento.</small></div><button class="btn primario" id="nw">+ Webhook</button></div>
      ${hooks.length ? `<table><thead><tr><th>Evento</th><th>URL</th><th>Estado</th></tr></thead><tbody>${hooks.map((h, i) => `<tr class="clic" data-i="${i}"><td><code>${esc(h.evento)}</code></td><td style="word-break:break-all">${esc(h.url)}</td><td>${h.activo ? chip('Activo', 'verde') : chip('Inactivo')}</td></tr>`).join('')}</tbody></table>` : vacio('Sin webhooks')}</div>
    <div class="tarjeta"><h2>API REST (entrante)</h2>
      <p>Con Supabase, cada tabla expone automáticamente una API REST (PostgREST). Ejemplo para crear un prospecto desde tu formulario web, Zapier, Make o n8n:</p>
      <div class="logs">curl -X POST '${esc(conexion.url || 'https://TU-PROYECTO.supabase.co')}/rest/v1/prospectos' \\
  -H "apikey: TU_ANON_KEY" -H "Authorization: Bearer TU_SERVICE_O_JWT" \\
  -H "Content-Type: application/json" \\
  -d '{"nombre":"Juan Pérez","telefono":"5512345678","origen":"Facebook","interes":"Limpieza","etapa":"nuevo"}'</div>
      <p class="sutil" style="margin-top:10px">Para formularios públicos usa la Edge Function <code>captura-prospecto</code> incluida en el repo (valida y no expone tu llave de servicio).</p></div>
    <div class="tarjeta"><h2>Otras integraciones incluidas</h2><div class="lista-simple">
      <div><div><b>WhatsApp</b><br><small>Recordatorios con un toque (wa.me). Automático con WhatsApp Cloud API vía Edge Function <code>recordatorios-whatsapp</code>.</small></div>${chip('Listo', 'verde')}</div>
      <div><div><b>Calendario (.ics)</b><br><small>Exporta citas a Google Calendar, Apple u Outlook.</small></div>${chip('Listo', 'verde')}</div>
      <div><div><b>Facturación CFDI 4.0</b><br><small>Webhook en <code>pagos.afterInsert</code> hacia tu PAC (Facturama, FacturAPI, etc.).</small></div>${chip('Vía webhook', 'azul')}</div>
      <div><div><b>Pagos en línea</b><br><small>Stripe / Mercado Pago: webhook entrante → Edge Function → tabla pagos.</small></div>${chip('Vía API', 'azul')}</div>
    </div></div>`;
  $('#sbcon', c).onclick = () => {
    const url = $('#sburl', c).value.trim(), anonKey = $('#sbkey', c).value.trim();
    if (!url || !anonKey) return toast('Captura URL y anon key', 'error');
    localStorage.setItem('dentalcrm_conexion', JSON.stringify({ url, anonKey }));
    sessionStorage.removeItem('dentalcrm_usuario'); location.reload();
  };
  $('#sbdes', c)?.addEventListener('click', () => { localStorage.removeItem('dentalcrm_conexion'); sessionStorage.removeItem('dentalcrm_usuario'); location.reload(); });
  const def = [{ clave: 'evento', etiqueta: 'Evento', tipo: 'select', requerido: true, opciones: eventos }, { clave: 'url', etiqueta: 'URL destino', tipo: 'url', requerido: true, ancho: 'completo' }, { clave: 'activo', etiqueta: 'Activo', tipo: 'checkbox', defecto: true }];
  const editar = (i) => modal({
    titulo: 'Webhook', cuerpo: formHtml(def, i == null ? {} : hooks[i]),
    acciones: [...(i != null ? [{ texto: '🗑', clase: 'chico', onClick: async () => { hooks.splice(i, 1); await db.setConfig('webhooks', hooks); invalidarCacheScripts(); recargar(); } }] : []),
      { texto: 'Cancelar' }, { texto: 'Guardar', clase: 'primario', onClick: async (m) => { const d = leerForm(m, def); i == null ? hooks.push(d) : (hooks[i] = d); await db.setConfig('webhooks', hooks); invalidarCacheScripts(); toast('Webhook guardado'); recargar(); } }]
  });
  $('#nw', c).onclick = () => editar(null);
  c.querySelectorAll('[data-i]').forEach(r => r.onclick = () => editar(+r.dataset.i));
}

async function datos(c) {
  c.innerHTML = `<div class="tarjeta"><h2>Respaldo</h2><p class="sutil">Descarga todos los datos en JSON. Haz respaldos frecuentes si usas el modo demo.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primario" id="exp">⬇ Exportar respaldo</button>
    ${db.modo === 'local' ? '<label class="btn">⬆ Importar respaldo<input type="file" id="imp" accept=".json" hidden></label><button class="btn peligro" id="reset">Reiniciar demo</button>' : ''}</div></div>`;
  $('#exp', c).onclick = async () => {
    const d = await db.exportAll();
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }));
    a.download = `dentalcrm_respaldo_${new Date().toISOString().slice(0, 10)}.json`; a.click();
  };
  $('#imp', c)?.addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (!(await confirmar('Esto reemplaza todos los datos actuales. ¿Continuar?'))) return;
    await db.importAll(JSON.parse(await f.text())); invalidarCacheScripts(); toast('Respaldo importado'); setTimeout(() => location.reload(), 600);
  });
  $('#reset', c)?.addEventListener('click', async () => {
    if (!(await confirmar('Se borrarán todos los datos de este navegador y se cargarán los de ejemplo.'))) return;
    localStorage.removeItem('dentalcrm_v1'); sessionStorage.clear(); location.reload();
  });
}

async function bitacora(c) {
  const regs = (await db.list('bitacora')).sort((a, b) => b.creado.localeCompare(a.creado)).slice(0, 200);
  c.innerHTML = `<div class="tarjeta"><h2>Bitácora (últimos 200)</h2>${regs.length ? `<div class="tabla-wrap"><table><thead><tr><th>Fecha</th><th>Usuario</th><th>Objeto</th><th>Acción</th><th>Detalle</th></tr></thead><tbody>
    ${regs.map(r => `<tr><td>${fechaHora(r.creado)}</td><td>${esc(r.usuario)}</td><td>${esc(r.entidad)}</td><td>${esc(r.accion)}</td><td><small>${esc(r.accion === 'actualizar' ? Object.keys(r.cambios || {}).join(', ') : (r.cambios?.nombre || r.cambios?.titulo || r.cambios?.motivo || ''))}</small></td></tr>`).join('')}
    </tbody></table></div>` : vacio('Sin movimientos')}</div>`;
}
