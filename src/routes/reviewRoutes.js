const express = require('express');
const router = express.Router();
const { submitReview } = require('../controllers/reviewController');
const { protect, authorize } = require('../middlewares/authMiddleware'); 

// POST /api/reviews/:commandId
router.post('/:commandId', protect, authorize('PARTNER'), submitReview);

module.exports = router;