-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('PROFESOR', 'ALUMNO');

-- CreateEnum
CREATE TYPE "EstadoExamen" AS ENUM ('BORRADOR', 'PUBLICADO');

-- CreateEnum
CREATE TYPE "EstadoEntrega" AS ENUM ('ENTREGADO');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "rol" "Rol" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Examen" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "enunciado" TEXT NOT NULL,
    "estado" "EstadoExamen" NOT NULL DEFAULT 'BORRADOR',
    "profesorId" TEXT NOT NULL,
    "habilitarEscritura" BOOLEAN NOT NULL DEFAULT true,
    "habilitarCalculadora" BOOLEAN NOT NULL DEFAULT false,
    "habilitarGeoGebra" BOOLEAN NOT NULL DEFAULT false,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaPublicacion" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Examen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consigna" (
    "id" TEXT NOT NULL,
    "examenId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "puntaje" DOUBLE PRECISION NOT NULL,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "Consigna_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AsignacionExamen" (
    "id" TEXT NOT NULL,
    "examenId" TEXT NOT NULL,
    "alumnoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AsignacionExamen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entrega" (
    "id" TEXT NOT NULL,
    "examenId" TEXT NOT NULL,
    "alumnoId" TEXT NOT NULL,
    "fechaEntrega" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado" "EstadoEntrega" NOT NULL DEFAULT 'ENTREGADO',
    "geogebraState" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entrega_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Respuesta" (
    "id" TEXT NOT NULL,
    "entregaId" TEXT NOT NULL,
    "consignaId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,

    CONSTRAINT "Respuesta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE INDEX "Usuario_rol_idx" ON "Usuario"("rol");

-- CreateIndex
CREATE INDEX "Examen_profesorId_idx" ON "Examen"("profesorId");

-- CreateIndex
CREATE INDEX "Examen_estado_idx" ON "Examen"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "Consigna_examenId_orden_key" ON "Consigna"("examenId", "orden");

-- CreateIndex
CREATE INDEX "AsignacionExamen_alumnoId_idx" ON "AsignacionExamen"("alumnoId");

-- CreateIndex
CREATE UNIQUE INDEX "AsignacionExamen_examenId_alumnoId_key" ON "AsignacionExamen"("examenId", "alumnoId");

-- CreateIndex
CREATE INDEX "Entrega_alumnoId_idx" ON "Entrega"("alumnoId");

-- CreateIndex
CREATE UNIQUE INDEX "Entrega_examenId_alumnoId_key" ON "Entrega"("examenId", "alumnoId");

-- CreateIndex
CREATE INDEX "Respuesta_consignaId_idx" ON "Respuesta"("consignaId");

-- CreateIndex
CREATE UNIQUE INDEX "Respuesta_entregaId_consignaId_key" ON "Respuesta"("entregaId", "consignaId");

-- AddForeignKey
ALTER TABLE "Examen" ADD CONSTRAINT "Examen_profesorId_fkey" FOREIGN KEY ("profesorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consigna" ADD CONSTRAINT "Consigna_examenId_fkey" FOREIGN KEY ("examenId") REFERENCES "Examen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsignacionExamen" ADD CONSTRAINT "AsignacionExamen_examenId_fkey" FOREIGN KEY ("examenId") REFERENCES "Examen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsignacionExamen" ADD CONSTRAINT "AsignacionExamen_alumnoId_fkey" FOREIGN KEY ("alumnoId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entrega" ADD CONSTRAINT "Entrega_examenId_fkey" FOREIGN KEY ("examenId") REFERENCES "Examen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entrega" ADD CONSTRAINT "Entrega_alumnoId_fkey" FOREIGN KEY ("alumnoId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Respuesta" ADD CONSTRAINT "Respuesta_entregaId_fkey" FOREIGN KEY ("entregaId") REFERENCES "Entrega"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Respuesta" ADD CONSTRAINT "Respuesta_consignaId_fkey" FOREIGN KEY ("consignaId") REFERENCES "Consigna"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reglas de negocio garantizadas también a nivel de base de datos
-- (Prisma no soporta CHECK constraints de forma declarativa).
ALTER TABLE "Consigna" ADD CONSTRAINT "Consigna_puntaje_rango_check" CHECK ("puntaje" >= 0 AND "puntaje" <= 10);
ALTER TABLE "Consigna" ADD CONSTRAINT "Consigna_orden_positivo_check" CHECK ("orden" >= 1);
