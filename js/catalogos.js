export const ETAPAS_PROSPECTO = [
  { v: 'nuevo', t: 'Nuevo', color: 'gris' },
  { v: 'contactado', t: 'Contactado', color: 'azul' },
  { v: 'cita_agendada', t: 'Cita agendada', color: 'morado' },
  { v: 'convertido', t: 'Convertido', color: 'verde' },
  { v: 'perdido', t: 'Perdido', color: 'rojo' }
];

export const ETAPAS_TRATAMIENTO = [
  { v: 'presupuesto', t: 'Presupuesto', color: 'gris' },
  { v: 'aceptado', t: 'Aceptado', color: 'azul' },
  { v: 'en_tratamiento', t: 'En tratamiento', color: 'morado' },
  { v: 'terminado', t: 'Terminado', color: 'verde' },
  { v: 'rechazado', t: 'Rechazado', color: 'rojo' }
];

export const ESTADOS_CITA = [
  { v: 'programada', t: 'Programada', color: 'gris' },
  { v: 'confirmada', t: 'Confirmada', color: 'azul' },
  { v: 'en_curso', t: 'En curso', color: 'morado' },
  { v: 'completada', t: 'Completada', color: 'verde' },
  { v: 'no_asistio', t: 'No asistió', color: 'rojo' },
  { v: 'cancelada', t: 'Cancelada', color: 'rojo' }
];

export const ORIGENES = ['Facebook', 'Instagram', 'WhatsApp', 'Google', 'TikTok', 'Recomendación', 'Paso por la clínica', 'Otro'];
export const METODOS_PAGO = ['Efectivo', 'Tarjeta de débito', 'Tarjeta de crédito', 'Transferencia', 'Aseguradora', 'Otro'];
export const ROLES = [{ v: 'admin', t: 'Administrador' }, { v: 'doctor', t: 'Doctor' }, { v: 'recepcion', t: 'Recepción' }];

// Odontograma (numeración FDI)
export const DIENTES_ADULTO = {
  sup: [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28],
  inf: [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]
};
export const DIENTES_INFANTIL = {
  sup: [55, 54, 53, 52, 51, 61, 62, 63, 64, 65],
  inf: [85, 84, 83, 82, 81, 71, 72, 73, 74, 75]
};
// Condiciones por cara
export const CONDICIONES_CARA = [
  { v: 'caries', t: 'Caries', color: '#e5484d' },
  { v: 'obturacion', t: 'Obturación', color: '#3e63dd' },
  { v: 'sellante', t: 'Sellante', color: '#30a46c' },
  { v: 'fractura', t: 'Fractura', color: '#f76b15' },
  { v: 'sano', t: 'Sano (borrar)', color: '#ffffff' }
];
// Condiciones del diente completo
export const CONDICIONES_DIENTE = [
  { v: 'ausente', t: 'Ausente', simbolo: '✕', color: '#6f6e77' },
  { v: 'extraccion', t: 'Extracción indicada', simbolo: '✕', color: '#e5484d' },
  { v: 'endodoncia', t: 'Endodoncia', simbolo: '▲', color: '#8e4ec6' },
  { v: 'corona', t: 'Corona', simbolo: '◯', color: '#3e63dd' },
  { v: 'implante', t: 'Implante', simbolo: '⊥', color: '#12a594' },
  { v: 'puente', t: 'Puente', simbolo: '═', color: '#3e63dd' },
  { v: 'normal', t: 'Normal (borrar)', simbolo: '', color: '' }
];

export const etiqueta = (lista, v) => lista.find(x => x.v === v)?.t || v || '—';
export const colorDe = (lista, v) => lista.find(x => x.v === v)?.color || 'gris';
