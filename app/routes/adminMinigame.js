const express = require('express');
const router = express.Router();
const minigameController = require('../controllers/minigameController');

// Admin routes for minigame management
// The isAdmin middleware should be applied globally in app.js for /admin routes

router.get('/map-data', minigameController.adminGetMapData); // Get all blocks and treasures
router.post('/map/block', minigameController.adminUpdateBlock); // Add or update a block
router.post('/treasure', minigameController.adminAddTreasureBox); // Add a new treasure box
router.delete('/treasure/:treasureId', minigameController.adminRemoveTreasureBox); // Remove a treasure box
router.post('/map/initialize', minigameController.initializeNewMap); // Create the initial map (destroys old if force=true)


module.exports = (io) => {
    // Pass io to controller methods that need it via req.app.get('io')
    return router;
};
