const express = require('express');
const router = express.Router();
const minigameController = require('../controllers/minigameController');

// Middleware to check if user is authenticated and part of a group
// This is a simplified version. In a real app, this would be more robust.
async function isUserAndInGroup(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ message: 'ابتدا باید وارد شوید.' });
    }
    // Note: We might not need to check group membership here for all routes,
    // as controller functions will fetch group details.
    // However, for actions that strictly require being in a group, it's good.
    // For now, basic session check is enough, controller handles group logic.
    next();
}

// Player routes
router.post('/connect', isUserAndInGroup, minigameController.connectPlayer);
router.post('/disconnect', isUserAndInGroup, minigameController.disconnectPlayer); // Or can be a socket event
router.post('/move', isUserAndInGroup, minigameController.movePlayer);
router.post('/fuel/buy', isUserAndInGroup, minigameController.buyFuel);
router.post('/treasure/open', isUserAndInGroup, minigameController.openTreasureBox);
router.get('/state', isUserAndInGroup, minigameController.getGameState);
router.get('/map/overview', isUserAndInGroup, minigameController.getInitialMapOverview); // For loading screen

module.exports = (io) => {
    // If controller needs to emit to all, it can use io directly.
    // If it needs to emit to specific socket, socket events are better.
    // Pass io to controller methods that need it via req.app.get('io')
    return router;
};
