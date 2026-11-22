// Tablero kanban genérico con arrastrar y soltar (escritorio) y selector de etapa (móvil).
import { esc, toast } from '../ui.js';

export function kanban(el, { etapas, registros, tarjeta, totalColumna, alMover, alAbrir }) {
  el.innerHTML = `<div class="kanban">${etapas.map(e => {
    const regs = registros.filter(r => r.etapa === e.v);
    return `<div class="columna" data-etapa="${e.v}">
      <div class="columna-cab"><span>${esc(e.t)} <small>(${regs.length})</small></span><small>${totalColumna ? totalColumna(regs) : ''}</small></div>
      ${regs.map(r => `<div class="tarjeta-k" draggable="true" data-id="${r.id}">${tarjeta(r)}
        <div class="pie-k"><select data-mover="${r.id}">${etapas.map(x => `<option value="${x.v}" ${x.v === r.etapa ? 'selected' : ''}>${esc(x.t)}</option>`).join('')}</select></div></div>`).join('')}
    </div>`;
  }).join('')}</div>`;

  const mover = async (id, etapa) => {
    const r = registros.find(x => x.id === id);
    if (!r || r.etapa === etapa) return;
    try { await alMover(r, etapa); } catch (e) { toast(e.message, 'error'); }
  };
  el.querySelectorAll('[data-mover]').forEach(s => {
    s.onclick = (e) => e.stopPropagation();
    s.onchange = () => mover(s.dataset.mover, s.value);
  });
  el.querySelectorAll('.tarjeta-k').forEach(t => {
    t.onclick = (e) => { if (!e.target.closest('select,a,button')) alAbrir(registros.find(r => r.id === t.dataset.id)); };
    t.ondragstart = (e) => e.dataTransfer.setData('text/plain', t.dataset.id);
  });
  el.querySelectorAll('.columna').forEach(c => {
    c.ondragover = (e) => { e.preventDefault(); c.classList.add('sobre'); };
    c.ondragleave = () => c.classList.remove('sobre');
    c.ondrop = (e) => { e.preventDefault(); c.classList.remove('sobre'); mover(e.dataTransfer.getData('text/plain'), c.dataset.etapa); };
  });
}
