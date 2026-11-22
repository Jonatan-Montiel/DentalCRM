// Motor de scripts estilo "Object Functions / Triggers" de Application Composer,
// pero en JavaScript. Cada script se ejecuta con un contexto:
//   registro  -> el registro (editable en before*)
//   anterior  -> versión previa (en update/delete)
//   api       -> utilerías: error(), buscar(), crear(), actualizar(), webhook(), log(), hoy(), usuario
// En before* puedes modificar `registro` o lanzar api.error('mensaje') para bloquear.
import { db } from './db.js';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
export const EVENTOS = ['beforeInsert', 'afterInsert', 'beforeUpdate', 'afterUpdate', 'beforeDelete'];

export class ErrorValidacion extends Error {}

let cache = null;
export function invalidarCacheScripts() { cache = null; }

async function cargar() {
  if (cache) return cache;
  const [scripts, webhooks] = await Promise.all([
    db.adapter.list('config', { clave: 'scripts' }),
    db.adapter.list('config', { clave: 'webhooks' })
  ]);
  cache = { scripts: scripts[0]?.valor || [], webhooks: webhooks[0]?.valor || [] };
  return cache;
}

export const logsScripts = [];
function logScript(nombre, ...args) {
  logsScripts.unshift({ fecha: new Date().toISOString(), nombre, mensaje: args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ') });
  logsScripts.length = Math.min(logsScripts.length, 200);
}

export function construirApi(nombre) {
  return {
    error(msg) { throw new ErrorValidacion(msg); },
    log: (...a) => logScript(nombre, ...a),
    hoy: () => new Date(),
    usuario: db.usuario,
    buscar: (entidad, filtro) => db.list(entidad, filtro),
    obtener: (entidad, id) => db.get(entidad, id),
    crear: (entidad, datos) => db.create(entidad, datos, { sinTriggers: true }),
    actualizar: (entidad, id, cambios) => db.update(entidad, id, cambios, { sinTriggers: true }),
    config: (clave) => db.getConfig(clave),
    async webhook(url, payload, metodo = 'POST') {
      const r = await fetch(url, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      logScript(nombre, `webhook ${metodo} ${url} -> ${r.status}`);
      return r.ok;
    }
  };
}

export async function ejecutarCodigo(codigo, registro, anterior, nombre = 'prueba') {
  const fn = new AsyncFunction('registro', 'anterior', 'api', codigo);
  await fn(registro, anterior, construirApi(nombre));
  return registro;
}

export async function runTriggers(entidad, evento, registro, anterior) {
  const { scripts, webhooks } = await cargar();
  let rec = registro ? { ...registro } : registro;
  for (const s of scripts) {
    if (!s.activo || s.entidad !== entidad || s.evento !== evento) continue;
    try {
      rec = (await ejecutarCodigo(s.codigo, rec, anterior, s.nombre)) ?? rec;
    } catch (e) {
      if (e instanceof ErrorValidacion) throw e;
      logScript(s.nombre, 'ERROR: ' + e.message);
      if (evento.startsWith('before')) throw new Error(`Script "${s.nombre}": ${e.message}`);
    }
  }
  // Webhooks salientes (solo eventos after*)
  if (evento.startsWith('after')) {
    const clave = `${entidad}.${evento}`;
    for (const w of webhooks) {
      if (!w.activo || (w.evento !== clave && w.evento !== '*')) continue;
      fetch(w.url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evento: clave, fecha: new Date().toISOString(), registro: rec, anterior })
      }).then(r => logScript('webhook', `${clave} -> ${w.url} (${r.status})`))
        .catch(err => logScript('webhook', `${clave} -> ${w.url} ERROR ${err.message}`));
    }
  }
  return rec;
}
