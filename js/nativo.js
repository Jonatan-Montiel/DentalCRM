// Puente con la app de Android (window.DentalAndroid, ver android/.../MainActivity.java).
// En navegador usa las APIs web normales.
const A = window.DentalAndroid;
export const esNativo = !!A;

// Guarda un archivo: en Android abre "Compartir" (Drive, WhatsApp, correo); en web lo descarga.
export async function descargar(nombre, contenido, mime = 'text/plain') {
  if (esNativo) return A.compartir(nombre, contenido, mime);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([contenido], { type: mime }));
  a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
}

// Imprime un documento HTML (en Android usa el servicio de impresión: impresora o "Guardar como PDF").
export async function imprimirHtml(html, nombre = 'documento.html') {
  if (esNativo) return A.imprimir(html, nombre.replace(/\.html$/, ''));
  const w = window.open('', '_blank');
  if (!w) return descargar(nombre, html, 'text/html');
  w.document.write(html.replace('</body>', '<script>print()<\/script></body>'));
  w.document.close();
}

// Abre un enlace externo (WhatsApp, etc.).
export function abrirExterno(url) {
  if (esNativo) return A.abrir(url);
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
}

export function iniciarNativo() {
  if (esNativo) {
    document.documentElement.classList.add('nativo');
    // Botón "atrás" de Android: Java pregunta aquí; true = ya se manejó, false = salir de la app.
    window.__atras = () => {
      const modal = document.getElementById('modal');
      if (modal) { modal.remove(); return true; }
      const ruta = location.hash.replace(/^#\/?/, '');
      if (ruta && ruta !== 'inicio') { history.back(); return true; }
      return false;
    };
    return;
  }
  // PWA: permite instalar desde Chrome ("Agregar a la pantalla principal")
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// En la página web: muestra el botón para descargar la app de Android si ya hay un APK publicado (dl/).
export async function enlaceApk() {
  if (esNativo || !/Android/i.test(navigator.userAgent + (navigator.userAgentData?.platform || '')) && !location.hostname.endsWith('github.io')) return '';
  try {
    const r = await fetch('dl/version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return '';
    const { vc } = await r.json();
    return `<a class="btn completo" href="dl/dentalcrm.apk" download>📱 Descargar app Android (v${vc})</a>`;
  } catch { return ''; }
}
