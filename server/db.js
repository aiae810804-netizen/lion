import sql from 'mssql';

// CONFIGURACIÓN DE CONEXIÓN
// Ajusta estos valores a tu instancia local de SQL Server
const sqlConfig = {
  user: process.env.DB_USER || 'lionuser',
  password: process.env.DB_PASSWORD || 'lionu5er',
  database: 'testdb',
  server: process.env.DB_SERVER || 'mx31w1002',
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  },
  options: {
    encrypt: false, // Para Azure usa true, para local false
    trustServerCertificate: true // Cambiar a false para producción real
  }
};

// Configuración para conectar a 'master' y crear la DB si no existe
const masterConfig = {
  ...sqlConfig,
  database: 'master'
};

// SCRIPTS SQL
const SCHEMA_SCRIPTS = [
    `IF OBJECT_ID('dbo.Users', 'U') IS NULL
    CREATE TABLE Users (
        Id NVARCHAR(50) PRIMARY KEY,
        Username NVARCHAR(50) NOT NULL UNIQUE,
        Role NVARCHAR(20) NOT NULL,
        Name NVARCHAR(100) NOT NULL
    );`,
    
    `IF OBJECT_ID('dbo.Operations', 'U') IS NULL
    CREATE TABLE Operations (
        Id NVARCHAR(50) PRIMARY KEY,
        Name NVARCHAR(100) NOT NULL,
        OrderIndex INT NOT NULL,
        IsInitial BIT DEFAULT 0,
        IsFinal BIT DEFAULT 0,
        ActiveOperatorId NVARCHAR(50) NULL -- Column for locking station
    );`,

    `IF OBJECT_ID('dbo.ProcessRoutes', 'U') IS NULL
    CREATE TABLE ProcessRoutes (
        Id NVARCHAR(50) PRIMARY KEY,
        Name NVARCHAR(100) NOT NULL,
        Description NVARCHAR(255)
    );`,

    `IF OBJECT_ID('dbo.ProcessRouteSteps', 'U') IS NULL
    CREATE TABLE ProcessRouteSteps (
        Id NVARCHAR(50) PRIMARY KEY,
        ProcessRouteId NVARCHAR(50) FOREIGN KEY REFERENCES ProcessRoutes(Id) ON DELETE CASCADE,
        OperationId NVARCHAR(50) FOREIGN KEY REFERENCES Operations(Id),
        StepOrder INT NOT NULL
    );`,

    `IF OBJECT_ID('dbo.PartNumbers', 'U') IS NULL
    CREATE TABLE PartNumbers (
        Id NVARCHAR(50) PRIMARY KEY,
        PartNumber NVARCHAR(50) NOT NULL,
        Revision NVARCHAR(10),
        Description NVARCHAR(255),
        ProductCode NVARCHAR(50),
        SerialMask NVARCHAR(50),
        SerialGenType NVARCHAR(20) DEFAULT 'PCB_SERIAL',
        ProcessRouteId NVARCHAR(50) NULL FOREIGN KEY REFERENCES ProcessRoutes(Id)
    );`,

    `IF OBJECT_ID('dbo.WorkOrders', 'U') IS NULL
    CREATE TABLE WorkOrders (
        Id NVARCHAR(50) PRIMARY KEY,
        OrderNumber NVARCHAR(50) NOT NULL UNIQUE, -- Internal Lot Number
        SAPOrderNumber NVARCHAR(50) NULL, -- External SAP Order
        PartNumberId NVARCHAR(50) FOREIGN KEY REFERENCES PartNumbers(Id),
        Quantity INT NOT NULL,
        Status NVARCHAR(20) CHECK (Status IN ('OPEN', 'CLOSED')),
        CreatedAt DATETIME DEFAULT GETDATE(),
        Mask NVARCHAR(50)
    );`,

    `IF OBJECT_ID('dbo.Serials', 'U') IS NULL
    CREATE TABLE Serials (
        SerialNumber NVARCHAR(50) PRIMARY KEY,
        OrderNumber NVARCHAR(50) NOT NULL, 
        PartNumberId NVARCHAR(50) FOREIGN KEY REFERENCES PartNumbers(Id),
        CurrentOperationId NVARCHAR(50) FOREIGN KEY REFERENCES Operations(Id),
        IsComplete BIT DEFAULT 0,
        TrayId NVARCHAR(50) NULL -- New column for Batch Trays
    );`,

    `IF OBJECT_ID('dbo.SerialHistory', 'U') IS NULL
    CREATE TABLE SerialHistory (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        SerialNumber NVARCHAR(50) FOREIGN KEY REFERENCES Serials(SerialNumber),
        OperationId NVARCHAR(50) FOREIGN KEY REFERENCES Operations(Id),
        OperatorId NVARCHAR(50) FOREIGN KEY REFERENCES Users(Id),
        Timestamp DATETIME DEFAULT GETDATE()
    );`,

    `IF OBJECT_ID('dbo.PrintLogs', 'U') IS NULL
    CREATE TABLE PrintLogs (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        PrintIdentifier NVARCHAR(50), -- Can be SerialNumber or OrderNumber
        Status NVARCHAR(20), -- 'SUCCESS', 'ERROR'
        Message NVARCHAR(MAX),
        Timestamp DATETIME DEFAULT GETDATE(),
        FileName NVARCHAR(255),
        JobId NVARCHAR(255),
        JobContent NVARCHAR(MAX)
    );`,

    `IF OBJECT_ID('dbo.LabelConfigs', 'U') IS NULL
    CREATE TABLE LabelConfigs (
        Id NVARCHAR(50) PRIMARY KEY,
        Sku NVARCHAR(50) NOT NULL,
        LabelName NVARCHAR(100) NOT NULL, 
        FormatPath NVARCHAR(255) NOT NULL,
        PrinterName NVARCHAR(100) NOT NULL, 
        DefaultQuantity INT DEFAULT 1,
        LabelType NVARCHAR(20) DEFAULT 'CARTON1'
    );`,

    `IF OBJECT_ID('dbo.LabelFields', 'U') IS NULL
    CREATE TABLE LabelFields (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        LabelConfigId NVARCHAR(50) FOREIGN KEY REFERENCES LabelConfigs(Id) ON DELETE CASCADE,
        FieldName NVARCHAR(100) NOT NULL, 
        DataSource NVARCHAR(50) NOT NULL,   
        StaticValue NVARCHAR(255) NULL
    );`,
     
    `IF OBJECT_ID('dbo.test_logs', 'U') IS NULL
    CREATE TABLE test_logs (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    FechaRegistro DATETIME NOT NULL,
    HUB NVARCHAR(100),
    HUB_FW NVARCHAR(50),
    SensorName NVARCHAR(100),
    SensorFW NVARCHAR(50),
    SensorType NVARCHAR(50),
    Status NVARCHAR(20),
    Temperature NVARCHAR(50),
    Humidity NVARCHAR(50),
    ScalarValue NVARCHAR(50),
    SensorStandby NVARCHAR(20),
    CreatedAt DATETIME DEFAULT GETDATE()
    );`
];

