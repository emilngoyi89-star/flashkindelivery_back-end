const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { initWakeUpCron } = require('./services/cronService');

const productRoutes = require('./routes/productRoutes');
// Initialisation de l'application Express
const app = express();

// Démarre la surveillance automatique juste après le démarrage d'Express
initWakeUpCron();
// 🛡️ Middlewares globaux de sécurité et de formatage
app.use(helmet()); // Protège les en-têtes HTTP

// Autoriser le Frontend à communiquer avec le Backend (CORS)
app.use(cors({
  origin: 'http://localhost:5173', // L'adresse exacte de ton Frontend React
  credentials: true
}));

// On augmente la limite à 10 Mo pour autoriser l'upload des photos de profil en Base64
app.use(express.json({ limit: '10mb' })); 
app.use(express.urlencoded({ limit: '10mb', extended: true }));
// 🩺 Route de vérification (Health Check)
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    success: true, 
    message: 'Flashkin Delivery API is running 🚀' 
  });
});

// 🛣️ Importation des routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/commands', require('./routes/commandRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/drivers', require('./routes/driverRoutes'));
app.use('/api/zones', require('./routes/zoneRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/ai', require('./routes/aiRoutes'));
app.use('/api/balance', require('./routes/balanceRoutes'));
app.use('/api/reviews', require('./routes/reviewRoutes'));

// 👉 NOUVELLE ROUTE WALLET (Livreurs)
app.use('/api/wallet', require('./routes/walletRoutes'));
app.use('/api/products',require('./routes/productRoutes'));  
// ❌ Middleware pour gérer les routes inexistantes (404)
app.use((req, res, next) => {
  res.status(404).json({ success: false, message: 'Route introuvable' });
});

// TRÈS IMPORTANT : On exporte "app" pour que server.js puisse utiliser la fonction .listen()
module.exports = app;