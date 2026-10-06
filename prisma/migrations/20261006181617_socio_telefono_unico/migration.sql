-- CreateIndex
-- Regla de unicidad de contactos: impide registrar teléfonos duplicados por accidente.
-- (Los campos de contacto nombre y telefono ya eran NOT NULL desde la migración init.)
CREATE UNIQUE INDEX "Socio_telefono_key" ON "Socio"("telefono");
