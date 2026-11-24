import { db } from '../db.js';
import { esc, dinero, modal, formHtml, leerForm, toast, confirmar, fechaHora, chip, vacio, $ } from '../ui.js';
import { ROLES, etiqueta } from '../catalogos.js';
import { descargar } from '../nativo.js';

let pestana = 'clinica';

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
    ['datos', 'Datos y conexión'], ['bitacora', 'Bitácora']];
  el.innerHTML = `<div class="cabecera"><h1>Configuración</h1></div>
    <div class="pestanas">${tabs.map(([k, t]) => `<button data-tab="${k}" class="${k === pestana ? 'activo' : ''}">${t}</button>`).join('')}</div><div id="cfg"></div>`;
  el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { pestana = b.dataset.tab; render(el); });
  const c = $('#cfg', el);
  const recargar = () => render(el);
  if (CATALOGOS[pestana]) return catalogo(c, pestana, recargar);
  await ({ clinica, datos, bitacora })[pestana](c, recargar);
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

async function datos(c) {
  const conexion = JSON.parse(localStorage.getItem('dentalcrm_conexion') || 'null') || {};
  c.innerHTML = `<div class="tarjeta"><h2>Base de datos</h2>
      <p class="sutil">Modo actual: <b>${db.modo === 'local' ? 'Demo (datos en este navegador)' : 'Supabase'}</b>. Para datos reales de pacientes conecta Supabase (ver README).</p>
      <div class="form-grid"><div class="campo completo"><label>URL del proyecto</label><input id="sburl" placeholder="https://xxxx.supabase.co" value="${esc(conexion.url || '')}"></div>
      <div class="campo completo"><label>Anon key (pública)</label><input id="sbkey" value="${esc(conexion.anonKey || '')}"></div></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">${db.modo === 'supabase' ? '<button class="btn" id="sbdes">Volver a demo</button>' : ''}<button class="btn primario" id="sbcon">Conectar</button></div></div>
    <div class="tarjeta"><h2>Respaldo</h2><p class="sutil">Descarga todos los datos en JSON. Haz respaldos frecuentes si usas el modo demo.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primario" id="exp">⬇ Exportar respaldo</button>
    ${db.modo === 'local' ? '<label class="btn">⬆ Importar respaldo<input type="file" id="imp" accept=".json" hidden></label><button class="btn peligro" id="reset">Reiniciar demo</button>' : ''}</div></div>`;
  $('#sbcon', c).onclick = () => {
    const url = $('#sburl', c).value.trim(), anonKey = $('#sbkey', c).value.trim();
    if (!url || !anonKey) return toast('Captura URL y anon key', 'error');
    localStorage.setItem('dentalcrm_conexion', JSON.stringify({ url, anonKey }));
    sessionStorage.removeItem('dentalcrm_usuario'); location.reload();
  };
  $('#sbdes', c)?.addEventListener('click', () => { localStorage.removeItem('dentalcrm_conexion'); sessionStorage.removeItem('dentalcrm_usuario'); location.reload(); });
  $('#exp', c).onclick = async () => {
    const d = await db.exportAll();
    descargar(`dentalcrm_respaldo_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(d, null, 2), 'application/json');
  };
  $('#imp', c)?.addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (!(await confirmar('Esto reemplaza todos los datos actuales. ¿Continuar?'))) return;
    await db.importAll(JSON.parse(await f.text())); toast('Respaldo importado'); setTimeout(() => location.reload(), 600);
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
