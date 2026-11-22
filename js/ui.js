// Utilerías de interfaz: escape, formatos, modales, toasts y formularios.
import { db } from './db.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
export const dinero = (n) => mxn.format(Number(n) || 0);
export const fecha = (d) => d ? new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
export const fechaHora = (d) => d ? new Date(d).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
export const hora = (d) => d ? new Date(d).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '';
export const isoDia = (d = new Date()) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
export const localInput = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };
export const edad = (fn) => { if (!fn) return ''; const d = new Date(fn), h = new Date(); let a = h.getFullYear() - d.getFullYear(); if (h < new Date(h.getFullYear(), d.getMonth(), d.getDate())) a--; return a; };
export const nombreCompleto = (p) => p ? `${p.nombre || ''} ${p.apellidos || ''}`.trim() : '—';

export function toast(msg, tipo = 'ok') {
  const t = document.createElement('div');
  t.className = `toast toast-${tipo}`; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, tipo === 'error' ? 5000 : 2500);
}

export function modal({ titulo, cuerpo, acciones = [], ancho = '' }) {
  cerrarModal();
  const fondo = document.createElement('div');
  fondo.className = 'modal-fondo'; fondo.id = 'modal';
  fondo.innerHTML = `<div class="modal ${ancho}">
    <div class="modal-cab"><h3>${esc(titulo)}</h3><button class="btn-icono" data-cerrar aria-label="Cerrar">✕</button></div>
    <div class="modal-cuerpo">${cuerpo}</div>
    <div class="modal-pie">${acciones.map((a, i) => `<button class="btn ${a.clase || ''}" data-acc="${i}">${esc(a.texto)}</button>`).join('')}</div>
  </div>`;
  document.body.appendChild(fondo);
  fondo.addEventListener('click', async (e) => {
    if (e.target === fondo || e.target.closest('[data-cerrar]')) return cerrarModal();
    const b = e.target.closest('[data-acc]');
    if (b) {
      const a = acciones[+b.dataset.acc];
      b.disabled = true;
      try { const r = await a.onClick?.(fondo); if (r !== false) cerrarModal(); }
      catch (err) { toast(err.message, 'error'); }
      finally { b.disabled = false; }
    }
  });
  setTimeout(() => fondo.querySelector('input,select,textarea')?.focus(), 50);
  return fondo;
}
export function cerrarModal() { document.getElementById('modal')?.remove(); }

export function confirmar(texto) {
  return new Promise(res => modal({
    titulo: 'Confirmar', cuerpo: `<p>${esc(texto)}</p>`,
    acciones: [{ texto: 'Cancelar', onClick: () => res(false) }, { texto: 'Sí, continuar', clase: 'peligro', onClick: () => res(true) }]
  }));
}

// ---------- Formularios ----------
// campo: { clave, etiqueta, tipo: text|number|date|datetime|select|textarea|tel|email|checkbox, opciones:[{v,t}]|string[], requerido, ancho:'completo' }
export function campoHtml(c, valor) {
  const id = `f_${c.clave}`;
  const req = c.requerido ? 'required' : '';
  const v = valor ?? c.defecto ?? '';
  let input;
  const ops = (c.opciones || []).map(o => typeof o === 'string' ? { v: o, t: o } : o);
  switch (c.tipo) {
    case 'select':
      input = `<select id="${id}" name="${c.clave}" ${req}>${c.requerido ? '' : '<option value="">—</option>'}${ops.map(o => `<option value="${esc(o.v)}" ${String(o.v) === String(v) ? 'selected' : ''}>${esc(o.t)}</option>`).join('')}</select>`; break;
    case 'textarea':
      input = `<textarea id="${id}" name="${c.clave}" rows="${c.filas || 3}" ${req}>${esc(v)}</textarea>`; break;
    case 'checkbox':
      return `<label class="campo campo-check ${c.ancho || ''}"><input type="checkbox" name="${c.clave}" ${v ? 'checked' : ''}> ${esc(c.etiqueta)}</label>`;
    case 'datetime':
      input = `<input id="${id}" type="datetime-local" name="${c.clave}" value="${v ? localInput(v) : ''}" ${req}>`; break;
    default:
      input = `<input id="${id}" type="${c.tipo || 'text'}" name="${c.clave}" value="${esc(v)}" ${c.tipo === 'number' ? 'step="any"' : ''} ${req} ${c.placeholder ? `placeholder="${esc(c.placeholder)}"` : ''}>`;
  }
  return `<div class="campo ${c.ancho || ''}"><label for="${id}">${esc(c.etiqueta)}${c.requerido ? ' *' : ''}</label>${input}</div>`;
}

export function formHtml(campos, valores = {}) {
  return `<form class="form-grid" onsubmit="return false">${campos.map(c => campoHtml(c, valores[c.clave] ?? valores.custom?.[c.clave])).join('')}</form>`;
}

export function leerForm(raiz, campos) {
  const form = raiz.querySelector('form');
  const out = {};
  for (const c of campos) {
    const el = form.elements[c.clave]; if (!el) continue;
    let v = c.tipo === 'checkbox' ? el.checked : el.value;
    if (c.tipo === 'number') v = v === '' ? null : Number(v);
    if (c.tipo === 'datetime') v = v ? new Date(v).toISOString() : null;
    if (c.requerido && (v === '' || v === null)) throw new Error(`El campo "${c.etiqueta}" es obligatorio`);
    out[c.clave] = v;
  }
  return out;
}

// Campos personalizados definidos en Configuración
export async function camposPersonalizados(entidad) {
  const todos = await db.getConfig('campos_personalizados', []);
  return todos.filter(c => c.entidad === entidad).map(c => ({ ...c, custom: true, opciones: c.opciones ? String(c.opciones).split(',').map(s => s.trim()) : [] }));
}
export function separarCustom(datos, campos) {
  const custom = {}; const base = { ...datos };
  for (const c of campos) if (c.custom) { custom[c.clave] = base[c.clave]; delete base[c.clave]; }
  return { base, custom };
}

export function vacio(texto, accion = '') {
  return `<div class="vacio"><div class="vacio-ico">🦷</div><p>${esc(texto)}</p>${accion}</div>`;
}

export function chip(texto, color = '') { return `<span class="chip ${color}">${esc(texto)}</span>`; }

export function puede(...roles) { return roles.includes(db.usuario?.rol); }
