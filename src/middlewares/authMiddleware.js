const jwt = require('jsonwebtoken');

// 1. Le Vigile Principal (Vérifie si la personne a un badge valide)
const authenticateToken = (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_flashkin_temporaire');
      
      // On attache l'ID et le rôle à la requête (très utile pour créer la commande ensuite)
      req.user = decoded;
      
      return next();
    } catch (error) {
      console.error('Erreur de token :', error.message);
      return res.status(401).json({ success: false, message: 'Accès refusé. Token invalide ou expiré.' });
    }
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Accès refusé. Aucun token fourni.' });
  }
};

// Alias pour conserver la compatibilité avec le reste du projet
const protect = authenticateToken;

// 2. Vérifie si l'utilisateur a le bon rôle
const authorizeRole = (...allowedRoles) => {
  return (req, res, next) => {
    // Si l'utilisateur n'est pas connecté ou si son rôle n'est pas dans la liste autorisée
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false, 
        message: "Accès refusé : Vous n'avez pas les permissions nécessaires." 
      });
    }
    next(); // Si tout est bon, on le laisse passer !
  };
};

// On exporte les fonctions avec leurs nouveaux noms ET leurs anciens noms (alias)
module.exports = { 
  authenticateToken, 
  protect, 
  authorizeRole,
  authorize: authorizeRole // 👈 L'astuce magique est ici ! 'authorize' pointe vers 'authorizeRole'
};