const express = require('express');
const router = express.Router();
const { getProfile, updateProfile, updatePassword, changePassword } = require('../controllers/userController');
const { protect } = require('../middlewares/authMiddleware');

router.get('/profile', protect, getProfile);
router.put('/profile', protect, updateProfile);
router.put('/password', protect, updatePassword);
router.put('/change-password', protect, changePassword);
module.exports = router;