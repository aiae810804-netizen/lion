import XLSX from 'xlsx';
import { Router } from 'express';
import cron from 'node-cron';
import db from './db.js';
const router = Router();

// --- CREAR TABLA SI NO EXISTE AL INICIAR ---
(async () => {
    try {
        await db.query(`
            IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ProductionPlan')
            BEGIN
                CREATE TABLE ProductionPlan (
                    Id INT IDENTITY(1,1) PRIMARY KEY,
                    MATERIAL NVARCHAR(100),
                    Qty INT,
                    Semana NVARCHAR(20),
                    Fecha DATE,
                    Orden NVARCHAR(100),
                    Producido NVARCHAR(100),
                    Status NVARCHAR(100),
                    LastUpdate DATETIME DEFAULT GETDATE()
                )
            END
        `);
        console.log('Tabla ProductionPlan verificada/creada');
    } catch (e) {
        console.error('Error verificando/creando tabla ProductionPlan:', e);
    }
})();

// --- FUNCION DE SINCRONIZACION ---
async function syncProductionPlanFromExcel() {
    try {
        const ruta = 'C:/Users/H583623/Honeywell/MX31 SIOP - General/MX31 SIOP Q1 2026.xlsx';
        const workbook = XLSX.readFile(ruta, { cellDates: true });
        const hoja = workbook.Sheets['DATABASE'];
        const filas = XLSX.utils.sheet_to_json(hoja, { header: 1 });

        const COL_MATERIAL = 0;
        const COL_FAMILY = 1;
        const COL_DATE = 3;
        const COL_WEEK = 4;
        const COL_QTY = 5;
        const COL_PROD = 6;
        const COL_STATUS = 7;
        const COL_PLAN_ORDER = 8;

        const valorABuscar = 'LI-ON'; // Solo sincroniza LI-ON, puedes ajustar

        const nuevosDatos = filas.slice(1)
            .filter(fila => fila[COL_FAMILY] === valorABuscar)
            .map(fila => {
                let valorFecha = fila[COL_DATE];
                let fechaFormateada = null;
                if (valorFecha instanceof Date) {
                    fechaFormateada = valorFecha;
                } else if (typeof valorFecha === 'number') {
                    fechaFormateada = new Date((valorFecha - 25569) * 86400 * 1000);
                }
                return {
                    MATERIAL: fila[COL_MATERIAL] || "Sin Material",
                    Qty: fila[COL_QTY] || 0,
                    Semana: fila[COL_WEEK],
                    Fecha: fechaFormateada,
                    Orden: fila[COL_PLAN_ORDER] || "Sin Orden",
                    Producido: fila[COL_PROD] || " ",
                    Status: fila[COL_STATUS] || "Sin Status",
                };
            });

        for (const row of nuevosDatos) {
            // Busca si ya existe (por MATERIAL, Qty, Semana, Fecha)
            const result = await db.query(
                `SELECT TOP 1 * FROM ProductionPlan WHERE MATERIAL = @MATERIAL AND Qty = @Qty AND Semana = @Semana AND Fecha = @Fecha`,
                {
                    MATERIAL: row.MATERIAL,
                    Qty: row.Qty,
                    Semana: row.Semana,
                    Fecha: row.Fecha
                }
            );
            if (result.recordset && result.recordset.length > 0) {
                // Si cambia Orden, Producido o Status, actualiza
                const existing = result.recordset[0];
                if (existing.Orden !== row.Orden || existing.Producido !== row.Producido || existing.Status !== row.Status) {
                    await db.query(
                        `UPDATE ProductionPlan SET Orden = @Orden, Producido = @Producido, Status = @Status, LastUpdate = GETDATE() WHERE Id = @Id`,
                        {
                            Orden: row.Orden,
                            Producido: row.Producido,
                            Status: row.Status,
                            Id: existing.Id
                        }
                    );
                }
            } else {
                // Inserta nuevo
                await db.query(
                    `INSERT INTO ProductionPlan (MATERIAL, Qty, Semana, Fecha, Orden, Producido, Status) VALUES (@MATERIAL, @Qty, @Semana, @Fecha, @Orden, @Producido, @Status)`,
                    row
                );
            }
        }
        // Opcional: podrías eliminar registros que ya no existen en el Excel
    } catch (e) {
        console.error('Error sincronizando ProductionPlan:', e);
    }
}

// --- CRON JOB: cada hora ---
cron.schedule('0 * * * *', () => {
    syncProductionPlanFromExcel();
});

// --- ENDPOINT: lee de la base de datos ---
router.get('/', async (req, res) => {
    try {
        const { family = 'LI-ON' } = req.query;
        // Solo muestra los registros de la familia seleccionada (si tienes ese campo en la tabla)
        // Si no, ignora el filtro family
        const result = await db.query(
            `SELECT MATERIAL, Qty, Semana, CONVERT(varchar, Fecha, 23) as Fecha, Orden, Producido, Status FROM ProductionPlan`,
            {}
        );
        res.json({ success: true, data: result.recordset });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- ENDPOINT: refrescar manualmente desde el frontend ---
router.post('/refresh', async (req, res) => {
    try {
        await syncProductionPlanFromExcel();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
