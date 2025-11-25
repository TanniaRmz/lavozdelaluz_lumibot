// Archivo: api/report.js

const { Octokit } = require("@octokit/rest");

// --- ⚠️ ¡IMPORTANTE! Reemplaza con tus datos de Repositorio
const REPO_OWNER = 'TanniaRmz'; // Tu nombre de usuario
const REPO_NAME = 'lavozdelaluz_lumibot'; 
// ---

// El Token es extraído de las Variables de Entorno, NUNCA expuesto en el código.
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; 

const octokit = new Octokit({
  auth: GITHUB_TOKEN,
});

/**
 * Función que lee la carpeta 'reports' en GitHub para determinar el siguiente folio consecutivo.
 * @param {Octokit} octokitInstance - Instancia autenticada de Octokit.
 * @returns {Promise<string>} El siguiente folio formateado (ej: 'F-0001').
 */
async function getNextGlobalFolio(octokitInstance) {
    const REPORT_DIR = 'reports';
    let maxFolio = 0;
    
    try {
        // 1. Obtener la lista de archivos en la carpeta 'reports'
        const { data } = await octokitInstance.repos.getContent({
            owner: REPO_OWNER,
            repo: REPO_NAME,
            path: REPORT_DIR,
            ref: 'main' // Rama principal
        });

        // 2. Iterar y encontrar el folio numérico más alto
        if (Array.isArray(data)) {
            data.forEach(item => {
                if (item.type === 'file' && item.name.startsWith('F-')) {
                    // El nombre de archivo es F-XXXX-YYYYMMDD.json
                    const parts = item.name.split('-');
                    if (parts.length >= 2) {
                        // El número de folio es la segunda parte (ej: '0001')
                        const folioNumber = parseInt(parts[1], 10);
                        if (!isNaN(folioNumber) && folioNumber > maxFolio) {
                            maxFolio = folioNumber;
                        }
                    }
                }
            });
        }
    } catch (error) {
        // Si la carpeta no existe (error 404), asumimos que el contador es 0.
        if (error.status !== 404) {
            console.error("Error al obtener el historial de folios de GitHub:", error.message);
            throw new Error("Fallo al calcular el siguiente folio.");
        }
    }
    
    const nextFolioNumber = maxFolio + 1;
    // 3. Formatear y devolver F-0001 (4 dígitos)
    return `F-${String(nextFolioNumber).padStart(4, '0')}`;
}


module.exports = async (req, res) => {
    // Aseguramos que solo responda a peticiones POST
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Solo se permite el método POST.' });
    }

    const reportData = req.body;

    // Ya no requerimos que el folio esté en el cuerpo del reporte
    if (!reportData) {
        return res.status(400).json({ success: false, error: 'Datos de reporte vacíos.' });
    }
    
    let newFolio;

    try {
        // 1. ASIGNAR FOLIO ÚNICO Y GLOBALMENTE CONSECUTIVO
        newFolio = await getNextGlobalFolio(octokit);
        reportData.folio = newFolio; // Añadimos el folio al objeto del reporte
        
        // 2. Prepara el contenido del archivo JSON
        const content = JSON.stringify(reportData, null, 2);
        const contentBase64 = Buffer.from(content).toString('base64');

        // 3. Define la ruta y el nombre del archivo. Usamos el nuevo folio.
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, ''); 
        const time = new Date().toTimeString().slice(0, 5).replace(/:/g, ''); 
        const filePath = `reports/${newFolio}-${date}-${time}.json`; 
        
        // 4. Llama a la API de GitHub para crear el archivo (Commit)
        const response = await octokit.repos.createOrUpdateFileContents({
            owner: REPO_OWNER,
            repo: REPO_NAME,
            path: filePath,
            message: `[Lumi-Bot] Reporte de Falla #${newFolio}`, // Mensaje del commit
            content: contentBase64,
            branch: 'main', 
        });

        // 5. Éxito: DEVOLVEMOS EL FOLIO ASIGNADO AL CLIENTE
        res.status(200).json({
            success: true,
            folio: newFolio, // <-- CLAVE: Devolvemos el folio único generado
            message: `Reporte ${newFolio} guardado en GitHub.`,
            commit: response.data.commit.html_url,
        });

    } catch (error) {
        console.error("Error en la API de GitHub:", error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Fallo al realizar el commit en GitHub.', 
            details: error.message,
            // Si hubo un folio asignado, lo reportamos, aunque el commit haya fallado.
            assignedFolio: newFolio 
        });
    }
};
