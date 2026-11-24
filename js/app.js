import { db } from './db.js';
import { sembrarDemo } from './seed.js';
import { esc, toast, $, puede } from './ui.js';
import { ROLES, etiqueta } from './catalogos.js';
import { iniciarNativo } from './nativo.js';

const RUTAS = [
  { ruta: 'inicio', titulo: 'Inicio', ico: '📊', modulo: './vistas/dashboard.js', roles: ['admin', 'doctor', 'recepcion'] },
  { ruta: 'agenda', titulo: 'Agenda', ico: '📅', modulo: './vistas/agenda.js', roles: ['admin', 'doctor', 'recepcion'] },
  { ruta: 'pacientes', titulo: 'Pacientes', ico: '👥', modulo: './vistas/pacientes.js', roles: ['admin', 'doctor', 'recepcion'] },
  { ruta: 'paciente', titulo: 'Paciente', modulo: './vistas/paciente.js', roles: ['admin', 'doctor', 'recepcion'], oculta: true },
  { ruta: 'prospectos', titulo: 'Prospectos', ico: '🎯', modulo: './vistas/prospectos.js', roles: ['admin', 'doctor', 'recepcion'] },
  { ruta: 'tratamientos', titulo: 'Tratamientos', ico: '🦷', modulo: './vistas/tratamientos.js', roles: ['admin', 'doctor', 'recepcion'] },
  { ruta: 'pagos', titulo: 'Pagos', ico: '💳', modulo: './vistas/pagos.js', roles: ['admin', 'recepcion'] },
  { ruta: 'config', titulo: 'Configuración', ico: '⚙️', modulo: './vistas/config.js', roles: ['admin'] }
];

async function iniciar() {
  try {
    await db.init();
    if (db.modo === 'local' && db.adapter.isEmpty()) await sembrarDemo();
  } catch (e) {
    document.getElementById('app').innerHTML = `<div class="cargando">Error al conectar: ${esc(e.message)}<br><button class="btn" onclick="localStorage.removeItem('dentalcrm_conexion');location.reload()">Volver al modo demo</button></div>`;
    return;
  }
  const guardado = sessionStorage.getItem('dentalcrm_usuario');
  if (guardado) db.usuario = JSON.parse(guardado);
  if (db.modo === 'supabase') {
    const { data } = await db.sb.auth.getSession();
    if (!data.session) db.usuario = null;
  }
  db.usuario ? montar() : login();
}

// ---------- Login ----------
async function login() {
  const app = document.getElementById('app');
  const clinica = await db.getConfig('clinica', {}).catch(() => ({}));
  if (db.modo === 'local') {
    const usuarios = await db.list('usuarios');
    app.innerHTML = `<div class="login"><div class="login-caja">
      <div class="login-logo">🦷</div><h1>${esc(clinica?.nombre || 'DentalCRM')}</h1>
      <p class="sutil">Modo demo · los datos se guardan en este navegador</p>
      <form id="flogin" class="form-grid">
        <div class="campo completo"><label>Usuario</label><select name="u">${usuarios.map(u => `<option value="${u.id}">${esc(u.nombre)} · ${esc(etiqueta(ROLES, u.rol))}</option>`).join('')}</select></div>
        <div class="campo completo"><label>PIN</label><input name="pin" type="password" inputmode="numeric" autocomplete="current-password" placeholder="Demo: 1234 admin · 0000 recepción · 1111 doctor"></div>
        <button class="btn primario completo">Entrar</button>
      </form></div></div>`;
    $('#flogin').onsubmit = (e) => {
      e.preventDefault();
      const u = usuarios.find(x => x.id === e.target.u.value);
      if (!u || String(u.pin) !== e.target.pin.value) return toast('PIN incorrecto', 'error');
      entrar(u);
    };
  } else {
    app.innerHTML = `<div class="login"><div class="login-caja">
      <div class="login-logo">🦷</div><h1>${esc(clinica?.nombre || 'DentalCRM')}</h1>
      <form id="flogin" class="form-grid">
        <div class="campo completo"><label>Correo</label><input name="email" type="email" required autocomplete="username"></div>
        <div class="campo completo"><label>Contraseña</label><input name="pass" type="password" required autocomplete="current-password"></div>
        <button class="btn primario completo">Entrar</button>
      </form></div></div>`;
    $('#flogin').onsubmit = async (e) => {
      e.preventDefault();
      const { error } = await db.sb.auth.signInWithPassword({ email: e.target.email.value, password: e.target.pass.value });
      if (error) return toast(error.message, 'error');
      const [perfil] = await db.list('usuarios', { email: e.target.email.value.toLowerCase() });
      if (!perfil) return toast('Tu usuario no tiene perfil en la tabla usuarios', 'error');
      db.usuario = perfil;
      // Primera vez: carga configuración inicial (sin pacientes de ejemplo)
      if (!(await db.getConfig('clinica'))) await sembrarDemo({ ejemplos: false });
      entrar(perfil);
    };
  }
}

function entrar(u) {
  const { pin, ...seguro } = u;
  db.usuario = seguro;
  sessionStorage.setItem('dentalcrm_usuario', JSON.stringify(seguro));
  location.hash = '#/inicio';
  montar();
}

export async function salir() {
  sessionStorage.removeItem('dentalcrm_usuario');
  db.usuario = null;
  if (db.modo === 'supabase') await db.sb.auth.signOut();
  login();
}

// ---------- Layout y router ----------
async function montar() {
  const clinica = await db.getConfig('clinica', {});
  const visibles = RUTAS.filter(r => !r.oculta && r.roles.includes(db.usuario.rol));
  document.getElementById('app').innerHTML = `
    <aside class="lateral">
      <div class="marca"><span>🦷</span><div><b>${esc(clinica?.nombre || 'DentalCRM')}</b><small>${db.modo === 'local' ? 'Modo demo' : 'Conectado'}</small></div></div>
      <nav>${visibles.map(r => `<a href="#/${r.ruta}" data-ruta="${r.ruta}"><span>${r.ico}</span><em>${r.titulo}</em></a>`).join('')}</nav>
      <div class="usuario"><div><b>${esc(db.usuario.nombre)}</b><small>${esc(etiqueta(ROLES, db.usuario.rol))}</small></div><button class="btn-icono" id="bsalir" title="Salir">⎋</button></div>
    </aside>
    <main><div id="vista"></div></main>`;
  $('#bsalir').onclick = salir;
  window.onhashchange = navegar;
  navegar();
}

let vistaActual = null;
async function navegar() {
  const [ruta = 'inicio', ...params] = location.hash.replace(/^#\/?/, '').split('/');
  const r = RUTAS.find(x => x.ruta === ruta) || RUTAS[0];
  if (!r.roles.includes(db.usuario.rol)) { location.hash = '#/inicio'; return; }
  document.querySelectorAll('.lateral nav a').forEach(a => a.classList.toggle('activo', a.dataset.ruta === (r.oculta ? 'pacientes' : r.ruta)));
  const cont = document.getElementById('vista');
  cont.innerHTML = '<div class="cargando">Cargando…</div>';
  try {
    vistaActual?.destruir?.();
    const mod = await import(r.modulo);
    vistaActual = mod;
    await mod.render(cont, params.map(decodeURIComponent));
    document.title = `${r.titulo} · DentalCRM`;
    window.scrollTo(0, 0);
  } catch (e) {
    console.error(e);
    cont.innerHTML = `<div class="vacio"><p>Ocurrió un error: ${esc(e.message)}</p></div>`;
  }
}
export function recargarVista() { navegar(); }
export { puede };

iniciarNativo();
iniciar();
