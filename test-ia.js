const API_KEY = "AIzaSyAKC2C2DfIlqj1NlCwmgPV7fipiRvwLD1M"; 

async function checkModels() {
  console.log("📡 Interrogation des serveurs Google...");
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
    const data = await response.json();
    
    if (data.models) {
      console.log("\n🟢 VOICI LES MODÈLES EXACTS AUTORISÉS POUR TA CLÉ :");
      data.models.forEach(m => {
        // On n'affiche que les modèles capables de générer du texte
        if (m.supportedGenerationMethods.includes('generateContent')) {
           console.log(`👉 ${m.name.replace('models/', '')}`);
        }
      });
    } else {
      console.log("🔴 Erreur de lecture :", data);
    }
  } catch (error) {
    console.error("🚨 Erreur de connexion :", error);
  }
}

checkModels();