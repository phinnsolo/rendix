import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

// Datos de demostración. ATENCIÓN: vacía las tablas antes de cargar los datos.

const prisma = new PrismaClient();

type ConsignaSeed = Omit<Prisma.ConsignaCreateManyInput, "examenId" | "orden" | "temaId">;

/** Crea un examen POR_TEMAS: cada tema con sus propias consignas (orden correlativo en el examen). */
async function crearTemas(examenId: string, temas: { nombre: string; titulo: string; descripcion: string; consignas: ConsignaSeed[] }[]) {
  let orden = 1;
  for (const [i, t] of temas.entries()) {
    const tema = await prisma.tema.create({
      data: { examenId, nombre: t.nombre, titulo: t.titulo, descripcion: t.descripcion, orden: i + 1 },
    });
    await prisma.consigna.createMany({ data: t.consignas.map((c) => ({ ...c, examenId, temaId: tema.id, orden: orden++ })) });
  }
}

async function main() {
  // El seed borra todo: nunca correrlo contra producción (Vercel define VERCEL_ENV).
  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
    throw new Error("Seed bloqueado en producción: vacía todas las tablas.");
  }

  await prisma.respuesta.deleteMany();
  await prisma.entrega.deleteMany();
  await prisma.asignacionExamen.deleteMany();
  await prisma.consigna.deleteMany();
  await prisma.tema.deleteMany();
  await prisma.examen.deleteMany();
  await prisma.inscripcionClase.deleteMany();
  await prisma.clase.deleteMany();
  await prisma.usuario.deleteMany();

  const [hashProfesor, hashAlumno] = await Promise.all([
    bcrypt.hash("Profesor123!", 10),
    bcrypt.hash("Alumno123!", 10),
  ]);

  const profesor = await prisma.usuario.create({
    data: { nombre: "Laura Fernández", email: "profesor@test.com", passwordHash: hashProfesor, rol: "PROFESOR" },
  });
  // Segundo profesor: sirve para comprobar que no ve ni administra las clases de Laura.
  await prisma.usuario.create({
    data: { nombre: "Carlos Ruiz", email: "profesor2@test.com", passwordHash: hashProfesor, rol: "PROFESOR" },
  });

  const alumnosData = [
    { nombre: "Juan Pérez", email: "alumno1@test.com" },
    { nombre: "María López", email: "alumno2@test.com" },
    { nombre: "Pedro García", email: "alumno3@test.com" },
    { nombre: "Ana Torres", email: "alumno4@test.com" },
    { nombre: "Lucas Díaz", email: "alumno5@test.com" },
    { nombre: "Sofía Romero", email: "alumno6@test.com" },
  ];
  const [juan, maria, pedro, ana, lucas] = await Promise.all(
    alumnosData.map((a) => prisma.usuario.create({ data: { ...a, passwordHash: hashAlumno, rol: "ALUMNO" } })),
  );

  // ---------------- Clases (Sofía queda sin clase a propósito) ----------------
  const mate = await prisma.clase.create({
    data: {
      nombre: "Matemática 1A",
      descripcion: "Comisión lunes y miércoles",
      profesorId: profesor.id,
      inscripciones: { create: [juan, maria, ana].map((a) => ({ alumnoId: a.id })) },
    },
  });
  const progra = await prisma.clase.create({
    data: {
      nombre: "Programación 2",
      descripcion: "Comisión martes y jueves",
      profesorId: profesor.id,
      inscripciones: { create: [pedro, lucas].map((a) => ({ alumnoId: a.id })) },
    },
  });

  // ---------------- Exámenes normales ----------------
  await prisma.examen.create({
    data: {
      titulo: "Funciones lineales (borrador)",
      enunciado: "Resolvé las siguientes consignas sobre funciones lineales. Justificá cada respuesta.",
      estado: "BORRADOR",
      profesorId: profesor.id,
      claseId: mate.id,
      habilitarEscritura: true,
      habilitarCalculadora: true,
      habilitarGeoGebra: false,
      consignas: {
        create: [
          { orden: 1, puntaje: 5, texto: "Hallá la pendiente de la recta que pasa por (1, 2) y (3, 8)." },
          { orden: 2, puntaje: 5, texto: "Escribí la ecuación de la recta del punto anterior." },
        ],
      },
    },
  });

  await prisma.examen.create({
    data: {
      titulo: "Parcial 1 - Análisis Matemático",
      enunciado:
        "Leé atentamente cada consigna. Podés usar la calculadora y GeoGebra. " +
        "Una vez enviado el examen no vas a poder modificarlo.",
      estado: "PUBLICADO",
      fechaPublicacion: new Date(),
      profesorId: profesor.id,
      claseId: mate.id,
      duracionMinutos: 90,
      habilitarEscritura: true,
      habilitarCalculadora: true,
      habilitarGeoGebra: true,
      consignas: {
        create: [
          { orden: 1, puntaje: 3, texto: "Calculá el valor de f(x) = 3x² - 2x + 1 para x = 4." },
          { orden: 2, puntaje: 3, texto: "Graficá en GeoGebra f(x) = x² - 4 e indicá sus raíces." },
          { orden: 3, puntaje: 4, texto: "Explicá con tus palabras qué representa la derivada de una función." },
        ],
      },
    },
  });

  await prisma.examen.create({
    data: {
      titulo: "TP 2 - Árboles de decisión",
      enunciado:
        "Respondé las preguntas de opción múltiple y verdadero/falso, y construí el árbol de decisión pedido " +
        "usando la pizarra (círculos, rectángulos, texto y líneas).",
      estado: "PUBLICADO",
      fechaPublicacion: new Date(),
      profesorId: profesor.id,
      claseId: progra.id,
      habilitarEscritura: true,
      habilitarCalculadora: false,
      habilitarGeoGebra: false,
      consignas: {
        create: [
          {
            orden: 1,
            puntaje: 2,
            tipo: "VERDADERO_FALSO",
            texto: "En un árbol de decisión, las hojas representan decisiones o resultados finales.",
            opciones: ["Verdadero", "Falso"],
            respuestaCorrecta: 0,
          },
          {
            orden: 2,
            puntaje: 2,
            tipo: "OPCION_MULTIPLE",
            texto: "¿Qué representa un nodo interno de un árbol de decisión?",
            opciones: ["Un resultado final", "Una condición o pregunta", "Un dato de entrada sin procesar"],
            respuestaCorrecta: 1,
          },
          {
            orden: 3,
            puntaje: 4,
            tipo: "DIAGRAMA",
            texto:
              "Construí un árbol de decisión que determine si una persona es mayor o menor de edad: " +
              "comenzá en \"Inicio\", preguntá \"¿Edad >= 18?\" y llegá a los resultados \"Mayor de edad\" / \"Menor de edad\". " +
              "Etiquetá las ramas con Sí / No.",
            criterio:
              "Nodo inicial → condición (¿Edad >= 18?) → dos hojas. Las ramas deben estar etiquetadas Sí → Mayor de edad, No → Menor de edad.",
          },
          {
            orden: 4,
            puntaje: 2,
            tipo: "DESARROLLO",
            texto: "Explicá con tus palabras una ventaja de los árboles de decisión.",
            criterio: "Mencionar interpretabilidad / facilidad de lectura, o que no requieren normalizar datos.",
          },
        ],
      },
    },
  });

  // ---------------- Examen por temas ----------------
  const tpFinal = await prisma.examen.create({
    data: {
      titulo: "Trabajo Práctico Final",
      enunciado:
        "Elegí UNO de los temas y respondé únicamente sus preguntas. " +
        "Una vez que comiences a responder no vas a poder cambiar de tema.",
      estado: "PUBLICADO",
      modo: "POR_TEMAS",
      fechaPublicacion: new Date(),
      profesorId: profesor.id,
      claseId: progra.id,
      habilitarEscritura: true,
      habilitarCalculadora: false,
      habilitarGeoGebra: false,
    },
  });
  await crearTemas(tpFinal.id, [
    {
      nombre: "Tema 1",
      titulo: "Inteligencia Artificial",
      descripcion: "Analizar aplicaciones de IA dentro de organizaciones.",
      consignas: [
        { puntaje: 4, texto: "Describí un caso real de uso de IA en una organización y qué problema resuelve." },
        { puntaje: 3, texto: "¿Qué riesgos éticos identificás en ese caso?" },
        {
          puntaje: 3,
          tipo: "OPCION_MULTIPLE",
          texto: "¿Cuál de estos es un ejemplo de aprendizaje supervisado?",
          opciones: ["Agrupar clientes sin etiquetas", "Clasificar correos como spam a partir de ejemplos etiquetados", "Reducir dimensiones con PCA"],
          respuestaCorrecta: 1,
        },
      ],
    },
    {
      nombre: "Tema 2",
      titulo: "Blockchain",
      descripcion: "Analizar aplicaciones de blockchain más allá de las criptomonedas.",
      consignas: [
        { puntaje: 5, texto: "Explicá qué problema de confianza resuelve una blockchain." },
        {
          puntaje: 2,
          tipo: "VERDADERO_FALSO",
          texto: "En una blockchain pública, cualquier participante puede modificar un bloque ya confirmado.",
          opciones: ["Verdadero", "Falso"],
          respuestaCorrecta: 1,
        },
        { puntaje: 3, texto: "Proponé un caso de uso en logística y justificá si conviene una blockchain." },
      ],
    },
    {
      nombre: "Tema 3",
      titulo: "Cloud Computing",
      descripcion: "Comparar modelos de servicio y despliegue en la nube.",
      consignas: [
        { puntaje: 5, texto: "Compará IaaS, PaaS y SaaS con un ejemplo de cada uno." },
        { puntaje: 5, texto: "¿Qué factores considerarías para migrar un sistema a la nube?" },
      ],
    },
    {
      nombre: "Tema 4",
      titulo: "Ciberseguridad",
      descripcion: "Identificar amenazas comunes y medidas de mitigación.",
      consignas: [
        { puntaje: 4, texto: "Describí un ataque de phishing y cómo prevenirlo." },
        { puntaje: 3, texto: "¿Qué es la autenticación multifactor y por qué reduce riesgos?" },
        {
          puntaje: 3,
          tipo: "VERDADERO_FALSO",
          texto: "Un firewall reemplaza la necesidad de mantener el software actualizado.",
          opciones: ["Verdadero", "Falso"],
          respuestaCorrecta: 1,
        },
      ],
    },
  ]);

  console.log("Seed completado:");
  console.log("  Profesores: profesor@test.com, profesor2@test.com / Profesor123!");
  console.log("  Alumnos:    alumno1..alumno6@test.com / Alumno123!");
  console.log(`  Clases:     ${mate.nombre} (Juan, María, Ana) · ${progra.nombre} (Pedro, Lucas) · Sofía sin clase`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
