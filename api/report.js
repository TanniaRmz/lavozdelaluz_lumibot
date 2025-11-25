// Archivo: api/report.js

const { Octokit } = require("@octokit/rest");

// --- ⚠️ ¡IMPORTANTE! Reemplaza con tus datos de Repositorio (NO CAMBIES ESTO SI YA ESTÁ BIEN)
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

    const { reportData, imageData } = req.body; // Ahora esperamos reportData E imageData

    if (!reportData) {
        return res.status(400).json({ success: false, error: 'Datos de reporte vacíos.' });
    }
    
    let newFolio;
    let imageUrlInGitHub = 'No'; // Default si no hay imagen

    try {
        // 1. ASIGNAR FOLIO ÚNICO Y GLOBALMENTE CONSECUTIVO
        newFolio = await getNextGlobalFolio(octokit);
        reportData.folio = newFolio; // Añadimos el folio al objeto del reporte

        // 2. Si hay datos de imagen, procesarla y subirla a GitHub
        if (imageData && imageData.base64 && imageData.fileType) {
            const imageBuffer = Buffer.from(imageData.base64, 'base64');
            const imageExtension = imageData.fileType.split('/')[1]; // ej: 'png', 'jpeg'
            const imagePath = `reports/images/${newFolio}-${Date.now()}.${imageExtension}`; // Ruta dentro de 'reports/images'

            try {
                await octokit.repos.createOrUpdateFileContents({
                    owner: REPO_OWNER,
                    repo: REPO_NAME,
                    path: imagePath,
                    message: `[Lumi-Bot] Imagen para Reporte #${newFolio}`,
                    content: imageBuffer.toString('base64'), // Ya es base64
                    branch: 'main',
                });
                // Construir la URL pública de la imagen en GitHub
                imageUrlInGitHub = `https://github.com/${REPO_OWNER}/${REPO_NAME}/blob/main/${imagePath}?raw=true`;
                console.log(`Imagen subida a: ${imageUrlInGitHub}`);
            } catch (imageError) {
                console.error("Error al subir la imagen a GitHub:", imageError.message);
                // No detenemos el reporte si falla la imagen, pero registramos el fallo
                imageUrlInGitHub = `Fallo al subir imagen: ${imageError.message}`;
            }
        }
        reportData.imagenURL = imageUrlInGitHub; // Actualizamos la URL de la imagen en el reporte


        // 3. Prepara el contenido del archivo JSON del reporte
        const content = JSON.stringify(reportData, null, 2);
        const contentBase64 = Buffer.from(content).toString('base64');

        // 4. Define la ruta y el nombre del archivo JSON. Usamos el nuevo folio.
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, ''); 
        const time = new Date().toTimeString().slice(0, 5).replace(/:/g, ''); 
        const filePath = `reports/${newFolio}-${date}-${time}.json`; 
        
        // 5. Llama a la API de GitHub para crear el archivo JSON (Commit)
        const response = await octokit.repos.createOrUpdateFileContents({
            owner: REPO_OWNER,
            repo: REPO_NAME,
            path: filePath,
            message: `[Lumi-Bot] Reporte de Falla #${newFolio}`, // Mensaje del commit
            content: contentBase64,
            branch: 'main', 
        });

        // 6. Éxito: DEVOLVEMOS EL FOLIO ASIGNADO Y LA URL DE LA IMAGEN (si existe)
        res.status(200).json({
            success: true,
            folio: newFolio, 
            imageUrl: imageUrlInGitHub, // Devolvemos la URL de la imagen si se subió
            message: `Reporte ${newFolio} guardado en GitHub.`,
            commit: response.data.commit.html_url,
        });

    } catch (error) {
        console.error("Error en la API de GitHub (general):", error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Fallo al procesar o guardar el reporte en GitHub.', 
            details: error.message,
            assignedFolio: newFolio 
        });
    }
};
