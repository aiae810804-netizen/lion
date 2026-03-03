import 'dotenv/config'; // Carga variables del archivo .env
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { sql, sqlConfig, masterConfig, SCHEMA_SCRIPTS, SEED_QUERIES } from './db.js';
import * as excelDataRouter from './excelDataRouter.js';

const app = express();
// Puerto 3000 por defecto si no hay variable de entorno
const PORT = process.env.PORT || 3000;

// Configuración de rutas para archivos estáticos/temporales (simulación de carpetas de impresión)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMP_PRINT_DIR = path.join(__dirname, 'temp_print_jobs');
const DIST_DIR = path.join(__dirname, '../dist'); // Ruta al build de React

// Asegurar que el directorio temporal existe
if (!fs.existsSync(TEMP_PRINT_DIR)){
    fs.mkdirSync(TEMP_PRINT_DIR);
}

// CONFIGURACIÓN BASE (El EXE suele ser fijo por servidor, pero los formatos son dinámicos)
const SYSTEM_PRINT_CONFIG = {
    // Ruta del ejecutable de EasyLabel (Fijo del sistema)
    EXE_PATH: 'C:\\Tharo\\EASYLABEL\\Easy.exe'
};

const SYSTEM_TABLES = [
    'Users', 'Operations', 'ProcessRoutes', 'ProcessRouteSteps', 
    'PartNumbers', 'WorkOrders', 'Serials', 'SerialHistory', 
    'PrintLogs', 'LabelConfigs', 'LabelFields', 'test_logs', 'GoldenSerials'
];

app.use(cors());
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb', extended: true }));
// Servir archivos estáticos del frontend
app.use(express.static(DIST_DIR));

// --- MIDDLEWARE DE BASE DE DATOS ROBUSTO ---
const dbMiddleware = async (req, res, next) => {
    try {
        if (sql.globalConnection && !sql.globalConnection.connected) {
            console.log("[DB] Connection detected as closed. Resetting...");
            sql.globalConnection = null;
        }

        if (!sql.globalConnection) {
            console.log("[DB] Establishing new global connection...");
            sql.globalConnection = await sql.connect(sqlConfig);
        }
        
        req.db = sql.globalConnection;
        next();
    } catch (err) {
        console.error("[DB ERROR] Connection failed:", err);
        sql.globalConnection = null;
        res.status(500).send('Database connection error: ' + err.message);
    }
};


// --- RUTAS DE SISTEMA ---

