-- CreateEnum
CREATE TYPE "TipoConsigna" AS ENUM ('DESARROLLO', 'OPCION_MULTIPLE', 'VERDADERO_FALSO', 'DIAGRAMA');

-- CreateEnum
CREATE TYPE "FuenteSugerencia" AS ENUM ('AUTOMATICA', 'IA');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EstadoEntrega" ADD VALUE 'EN_CORRECCION';
ALTER TYPE "EstadoEntrega" ADD VALUE 'CORREGIDO';

-- AlterTable
ALTER TABLE "Consigna" ADD COLUMN     "criterio" TEXT,
ADD COLUMN     "opciones" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "respuestaCorrecta" INTEGER,
ADD COLUMN     "tipo" "TipoConsigna" NOT NULL DEFAULT 'DESARROLLO';

-- AlterTable
ALTER TABLE "Entrega" ADD COLUMN     "fechaCorreccion" TIMESTAMP(3),
ADD COLUMN     "feedbackGeneral" TEXT,
ADD COLUMN     "notaTotal" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Respuesta" ADD COLUMN     "diagrama" JSONB,
ADD COLUMN     "feedback" TEXT,
ADD COLUMN     "fuenteSugerencia" "FuenteSugerencia",
ADD COLUMN     "opcionSeleccionada" INTEGER,
ADD COLUMN     "puntajeObtenido" DOUBLE PRECISION,
ADD COLUMN     "puntajeSugerido" DOUBLE PRECISION,
ADD COLUMN     "sugerenciaDetalle" TEXT;

-- Reglas de negocio a nivel de base de datos.
ALTER TABLE "Consigna" ADD CONSTRAINT "Consigna_respuestaCorrecta_check" CHECK ("respuestaCorrecta" IS NULL OR "respuestaCorrecta" >= 0);
ALTER TABLE "Respuesta" ADD CONSTRAINT "Respuesta_opcionSeleccionada_check" CHECK ("opcionSeleccionada" IS NULL OR "opcionSeleccionada" >= 0);
-- El máximo de una consigna es 10, por lo que ningún puntaje por respuesta puede superarlo.
ALTER TABLE "Respuesta" ADD CONSTRAINT "Respuesta_puntajeObtenido_check" CHECK ("puntajeObtenido" IS NULL OR ("puntajeObtenido" >= 0 AND "puntajeObtenido" <= 10));
ALTER TABLE "Respuesta" ADD CONSTRAINT "Respuesta_puntajeSugerido_check" CHECK ("puntajeSugerido" IS NULL OR ("puntajeSugerido" >= 0 AND "puntajeSugerido" <= 10));
ALTER TABLE "Entrega" ADD CONSTRAINT "Entrega_notaTotal_check" CHECK ("notaTotal" IS NULL OR "notaTotal" >= 0);
