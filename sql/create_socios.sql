-- Script: tabla Socios (SQLite)
-- Proyecto: gym-backend (datasource sqlite -> prisma/dev.db)

CREATE TABLE IF NOT EXISTS "Socios" (
    "id"              INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre"          TEXT    NOT NULL,
    "telefono"        TEXT    NOT NULL UNIQUE,
    "tipo_pase"       TEXT    NOT NULL CHECK ("tipo_pase" IN ('VISITA', 'SEMANAL', 'MENSUAL', 'ANUAL')),
    "fecha_vencimiento" DATETIME NOT NULL
);

-- Índice para buscar socios por fecha de vencimiento (vencimientos del día, alertas)
CREATE INDEX IF NOT EXISTS "Socios_fecha_vencimiento_idx" ON "Socios" ("fecha_vencimiento");
