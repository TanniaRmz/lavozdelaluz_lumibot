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

module.exports = async (req, res) => {
  // Aseguramos que solo responda a peticiones POST
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Solo se permite el método POST.' });
  }

  const reportData = req.body;

  if (!reportData || !reportData.folio) {
    return res.status(400).json({ success: false, error: 'Datos de reporte incompletos.' });
  }
  
  try {
    // 1. Prepara el contenido del archivo JSON
    const content = JSON.stringify(reportData, null, 2);
    // 2. Codifica el contenido en Base64 (requerido por la API de GitHub)
    const contentBase64 = Buffer.from(content).toString('base64');

    // 3. Define la ruta y el nombre del archivo. Ejemplo: reports/F-001-20251123-1703.json
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, ''); 
    const time = new Date().toTimeString().slice(0, 5).replace(/:/g, ''); 
    const filePath = `reports/${reportData.folio}-${date}-${time}.json`; 
    
    // 4. Llama a la API de GitHub para crear el archivo (Commit)
    const response = await octokit.repos.createOrUpdateFileContents({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path: filePath,
      message: `[Lumi-Bot] Reporte de Falla #${reportData.folio}`, // Mensaje del commit
      content: contentBase64,
      branch: 'main', 
    });

    // 5. Éxito
    res.status(200).json({
      success: true,
      message: `Reporte ${reportData.folio} guardado en GitHub.`,
      commit: response.data.commit.html_url,
    });

  } catch (error) {
    console.error("Error en la API de GitHub:", error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Fallo al realizar el commit en GitHub.', 
      details: error.message 
    });
  }
};