app.get('/api/health', async (req, res) => {
    try {
        if (!sql.globalConnection || !sql.globalConnection.connected) {
             sql.globalConnection = await sql.connect(sqlConfig);
        }
        await sql.globalConnection.request().query('SELECT 1');
        res.json({ status: 'ok', message: 'Connected to SQL Server Instance' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.post('/api/setup', async (req, res) => {
    const logs = [];
    try {
        const masterPool = new sql.ConnectionPool(masterConfig);
        await masterPool.connect();
        
        const dbName = sqlConfig.database;
        const dbCheck = await masterPool.request().query(`SELECT * FROM sys.databases WHERE name = '${dbName}'`);
        
        if (dbCheck.recordset.length === 0) {
            logs.push(`Database '${dbName}' not found. Creating...`);
            await masterPool.request().query(`CREATE DATABASE ${dbName}`);
            logs.push("Database created successfully.");
        }
        
        await masterPool.close();

        const setupPool = new sql.ConnectionPool(sqlConfig);
        await setupPool.connect();
        
        for (const script of SCHEMA_SCRIPTS) {
            await setupPool.request().query(script);
        }

        // MIGRATIONS
        const migrations = [
            { table: 'Users', col: 'Password', type: 'NVARCHAR(100) NULL' },
            { table: 'Operations', col: 'ActiveOperatorId', type: 'NVARCHAR(50) NULL' },
            { table: 'Operations', col: 'RequireTestLog', type: 'BIT DEFAULT 0' },
            { table: 'LabelConfigs', col: 'LabelType', type: "NVARCHAR(20) DEFAULT 'CARTON1'" },
            { table: 'WorkOrders', col: 'SAPOrderNumber', type: "NVARCHAR(50) NULL" },
            { table: 'PartNumbers', col: 'SerialGenType', type: "NVARCHAR(20) DEFAULT 'PCB_SERIAL'" },
            { table: 'PartNumbers', col: 'ProcessRouteId', type: "NVARCHAR(50) NULL" },
            { table: 'Serials', col: 'TrayId', type: "NVARCHAR(50) NULL" },
            // NUEVAS COLUMNAS PARA TEST LOG
            { table: 'Serials', col: 'TestFechaRegistro', type: 'DATETIME NULL' },
            { table: 'Serials', col: 'TestSensorFW', type: 'NVARCHAR(50) NULL' }
        ];

        for (const m of migrations) {
             try {
                const check = await setupPool.request().query(`SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${m.table}' AND COLUMN_NAME = '${m.col}'`);
                if (check.recordset.length === 0) {
                    logs.push(`Migrating: Adding ${m.col} to ${m.table}...`);
                    await setupPool.request().query(`ALTER TABLE ${m.table} ADD ${m.col} ${m.type}`);
                    // If ProcessRouteId, add FK
                    if (m.col === 'ProcessRouteId') {
                         await setupPool.request().query(`ALTER TABLE PartNumbers ADD CONSTRAINT FK_PartNumbers_ProcessRoutes FOREIGN KEY (ProcessRouteId) REFERENCES ProcessRoutes(Id)`);
                    }
                }
             } catch (e) { logs.push(`Migration Warn (${m.col}): ${e.message}`); }
        }

        // MIGRATION for PrintLogs table
        try {
            logs.push("Migrating PrintLogs table...");
            // 1. Drop FK constraint on PrintLogs.SerialNumber if it exists
            const fkCheck = await setupPool.request().query(`
                SELECT name FROM sys.foreign_keys 
                WHERE parent_object_id = OBJECT_ID('dbo.PrintLogs') 
                AND referenced_object_id = OBJECT_ID('dbo.Serials')
            `);
            if (fkCheck.recordset.length > 0) {
                const fkName = fkCheck.recordset[0].name;
                logs.push(`Dropping constraint ${fkName} from PrintLogs.`);
                await setupPool.request().query(`ALTER TABLE PrintLogs DROP CONSTRAINT ${fkName}`);
            }

            // 2. Rename SerialNumber to PrintIdentifier if it exists
            const colCheck = await setupPool.request().query(`
                SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = 'PrintLogs' AND COLUMN_NAME = 'SerialNumber'
            `);
            if (colCheck.recordset.length > 0) {
                logs.push("Renaming PrintLogs.SerialNumber to PrintIdentifier.");
                await setupPool.request().query(`EXEC sp_rename 'dbo.PrintLogs.SerialNumber', 'PrintIdentifier', 'COLUMN'`);
            }

            // 3. Add new columns
            const printLogMigrations = [
                { table: 'PrintLogs', col: 'FileName', type: 'NVARCHAR(255) NULL' },
                { table: 'PrintLogs', col: 'JobId', type: 'NVARCHAR(255) NULL' },
                { table: 'PrintLogs', col: 'JobContent', type: 'NVARCHAR(MAX) NULL' }
            ];
            for (const m of printLogMigrations) {
                const check = await setupPool.request().query(`SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${m.table}' AND COLUMN_NAME = '${m.col}'`);
                if (check.recordset.length === 0) {
                    logs.push(`Adding column ${m.col} to ${m.table}.`);
                    await setupPool.request().query(`ALTER TABLE ${m.table} ADD ${m.col} ${m.type}`);
                }
            }
            logs.push("PrintLogs migration finished.");
        } catch (e) {
            logs.push(`Migration Error (PrintLogs): ${e.message}`);
        }

        // Remove UNIQUE on LabelConfigs Sku
        try {
            const constraintCheck = await setupPool.request().query(`
                SELECT t.name 
                FROM sys.key_constraints t
                JOIN sys.index_columns ic ON ic.index_id = t.unique_index_id AND ic.object_id = t.parent_object_id
                JOIN sys.columns c ON c.column_id = ic.column_id AND c.object_id = t.parent_object_id
                WHERE t.parent_object_id = OBJECT_ID('LabelConfigs') AND t.type = 'UQ' AND c.name = 'Sku'
            `);

            if (constraintCheck.recordset.length > 0) {
                const constraintName = constraintCheck.recordset[0].name;
                await setupPool.request().query(`ALTER TABLE LabelConfigs DROP CONSTRAINT "${constraintName}"`);
            }
        } catch (e) {}

        // Seed
        for (const query of SEED_QUERIES) {
            await setupPool.request().query(query);
        }

        await setupPool.close();
        if (sql.globalConnection) { sql.globalConnection.close(); sql.globalConnection = null; }
        res.json({ success: true, logs });

    } catch (err) {
        res.status(500).json({ success: false, logs, error: err.message });
    }
});

app.use(dbMiddleware);
app.use('/api/excel-data', excelDataRouter.default || excelDataRouter);


// --- BACKUP & RESTORE ---

// --- BACKUP & RESTORE ---
app.post('/api/admin/import/prepare', dbMiddleware, async (req, res) => {
    const { selectedTables } = req.body;
    if (!selectedTables || !Array.isArray(selectedTables)) return res.status(400).json({ error: 'Seleccione tablas válidas.' });
    
    try {
        console.log("[IMPORT] Preparando tablas para importación por lotes...");
        // 1. Desactivar constraints
        for (const table of SYSTEM_TABLES) {
            await req.db.request().query(`ALTER TABLE ${table} NOCHECK CONSTRAINT ALL`);
        }
        // 2. Limpiar solo las tablas seleccionadas en orden inverso
        const reverseTables = [...SYSTEM_TABLES].reverse().filter(t => selectedTables.includes(t));
        for (const table of reverseTables) {
            await req.db.request().query(`DELETE FROM ${table}`);
            console.log(`[IMPORT] Tabla ${table} vaciada.`);
        }
        res.json({ success: true });
    } catch (e) {
        console.error("[IMPORT PREPARE ERROR]", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/admin/import/chunk', dbMiddleware, async (req, res) => {
    const { table, rows } = req.body;
    if (!table || !rows || !Array.isArray(rows)) return res.status(400).json({ error: 'Datos de lote inválidos.' });

    try {
        const request = req.db.request();
        request.timeout = 60000; // 1 minuto por lote

        // Obtener esquema
        const schemaRes = await request.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${table}'`);
        const dbColumns = schemaRes.recordset.map(r => r.COLUMN_NAME);
        
        const identityRes = await request.query(`SELECT name FROM sys.identity_columns WHERE object_id = OBJECT_ID('${table}')`);
        const identityCol = identityRes.recordset.length > 0 ? identityRes.recordset[0].name : null;

        let identityInsertEnabled = false;
        if (identityCol && rows.length > 0) {
            const hasIdentityInSource = Object.keys(rows[0]).some(k => k.toLowerCase() === identityCol.toLowerCase());
            if (hasIdentityInSource) {
                await request.query(`SET IDENTITY_INSERT ${table} ON`);
                identityInsertEnabled = true;
            }
        }

        for (const row of rows) {
            const rowKeys = Object.keys(row);
            const validKeys = [];
            const values = [];

            for (const dbCol of dbColumns) {
                const sourceKey = rowKeys.find(k => k.toLowerCase() === dbCol.toLowerCase());
                if (sourceKey !== undefined) {
                    validKeys.push(dbCol);
                    const val = row[sourceKey];
                    if (val === null || val === undefined) values.push('NULL');
                    else if (typeof val === 'string') values.push(`'${val.replace(/'/g, "''")}'`);
                    else if (typeof val === 'boolean') values.push(val ? 1 : 0);
                    else if (val instanceof Date) values.push(`'${val.toISOString()}'`);
                    else values.push(val);
                } else if (dbCol.toLowerCase() === 'id' && !identityCol) {
                    validKeys.push(dbCol);
                    values.push(`'${crypto.randomUUID()}'`);
                }
            }

            if (validKeys.length > 0) {
                await request.query(`INSERT INTO ${table} (${validKeys.join(', ')}) VALUES (${values.join(', ')})`);
            }
        }

        if (identityInsertEnabled) await request.query(`SET IDENTITY_INSERT ${table} OFF`);
        res.json({ success: true, count: rows.length });
    } catch (e) {
        console.error(`[IMPORT CHUNK ERROR] Table ${table}:`, e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/admin/import/finalize', dbMiddleware, async (req, res) => {
    try {
        console.log("[IMPORT] Finalizando y validando integridad...");
        for (const table of SYSTEM_TABLES) {
            await req.db.request().query(`ALTER TABLE ${table} WITH CHECK CHECK CONSTRAINT ALL`);
        }
        res.json({ success: true });
    } catch (e) {
        console.error("[IMPORT FINALIZE ERROR]", e);
        res.status(500).json({ error: "Error de integridad: " + e.message });
    }
});





app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await req.db.request().input('Username', sql.NVarChar, username).query('SELECT * FROM Users WHERE Username = @Username');
        const user = result.recordset[0];
        if (!user) return res.status(401).json({ error: "Usuario no encontrado" });

        if (user.Role === 'OPERATOR') {
            return res.json({ success: true, user: { id: user.Id, username: user.Username, role: user.Role, name: user.Name } });
        } else {
            if (user.Password === password) {
                return res.json({ success: true, user: { id: user.Id, username: user.Username, role: user.Role, name: user.Name } });
            } else {
                return res.status(401).json({ error: "Contraseña incorrecta" });
            }
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- ROUTES MANAGEMENT ---
app.get('/api/routes', async (req, res) => {
    try {
        const routesRes = await req.db.request().query('SELECT * FROM ProcessRoutes');
        const routes = routesRes.recordset;

        // Fetch steps for each route
        for (const route of routes) {
            const stepsRes = await req.db.request().input('Id', sql.NVarChar, route.Id).query(`
                SELECT s.*, o.Name as OperationName, o.IsInitial, o.IsFinal
                FROM ProcessRouteSteps s 
                JOIN Operations o ON s.OperationId = o.Id 
                WHERE s.ProcessRouteId = @Id 
                ORDER BY s.StepOrder
            `);
            route.steps = stepsRes.recordset.map(s => ({
                id: s.Id, processRouteId: s.ProcessRouteId, operationId: s.OperationId, stepOrder: s.StepOrder, operationName: s.OperationName
            }));
        }
        res.json(routes.map(r => ({ id: r.Id, name: r.Name, description: r.Description, steps: r.steps })));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/routes', async (req, res) => {
    const { id, name, description, steps } = req.body; // steps: { operationId, stepOrder }[]
    const transaction = new sql.Transaction(req.db);
    try {
        await transaction.begin();
        // Insert Route
        await transaction.request()
            .input('Id', sql.NVarChar, id)
            .input('Name', sql.NVarChar, name)
            .input('Desc', sql.NVarChar, description)
            .query('INSERT INTO ProcessRoutes (Id, Name, Description) VALUES (@Id, @Name, @Desc)');
        
        // Insert Steps
        if (steps && steps.length > 0) {
            for (const step of steps) {
                 await transaction.request()
                    .input('Id', sql.NVarChar, `step_${Date.now()}_${Math.random()}`)
                    .input('RId', sql.NVarChar, id)
                    .input('OpId', sql.NVarChar, step.operationId)
                    .input('Order', sql.Int, step.stepOrder)
                    .query('INSERT INTO ProcessRouteSteps (Id, ProcessRouteId, OperationId, StepOrder) VALUES (@Id, @RId, @OpId, @Order)');
            }
        }
        await transaction.commit();
        res.json({ success: true });
    } catch (e) {
        if(transaction.active) await transaction.rollback();
        res.status(500).json({ error: e.message });
    }
});

// UPDATE ROUTE (Replaces Steps)
app.put('/api/routes/:id', async (req, res) => {
    const { name, description, steps } = req.body;
    const routeId = req.params.id;
    const transaction = new sql.Transaction(req.db);
    
    try {
        await transaction.begin();
        
        // Update Route Details
        await transaction.request()
            .input('Id', sql.NVarChar, routeId)
            .input('Name', sql.NVarChar, name)
            .input('Desc', sql.NVarChar, description)
            .query('UPDATE ProcessRoutes SET Name = @Name, Description = @Desc WHERE Id = @Id');

        // Delete Old Steps
        await transaction.request()
            .input('Id', sql.NVarChar, routeId)
            .query('DELETE FROM ProcessRouteSteps WHERE ProcessRouteId = @Id');

        // Insert New Steps
        if (steps && steps.length > 0) {
            for (const step of steps) {
                 await transaction.request()
                    .input('Id', sql.NVarChar, `step_${Date.now()}_${Math.random()}`)
                    .input('RId', sql.NVarChar, routeId)
                    .input('OpId', sql.NVarChar, step.operationId)
                    .input('Order', sql.Int, step.stepOrder)
                    .query('INSERT INTO ProcessRouteSteps (Id, ProcessRouteId, OperationId, StepOrder) VALUES (@Id, @RId, @OpId, @Order)');
            }
        }
        
        await transaction.commit();
        res.json({ success: true });
    } catch (e) {
        if(transaction.active) await transaction.rollback();
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/routes/:id', async (req, res) => {
    const transaction = new sql.Transaction(req.db);
    try {
        await transaction.begin();
        await transaction.request().input('Id', sql.NVarChar, req.params.id).query('DELETE FROM ProcessRouteSteps WHERE ProcessRouteId = @Id');
        await transaction.request().input('Id', sql.NVarChar, req.params.id).query('DELETE FROM ProcessRoutes WHERE Id = @Id');
        // Unlink parts
        await transaction.request().input('Id', sql.NVarChar, req.params.id).query('UPDATE PartNumbers SET ProcessRouteId = NULL WHERE ProcessRouteId = @Id');
        await transaction.commit();
        res.json({ success: true });
    } catch (e) {
        if(transaction.active) await transaction.rollback();
        res.status(500).json({ error: e.message });
    }
});

// USERS
app.get('/api/users', async (req, res) => {
    const result = await req.db.request().query('SELECT Id, Username, Role, Name FROM Users');
    res.json(result.recordset.map(u => ({ id: u.Id, username: u.Username, role: u.Role, name: u.Name })));
});
app.post('/api/users', async (req, res) => {
    const { id, username, role, name, password } = req.body;
    await req.db.request().input('Id', sql.NVarChar, id).input('Username', sql.NVarChar, username).input('Role', sql.NVarChar, role).input('Name', sql.NVarChar, name).input('Password', sql.NVarChar, password)
        .query('INSERT INTO Users (Id, Username, Role, Name, Password) VALUES (@Id, @Username, @Role, @Name, @Password)');
    res.json({ success: true });
});
app.put('/api/users/:id', async (req, res) => {
    const { username, role, name, password } = req.body;
    const query = password ? 'UPDATE Users SET Username=@Username, Role=@Role, Name=@Name, Password=@Password WHERE Id=@Id' : 'UPDATE Users SET Username=@Username, Role=@Role, Name=@Name WHERE Id=@Id';
    await req.db.request().input('Id', sql.NVarChar, req.params.id).input('Username', sql.NVarChar, username).input('Role', sql.NVarChar, role).input('Name', sql.NVarChar, name).input('Password', sql.NVarChar, password).query(query);
    res.json({ success: true });
});
app.delete('/api/users/:id', async (req, res) => {
    await req.db.request().input('Id', sql.NVarChar, req.params.id).query('DELETE FROM Users WHERE Id=@Id');
    res.json({ success: true });
});

// OPS
app.get('/api/operations', async (req, res) => {
    const result = await req.db.request().query(`SELECT o.*, u.Name as OperatorName FROM Operations o LEFT JOIN Users u ON o.ActiveOperatorId = u.Id ORDER BY OrderIndex ASC`);
    res.json(result.recordset.map(o => ({ id: o.Id, name: o.Name, orderIndex: o.OrderIndex, isInitial: o.IsInitial, isFinal: o.IsFinal, activeOperatorId: o.ActiveOperatorId, activeOperatorName: o.OperatorName, requireTestLog: o.RequireTestLog })));
});
app.post('/api/operations', async (req, res) => {
    const { id, name, orderIndex, isInitial, isFinal, requireTestLog } = req.body;
    await req.db.request()
        .input('Id', sql.NVarChar, id)
        .input('Name', sql.NVarChar, name)
        .input('OrderIndex', sql.Int, orderIndex)
        .input('IsInitial', sql.Bit, isInitial)
        .input('IsFinal', sql.Bit, isFinal)
        .input('RequireTestLog', sql.Bit, requireTestLog ? 1 : 0)
        .query('INSERT INTO Operations (Id, Name, OrderIndex, IsInitial, IsFinal, RequireTestLog) VALUES (@Id, @Name, @OrderIndex, @IsInitial, @IsFinal, @RequireTestLog)');
    res.json({ success: true });
});
app.put('/api/operations/:id', async (req, res) => {
    const { name, orderIndex, isInitial, isFinal, requireTestLog } = req.body;
    await req.db.request()
        .input('Id', sql.NVarChar, req.params.id)
        .input('Name', sql.NVarChar, name)
        .input('OrderIndex', sql.Int, orderIndex)
        .input('IsInitial', sql.Bit, isInitial)
        .input('IsFinal', sql.Bit, isFinal)
        .input('RequireTestLog', sql.Bit, requireTestLog ? 1 : 0)
        .query('UPDATE Operations SET Name=@Name, OrderIndex=@OrderIndex, IsInitial=@IsInitial, IsFinal=@IsFinal, RequireTestLog=@RequireTestLog WHERE Id=@Id');
    res.json({ success: true });
});
app.delete('/api/operations/:id', async (req, res) => {
    await req.db.request().input('Id', sql.NVarChar, req.params.id).query('DELETE FROM Operations WHERE Id=@Id');
    res.json({ success: true });
});
app.post('/api/operations/:id/enter', async (req, res) => {
    const { userId } = req.body;
    const opId = req.params.id;
    const result = await req.db.request().input('Id', sql.NVarChar, opId).query('SELECT ActiveOperatorId FROM Operations WHERE Id=@Id');
    if (result.recordset[0]?.ActiveOperatorId && result.recordset[0].ActiveOperatorId !== userId) return res.status(403).json({ error: "Estación ocupada." });
    await req.db.request().input('Id', sql.NVarChar, opId).input('UserId', sql.NVarChar, userId).query('UPDATE Operations SET ActiveOperatorId=@UserId WHERE Id=@Id');
    res.json({ success: true });
});
app.post('/api/operations/:id/exit', async (req, res) => {
    await req.db.request().input('Id', sql.NVarChar, req.params.id).input('UserId', sql.NVarChar, req.body.userId).query('UPDATE Operations SET ActiveOperatorId=NULL WHERE Id=@Id AND ActiveOperatorId=@UserId');
    res.json({ success: true });
});
app.post('/api/operations/:id/unlock', async (req, res) => {
    await req.db.request().input('Id', sql.NVarChar, req.params.id).query('UPDATE Operations SET ActiveOperatorId=NULL WHERE Id=@Id');
    res.json({ success: true });
});

// PARTS (Update to include SerialGenType and Route)
app.get('/api/parts', async (req, res) => {
    const result = await req.db.request().query('SELECT * FROM PartNumbers');
    res.json(result.recordset.map(p => ({ id: p.Id, partNumber: p.PartNumber, revision: p.Revision, description: p.Description, productCode: p.ProductCode, serialMask: p.SerialMask, serialGenType: p.SerialGenType, processRouteId: p.ProcessRouteId, StdBoxQty: p.StdBoxQty,picture: p.Picture })));
});
app.post('/api/parts', async (req, res) => {
    const { id, partNumber, revision, description, productCode, serialMask, serialGenType, processRouteId, StdBoxQty, picture } = req.body;
    try {
        await req.db.request()
            .input('Id', sql.NVarChar, id)
            .input('PN', sql.NVarChar, partNumber)
            .input('Rev', sql.NVarChar, revision)
            .input('Desc', sql.NVarChar, description)
            .input('PC', sql.NVarChar, productCode)
            .input('Mask', sql.NVarChar, serialMask)
            .input('SGT', sql.NVarChar, serialGenType)
            .input('RID', sql.NVarChar, processRouteId)
            .input('SBQ', sql.Int, StdBoxQty || 1)
            .input('Pic', sql.NVarChar, picture || null)
            .query(`INSERT INTO PartNumbers (Id, PartNumber, Revision, Description, ProductCode, SerialMask, SerialGenType, ProcessRouteId, StdBoxQty, Picture) 
                    VALUES (@Id, @PN, @Rev, @Desc, @PC, @Mask, @SGT, @RID, @SBQ, @Pic)`);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/parts/:id', async (req, res) => {
    const { partNumber, revision, description, productCode, serialMask, serialGenType, processRouteId, StdBoxQty, picture } = req.body;
    try {
        await req.db.request()
            .input('Id', sql.NVarChar, req.params.id)
            .input('PN', sql.NVarChar, partNumber)
            .input('Rev', sql.NVarChar, revision)
            .input('Desc', sql.NVarChar, description)
            .input('PC', sql.NVarChar, productCode)
            .input('Mask', sql.NVarChar, serialMask)
            .input('SGT', sql.NVarChar, serialGenType)
            .input('RID', sql.NVarChar, processRouteId)
            .input('SBQ', sql.Int, StdBoxQty || 1)
            .input('Pic', sql.NVarChar, picture || null)
            .query(`UPDATE PartNumbers SET 
                    PartNumber = @PN, Revision = @Rev, Description = @Desc, 
                    ProductCode = @PC, SerialMask = @Mask, SerialGenType = @SGT, 
                    ProcessRouteId = @RID, StdBoxQty = @SBQ, Picture = @Pic 
                    WHERE Id = @Id`);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/parts/:id', async (req, res) => {
    await req.db.request().input('Id', sql.NVarChar, req.params.id).query('DELETE FROM PartNumbers WHERE Id=@Id');
    res.json({ success: true });
});

// ORDERS
app.get('/api/orders', async (req, res) => {
    const result = await req.db.request().query('SELECT * FROM WorkOrders');
    res.json(result.recordset.map(o => ({ id: o.Id, orderNumber: o.OrderNumber, sapOrderNumber: o.SAPOrderNumber, partNumberId: o.PartNumberId, quantity: o.Quantity, status: o.Status, createdAt: o.CreatedAt, mask: o.Mask })));
});

app.get('/api/orders/:number', async (req, res) => {
    try {
        const result = await req.db.request().input('N', sql.NVarChar, req.params.number).query('SELECT * FROM WorkOrders WHERE OrderNumber = @N');
        if (result.recordset.length === 0) return res.status(404).json({ error: "Order not found" });
        const r = result.recordset[0];
        res.json({
            id: r.Id, orderNumber: r.OrderNumber, sapOrderNumber: r.SAPOrderNumber, partNumberId: r.PartNumberId, quantity: r.Quantity, status: r.Status, createdAt: r.CreatedAt, mask: r.Mask
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// UPDATED PUT: Partial updates to prevent NULL errors
app.put('/api/orders/:id', async (req, res) => {
    const { quantity, status } = req.body;
    
    // Dynamic Query Construction
    const updates = [];
    if (quantity !== undefined) updates.push("Quantity = @Quantity");
    if (status !== undefined) updates.push("Status = @Status");
    
    if (updates.length === 0) return res.json({ success: true });

    const query = `UPDATE WorkOrders SET ${updates.join(', ')} WHERE Id = @Id`;
    const request = req.db.request().input('Id', sql.NVarChar, req.params.id);
    
    if (quantity !== undefined) request.input('Quantity', sql.Int, quantity);
    if (status !== undefined) request.input('Status', sql.NVarChar, status);
    
    await request.query(query);
    res.json({ success: true });
});
app.post('/api/orders/generate_oldie', async (req, res) => {
    const { sapOrderNumber, productCode, quantity, mask } = req.body;

    if (!sapOrderNumber || !productCode || !quantity) return res.status(400).json({ error: "Faltan datos (SAP Order, SKU, Qty)." });

    try {
        // 0. Verify SAP Order Uniqueness
        const sapCheck = await req.db.request().input('SAP', sql.NVarChar, sapOrderNumber).query('SELECT Id FROM WorkOrders WHERE SAPOrderNumber = @SAP');
        if (sapCheck.recordset.length > 0) throw new Error(`La Orden SAP ${sapOrderNumber} ya existe en el sistema.`);

        // 1. Look up Part ID and SerialGenType from Product Code
        const partRes = await req.db.request().input('Code', sql.NVarChar, productCode).query('SELECT Id, PartNumber, SerialGenType FROM PartNumbers WHERE ProductCode = @Code');
        if (partRes.recordset.length === 0) throw new Error("Producto/Modelo no encontrado en el sistema.");
        const partId = partRes.recordset[0].Id;
        const serialGenType = partRes.recordset[0].SerialGenType || 'LOT_BASED';

        // 2. Generate Internal Lot Number
        const now = new Date();
        const year = now.getFullYear();
        const baseYear = 2025;
        const baseCharCode = 75; // 'K'
        let yearCode = (year - baseYear >= 0 && year - baseYear <= 15) ? String.fromCharCode(baseCharCode + (year - baseYear)) : "AA";
        const quarterCode = ['A', 'B', 'C', 'D'][Math.floor(now.getMonth() / 3)];
        const prefix = `${yearCode}${quarterCode}`;
        const lastOrderResult = await req.db.request().input('Prefix', sql.NVarChar, prefix + '%').query(`SELECT TOP 1 OrderNumber FROM WorkOrders WHERE OrderNumber LIKE @Prefix ORDER BY OrderNumber DESC`);
        let sequence = 1;
        if (lastOrderResult.recordset.length > 0) {
            const match = lastOrderResult.recordset[0].OrderNumber.match(/(\d+)$/);
            if (match) sequence = parseInt(match[0], 10) + 1;
        }

        const newLotNumber = `${prefix}${sequence.toString().padStart(3, '0')}`;
        const newId = `wo_${Date.now()}`;
        
        // 3. Create Order
        await req.db.request()
            .input('Id', sql.NVarChar, newId)
            .input('LotNum', sql.NVarChar, newLotNumber)
            .input('SapNum', sql.NVarChar, sapOrderNumber)
            .input('PartId', sql.NVarChar, partId)
            .input('Qty', sql.Int, quantity)
            .input('Status', sql.NVarChar, 'OPEN')
            .input('Mask', sql.NVarChar, mask || 'DEFAULT')
            .query('INSERT INTO WorkOrders (Id, OrderNumber, SAPOrderNumber, PartNumberId, Quantity, Status, CreatedAt, Mask) VALUES (@Id, @LotNum, @SapNum, @PartId, @Qty, @Status, GETDATE(), @Mask)');
            
        res.json({ success: true, orderNumber: newLotNumber, orderId: newId });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.post('/api/orders/generate', async (req, res) => {
    const { sapOrderNumber, productCode, quantity, mask } = req.body;

    if (!sapOrderNumber || !productCode || !quantity) return res.status(400).json({ error: "Faltan datos (SAP Order, SKU, Qty)." });

    const maxRetries = 5;
    let attempt = 0;
    let success = false;
    let newLotNumber = null;
    let newId = null;
    let errorMsg = null;

    try {
        // 0. Verify SAP Order Uniqueness
        const sapCheck = await req.db.request().input('SAP', sql.NVarChar, sapOrderNumber).query('SELECT Id FROM WorkOrders WHERE SAPOrderNumber = @SAP');
        if (sapCheck.recordset.length > 0) throw new Error(`La Orden SAP ${sapOrderNumber} ya existe en el sistema.`);

        // 1. Look up Part ID and SerialGenType from Product Code
        const partRes = await req.db.request().input('Code', sql.NVarChar, productCode).query('SELECT Id, PartNumber, SerialGenType FROM PartNumbers WHERE ProductCode = @Code');
        if (partRes.recordset.length === 0) throw new Error("Producto/Modelo no encontrado en el sistema.");
        const partId = partRes.recordset[0].Id;
        const serialGenType = partRes.recordset[0].SerialGenType || 'LOT_BASED';

        while (!success && attempt < maxRetries) {
            attempt++;
            // 2. Generate Internal Lot Number
            const now = new Date();
            const year = now.getFullYear();
            const baseYear = 2025;
            const baseCharCode = 75; // 'K'
            let yearCode = (year - baseYear >= 0 && year - baseYear <= 15) ? String.fromCharCode(baseCharCode + (year - baseYear)) : "AA";
            const quarterCode = ['A', 'B', 'C', 'D'][Math.floor(now.getMonth() / 3)];
            const prefix = `${yearCode}${quarterCode}`;
            const lastOrderResult = await req.db.request().input('Prefix', sql.NVarChar, prefix + '%').query(`SELECT TOP 1 OrderNumber FROM WorkOrders WHERE OrderNumber LIKE @Prefix ORDER BY OrderNumber DESC`);
            let sequence = 1;
            if (lastOrderResult.recordset.length > 0) {
                const match = lastOrderResult.recordset[0].OrderNumber.match(/(\d+)$/);
                if (match) sequence = parseInt(match[0], 10) + 1;
            }
            newLotNumber = `${prefix}${sequence.toString().padStart(3, '0')}`;
            // Aplica prefijo según tipo
            if (serialGenType === 'ACCESSORIES') {
                newLotNumber = 'A' + newLotNumber;
            } else if (serialGenType === 'PCB_SERIAL') {
                newLotNumber = 'G3' + newLotNumber;
            }
            newId = `wo_${Date.now()}`;

            // Check for duplicate LOT number
            const lotCheck = await req.db.request().input('LotNum', sql.NVarChar, newLotNumber).query('SELECT Id FROM WorkOrders WHERE OrderNumber = @LotNum');
            if (lotCheck.recordset.length > 0) {
                // Duplicate found, retry
                continue;
            }

            // 3. Create Order
            try {
                await req.db.request()
                    .input('Id', sql.NVarChar, newId)
                    .input('LotNum', sql.NVarChar, newLotNumber)
                    .input('SapNum', sql.NVarChar, sapOrderNumber)
                    .input('PartId', sql.NVarChar, partId)
                    .input('Qty', sql.Int, quantity)
                    .input('Status', sql.NVarChar, 'OPEN')
                    .input('Mask', sql.NVarChar, mask || 'DEFAULT')
                    .query('INSERT INTO WorkOrders (Id, OrderNumber, SAPOrderNumber, PartNumberId, Quantity, Status, CreatedAt, Mask) VALUES (@Id, @LotNum, @SapNum, @PartId, @Qty, @Status, GETDATE(), @Mask)');
                success = true;
            } catch (insertErr) {
                errorMsg = insertErr.message;
                // If duplicate error, retry
                if (insertErr.message && insertErr.message.includes('duplicate')) {
                    continue;
                } else {
                    throw insertErr;
                }
            }
        }
        if (success) {
            res.json({ success: true, orderNumber: newLotNumber, orderId: newId });
        } else {
            res.status(500).json({ error: 'No se pudo generar un número de lote único. ' + (errorMsg || '') });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.get('/api/label-configs', async (req, res) => {
    const result = await req.db.request().query('SELECT * FROM LabelConfigs ORDER BY Sku, LabelType');
    const configs = result.recordset.map(c => ({
        id: c.Id, sku: c.Sku, labelName: c.LabelName, formatPath: c.FormatPath, printerName: c.PrinterName,
        defaultQuantity: c.DefaultQuantity, labelType: c.LabelType || 'CARTON1'
    }));
    res.json(configs);
});
app.post('/api/label-configs', async (req, res) => {
    const { id, sku, labelName, formatPath, printerName, defaultQuantity, labelType } = req.body;
    let isUpdate = false;
    if (id) {
        const check = await req.db.request().input('Id', sql.NVarChar, id).query('SELECT Id FROM LabelConfigs WHERE Id = @Id');
        if (check.recordset.length > 0) isUpdate = true;
    }
    if (isUpdate) {
        await req.db.request().input('Id', sql.NVarChar, id).input('Sku', sql.NVarChar, sku).input('LabelName', sql.NVarChar, labelName).input('FormatPath', sql.NVarChar, formatPath).input('PrinterName', sql.NVarChar, printerName).input('DefaultQuantity', sql.Int, defaultQuantity).input('LabelType', sql.NVarChar, labelType)
            .query(`UPDATE LabelConfigs SET Sku=@Sku, LabelName=@LabelName, FormatPath=@FormatPath, PrinterName=@PrinterName, DefaultQuantity=@DefaultQuantity, LabelType=@LabelType WHERE Id=@Id`);
    } else {
        await req.db.request().input('Id', sql.NVarChar, id || `lbl_${Date.now()}`).input('Sku', sql.NVarChar, sku).input('LabelName', sql.NVarChar, labelName).input('FormatPath', sql.NVarChar, formatPath).input('PrinterName', sql.NVarChar, printerName).input('DefaultQuantity', sql.Int, defaultQuantity).input('LabelType', sql.NVarChar, labelType || 'CARTON1')
            .query(`INSERT INTO LabelConfigs (Id, Sku, LabelName, FormatPath, PrinterName, DefaultQuantity, LabelType) VALUES (@Id, @Sku, @LabelName, @FormatPath, @PrinterName, @DefaultQuantity, @LabelType)`);
    }
    res.json({ success: true });
});
app.delete('/api/label-configs/:id', async (req, res) => {
    await req.db.request().input('Id', sql.NVarChar, req.params.id).query('DELETE FROM LabelConfigs WHERE Id=@Id');
    res.json({ success: true });
});
app.get('/api/label-fields/:configId', async (req, res) => {
    const result = await req.db.request().input('ConfigId', sql.NVarChar, req.params.configId).query('SELECT * FROM LabelFields WHERE LabelConfigId = @ConfigId');
    res.json(result.recordset.map(f => ({ id: f.Id, labelConfigId: f.LabelConfigId, fieldName: f.FieldName, dataSource: f.DataSource, staticValue: f.StaticValue })));
});
app.post('/api/label-fields', async (req, res) => {
    const { labelConfigId, fieldName, dataSource, staticValue } = req.body;
    await req.db.request().input('ConfigId', sql.NVarChar, labelConfigId).input('FName', sql.NVarChar, fieldName).input('DS', sql.NVarChar, dataSource).input('Static', sql.NVarChar, staticValue)
        .query('INSERT INTO LabelFields (LabelConfigId, FieldName, DataSource, StaticValue) VALUES (@ConfigId, @FName, @DS, @Static)');
    res.json({ success: true });
});
app.delete('/api/label-fields/:id', async (req, res) => {
    await req.db.request().input('Id', sql.Int, req.params.id).query('DELETE FROM LabelFields WHERE Id=@Id');
    res.json({ success: true });
});

// PRINT ENDPOINT (Updated for Exclusion Logic)
app.post('/api/print-label', async (req, res) => {
    const { serialNumber,partNumber,sapOrderNumber,orderQuantity, sku, quantity, cancelJob, cancelPrinter, closeApp = true, excludeLabelTypes, labelType, jobDescription } = req.body;

    // serialNumber can be a serial or an order number, so we call it printIdentifier
    const printIdentifier = serialNumber;

    if (!printIdentifier || !partNumber) return res.status(400).json({ error: "Faltan datos." });

    const logPrintJob = async (logData) => {
        const {
            printId, status, message, fileName, jobId, jobContent
        } = logData;
        try {
            await req.db.request()
                .input('Id', sql.NVarChar, printId)
                .input('Status', sql.NVarChar, status)
                .input('Msg', sql.NVarChar, message)
                .input('FileName', sql.NVarChar, fileName || null)
                .input('JobId', sql.NVarChar, jobId || null)
                .input('JobContent', sql.NVarChar, jobContent || null)
                .query(`INSERT INTO PrintLogs (PrintIdentifier, Status, Message, FileName, JobId, JobContent) 
                        VALUES (@Id, @Status, @Msg, @FileName, @JobId, @JobContent)`);
        } catch (e) {
            console.error("[PRINT LOG ERROR]", e.message);
        }
    };

    try {
        let configs = [];
        if (sku) {
            const configResult = await req.db.request().input('Sku', sql.NVarChar, sku).query('SELECT * FROM LabelConfigs WHERE Sku = @Sku');
            configs = configResult.recordset;
        }

        if (excludeLabelTypes && Array.isArray(excludeLabelTypes)) {
            configs = configs.filter(c => !excludeLabelTypes.includes(c.LabelType));
        }

        if (labelType) {
            configs = configs.filter(c => c.LabelType === labelType);
        }

        if (configs.length === 0) {
            if (excludeLabelTypes) return res.json({ success: true, message: "No labels to print after filtering." });
            throw new Error(`No config for SKU: ${sku}`);
        }

        const EOL = '\r\n';
        const finalSku = sku || ""; 
        let cmdContent = "";

        for (const config of configs) {
            let labelName = config.LabelName;
            if (labelName.toLowerCase().endsWith('.fmt')) labelName = labelName.slice(0, -4);
            
            const fullFormatPath = path.join(config.FormatPath, labelName);
            const finalQuantity = quantity || config.DefaultQuantity || 1;
            
            const fieldsResult = await req.db.request().input('ConfigId', sql.NVarChar, config.Id).query('SELECT * FROM LabelFields WHERE LabelConfigId = @ConfigId');
            const customFields = fieldsResult.recordset;

            cmdContent += `print${EOL}`;
            cmdContent += `formatname="${fullFormatPath}"${EOL}`;
            cmdContent += `formatcount=${finalQuantity}${EOL}`; 
            cmdContent += `printername="${config.PrinterName}"${EOL}`;
            cmdContent += `singlejob=on${EOL}`;
            
            if (customFields.length > 0) {
                customFields.forEach(f => {
                    let val = "";
                    switch(f.DataSource) {
                        case 'SERIAL': val = printIdentifier; break;
                        case 'PART': val = partNumber; break;
                        case 'SKU': val = finalSku; break;
                        case 'SAPORDER': val = sapOrderNumber; break;
                        case 'ORDERQTY': val = orderQuantity;break;
                        case 'DESC': val = "N/A"; break;
                        case 'DATE': val = new Date().toLocaleDateString(); break;
                        case 'STATIC': val = f.StaticValue || ""; break;
                    }
                    val = String(val).replace(/"/g, ''); 
                    cmdContent += `${f.FieldName}="${val}"${EOL}`;
                });
            } 
            
            cmdContent += `jobdescription="${jobDescription || ('Print ' + config.LabelType)}";${EOL}${EOL}`;
        }

        if (cancelJob) cmdContent += `cancel job=${cancelJob};${EOL}`;
        if (cancelPrinter) cmdContent += `cancel printername="${cancelPrinter}";${EOL}`;
        if (closeApp) cmdContent += `${EOL}close;${EOL}`;

        const jobFileName = `job_${Date.now()}_${printIdentifier.replace(/[^a-zA-Z0-9]/g, '')}.cmd`;
        const cmdFilePath = path.join(TEMP_PRINT_DIR, jobFileName);
        
        fs.writeFileSync(cmdFilePath, cmdContent);
        
        const command = `"${SYSTEM_PRINT_CONFIG.EXE_PATH}" "${cmdFilePath}" /W`;

        const logData = {
            printId: printIdentifier,
            fileName: configs.map(c => c.LabelName).join(', '),
            jobId: jobFileName,
            jobContent: cmdContent
        };

        exec(command, async (error, stdout, stderr) => {
            if (error) {
                await logPrintJob({ ...logData, status: 'ERROR', message: error.message });
                return;
            }
            await logPrintJob({ ...logData, status: 'SUCCESS', message: `Sent ${configs.length} labels` });
        });

        res.json({ success: true, message: "Job sent", file: cmdFilePath });

    } catch (err) {
        await logPrintJob({ printId: printIdentifier, status: 'ERROR', message: 'System Error: ' + err.message });
        res.status(500).json({ error: err.message });
    }
});

// MULTI PRINT ENDPOINT (For 100 distinctive Nameplates)
/*app.post('/api/print-label/multi', async (req, res) => {
    const { serials, sku, partNumber } = req.body; 
    // serials: { serialNumber: string }[]

    if (!serials || serials.length === 0 || !sku) return res.status(400).json({ error: "Missing data" });

    try {
        const configResult = await req.db.request().input('Sku', sql.NVarChar, sku).query("SELECT * FROM LabelConfigs WHERE Sku = @Sku AND LabelType = 'NAMEPLATE'");
        const config = configResult.recordset[0];
        
        if (!config) {
             return res.json({ success: true, message: "No NAMEPLATE config found. Skipping print." });
        }

        let labelName = config.LabelName;
        if (labelName.toLowerCase().endsWith('.fmt')) labelName = labelName.slice(0, -4);
        const fullFormatPath = path.join(config.FormatPath, labelName);
        
        const fieldsResult = await req.db.request().input('ConfigId', sql.NVarChar, config.Id).query('SELECT * FROM LabelFields WHERE LabelConfigId = @ConfigId');
        const customFields = fieldsResult.recordset;

        const EOL = '\r\n';
        let cmdContent = "";

        for (const unit of serials) {
            cmdContent += `print${EOL}`;
            cmdContent += `formatname="${fullFormatPath}"${EOL}`;
            cmdContent += `formatcount=1${EOL}`; 
            cmdContent += `printername="${config.PrinterName}"${EOL}`;
            cmdContent += `singlejob=on${EOL}`;

            if (customFields.length > 0) {
                customFields.forEach(f => {
                    let val = "";
                    switch(f.DataSource) {
                        case 'SERIAL': val = unit.serialNumber; break;
                        case 'PART': val = partNumber; break;
                        case 'SKU': val = sku; break;
                        case 'DESC': val = "N/A"; break;
                        case 'DATE': val = new Date().toLocaleDateString(); break;
                        case 'STATIC': val = f.StaticValue || ""; break;
                    }
                    val = String(val).replace(/"/g, ''); 
                    cmdContent += `${f.FieldName}="${val}"${EOL}`;
                });
            }
            cmdContent += `jobdescription="Nameplate ${unit.serialNumber}";${EOL}${EOL}`;
        }
        
        cmdContent += `close;${EOL}`;

        const jobFileName = `batch_job_${Date.now()}.cmd`;
        const cmdFilePath = path.join(TEMP_PRINT_DIR, jobFileName);
        fs.writeFileSync(cmdFilePath, cmdContent);

        const command = `"${SYSTEM_PRINT_CONFIG.EXE_PATH}" "${cmdFilePath}" /W`;
        exec(command);

        const transaction = new sql.Transaction(req.db);
        await transaction.begin();
        try {
            const request = transaction.request();
            const values = [];
            
            request.input('fileName', sql.NVarChar, config.LabelName);
            request.input('jobId', sql.NVarChar, jobFileName);
            request.input('jobContent', sql.NVarChar, cmdContent);
            request.input('status', sql.NVarChar, 'SUCCESS');
            request.input('message', sql.NVarChar, 'Batch Print Sent');

            for (let i = 0; i < serials.length; i++) {
                const unit = serials[i];
                const pName = `sn${i}`;
                request.input(pName, sql.NVarChar, unit.serialNumber);
                values.push(`(@${pName}, @status, @message, @fileName, @jobId, @jobContent)`);
            }
            
            if (values.length > 0) {
                 await request.query(`INSERT INTO PrintLogs (PrintIdentifier, Status, Message, FileName, JobId, JobContent) VALUES ${values.join(',')}`);
            }

            await transaction.commit();
        } catch(e) {
            console.error("Error logging batch print", e);
            if (transaction.active) await transaction.rollback();
        }

        res.json({ success: true, count: serials.length });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});*/
app.post('/api/print-label', async (req, res) => {
    const { serialNumber,partNumber,sapOrderNumber,orderQuantity, sku, quantity, cancelJob, cancelPrinter, closeApp = true, excludeLabelTypes, labelType, jobDescription, rawJobContent } = req.body;

    // serialNumber can be a serial or an order number, so we call it printIdentifier
    const printIdentifier = serialNumber;

    if (!printIdentifier || !partNumber) return res.status(400).json({ error: "Faltan datos." });

    const logPrintJob = async (logData) => {
        const {
            printId, status, message, fileName, jobId, jobContent
        } = logData;
        try {
            await req.db.request()
                .input('Id', sql.NVarChar, printId)
                .input('Status', sql.NVarChar, status)
                .input('Msg', sql.NVarChar, message)
                .input('FileName', sql.NVarChar, fileName || null)
                .input('JobId', sql.NVarChar, jobId || null)
                .input('JobContent', sql.NVarChar, jobContent || null)
                .query(`INSERT INTO PrintLogs (PrintIdentifier, Status, Message, FileName, JobId, JobContent) 
                        VALUES (@Id, @Status, @Msg, @FileName, @JobId, @JobContent)`);
        } catch (e) {
            console.error("[PRINT LOG ERROR]", e.message);
        }
    };

    try {
        if (rawJobContent) {
            const jobFileName = `job_reprint_${Date.now()}_${serialNumber.replace(/[^a-zA-Z0-9]/g, '')}.cmd`;
            const cmdFilePath = path.join(TEMP_PRINT_DIR, jobFileName);
            
            fs.writeFileSync(cmdFilePath, rawJobContent);
            
            const command = `"${SYSTEM_PRINT_CONFIG.EXE_PATH}" "${cmdFilePath}" /W`;

            const logData = {
                printId: serialNumber,
                fileName: "REPRINT",
                jobId: jobFileName,
                jobContent: rawJobContent
            };

            exec(command, async (error, stdout, stderr) => {
                if (error) {
                    await logPrintJob({ ...logData, status: 'ERROR', message: "Reprint Error: " + error.message });
                    return;
                }
                await logPrintJob({ ...logData, status: 'SUCCESS', message: "Reprinted successfully" });
            });

            return res.json({ success: true, message: "Reprint job sent" });
        }

        let configs = [];
        if (sku) {
            const configResult = await req.db.request().input('Sku', sql.NVarChar, sku).query('SELECT * FROM LabelConfigs WHERE Sku = @Sku');
            configs = configResult.recordset;
        }

        if (excludeLabelTypes && Array.isArray(excludeLabelTypes)) {
            configs = configs.filter(c => !excludeLabelTypes.includes(c.LabelType));
        }

        if (labelType) {
            configs = configs.filter(c => c.LabelType === labelType);
        }

        if (configs.length === 0) {
            if (excludeLabelTypes) return res.json({ success: true, message: "No labels to print after filtering." });
            throw new Error(`No config for SKU: ${sku}`);
        }

        const EOL = '\r\n';
        const finalSku = sku || ""; 
        let cmdContent = "";

        for (const config of configs) {
            let labelName = config.LabelName;
            if (labelName.toLowerCase().endsWith('.fmt')) labelName = labelName.slice(0, -4);
            
            const fullFormatPath = path.join(config.FormatPath, labelName);
            const finalQuantity = quantity || config.DefaultQuantity || 1;
            
            const fieldsResult = await req.db.request().input('ConfigId', sql.NVarChar, config.Id).query('SELECT * FROM LabelFields WHERE LabelConfigId = @ConfigId');
            const customFields = fieldsResult.recordset;

            cmdContent += `print${EOL}`;
            cmdContent += `formatname="${fullFormatPath}"${EOL}`;
            cmdContent += `formatcount=${finalQuantity}${EOL}`; 
            cmdContent += `printername="${config.PrinterName}"${EOL}`;
            cmdContent += `singlejob=on${EOL}`;
            
            if (customFields.length > 0) {
                customFields.forEach(f => {
                    let val = "";
                    switch(f.DataSource) {
                        case 'SERIAL': val = printIdentifier; break;
                        case 'PART': val = partNumber; break;
                        case 'SKU': val = finalSku; break;
                        case 'SAPORDER': val = sapOrderNumber; break;
                        case 'ORDERQTY': val = orderQuantity;break;
                        case 'DESC': val = "N/A"; break;
                        case 'DATE': val = new Date().toLocaleDateString(); break;
                        case 'STATIC': val = f.StaticValue || ""; break;
                    }
                    val = String(val).replace(/"/g, ''); 
                    cmdContent += `${f.FieldName}="${val}"${EOL}`;
                });
            } 
            
            cmdContent += `jobdescription="${jobDescription || ('Print ' + config.LabelType)}";${EOL}${EOL}`;
        }

        if (cancelJob) cmdContent += `cancel job=${cancelJob};${EOL}`;
        if (cancelPrinter) cmdContent += `cancel printername="${cancelPrinter}";${EOL}`;
        if (closeApp) cmdContent += `${EOL}close;${EOL}`;

        const jobFileName = `job_${Date.now()}_${printIdentifier.replace(/[^a-zA-Z0-9]/g, '')}.cmd`;
        const cmdFilePath = path.join(TEMP_PRINT_DIR, jobFileName);
        
        fs.writeFileSync(cmdFilePath, cmdContent);
        
        const command = `"${SYSTEM_PRINT_CONFIG.EXE_PATH}" "${cmdFilePath}" /W`;

        const logData = {
            printId: printIdentifier,
            fileName: configs.map(c => c.LabelName).join(', '),
            jobId: jobFileName,
            jobContent: cmdContent
        };

        exec(command, async (error, stdout, stderr) => {
            if (error) {
                await logPrintJob({ ...logData, status: 'ERROR', message: error.message });
                return;
            }
            await logPrintJob({ ...logData, status: 'SUCCESS', message: `Sent ${configs.length} labels` });
        });

        res.json({ success: true, message: "Job sent", file: cmdFilePath });

    } catch (err) {
        await logPrintJob({ printId: printIdentifier, status: 'ERROR', message: 'System Error: ' + err.message });
        res.status(500).json({ error: err.message });
    }
});

// SERIALS
app.get('/api/serials', async (req, res) => {
    try {
        const result = await req.db.request().query(`
            SELECT 
                s.*, 
                sh.OperationId as HistOpId, op.Name as HistOpName, sh.OperatorId as HistUserId, u.Name as HistUserName, sh.Timestamp as HistTs,
                pl.Id as PrintLogId, pl.Status as PrintStatus, pl.Message as PrintMessage, pl.Timestamp as PrintTs, pl.FileName as PrintFileName, pl.JobId as PrintJobId, pl.JobContent as PrintJobContent
            FROM 
                Serials s 
            LEFT JOIN 
                SerialHistory sh ON s.SerialNumber = sh.SerialNumber 
            LEFT JOIN 
                Users u ON sh.OperatorId = u.Id 
            LEFT JOIN 
                Operations op ON sh.OperationId = op.Id
            LEFT JOIN
                PrintLogs pl ON s.SerialNumber = pl.PrintIdentifier
            ORDER BY 
                s.SerialNumber, sh.Timestamp, pl.Id
        `);
        
        const map = new Map();
        result.recordset.forEach(r => {
            if(!map.has(r.SerialNumber)) {
                map.set(r.SerialNumber, {
                    serialNumber: r.SerialNumber,
                    orderNumber: r.OrderNumber,
                    partNumberId: r.PartNumberId,
                    currentOperationId: r.CurrentOperationId,
                    isComplete: r.IsComplete,
                    trayId: r.TrayId,
                    testFechaRegistro: r.TestFechaRegistro,
                    testSensorFW: r.TestSensorFW,
                    history: [],
                    printHistory: []
                });
            }

            const serial = map.get(r.SerialNumber);
            
            if(r.HistOpId && !serial.history.some(h => h.timestamp.getTime() === r.HistTs.getTime())) {
                serial.history.push({ operationId: r.HistOpId, operationName: r.HistOpName, operatorId: r.HistUserId, operatorName: r.HistUserName, timestamp: r.HistTs });
            }

            if(r.PrintLogId && !serial.printHistory.some(p => p.id === r.PrintLogId)) {
                serial.printHistory.push({
                    id: r.PrintLogId,
                    status: r.PrintStatus,
                    message: r.PrintMessage,
                    timestamp: r.PrintTs,
                    fileName: r.PrintFileName,
                    jobId: r.PrintJobId,
                    jobContent: r.PrintJobContent
                });
            }
        });

        res.json(Array.from(map.values()));
    } catch (e) {
        console.error("Error fetching serials:", e.message);
        res.json([]);
    }
});

app.get('/api/serials/order/:orderNumber', async (req, res) => {
    try {
        const { orderNumber } = req.params;
        const result = await req.db.request().input('OrderNumber', sql.NVarChar, orderNumber).query(`
            SELECT s.*, sh.OperationId as HistOpId, op.Name as HistOpName, sh.OperatorId as HistUserId, u.Name as HistUserName, sh.Timestamp as HistTs 
            FROM Serials s 
            LEFT JOIN SerialHistory sh ON s.SerialNumber = sh.SerialNumber 
            LEFT JOIN Users u ON sh.OperatorId = u.Id 
            LEFT JOIN Operations op ON sh.OperationId = op.Id 
            WHERE s.OrderNumber = @OrderNumber
            ORDER BY s.SerialNumber
        `);
        const map = new Map();
        result.recordset.forEach(r => {
            if(!map.has(r.SerialNumber)) map.set(r.SerialNumber, { serialNumber: r.SerialNumber, orderNumber: r.OrderNumber, partNumberId: r.PartNumberId, currentOperationId: r.CurrentOperationId, isComplete: r.IsComplete, trayId: r.TrayId, testFechaRegistro: r.TestFechaRegistro, testSensorFW: r.TestSensorFW, history: [], printHistory: [] });
            if(r.HistOpId) map.get(r.SerialNumber).history.push({ operationId: r.HistOpId, operationName: r.HistOpName, operatorId: r.HistUserId, operatorName: r.HistUserName, timestamp: r.HistTs });
        });
        res.json(Array.from(map.values()));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/serials/tray/:trayId', async (req, res) => {
    try {
        const { trayId } = req.params;
        const result = await req.db.request().input('TrayId', sql.NVarChar, trayId).query(`
            SELECT s.*, sh.OperationId as HistOpId, op.Name as HistOpName, sh.OperatorId as HistUserId, u.Name as HistUserName, sh.Timestamp as HistTs 
            FROM Serials s 
            LEFT JOIN SerialHistory sh ON s.SerialNumber = sh.SerialNumber 
            LEFT JOIN Users u ON sh.OperatorId = u.Id 
            LEFT JOIN Operations op ON sh.OperationId = op.Id 
            WHERE s.TrayId = @TrayId
            ORDER BY s.SerialNumber
        `);
        const map = new Map();
        result.recordset.forEach(r => {
            if(!map.has(r.SerialNumber)) map.set(r.SerialNumber, { serialNumber: r.SerialNumber, orderNumber: r.OrderNumber, partNumberId: r.PartNumberId, currentOperationId: r.CurrentOperationId, isComplete: r.IsComplete, trayId: r.TrayId, testFechaRegistro: r.TestFechaRegistro, testSensorFW: r.TestSensorFW, history: [], printHistory: [] });
            if(r.HistOpId) map.get(r.SerialNumber).history.push({ operationId: r.HistOpId, operationName: r.HistOpName, operatorId: r.HistUserId, operatorName: r.HistUserName, timestamp: r.HistTs });
        });
        res.json(Array.from(map.values()));
    } catch (e) {
        res.json([]);
    }
});

// BATCH GENERATE (OPTIMIZED for 100+ Units)
app.post('/api/serials/batch-generate', async (req, res) => {
    const { orderNumber, partNumberId, currentOperationId, trayId, operatorId, quantity = 100, autoComplete, testFechaRegistro, testSensorFW } = req.body;
    // autoComplete: If true, sets IsComplete=1 immediately (For Accessories/One-Step processes)

    const transaction = new sql.Transaction(req.db);
    await transaction.begin();

    try {
        // STRICT VALIDATION (Only if not completing immediately)
        if (!autoComplete && trayId) {
            const trayCheck = await transaction.request()
                .input('TID', sql.NVarChar, trayId)
                .query('SELECT TOP 1 OrderNumber FROM Serials WHERE TrayId = @TID AND IsComplete = 0');

            if (trayCheck.recordset.length > 0) {
                throw new Error(`La Charola ${trayId} tiene unidades pendientes de la orden ${trayCheck.recordset[0].OrderNumber}. Debe vaciarse/completarse antes de reusar.`);
            }
        }

        // 1. Determine starting sequence
        const countRes = await transaction.request().input('ON', sql.NVarChar, orderNumber).query('SELECT COUNT(*) as Cnt FROM Serials WHERE OrderNumber = @ON');
        let nextSeq = countRes.recordset[0].Cnt + 1;
        
        const generatedSerials = [];
        
        // CONSTRUCT BULK INSERTS
        if (quantity > 0) {
            let valuesClause = [];
            let histValuesClause = [];
            
            const request = transaction.request();
            request.input('ON', sql.NVarChar, orderNumber);
            request.input('PN', sql.NVarChar, partNumberId);
            request.input('OpId', sql.NVarChar, currentOperationId);
            request.input('TrayId', sql.NVarChar, trayId || null);
            request.input('UserId', sql.NVarChar, operatorId);
            request.input('IsComp', sql.Bit, autoComplete ? 1 : 0);
            request.input('TestFechaRegistro', sql.DateTime, testFechaRegistro || null);
            request.input('TestSensorFW', sql.NVarChar, testSensorFW || null);

            for (let i = 0; i < quantity; i++) {
                const seqStr = nextSeq.toString().padStart(3, '0');
                // Use a simpler format for accessories if needed, but keeping consistency
                const sn = `${orderNumber}-${seqStr}M`; 
                generatedSerials.push({ serialNumber: sn });
                
                request.input(`sn${i}`, sql.NVarChar, sn);
                
                valuesClause.push(`(@sn${i}, @ON, @PN, @OpId, @IsComp, @TrayId, @TestFechaRegistro, @TestSensorFW)`);
                histValuesClause.push(`(@sn${i}, @OpId, @UserId, GETDATE())`);
                
                nextSeq++;
            }

            const bulkInsertSerials = `INSERT INTO Serials (SerialNumber, OrderNumber, PartNumberId, CurrentOperationId, IsComplete, TrayId, TestFechaRegistro, TestSensorFW) VALUES ${valuesClause.join(',')}`;
            const bulkInsertHistory = `INSERT INTO SerialHistory (SerialNumber, OperationId, OperatorId, Timestamp) VALUES ${histValuesClause.join(',')}`;

            await request.query(bulkInsertSerials);
            await request.query(bulkInsertHistory);
        }

        // If Auto-Complete, also Close the Order immediately (since we just filled it)
        if (autoComplete) {
            await transaction.request()
                .input('ON', sql.NVarChar, orderNumber)
                .input('Status', sql.NVarChar, 'CLOSED')
                .query('UPDATE WorkOrders SET Status = @Status WHERE OrderNumber = @ON');
        }

        await transaction.commit();
        res.json({ success: true, serials: generatedSerials });

    } catch (e) {
        if (transaction.active) await transaction.rollback();
        res.status(500).json({ error: e.message });
    }
});

// Crear o actualizar un serial individual
app.post('/api/serials', async (req, res) => {
    const { serialNumber, orderNumber, partNumberId, currentOperationId, isComplete, trayId, testFechaRegistro, testSensorFW, operatorId } = req.body;
    if (!serialNumber || !orderNumber || !partNumberId) {
        return res.status(400).json({ error: 'Faltan datos obligatorios (serialNumber, orderNumber, partNumberId).' });
    }

    const transaction = new sql.Transaction(req.db);
    try {
        await transaction.begin();
        const request = transaction.request();

        // Verificar si el serial ya existe
        const check = await request.input('SN_check', sql.NVarChar, serialNumber).query('SELECT SerialNumber, CurrentOperationId FROM Serials WHERE SerialNumber = @SN_check');
        const now = new Date();

        if (check.recordset.length > 0) {
            // Actualizar
            const updateRequest = transaction.request(); // New request for the update
            await updateRequest
                .input('SN', sql.NVarChar, serialNumber)
                .input('ON', sql.NVarChar, orderNumber)
                .input('PN', sql.NVarChar, partNumberId)
                .input('OpId', sql.NVarChar, currentOperationId)
                .input('IsComp', sql.Bit, isComplete ? 1 : 0)
                .input('TrayId', sql.NVarChar, trayId || null)
                .input('TestFechaRegistro', sql.DateTime, testFechaRegistro || null)
                .input('TestSensorFW', sql.NVarChar, testSensorFW || null)
                .query('UPDATE Serials SET OrderNumber=@ON, PartNumberId=@PN, CurrentOperationId=@OpId, IsComplete=@IsComp, TrayId=@TrayId, TestFechaRegistro=@TestFechaRegistro, TestSensorFW=@TestSensorFW WHERE SerialNumber=@SN');
            
            // Registrar historial solo si cambió la operación
            if (check.recordset[0].CurrentOperationId !== currentOperationId && currentOperationId && operatorId) {
                const historyRequest = transaction.request(); // New request for history
                await historyRequest
                    .input('sn_hist', sql.NVarChar, serialNumber)
                    .input('oid_hist', sql.NVarChar, currentOperationId)
                    .input('uid_hist', sql.NVarChar, operatorId)
                    .input('ts_hist', sql.DateTime, now)
                    .query('INSERT INTO SerialHistory (SerialNumber, OperationId, OperatorId, Timestamp) VALUES (@sn_hist, @oid_hist, @uid_hist, @ts_hist)');
            }
            await transaction.commit();
            return res.json({ success: true, updated: true });

        } else {
            // Insertar nuevo
            const insertRequest = transaction.request();
            await insertRequest
                .input('SN', sql.NVarChar, serialNumber)
                .input('ON', sql.NVarChar, orderNumber)
                .input('PN', sql.NVarChar, partNumberId)
                .input('OpId', sql.NVarChar, currentOperationId)
                .input('IsComp', sql.Bit, isComplete ? 1 : 0)
                .input('TrayId', sql.NVarChar, trayId || null)
                .input('TestFechaRegistro', sql.DateTime, testFechaRegistro || null)
                .input('TestSensorFW', sql.NVarChar, testSensorFW || null)
                .query('INSERT INTO Serials (SerialNumber, OrderNumber, PartNumberId, CurrentOperationId, IsComplete, TrayId, TestFechaRegistro, TestSensorFW) VALUES (@SN, @ON, @PN, @OpId, @IsComp, @TrayId, @TestFechaRegistro, @TestSensorFW)');
            
            // Registrar historial si hay currentOperationId y operatorId
            if (currentOperationId && operatorId) {
                const historyRequest = transaction.request();
                await historyRequest
                    .input('sn_hist', sql.NVarChar, serialNumber)
                    .input('oid_hist', sql.NVarChar, currentOperationId)
                    .input('uid_hist', sql.NVarChar, operatorId)
                    .input('ts_hist', sql.DateTime, now)
                    .query('INSERT INTO SerialHistory (SerialNumber, OperationId, OperatorId, Timestamp) VALUES (@sn_hist, @oid_hist, @uid_hist, @ts_hist)');
            }
            await transaction.commit();
            return res.json({ success: true, created: true });
        }
    } catch (e) {
        if (transaction.active) {
            await transaction.rollback();
        }
        res.status(500).json({ error: e.message });
    }
});

// Eliminar un serial individual
app.delete('/api/serials/:serialNumber', async (req, res) => {
    const { serialNumber } = req.params;
    try {
        // Eliminar historial asociado primero (opcional, pero recomendado)
        await req.db.request().input('SN', sql.NVarChar, serialNumber).query('DELETE FROM SerialHistory WHERE SerialNumber = @SN');
        // Eliminar el serial
        const result = await req.db.request().input('SN', sql.NVarChar, serialNumber).query('DELETE FROM Serials WHERE SerialNumber = @SN');
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'Not Found' });
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
//API TO SAVE TEST LOGS FROM SENSORS (Optimized for Bulk Inserts and Real-Time Emission)
app.post('/api/sensors/events/bulk', async (req, res) => {
    let transaction; // Definir fuera para poder hacer rollback en el catch
    try {
        const eventos = req.body;

        if (!Array.isArray(eventos) || eventos.length === 0) {
            return res.status(400).json({ error: "El body debe ser un arreglo de eventos." });
        }

        transaction = new sql.Transaction(req.db);
        await transaction.begin();

        // Cargar Golden Serials en memoria para validación rápida
        const goldenRes = await transaction.request().query('SELECT SerialNumber, Type FROM GoldenSerials');
        const goldenMap = new Map();
        goldenRes.recordset.forEach(r => goldenMap.set(r.SerialNumber, r.Type));

        for (let e of eventos) {
            const {
                fecha_registro,
                HUB,
                HUB_FW,
                datos
            } = e;

            if (!datos) continue;

            let sensorName = datos.name;
            let skipInsert = false;

            const isHubGolden = goldenMap.get(HUB) === 'HUB';
            const isM3Golden = goldenMap.get(datos.name) === 'M3';

            // Lógica Golden M3 (Solo si el HUB NO es Golden, ya que HUB Golden tiene prioridad de "guardar todo")
            if (!isHubGolden && isM3Golden) {
                // Verificar si el HUB ya existe
                const checkHub = await transaction.request().input('H', sql.NVarChar, HUB).query('SELECT TOP 1 isRW FROM test_logs WHERE HUB = @H');
                
                if (checkHub.recordset.length > 0) {
                    const existingIsRW = checkHub.recordset[0].isRW;
                    const isReworkedDate = (fecha_registro >= Date.now());
                    console.log(isReworkedDate);
                    if (!existingIsRW && !isReworkedDate) { // isRW == 0
                        // Solo actualizar fecha, omitir insert
                        await transaction.request()
                            .input('F', sql.DateTime, new Date(fecha_registro))
                            .input('H', sql.NVarChar, HUB)
                            .query('UPDATE test_logs SET FechaRegistro = @F WHERE HUB = @H');
                        skipInsert = true;
                    } else {
                        // isRW == 1, insertar pero con nombre 'golden'
                        sensorName = 'golden';
                    }
                } else {
                    // No existe HUB, insertar con nombre 'golden'
                    sensorName = 'golden';
                }
            }

            if (skipInsert) continue;
           
            // SOLUCIÓN: Crear un nuevo request para cada iteración dentro de la transacción
            const request = transaction.request();

            request.input("Fecha", sql.DateTime, new Date(fecha_registro));
            if (isHubGolden) {
                request.input("Hub", sql.NVarChar, 'golden');
            } else {
                request.input("Hub", sql.NVarChar, HUB);
            }
            request.input("HubFW", sql.NVarChar, HUB_FW);
            request.input("Name", sql.NVarChar, sensorName);
            request.input("FW", sql.NVarChar, datos.fw_version);
            request.input("Type", sql.NVarChar, datos.type);
            request.input("Status", sql.NVarChar, datos.status);
            request.input("Temp", sql.NVarChar, datos.temperature);
            request.input("Hum", sql.NVarChar, datos.humidity);
            request.input("Scalar", sql.NVarChar, datos.scalar);
            request.input("Standby", sql.NVarChar, datos.sensor_standby);
            request.input("isRW", sql.Bit, datos.isRW ?? datos.isRw ?? 0);
        
            await request.query(`
                INSERT INTO test_logs
                (FechaRegistro, HUB, HUB_FW, SensorName, SensorFW, SensorType, Status, Temperature, Humidity, ScalarValue, SensorStandby, isRW)
                VALUES (@Fecha, @Hub, @HubFW, @Name, @FW, @Type, @Status, @Temp, @Hum, @Scalar, @Standby, @isRW);
            `);
            
            if (global.io) {
                global.io.emit('sensor_event', {
                    fecha_registro,
                    HUB,
                    HUB_FW,
                    datos
                });
            }
        }

        await transaction.commit();
        res.json({ success: true, message: "Eventos guardados correctamente.", count: eventos.length });
        

    } catch (err) {
        console.error("Error guardando eventos:", err);
        // Si hay error y la transacción está activa, revertir cambios
        if (transaction) {
            await transaction.rollback().catch(e => console.error("Error en rollback:", e));
        }
        res.status(500).json({ error: err.message });
    }
});

// GOLDEN SERIALS MANAGEMENT
app.get('/api/golden-serials', async (req, res) => {
    try {
        const result = await req.db.request().query('SELECT * FROM GoldenSerials');
        res.json(result.recordset);
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/golden-serials', async (req, res) => {
    const { serialNumber, type } = req.body;
    try {
        await req.db.request().input('SN', sql.NVarChar, serialNumber).input('Type', sql.NVarChar, type).query('INSERT INTO GoldenSerials (SerialNumber, Type) VALUES (@SN, @Type)');
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/golden-serials/:serial', async (req, res) => {
    try {
        await req.db.request().input('SN', sql.NVarChar, req.params.serial).query('DELETE FROM GoldenSerials WHERE SerialNumber = @SN');
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// BATCH UPDATE DE CHAROLA (actualiza todos los seriales de una charola a una operación y estado)
app.post('/api/serials/batch-update', async (req, res) => {
    const { trayId, operationId, operatorId, isComplete } = req.body;
    try {
        const timestamp = new Date();
        const request = req.db.request();
        const result = await request.input('tid', sql.NVarChar, trayId).query('SELECT SerialNumber FROM Serials WHERE TrayId = @tid');
        const serials = result.recordset;

        const transaction = new sql.Transaction(req.db);
        await transaction.begin();
        try {
            for (const s of serials) {
                await transaction.request()
                    .input('sn', sql.NVarChar, s.SerialNumber)
                    .input('oid', sql.NVarChar, operationId)
                    .input('comp', sql.Bit, isComplete || 0)
                    .query('UPDATE Serials SET CurrentOperationId = @oid, IsComplete = @comp WHERE SerialNumber = @sn');

                await transaction.request()
                    .input('sn', sql.NVarChar, s.SerialNumber)
                    .input('oid', sql.NVarChar, operationId)
                    .input('uid', sql.NVarChar, operatorId)
                    .input('ts', sql.DateTime, timestamp)
                    .query('INSERT INTO SerialHistory (SerialNumber, OperationId, OperatorId, Timestamp) VALUES (@sn, @oid, @uid, @ts)');
            }
            await transaction.commit();
            res.json({ success: true });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Marcar serial como procesado (solo LOT_BASED)
app.post('/api/serials/:serialNumber/process', async (req, res) => {
  const { serialNumber } = req.params;
  // Verifica tipo LOT_BASED
  const serialRes = await req.db.request().input('SerialNumber', sql.NVarChar, serialNumber)
    .query('SELECT s.*, p.SerialGenType FROM Serials s INNER JOIN PartNumbers p ON s.PartNumberId = p.Id WHERE s.SerialNumber = @SerialNumber');
  if (!serialRes.recordset.length || serialRes.recordset[0].SerialGenType !== 'LOT_BASED') {
    return res.status(400).json({ error: 'Solo se puede procesar LOT_BASED' });
  }
  await req.db.request()
    .input('SerialNumber', sql.NVarChar, serialNumber)
    .query('UPDATE Serials SET IsProcessed = 1 WHERE SerialNumber = @SerialNumber');
  res.json({ success: true });
});

// Desmarcar serial (solo LOT_BASED)
app.delete('/api/serials/:serialNumber/process', async (req, res) => {
  const { serialNumber } = req.params;
  const serialRes = await req.db.request().input('SerialNumber', sql.NVarChar, serialNumber)
    .query('SELECT s.*, p.SerialGenType FROM Serials s INNER JOIN PartNumbers p ON s.PartNumberId = p.Id WHERE s.SerialNumber = @SerialNumber');
  if (!serialRes.recordset.length || serialRes.recordset[0].SerialGenType !== 'LOT_BASED') {
    return res.status(400).json({ error: 'Solo se puede desprocesar LOT_BASED' });
  }
  await req.db.request()
    .input('SerialNumber', sql.NVarChar, serialNumber)
    .query('UPDATE Serials SET IsProcessed = 0 WHERE SerialNumber = @SerialNumber');
  res.json({ success: true });
});

// --- CATCH-ALL FOR REACT SPA ---
// Cualquier ruta no capturada por la API devolverá index.html
app.get('/api/test_logs/:serialNumber', async (req, res) => {
    try {
        const serialNumber = req.params.serialNumber;
        const partNumber = req.query.partNumber;

        let query = '';
        if (partNumber === '261001' || partNumber === '261002') {
             query = `SELECT TOP 1 SensorName as serialNumber, FechaRegistro as fechaRegistro, SensorFW as sensorFW 
                      FROM test_logs 
                      WHERE SensorName = @Serial 
                      ORDER BY FechaRegistro DESC`;
        } else {
             query = `SELECT TOP 1 HUB as serialNumber, FechaRegistro as fechaRegistro, HUB_FW as sensorFW 
                      FROM test_logs 
                      WHERE  SUBSTRING(HUB, PATINDEX('%[^0]%', HUB + ' '), LEN(HUB)) = @Serial 
                      ORDER BY FechaRegistro DESC`;
        }

        const result = await req.db.request().input('Serial', sql.NVarChar, serialNumber).query(query);
        const data = result.recordset[0];

        if (!data) {
            // Return 200 with a user-friendly message instead of 404
            return res.json({ success: false, message: 'No test log found for this serial.' });
        }
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// Endpoint to get all test logs
app.get('/api/test-results', async (req, res) => {
    try {
        const result = await req.db.request().query('SELECT FechaRegistro, SensorName, Hub, Hub_FW, SensorFW, Status, Temperature, Humidity, ScalarValue, SensorStandby, isRW FROM test_logs ORDER BY FechaRegistro DESC');
        res.json(result.recordset.map(r => ({
            fechaRegistro: r.FechaRegistro,
            sensorName: r.SensorName,
            hub: r.Hub,
            hubFW: r.HubFW,
            sensorFW: r.SensorFW,
            status: r.Status,
            temperature: r.Temperature,
            humidity: r.Humidity,
            scalarValue: r.ScalarValue,
            sensorStandby: r.SensorStandby,
            isRW: r.isRW
        })));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/test-results/:sn', async (req, res) => {
    try {
        const log = await getTestLogBySerial(req.db, req.params.sn);
        res.json(log);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- INICIO: ENDPOINT DE PROGRESO DE ORDEN ACCESSORIES ---
app.get('/api/order-progress/:orderId', async (req, res) => {
  const { orderId } = req.params;
  try {
    // Cambia esto si tu función se llama diferente
    const units = await db.getSerialUnitsByOrder(orderId); 
    const processedUnits = units.filter(u => u.isComplete).length;
    const totalUnits = units.length;
    const batchSize = 1; // Cambia si tu caja/lote es de otro tamaño
    const totalBatches = Math.ceil(totalUnits / batchSize);
    const currentBatch = Math.floor(processedUnits / batchSize);
    const waitingForContinue = processedUnits % batchSize === 0 && processedUnits < totalUnits;

    res.json({
      currentBatch,
      totalBatches,
      waitingForContinue,
      processedUnits
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener progreso de la orden.' });
  }
});
// --- FIN: ENDPOINT DE PROGRESO DE ORDEN ACCESSORIES ---

app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(DIST_DIR, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`MES Backend running on port ${PORT} (DB: ${sqlConfig.database})`);
});
