// Odontograma interactivo (numeración FDI). Cada diente tiene 5 caras:
// V (vestibular), L (lingual/palatino), M (mesial), D (distal), O (oclusal/incisal).
import { db } from '../db.js';
import { esc, toast, modal, $ } from '../ui.js';
import { DIENTES_ADULTO, DIENTES_INFANTIL, CONDICIONES_CARA, CONDICIONES_DIENTE } from '../catalogos.js';

export async function renderOdontograma(el, pacienteId, soloLectura = false) {
  let [reg] = await db.list('odontogramas', { paciente_id: pacienteId });
  let datos = reg ? structuredClone(reg) : { paciente_id: pacienteId, tipo: 'adulto', dientes: {} };
  let herramienta = { tipo: 'cara', v: 'caries' };
  let pendiente = false;

  const colorCara = (v) => CONDICIONES_CARA.find(c => c.v === v)?.color || '#fff';

  // Mesial queda hacia la línea media: en cuadrantes 1,4,5,8 la mesial está a la derecha.
  const svgDiente = (n) => {
    const d = datos.dientes[n] || { caras: {} };
    const q = Math.floor(n / 10);
    const mesialDerecha = [1, 4, 5, 8].includes(q);
    const superior = [1, 2, 5, 6].includes(q);
    const caras = {
      top: superior ? 'V' : 'L', bottom: superior ? 'L' : 'V',
      left: mesialDerecha ? 'D' : 'M', right: mesialDerecha ? 'M' : 'D'
    };
    const cd = CONDICIONES_DIENTE.find(c => c.v === d.estado);
    const f = (cara) => colorCara(d.caras?.[cara]);
    return `<svg viewBox="0 0 40 40" data-n="${n}">
      <polygon class="cara" data-cara="${caras.top}" points="0,0 40,0 30,10 10,10" fill="${f(caras.top)}"/>
      <polygon class="cara" data-cara="${caras.right}" points="40,0 40,40 30,30 30,10" fill="${f(caras.right)}"/>
      <polygon class="cara" data-cara="${caras.bottom}" points="0,40 40,40 30,30 10,30" fill="${f(caras.bottom)}"/>
      <polygon class="cara" data-cara="${caras.left}" points="0,0 0,40 10,30 10,10" fill="${f(caras.left)}"/>
      <rect class="cara" data-cara="O" x="10" y="10" width="20" height="20" fill="${f('O')}"/>
      ${cd ? simbolo(cd) : ''}
    </svg>`;
  };
  const simbolo = (cd) => {
    const s = `stroke="${cd.color}" stroke-width="3.5" fill="none" pointer-events="none" stroke-linecap="round"`;
    switch (cd.v) {
      case 'ausente': case 'extraccion': return `<path d="M4 4 L36 36 M36 4 L4 36" ${s}/>`;
      case 'endodoncia': return `<path d="M20 5 L35 34 L5 34 Z" ${s}/>`;
      case 'corona': return `<circle cx="20" cy="20" r="17" ${s}/>`;
      case 'implante': return `<path d="M20 5 L20 35 M10 35 L30 35 M13 13 L27 13 M13 21 L27 21" ${s}/>`;
      case 'puente': return `<path d="M0 3 L40 3 M0 37 L40 37" ${s}/>`;
      default: return '';
    }
  };

  const fila = (lista) => `<div class="odonto-fila">${lista.map((n, i) => `${i === lista.length / 2 ? '<div class="odonto-sep"></div>' : ''}<div class="diente">${[1, 2, 5, 6].includes(Math.floor(n / 10)) ? `<small>${n}</small>${svgDiente(n)}` : `${svgDiente(n)}<small>${n}</small>`}</div>`).join('')}</div>`;

  const pintar = () => {
    const set = datos.tipo === 'infantil' ? DIENTES_INFANTIL : DIENTES_ADULTO;
    const resumen = Object.entries(datos.dientes).filter(([, d]) => d.estado || d.nota || Object.values(d.caras || {}).some(Boolean))
      .sort(([a], [b]) => a - b)
      .map(([n, d]) => `<b>${n}</b>: ${[CONDICIONES_DIENTE.find(c => c.v === d.estado)?.t, ...Object.entries(d.caras || {}).map(([c, v]) => `${CONDICIONES_CARA.find(x => x.v === v)?.t} ${c}`)].filter(Boolean).join(', ')}${d.nota ? ` — ${esc(d.nota)}` : ''}`);
    el.innerHTML = `
      <div class="cabecera" style="margin-bottom:10px"><h2>Odontograma</h2>
        <div class="acciones"><select id="tipo" style="width:auto"><option value="adulto" ${datos.tipo === 'adulto' ? 'selected' : ''}>Permanente (adulto)</option><option value="infantil" ${datos.tipo === 'infantil' ? 'selected' : ''}>Temporal (infantil)</option></select>
        ${soloLectura ? '' : `<button class="btn primario" id="guardar" ${pendiente ? '' : 'disabled'}>Guardar${pendiente ? ' *' : ''}</button>`}</div></div>
      ${soloLectura ? '' : `<div class="odonto-herr">
        ${CONDICIONES_CARA.map(c => `<button data-t="cara" data-v="${c.v}" class="${herramienta.v === c.v ? 'activo' : ''}"><i style="background:${c.color}"></i>${c.t}</button>`).join('')}
        ${CONDICIONES_DIENTE.map(c => `<button data-t="diente" data-v="${c.v}" class="${herramienta.v === c.v ? 'activo' : ''}"><b style="color:${c.color}">${c.simbolo || '○'}</b>${c.t}</button>`).join('')}
        <button data-t="nota" data-v="nota" class="${herramienta.v === 'nota' ? 'activo' : ''}">📝 Nota</button>
      </div>
      <p class="sutil" style="margin:-4px 0 12px;font-size:12px">Elige una condición y toca la cara del diente (o el diente completo para ausente, corona, etc.).</p>`}
      <div class="odonto">${fila(set.sup)}${fila(set.inf)}</div>
      <h3 style="margin:18px 0 6px">Hallazgos</h3>
      ${resumen.length ? `<ul style="margin:0;padding-left:18px;line-height:1.8">${resumen.map(r => `<li>${r}</li>`).join('')}</ul>` : '<p class="sutil">Sin hallazgos registrados.</p>'}`;

    $('#tipo', el).onchange = (e) => { datos.tipo = e.target.value; pendiente = true; pintar(); };
    if (soloLectura) return;
    el.querySelectorAll('.odonto-herr button').forEach(b => b.onclick = () => { herramienta = { tipo: b.dataset.t, v: b.dataset.v }; pintar(); });
    el.querySelectorAll('.diente svg').forEach(svg => svg.onclick = (e) => {
      const n = svg.dataset.n; const d = (datos.dientes[n] ||= { caras: {} });
      if (herramienta.tipo === 'cara') {
        const cara = e.target.dataset.cara; if (!cara) return;
        if (herramienta.v === 'sano') delete d.caras[cara]; else d.caras[cara] = herramienta.v;
      } else if (herramienta.tipo === 'diente') {
        if (herramienta.v === 'normal') delete d.estado; else d.estado = d.estado === herramienta.v ? undefined : herramienta.v;
      } else {
        modal({
          titulo: `Nota para la pieza ${n}`, cuerpo: `<textarea id="notaPieza" rows="3">${esc(d.nota || '')}</textarea>`,
          acciones: [{ texto: 'Cancelar' }, { texto: 'Aplicar', clase: 'primario', onClick: (m) => { d.nota = $('#notaPieza', m).value.trim(); pendiente = true; pintar(); } }]
        });
        return;
      }
      pendiente = true; pintar();
    });
    $('#guardar', el).onclick = async () => {
      try {
        reg = reg ? await db.update('odontogramas', reg.id, datos) : await db.create('odontogramas', datos);
        datos = structuredClone(reg); pendiente = false; toast('Odontograma guardado'); pintar();
      } catch (e) { toast(e.message, 'error'); }
    };
  };
  pintar();
}
