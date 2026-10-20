const express = require('express');
const authController = require('../controllers/authController');
const { autenticarToken } = require('../middlewares/authMiddleware');

const router = express.Router();

router.post('/login', authController.login);
router.post('/register', authController.register);
router.post('/recuperar-password', authController.recuperarPassword);
router.post('/reset-password', authController.resetPassword);
router.get('/me', autenticarToken, authController.me);

module.exports = router;
