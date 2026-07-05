const express = require('express');
const router = express.Router();
const { getDashboardStats, downloadReport, getAllUsers, toggleUserStatus, deleteUser, getFinanceData, handleWithdrawalRequest,getAllCommandsForAdmin, 
  forceCancelCommand, 
  getActiveFlashmans, 
  reassignCommand,getAdminZones, upsertZone, getSystemSettings, updateSystemSettings, deleteZone} = require('../controllers/adminController');
const { protect, authorizeRole } = require('../middlewares/authMiddleware');
const { getDashboardAnalytics, downloadGlobalReport } = require('../controllers/analyticsController');
const { getAdminNotifications } = require('../controllers/notificationController');
// Route GET : Obtenir les statistiques du tableau de bord
router.get('/stats', protect, getDashboardStats);
router.get('/report/download', protect, downloadReport);
// Seul un ADMIN peut accéder à ces données
router.get('/dashboard-stats', protect,authorizeRole ('ADMIN'), getDashboardStats);
// --- ROUTES UTILISATEURS ---
router.get('/users', protect, authorizeRole('ADMIN'), getAllUsers);
router.patch('/users/:id/status', protect, authorizeRole('ADMIN'), toggleUserStatus);
router.delete('/users/:id', protect, authorizeRole('ADMIN'), deleteUser);
// --- ROUTES FINANCE ---
router.get('/finance', protect, authorizeRole('ADMIN'), getFinanceData);
router.post('/finance/withdrawals/:id', protect, authorizeRole('ADMIN'), handleWithdrawalRequest);
router.get('/commands', protect, authorizeRole('ADMIN'), getAllCommandsForAdmin);
router.patch('/commands/:id/cancel', protect, authorizeRole('ADMIN'), forceCancelCommand);
// 👇 NOUVELLES ROUTES DE RÉASSIGNATION 👇
router.get('/flashmans/active', protect, authorizeRole('ADMIN'), getActiveFlashmans);
router.patch('/commands/:id/reassign', protect, authorizeRole('ADMIN'), reassignCommand);
// --- ROUTES SETTINGS & CATALOGUE ---
router.get('/zones', protect, authorizeRole('ADMIN'), getAdminZones);
router.post('/zones', protect, authorizeRole('ADMIN'), upsertZone); // Sert pour création et modif
router.get('/settings', protect, authorizeRole('ADMIN'), getSystemSettings);
router.post('/settings', protect, authorizeRole('ADMIN'), updateSystemSettings);
router.delete('/zones/:id', protect, authorizeRole('ADMIN'), deleteZone);
// --- ROUTES ANALYTICS ---
router.get('/analytics', protect, authorizeRole('ADMIN'), getDashboardAnalytics);
// ...
router.get('/reports/global', protect, authorizeRole('ADMIN'), downloadGlobalReport);
// --- ROUTES NOTIFICATIONS ---
router.get('/notifications', protect, authorizeRole('ADMIN'), getAdminNotifications);
module.exports = router;