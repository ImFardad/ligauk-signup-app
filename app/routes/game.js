const express = require('express');
const router = express.Router();
const gameController = require('../controllers/GameController');
const ammunitionController = require('../controllers/AmmunitionController');

// Middleware to pass io to controllers that need it for socket emissions
// This is an alternative to passing it when setting up routes in app.js
// router.use((req, res, next) => {
//     req.io = req.app.get('io');
//     next();
// });


// Map routes
// Get basic info of the current active map (or the latest active one if multiple somehow exist)
router.get('/map/active', (req, res, next) => { req.io = req.app.get('io'); next(); }, gameController.getActiveMap);
// Get full state of a specific map
router.get('/map/:mapId/state', (req, res, next) => { req.io = req.app.get('io'); next(); }, gameController.getMapState);
// Buy a tile
router.post('/tile/buy', (req, res, next) => { req.io = req.app.get('io'); next(); }, gameController.buyTile);
// Upgrade a wall
router.post('/wall/upgrade', (req, res, next) => { req.io = req.app.get('io'); next(); }, gameController.upgradeWall);
// Deploy ammunition to a wall
router.post('/ammunition/deploy', (req, res, next) => { req.io = req.app.get('io'); next(); }, gameController.deployAmmunition);

// Ammunition Store routes
// List visible ammunitions for sale
router.get('/ammunition/store', (req, res, next) => { req.io = req.app.get('io'); next(); }, ammunitionController.listAmmunitions);
// Buy ammunition
router.post('/ammunition/buy', (req, res, next) => { req.io = req.app.get('io'); next(); }, ammunitionController.buyAmmunition);
// Get group's current ammunition inventory and score
router.get('/ammunition/inventory', (req, res, next) => { req.io = req.app.get('io'); next(); }, ammunitionController.getGroupInventory);

module.exports = router;
