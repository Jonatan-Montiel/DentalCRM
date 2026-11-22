// Capa de datos: misma interfaz para modo demo (navegador) y Supabase.
// Toda escritura pasa por el motor de scripts (triggers) y la bitácora.
import { runTriggers } from './scripts.js';

export const ENTIDADES = [
  'pacientes', 'prospectos', 'citas', 'tratamientos', 'pagos',
  'notas_clinicas', 'odontogramas', 'doctores', 'sillones',
  'procedimientos', 'usuarios', 'bitacora', 'config'
];

const uid = () => (crypto.randomUUID ? crypto.randomUUID() :
  Date.now().toString(36) + Math.random().toString(36).slice(2));

// ---------- Adaptador local (localStorage) ----------
class LocalAdapter {
  constructor() { this.key = 'dentalcrm_v1'; this.data = this._load(); }
  _load() {
    try { return JSON.parse(localStorage.getItem(this.key)) || {}; } catch { return {}; }
  }
  _save() { try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { console.error(e); } }
  _t(e) { return (this.data[e] ||= []); }
  async list(e, filtro = {}) {
    return this._t(e).filter(r => Object.entries(filtro).every(([k, v]) => r[k] === v)).map(r => ({ ...r }));
  }
  async get(e, id) { const r = this._t(e).find(r => r.id === id); return r ? { ...r } : null; }
  async insert(e, rec) { this._t(e).push(rec); this._save(); return { ...rec }; }
  async update(e, id, rec) {
    const t = this._t(e); const i = t.findIndex(r => r.id === id);
    if (i < 0) throw new Error('Registro no encontrado');
    t[i] = { ...rec }; this._save(); return { ...rec };
  }
  async remove(e, id) { this.data[e] = this._t(e).filter(r => r.id !== id); this._save(); }
  async exportAll() { return JSON.parse(JSON.stringify(this.data)); }
  async importAll(d) { this.data = d; this._save(); }
  isEmpty() { return !this.data.config || !this.data.config.length; }
}

// ---------- Adaptador Supabase ----------
// PostgreSQL no acepta '' en fechas, números ni llaves foráneas: se convierten a null.
const limpiar = (rec) => Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, v === '' ? null : v]));

class SupabaseAdapter {
  constructor(client) { this.sb = client; }
  isEmpty() { return false; }
  async list(e, filtro = {}) {
    let q = this.sb.from(e).select('*');
    for (const [k, v] of Object.entries(filtro)) q = q.eq(k, v);
    const { data, error } = await q; if (error) throw error; return data;
  }
  async get(e, id) {
    const { data, error } = await this.sb.from(e).select('*').eq('id', id).maybeSingle();
    if (error) throw error; return data;
  }
  async insert(e, rec) {
    const { data, error } = await this.sb.from(e).insert(limpiar(rec)).select().single();
    if (error) throw error; return data;
  }
  async update(e, id, rec) {
    const { data, error } = await this.sb.from(e).update(limpiar(rec)).eq('id', id).select().single();
    if (error) throw error; return data;
  }
  async remove(e, id) { const { error } = await this.sb.from(e).delete().eq('id', id); if (error) throw error; }
  async exportAll() {
    const out = {}; for (const e of ENTIDADES) out[e] = await this.list(e); return out;
  }
  async importAll() { throw new Error('La importación masiva en Supabase se hace desde el panel SQL.'); }
}

// ---------- Fachada ----------
export const db = {
  adapter: null,
  modo: 'local',
  usuario: null,
  listeners: new Set(),

  async init() {
    const cfg = JSON.parse(localStorage.getItem('dentalcrm_conexion') || 'null');
    if (cfg?.url && cfg?.anonKey) {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      this.sb = createClient(cfg.url, cfg.anonKey);
      this.adapter = new SupabaseAdapter(this.sb);
      this.modo = 'supabase';
    } else {
      this.adapter = new LocalAdapter();
      this.modo = 'local';
    }
  },

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  _emit(evt) { this.listeners.forEach(fn => { try { fn(evt); } catch (e) { console.error(e); } }); },

  list(e, f) { return this.adapter.list(e, f); },
  get(e, id) { return this.adapter.get(e, id); },

  async create(entidad, datos, { sinTriggers = false } = {}) {
    let rec = { id: uid(), creado: new Date().toISOString(), ...datos };
    if (!sinTriggers) rec = await runTriggers(entidad, 'beforeInsert', rec, null);
    const saved = await this.adapter.insert(entidad, rec);
    if (entidad !== 'bitacora') await this._log(entidad, saved.id, 'crear', saved);
    if (!sinTriggers) await runTriggers(entidad, 'afterInsert', saved, null);
    this._emit({ entidad, accion: 'crear', registro: saved });
    return saved;
  },

  async update(entidad, id, cambios, { sinTriggers = false } = {}) {
    const old = await this.adapter.get(entidad, id);
    let rec = { ...old, ...cambios, actualizado: new Date().toISOString() };
    if (!sinTriggers) rec = await runTriggers(entidad, 'beforeUpdate', rec, old);
    const saved = await this.adapter.update(entidad, id, rec);
    const diff = {};
    for (const k of Object.keys(saved)) {
      if (k !== 'actualizado' && JSON.stringify(saved[k]) !== JSON.stringify(old?.[k])) diff[k] = { de: old?.[k], a: saved[k] };
    }
    if (Object.keys(diff).length) await this._log(entidad, id, 'actualizar', diff);
    if (!sinTriggers) await runTriggers(entidad, 'afterUpdate', saved, old);
    this._emit({ entidad, accion: 'actualizar', registro: saved, anterior: old });
    return saved;
  },

  async remove(entidad, id) {
    const old = await this.adapter.get(entidad, id);
    await runTriggers(entidad, 'beforeDelete', old, old);
    await this.adapter.remove(entidad, id);
    await this._log(entidad, id, 'eliminar', old);
    this._emit({ entidad, accion: 'eliminar', registro: old });
  },

  async _log(entidad, registro_id, accion, cambios) {
    if (entidad === 'bitacora') return;
    try {
      await this.adapter.insert('bitacora', {
        id: uid(), creado: new Date().toISOString(), entidad, registro_id, accion,
        usuario: this.usuario?.nombre || 'sistema', cambios
      });
    } catch (e) { console.warn('Bitácora:', e.message); }
  },

  // Configuración (clave/valor)
  async getConfig(clave, def = null) {
    const rows = await this.adapter.list('config', { clave });
    return rows[0]?.valor ?? def;
  },
  async setConfig(clave, valor) {
    const rows = await this.adapter.list('config', { clave });
    if (rows[0]) await this.adapter.update('config', rows[0].id, { ...rows[0], valor });
    else await this.adapter.insert('config', { id: uid(), clave, valor });
    this._emit({ entidad: 'config', accion: 'actualizar', clave });
  },

  exportAll() { return this.adapter.exportAll(); },
  importAll(d) { return this.adapter.importAll(d); },
  uid
};
