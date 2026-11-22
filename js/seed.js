// Datos de ejemplo para el modo demo. En Supabase solo se carga la configuración inicial.
import { db } from './db.js';

const PROCS = [
    ['CON', 'Consulta y valoración', 400, 30, 'General'], ['LIM', 'Limpieza dental (profilaxis)', 800, 45, 'Preventiva'],
    ['RES', 'Resina (por cara)', 900, 45, 'Restaurativa'], ['EXT', 'Extracción simple', 1000, 30, 'Cirugía'],
    ['TER', 'Extracción de tercer molar', 3500, 60, 'Cirugía'], ['END', 'Endodoncia (molar)', 4500, 90, 'Endodoncia'],
    ['COR', 'Corona de zirconia', 6500, 60, 'Prótesis'], ['IMP', 'Implante dental', 18000, 90, 'Implantología'],
    ['BLA', 'Blanqueamiento', 3500, 60, 'Estética'], ['ORT', 'Brackets metálicos (tratamiento)', 25000, 60, 'Ortodoncia'],
    ['AJU', 'Ajuste de ortodoncia', 700, 30, 'Ortodoncia'], ['RX', 'Radiografía periapical', 250, 15, 'Diagnóstico']
  ];

export async function sembrarDemo({ ejemplos = true } = {}) {
  const s = { sinTriggers: true };
  await db.setConfig('clinica', {
    nombre: 'Clínica Dental Sonrisa', telefono: '55 1234 5678', direccion: 'Ciudad de México',
    hora_apertura: 9, hora_cierre: 20, duracion_cita: 30,
    plantilla_recordatorio: 'Hola {paciente} 👋, te recordamos tu cita en {clinica} el {fecha} a las {hora} con {doctor}. Responde SÍ para confirmar.'
  });
  if (!ejemplos) {
    for (const [clave, nombre, precio, duracion_min, categoria] of PROCS) await db.create('procedimientos', { clave, nombre, precio, duracion_min, categoria }, s);
    await db.create('sillones', { nombre: 'Sillón 1', activo: true }, s);
    return;
  }

  const d1 = await db.create('doctores', { nombre: 'Dra. Mariana López', especialidad: 'Odontología general', color: '#3e63dd', telefono: '5511111111', activo: true }, s);
  const d2 = await db.create('doctores', { nombre: 'Dr. Carlos Ruiz', especialidad: 'Ortodoncia', color: '#30a46c', telefono: '5522222222', activo: true }, s);
  const d3 = await db.create('doctores', { nombre: 'Dra. Sofía Hernández', especialidad: 'Endodoncia', color: '#8e4ec6', telefono: '5533333333', activo: true }, s);
  const s1 = await db.create('sillones', { nombre: 'Sillón 1', activo: true }, s);
  const s2 = await db.create('sillones', { nombre: 'Sillón 2', activo: true }, s);
  await db.create('sillones', { nombre: 'Sillón 3', activo: true }, s);

  await db.create('usuarios', { nombre: 'Administrador', rol: 'admin', pin: '1234', email: '' }, s);
  await db.create('usuarios', { nombre: 'Recepción', rol: 'recepcion', pin: '0000', email: '' }, s);
  await db.create('usuarios', { nombre: d1.nombre, rol: 'doctor', pin: '1111', doctor_id: d1.id, email: '' }, s);

  const P = {};
  for (const [clave, nombre, precio, duracion_min, categoria] of PROCS) P[clave] = await db.create('procedimientos', { clave, nombre, precio, duracion_min, categoria }, s);

  const pac = [
    ['Ana', 'García Pérez', '1990-04-12', 'F', '5544443333', 'Facebook'],
    ['Luis', 'Martínez Soto', '1985-09-30', 'M', '5555552222', 'Recomendación'],
    ['Valeria', 'Torres Ramírez', '2012-01-20', 'F', '5566661111', 'Google'],
    ['Jorge', 'Mendoza Cruz', '1972-06-05', 'M', '5577770000', 'Instagram']
  ];
  const pacientes = [];
  for (const [nombre, apellidos, fecha_nac, sexo, telefono, origen] of pac) {
    pacientes.push(await db.create('pacientes', { nombre, apellidos, fecha_nac, sexo, telefono, email: '', origen, alergias: nombre === 'Luis' ? 'Penicilina' : '', antecedentes: '' }, s));
  }
  pacientes[2].tutor = 'Laura Ramírez (mamá)'; await db.update('pacientes', pacientes[2].id, { tutor: 'Laura Ramírez (mamá)' }, s);

  const hoy = new Date(); const at = (dias, h, m = 0) => { const d = new Date(hoy); d.setDate(d.getDate() + dias); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const mas = (iso, min) => new Date(new Date(iso).getTime() + min * 60000).toISOString();
  const citas = [
    [pacientes[0], d1, s1, 0, 10, 0, 45, 'Limpieza', 'confirmada'],
    [pacientes[1], d3, s2, 0, 11, 0, 90, 'Endodoncia pieza 36', 'programada'],
    [pacientes[2], d2, s1, 0, 16, 30, 30, 'Ajuste de brackets', 'programada'],
    [pacientes[3], d1, s2, 1, 12, 0, 30, 'Valoración implante', 'programada'],
    [pacientes[0], d1, s1, -7, 10, 0, 30, 'Consulta', 'completada'],
    [pacientes[3], d1, s1, -3, 13, 0, 30, 'Consulta', 'no_asistio']
  ];
  for (const [p, d, si, dias, h, m, dur, motivo, estado] of citas) {
    const inicio = at(dias, h, m);
    await db.create('citas', { paciente_id: p.id, doctor_id: d.id, sillon_id: si.id, inicio, fin: mas(inicio, dur), motivo, estado, notas: '' }, s);
  }

  await db.create('prospectos', { nombre: 'Fernanda Ríos', telefono: '5588889999', email: '', origen: 'Instagram', interes: 'Blanqueamiento', etapa: 'nuevo', doctor_id: d1.id, notas: 'Preguntó precio por DM' }, s);
  await db.create('prospectos', { nombre: 'Ricardo Peña', telefono: '5599990000', email: '', origen: 'Google', interes: 'Implante', etapa: 'contactado', doctor_id: d1.id, notas: '' }, s);
  await db.create('prospectos', { nombre: 'Daniela Ortiz', telefono: '5512121212', email: '', origen: 'Facebook', interes: 'Ortodoncia', etapa: 'cita_agendada', doctor_id: d2.id, notas: 'Viene el sábado' }, s);

  const item = (pr, diente = '', cant = 1) => ({ procedimiento_id: pr.id, descripcion: pr.nombre, diente, cantidad: cant, precio: pr.precio, estado: 'pendiente' });
  const tot = (items, desc = 0) => items.reduce((s, i) => s + i.precio * i.cantidad, 0) - desc;
  const it1 = [item(P.END, '36'), item(P.COR, '36')];
  const t1 = await db.create('tratamientos', { paciente_id: pacientes[1].id, doctor_id: d3.id, titulo: 'Rehabilitación pieza 36', etapa: 'en_tratamiento', items: it1, descuento: 500, total: tot(it1, 500), notas: '' }, s);
  const it2 = [item(P.ORT)];
  await db.create('tratamientos', { paciente_id: pacientes[2].id, doctor_id: d2.id, titulo: 'Ortodoncia', etapa: 'aceptado', items: it2, descuento: 0, total: tot(it2), notas: 'Pago en 12 mensualidades' }, s);
  const it3 = [item(P.IMP, '46'), item(P.RX, '46')];
  await db.create('tratamientos', { paciente_id: pacientes[3].id, doctor_id: d1.id, titulo: 'Implante 46', etapa: 'presupuesto', items: it3, descuento: 0, total: tot(it3), notas: '' }, s);

  const pago = (dias) => { const d = new Date(); d.setDate(d.getDate() + dias); return isoDiaLocal(d); };
  await db.create('pagos', { paciente_id: pacientes[1].id, tratamiento_id: t1.id, monto: 4500, metodo: 'Tarjeta de crédito', fecha: pago(-10), referencia: '', notas: 'Anticipo' }, s);
  await db.create('pagos', { paciente_id: pacientes[0].id, tratamiento_id: null, monto: 800, metodo: 'Efectivo', fecha: pago(-7), referencia: '', notas: 'Limpieza' }, s);
  await db.create('pagos', { paciente_id: pacientes[2].id, tratamiento_id: null, monto: 2100, metodo: 'Transferencia', fecha: pago(-40), referencia: '', notas: 'Mensualidad' }, s);

  await db.create('odontogramas', { paciente_id: pacientes[1].id, tipo: 'adulto', dientes: { '36': { estado: 'endodoncia', caras: { O: 'caries' } }, '18': { estado: 'ausente', caras: {} }, '24': { caras: { O: 'obturacion', M: 'obturacion' } } } }, s);
  await db.create('notas_clinicas', { paciente_id: pacientes[1].id, doctor_id: d3.id, fecha: pago(-10), motivo: 'Dolor en molar inferior izquierdo', subjetivo: 'Dolor espontáneo nocturno de 5 días', objetivo: 'Caries profunda en 36, percusión positiva', diagnostico: 'Pulpitis irreversible 36', plan: 'Endodoncia y corona', ta: '120/80', fc: '72' }, s);
}

function isoDiaLocal(d) { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); }
