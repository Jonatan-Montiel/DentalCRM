// Copia los archivos de la app web a www/ (carpeta que Capacitor empaqueta en el APK).
import { cpSync, rmSync, mkdirSync } from 'node:fs';
const ARCHIVOS = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'icons'];
rmSync('www', { recursive: true, force: true });
mkdirSync('www');
for (const f of ARCHIVOS) cpSync(f, `www/${f}`, { recursive: true });
console.log('www/ listo');
