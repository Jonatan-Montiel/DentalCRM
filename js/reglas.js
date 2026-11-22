// Reglas de negocio del CRM (equivalente a los triggers de objeto en Groovy).
// Se mantienen en código: cada regla nueva o integración se agrega aquí.
//
// Estructura:  REGLAS[entidad][evento] = [ async (registro, anterior, ctx) => { ... } ]
// Eventos:     beforeInsert, afterInsert, beforeUpdate, afterUpdate, beforeDelete
// En before*   se puede modificar `registro` o lanzar `new ErrorValidacion('mensaje')` para bloquear.
import { db } from './db.js';

export class ErrorValidacion extends Error {}

const abierto = (p) => !['convertido', 'perdido'].includes(p.etapa);

const REGLAS = {
  citas: {
    beforeInsert: [
      // Bloquea citas fuera del horario de la clínica
      async (registro) => {
        const clinica = await db.getConfig('clinica', {});
        const h = new Date(registro.inicio).getHours();
        if (h < (clinica?.hora_apertura ?? 8) || h >= (clinica?.hora_cierre ?? 20)) {
          throw new ErrorValidacion('La cita está fuera del horario de la clínica');
        }
      }
    ]
  },

  prospectos: {
    beforeInsert: [
      // Asignación round-robin: el doctor activo con menos prospectos abiertos
      async (registro) => {
        if (registro.doctor_id) return;
        const doctores = (await db.list('doctores')).filter(d => d.activo !== false);
        const abiertos = (await db.list('prospectos')).filter(abierto);
        const carga = (id) => abiertos.filter(p => p.doctor_id === id).length;
        doctores.sort((a, b) => carga(a.id) - carga(b.id));
        if (doctores[0]) registro.doctor_id = doctores[0].id;
      }
    ]
  },

  pagos: {
    afterInsert: [
      // Marca el tratamiento como liquidado cuando los pagos cubren el total
      async (registro) => {
        if (!registro.tratamiento_id) return;
        const t = await db.get('tratamientos', registro.tratamiento_id);
        if (!t || t.liquidado) return;
        const pagos = await db.list('pagos', { tratamiento_id: t.id });
        const pagado = pagos.reduce((s, p) => s + Number(p.monto || 0), 0);
        if (pagado >= Number(t.total || 0)) await db.update('tratamientos', t.id, { liquidado: true }, { sinTriggers: true });
      }
    ]
  }
};

export async function runTriggers(entidad, evento, registro, anterior) {
  const reglas = REGLAS[entidad]?.[evento] || [];
  const rec = registro ? { ...registro } : registro;
  for (const regla of reglas) {
    try {
      await regla(rec, anterior);
    } catch (e) {
      if (e instanceof ErrorValidacion || evento.startsWith('before')) throw e;
      console.error(`Regla ${entidad}.${evento}:`, e); // after*: no revierte el guardado
    }
  }
  return rec;
}
