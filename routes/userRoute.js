/**
 * User Routes
 * API endpoints for user management
 */

const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// Get page access options (static list)
router.get('/page-access-options', userController.getPageAccessOptions);

// User authentication
router.post('/login', userController.loginUser);

// CRUD operations
router.get('/', userController.getAllUsers);
router.get('/:id', userController.getUserById);
router.post('/', userController.createUser);
router.put('/:id', userController.updateUser);
router.delete('/:id', userController.deleteUser);

module.exports = router;
