// Puente con Android (Capacitor). En navegador usa las APIs web normales.
const Cap = window.Capacitor;
export const esNativo = !!Cap?.isNativePlatform?.();
const plugin = (n) => Cap?.Plugins?.[n];

// Guarda un archivo y lo comparte (Android) o lo descarga (web).
export async function descargar(nombre, contenido, mime = 'text/plain') {
  if (esNativo && plugin('Filesystem') && plugin('Share')) {
    const { uri } = await plugin('Filesystem').writeFile({ path: nombre, data: contenido, directory: 'CACHE', encoding: 'utf8' });
    await plugin('Share').share({ title: nombre, files: [uri], dialogTitle: 'Guardar o compartir' });
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([contenido], { type: mime }));
  a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
}

// Imprime un documento HTML. En Android se comparte el archivo para abrirlo en Chrome e imprimir / guardar como PDF.
export async function imprimirHtml(html, nombre = 'documento.html') {
  if (esNativo) return descargar(nombre, html, 'text/html');
  const w = window.open('', '_blank');
  if (!w) return descargar(nombre, html, 'text/html');
  w.document.write(html.replace('</body>', '<script>print()<\/script></body>'));
  w.document.close();
}

// Abre un enlace externo (WhatsApp, etc.). Capacitor lo manda al navegador o a la app correspondiente.
export function abrirExterno(url) {
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
}

export function iniciarNativo() {
  if (esNativo) {
    document.documentElement.classList.add('nativo');
    // Botón "atrás" de Android: cierra el modal, regresa de pantalla o sale de la app.
    plugin('App')?.addListener('backButton', () => {
      const modal = document.getElementById('modal');
      if (modal) return modal.remove();
      const ruta = location.hash.replace(/^#\/?/, '');
      if (ruta && ruta !== 'inicio') history.back();
      else plugin('App').exitApp();
    });
    return;
  }
  // PWA: permite instalar desde Chrome ("Agregar a pantalla principal")
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