// SEED DATA
const SEED_QUERIES = [
    `IF NOT EXISTS (SELECT * FROM Users) 
     INSERT INTO Users (Id, Username, Role, Name, Password) VALUES 
     ('1', 'admin', 'ADMIN', 'Admin Sistema', 'admin123'),
     ('2', 'super', 'SUPERVISOR', 'Supervisor Linea', 'super123'),
     ('3', 'op1', 'OPERATOR', 'Operador Juan', NULL);`,

    `IF NOT EXISTS (SELECT * FROM Operations)
     INSERT INTO Operations (Id, Name, OrderIndex, IsInitial, IsFinal) VALUES
     ('op_10', 'INICIAL', 10, 1, 0),
     ('op_20', 'ENSAMBLE', 20, 0, 0),
     ('op_30', 'PRUEBA', 30, 0, 0),
     ('op_40', 'EMPAQUE', 40, 0, 1);`,
     
    `IF NOT EXISTS (SELECT * FROM PartNumbers)
     INSERT INTO PartNumbers (Id, PartNumber, Revision, Description, ProductCode, SerialMask) VALUES
     ('pn_1', '261001', 'A', 'LT-SEN-M3: Monitoring Sensor, Gen 3', 'LT-SEN-M3', '33########'),
     ('pn_2', '261004', 'C', 'Hub POE, Gen 3', 'Hub POE', '31########');`
];

export { sql, sqlConfig, masterConfig, SCHEMA_SCRIPTS, SEED_QUERIES };

export async function getTestLogBySerial(db, serialNumber) {
    // Busca el registro más reciente para ese serial (SensorName)
    const result = await db.request()
        .input('SensorName', sql.NVarChar, serialNumber)
        .query(`
            SELECT TOP 1 FechaRegistro, SensorFW 
            FROM test_logs 
            WHERE SensorName = @SensorName 
            ORDER BY FechaRegistro DESC
        `);
    if (result.recordset.length === 0) return null;
    return {
        serialNumber,
        fechaRegistro: result.recordset[0].FechaRegistro,
        sensorFW: result.recordset[0].SensorFW
    };
}
