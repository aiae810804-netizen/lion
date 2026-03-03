const XLSX = require('xlsx');

function leerExcel() {
    try {
        const ruta = 'C:/Users/H583623/Honeywell/MX31 SIOP - General/MX31 SIOP Q1 2026.xlsx';
        
        // 1. IMPORTANTE: Agregamos cellDates: true para que intente convertir fechas automáticamente
        const workbook = XLSX.readFile(ruta, { cellDates: true });
        const hoja = workbook.Sheets['DATABASE'];

        const filas = XLSX.utils.sheet_to_json(hoja, { header: 1 });

        const COL_MATERIAL = 0;   
        const COL_FAMILY = 1;     
        const COL_DATE = 3;       // Columna D
        const COL_WEEK = 4;       
        const COL_QTY = 5;        
        const COL_PROD = 6;        
        const COL_STATUS = 7;
        const COL_PLAN_ORDER = 8; // Columna I (según tu índice 8)

        const valorABuscar = 'LI-ON'; 

        const resultadoFinal = filas.slice(1)
            .filter(fila => fila[COL_FAMILY] === valorABuscar)
            .map(fila => {
                // LÓGICA DE CONVERSIÓN DE FECHA
                let valorFecha = fila[COL_DATE];
                let fechaFormateada = "Sin Fecha";

                if (valorFecha instanceof Date) {
                    // Si ya es un objeto Date
                    fechaFormateada = valorFecha.toLocaleDateString('es-ES');
                } else if (typeof valorFecha === 'number') {
                    // Si es un número de Excel (ej. 46041), lo convertimos manualmente
                    const fechaJS = new Date((valorFecha - 25569) * 86400 * 1000);
                    fechaFormateada = fechaJS.toLocaleDateString('es-ES');
                }

                return {
                    MATERIAL: fila[COL_MATERIAL] || "Sin Material",
                    Qty: fila[COL_QTY] || 0,
                    Semana: fila[COL_WEEK],
                    Fecha: fechaFormateada, // <--- Valor convertido
                    Orden: fila[COL_PLAN_ORDER] || "Sin Orden",
                    Producido: fila[COL_PROD] || " ",
                    Status: fila[COL_STATUS] || "Sin Status",
                };
            });

        console.log(`--- Resultados filtrados por Family: ${valorABuscar} ---`);
        console.table(resultadoFinal);

    } catch (e) {
        console.error("Error al filtrar:", e.message);
    }
}

leerExcel();
