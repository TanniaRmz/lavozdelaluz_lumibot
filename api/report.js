// Archivo: api/report.js

const { Octokit } = require("@octokit/rest");

// --- ⚠️ ¡IMPORTANTE! Tus datos de Repositorio (No cambiar si ya están correctos)
const REPO_OWNER = 'TanniaRmz'; // Tu nombre de usuario
const REPO_NAME = 'lavozdelaluz_lumibot'; 
// ---

// El Token es extraído de las Variables de Entorno de Vercel (GITHUB_TOKEN)
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
        const { data } = await octokitInstance.repos.getContent({
            owner: REPO_OWNER,
            repo: REPO_NAME,
            path: REPORT_DIR,
            ref: 'main' // Rama principal
        });

        if (Array.isArray(data)) {
            data.forEach(item => {
                if (item.type === 'file' && item.name.startsWith('F-')) {
                    // Extrae el número del nombre del archivo (ej: 'F-0012-fecha.json' -> '0012')
                    const parts = item.name.split('-');
                    if (parts.length >= 2) {
                        const folioNumberString = parts[1]; 
                        const folioNumber = parseInt(folioNumberString, 10);
                        if (!isNaN(folioNumber) && folioNumber > maxFolio) {
                            maxFolio = folioNumber;
                        }
                    }
                }
            });
        }
    } catch (error) {
        // Ignoramos el error 404 si la carpeta aún no existe
        if (error.status !== 404) {
            console.error("Error al obtener el historial de folios de GitHub:", error.message);
            throw new Error("Fallo al calcular el siguiente folio.");
        }
    }
    
    const nextFolioNumber = maxFolio + 1;
    return `F-${String(nextFolioNumber).padStart(4, '0')}`;
}


module.exports = async (req, res) => {
    // Aseguramos que solo responda a peticiones POST
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Solo se permite el método POST.' });
    }

    // Esperamos los datos del reporte Y los datos de la imagen
    const { reportData, imageData } = req.body; 

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
            
            // Lógica para remover el prefijo "data:image/..." antes de la subida
            const base64Data = imageData.base64.split(';base64,').pop();
            
            // Decodifica la Base64 pura a un Buffer
            const imageBuffer = Buffer.from(base64Data, 'base64');
            
            const imageExtension = imageData.fileType.split('/')[1] || 'jpg'; // Extensión por defecto 'jpg'
            const imagePath = `reports/images/${newFolio}-${Date.now()}.${imageExtension}`; // Ruta única dentro de 'reports/images'

            try {
                await octokit.repos.createOrUpdateFileContents({
                    owner: REPO_OWNER,
                    repo: REPO_NAME,
                    path: imagePath,
                    message: `[Lumi-Bot] Imagen para Reporte #${newFolio}`,
                    content: imageBuffer.toString('base64'), // Re-codifica el Buffer a Base64 para la API
                    branch: 'main',
                });
                
                // CORRECCIÓN CLAVE: Usar raw.githubusercontent.com para que la imagen se cargue correctamente
                imageUrlInGitHub = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/${imagePath}`;
                console.log(`Imagen subida a: ${imageUrlInGitHub}`);
            } catch (imageError) {
                console.error("Error al subir la imagen a GitHub:", imageError.message);
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
            imageUrl: imageUrlInGitHub, 
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
