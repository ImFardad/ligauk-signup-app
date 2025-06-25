const { MinigamePlayer, MinigameMapBlock, MinigameTreasureBox, Group, GroupMember, sequelize } = require('../models');
const { Op } = require('sequelize');
// const redisClient = require('../utils/redis'); // TODO: Setup a shared redis client if not already available

// Game Constants
const MINIGAME_CONSTANTS = {
    // MAP_RADIUS: 100, // Max distance from 0,0 for map generation - REPLACED
    MAP_SIZE: 80, // Side length of the square map
    VIEW_RADIUS: 10, // Player's line of sight in blocks
    FUEL_PER_MOVE: 1,
    INITIAL_FUEL: 20,
    FUEL_PURCHASE_COST_PER_UNIT: 10, // Score points per unit of fuel
    MAX_DISCOUNT_PERCENT: 0.40, // 40%
    FUEL_UNITS_FOR_MAX_DISCOUNT: 100,
    SPAWN_EDGE_OFFSET: 5, // How far from the absolute edge (MAP_RADIUS) players spawn
    MAX_SPAWN_SEARCH_RADIUS: 20, // Search this radius around last spawn for new spawn point
    TREASURE_BOX_DEFAULT_PRIZE_MIN: 5,
    TREASURE_BOX_DEFAULT_PRIZE_MAX: 50,
};

// --- Helper Functions ---

async function getGroupIdForUser(userId) {
    if (!userId) return null;
    const groupMember = await GroupMember.findOne({ where: { userId } });
    return groupMember ? groupMember.groupId : null;
}

function calculateDiscount(quantity) {
    if (quantity <= 0) return 0;
    if (quantity >= MINIGAME_CONSTANTS.FUEL_UNITS_FOR_MAX_DISCOUNT) {
        return MINIGAME_CONSTANTS.MAX_DISCOUNT_PERCENT;
    }
    // Linear discount scaling
    const discount = (quantity / MINIGAME_CONSTANTS.FUEL_UNITS_FOR_MAX_DISCOUNT) * MINIGAME_CONSTANTS.MAX_DISCOUNT_PERCENT;
    return parseFloat(discount.toFixed(4)); // Max 4 decimal places for discount factor
}

async function getPlayerState(groupId, io) {
    const player = await MinigamePlayer.findOne({ where: { groupId } });
    if (!player || !player.isConnected) {
        return { error: 'Player not connected or not found.' };
    }

    const { positionX, positionY, positionZ, fuel } = player;
    const viewRadius = MINIGAME_CONSTANTS.VIEW_RADIUS;

    const visibleBlocks = await MinigameMapBlock.findAll({
        where: {
            x: { [Op.between]: [positionX - viewRadius, positionX + viewRadius] },
            y: { [Op.between]: [positionY - viewRadius, positionY + viewRadius] },
            // z is also a factor, but for a flat map or small height variations, x,y is primary
        }
    });

    const visibleTreasures = await MinigameTreasureBox.findAll({
        where: {
            isOpened: false,
            positionX: { [Op.between]: [positionX - viewRadius, positionX + viewRadius] },
            positionY: { [Op.between]: [positionY - viewRadius, positionY + viewRadius] },
        }
    });

    const otherPlayers = await MinigamePlayer.findAll({
        where: {
            groupId: { [Op.ne]: groupId },
            isConnected: true,
            positionX: { [Op.between]: [positionX - viewRadius, positionX + viewRadius] },
            positionY: { [Op.between]: [positionY - viewRadius, positionY + viewRadius] },
        },
        include: [{ model: Group, as: 'group', attributes: ['name'] }]
    });

    // Notify other players if they can see this player now or can no longer see them
    // This logic can be complex and might be better handled via proximity updates in movePlayer

    return {
        position: { x: positionX, y: positionY, z: positionZ },
        fuel,
        map: visibleBlocks.map(b => ({ x: b.x, y: b.y, z: b.z, type: b.type })),
        treasures: visibleTreasures.map(t => ({ id: t.id, x: t.positionX, y: t.positionY, z: t.positionZ })),
        otherPlayers: otherPlayers.map(p => ({
            groupId: p.groupId,
            groupName: p.group.name,
            position: { x: p.positionX, y: p.positionY, z: p.positionZ }
        }))
    };
}

// --- Socket Emitters (to be called from controllers) ---
function emitPlayerUpdate(io, groupId, playerData) {
    // Emits to the specific group's room, assuming socket joins a room like `minigame-group-${groupId}`
    io.to(`minigame-group-${groupId}`).emit('minigame:playerUpdate', playerData);
}

function emitGroupNotification(io, groupId, message, type = 'info') {
    io.to(`minigame-group-${groupId}`).emit('minigame:notification', { type, message });
}

function broadcastToVisiblePlayers(io, currentPlayerGroupId, currentPosition, eventName, eventData) {
    // This function would find players who can see `currentPosition` and emit `eventName` to them.
    // For simplicity, this might be done by emitting to a general minigame room, and client filters,
    // or by querying players within VIEW_RADIUS of currentPosition.
    // Example: io.to('minigame-active-players').emit(eventName, eventData);
    // More targeted:
    const viewRadius = MINIGAME_CONSTANTS.VIEW_RADIUS;
    MinigamePlayer.findAll({
        where: {
            isConnected: true,
            groupId: { [Op.ne]: currentPlayerGroupId },
            positionX: { [Op.between]: [currentPosition.x - viewRadius, currentPosition.x + viewRadius] },
            positionY: { [Op.between]: [currentPosition.y - viewRadius, currentPosition.y + viewRadius] },
        }
    }).then(players => {
        players.forEach(p => {
            io.to(`minigame-group-${p.groupId}`).emit(eventName, eventData);
        });
    });
}


// --- Player Route Handlers ---

exports.connectPlayer = async (req, res) => {
    const userId = req.session.userId;
    const io = req.app.get('io');
    let groupId;

    try {
        groupId = await getGroupIdForUser(userId);
        if (!groupId) {
            return res.status(403).json({ message: 'شما عضو هیچ گروهی نیستید.' });
        }

        // Check if another member of the same group is already connected
        const existingConnection = await MinigamePlayer.findOne({ where: { groupId, isConnected: true } });
        if (existingConnection) {
            // A simple check; ideally, this would use socket IDs or a more robust session check if possible
            // For now, we assume one player model per group. If another user from the group tries to connect,
            // we might deny or disconnect the old one. For this logic, we deny.
            // Note: This doesn't prevent the same user opening multiple tabs if not handled client-side or via socket uniqueness.
             return res.status(409).json({ message: 'عضو دیگری از گروه شما در حال حاضر به بازی متصل است.' });
        }


        let player = await MinigamePlayer.findOne({ where: { groupId } });
        let spawnPosition = { x: 0, y: 0, z: 0 };

        if (!player) {
            // First time connection for this group, find a valid spawn point on land
            let validSpawnFound = false;
            let attempts = 0;
            const maxSpawnAttempts = 10; // Max attempts to find a spawn point

            while(!validSpawnFound && attempts < maxSpawnAttempts) {
                attempts++;
                let candidateX, candidateY;
                const edgeOffset = MINIGAME_CONSTANTS.SPAWN_EDGE_OFFSET;
                const halfMapSize = Math.floor(MINIGAME_CONSTANTS.MAP_SIZE / 2);
                const landEdge = halfMapSize - edgeOffset; // Spawn inside the land, away from water border

                // Pick a random side (0: +X, 1: -X, 2: +Y, 3: -Y)
                const side = Math.floor(Math.random() * 4);
                switch(side) {
                    case 0: // Right edge (+X)
                        candidateX = landEdge -1; // -1 because map loop is < HALF_MAP_SIDE
                        candidateY = Math.floor(Math.random() * (2 * landEdge)) - landEdge;
                        break;
                    case 1: // Left edge (-X)
                        candidateX = -landEdge;
                        candidateY = Math.floor(Math.random() * (2 * landEdge)) - landEdge;
                        break;
                    case 2: // Top edge (+Y)
                        candidateY = landEdge -1;
                        candidateX = Math.floor(Math.random() * (2 * landEdge)) - landEdge;
                        break;
                    case 3: // Bottom edge (-Y)
                        candidateY = -landEdge;
                        candidateX = Math.floor(Math.random() * (2 * landEdge)) - landEdge;
                        break;
                }

                const groundBlocks = await MinigameMapBlock.findAll({
                    where: { x: candidateX, y: candidateY, isWalkable: true },
                    order: [['z', 'DESC']]
                });

                if (groundBlocks.length > 0) {
                    spawnPosition = { x: groundBlocks[0].x, y: groundBlocks[0].y, z: groundBlocks[0].z };
                    validSpawnFound = true;
                }
            }

            if (!validSpawnFound) {
                console.warn(`Could not find valid edge spawn for group ${groupId}, attempting center spawn on square map.`);
                const centerSearchRadius = 5;
                const centerBlocks = await MinigameMapBlock.findAll({
                    where: {
                        x: { [Op.between]: [-centerSearchRadius, centerSearchRadius] },
                        y: { [Op.between]: [-centerSearchRadius, centerSearchRadius] },
                        isWalkable: true
                    },
                    order: [['z', 'DESC']],
                    limit: 1
                });
                if (centerBlocks.length > 0) {
                    spawnPosition = { x: centerBlocks[0].x, y: centerBlocks[0].y, z: centerBlocks[0].z };
                } else {
                    console.error(`CRITICAL: No walkable block found anywhere for group ${groupId} on square map. Defaulting to 0,0,0.`);
                }
            }

            player = await MinigamePlayer.create({
                groupId,
                positionX: spawnPosition.x,
                positionY: spawnPosition.y,
                positionZ: spawnPosition.z,
                fuel: MINIGAME_CONSTANTS.INITIAL_FUEL,
                isConnected: true,
                lastSeen: new Date(),
            });
        } else {
            // For existing players reconnecting, ensure their last position is still valid.
            // If not, they might need to be respawned. For now, trust last position.
            spawnPosition = { x: player.positionX, y: player.positionY, z: player.positionZ };
            player.isConnected = true;
            player.lastSeen = new Date();
            await player.save();
        }

        // Socket management: Client should emit 'minigame:join' with groupId
        // Server on 'minigame:join': socket.join(`minigame-group-${groupId}`);

        const state = await getPlayerState(groupId, io);
        res.json({ success: true, message: 'به مینی‌گیم متصل شدید.', state });

    } catch (error) {
        console.error('Error connecting player to minigame:', error);
        res.status(500).json({ message: error.message || 'خطا در اتصال به مینی‌گیم.' });
    }
};

exports.disconnectPlayer = async (req, res) => {
    const userId = req.session.userId;
    const io = req.app.get('io');
    let groupId;

    try {
        groupId = await getGroupIdForUser(userId);
        if (!groupId) {
            // Should not happen if isUser middleware is effective
            return res.status(403).json({ message: 'کاربر نامعتبر است.' });
        }

        const player = await MinigamePlayer.findOne({ where: { groupId } });
        if (player) {
            player.isConnected = false;
            await player.save();

            // Socket management: Client should emit 'minigame:leave' with groupId
            // Server on 'minigame:leave': socket.leave(`minigame-group-${groupId}`);
            // Notify other players that this player has disconnected
            broadcastToVisiblePlayers(io, groupId,
                { x: player.positionX, y: player.positionY, z: player.positionZ },
                'minigame:playerLeft',
                { groupId }
            );
        }
        res.json({ success: true, message: 'اتصال شما از مینی‌گیم قطع شد.' });
    } catch (error) {
        console.error('Error disconnecting player from minigame:', error);
        res.status(500).json({ message: 'خطا در قطع اتصال از مینی‌گیم.' });
    }
};


exports.movePlayer = async (req, res) => {
    const userId = req.session.userId;
    const { direction } = req.body; // 'forward', 'backward', 'left', 'right'
    const cameraAngle = parseInt(req.body.cameraAngle) || 0; // 0, 90, 180, 270
    const io = req.app.get('io');
    let groupId;

    try {
        groupId = await getGroupIdForUser(userId);
        if (!groupId) return res.status(403).json({ message: 'شما عضو هیچ گروهی نیستید.' });

        const player = await MinigamePlayer.findOne({ where: { groupId, isConnected: true } });
        if (!player) return res.status(404).json({ message: 'بازیکن متصل نیست یا یافت نشد.' });

        if (player.fuel < MINIGAME_CONSTANTS.FUEL_PER_MOVE) {
            emitGroupNotification(io, groupId, 'سوخت شما برای حرکت کافی نیست!', 'error');
            return res.status(400).json({ message: 'سوخت کافی برای حرکت ندارید.' });
        }

        let dx = 0, dy = 0;
        // Adjust dx, dy based on direction and cameraAngle
        // cameraAngle: 0 (North), 90 (East), 180 (South), 270 (West)
        // Player's "forward" is relative to camera.
        if (direction === 'forward') {
            if (cameraAngle === 0) dy = 1;   // Moving North (positive Y)
            else if (cameraAngle === 90) dx = 1;  // Moving East (positive X)
            else if (cameraAngle === 180) dy = -1; // Moving South (negative Y)
            else if (cameraAngle === 270) dx = -1; // Moving West (negative X)
        } else if (direction === 'backward') {
            if (cameraAngle === 0) dy = -1;
            else if (cameraAngle === 90) dx = -1;
            else if (cameraAngle === 180) dy = 1;
            else if (cameraAngle === 270) dx = 1;
        } else if (direction === 'left') {
            if (cameraAngle === 0) dx = -1;
            else if (cameraAngle === 90) dy = 1;
            else if (cameraAngle === 180) dx = 1;
            else if (cameraAngle === 270) dy = -1;
        } else if (direction === 'right') {
            if (cameraAngle === 0) dx = 1;
            else if (cameraAngle === 90) dy = -1;
            else if (cameraAngle === 180) dx = -1;
            else if (cameraAngle === 270) dy = 1;
        } else {
            return res.status(400).json({ message: 'جهت حرکت نامعتبر است.' });
        }

        const targetX = player.positionX + dx;
        const targetY = player.positionY + dy;
        // For now, Z remains the same, assuming flat movement or handled by client/map data
        // TODO: Implement Z-axis check for hills/valleys/bridges
        const targetZ = player.positionZ;

        // Check map boundaries (square map)
        const halfMapSize = Math.floor(MINIGAME_CONSTANTS.MAP_SIZE / 2);
        if (targetX >= halfMapSize || targetX < -halfMapSize || targetY >= halfMapSize || targetY < -halfMapSize) {
            emitGroupNotification(io, groupId, 'نمی‌توانید از محدوده نقشه خارج شوید!', 'warn');
            return res.status(400).json({ message: 'رسیدن به لبه نقشه مربعی.' });
        }

        // Check if target block is walkable
        const targetBlock = await MinigameMapBlock.findOne({ where: { x: targetX, y: targetY, z: targetZ } });
        if (!targetBlock || !targetBlock.isWalkable) {
            emitGroupNotification(io, groupId, 'مسیر حرکت مسدود است.', 'warn');
            return res.status(400).json({ message: 'نمی‌توانید به این خانه حرکت کنید (مسدود یا غیرقابل عبور).' });
        }

        const oldPosition = { x: player.positionX, y: player.positionY, z: player.positionZ };

        player.positionX = targetX;
        player.positionY = targetY;
        player.positionZ = targetZ; // Update Z if map has height
        player.fuel -= MINIGAME_CONSTANTS.FUEL_PER_MOVE;
        player.lastSeen = new Date();
        await player.save();

        const updatedPlayerState = await getPlayerState(groupId, io);
        emitPlayerUpdate(io, groupId, updatedPlayerState);

        // Notify other players about this player's movement
        const group = await Group.findByPk(groupId, { attributes: ['name'] });
        broadcastToVisiblePlayers(io, groupId, {x: targetX, y: targetY, z: targetZ}, 'minigame:playerMoved', {
            groupId,
            groupName: group.name,
            newPosition: { x: targetX, y: targetY, z: targetZ },
            oldPosition: oldPosition
        });


        res.json({ success: true, message: 'حرکت انجام شد.', newState: updatedPlayerState });

    } catch (error) {
        console.error('Error moving player:', error);
        res.status(500).json({ message: error.message || 'خطا در انجام حرکت.' });
    }
};

exports.buyFuel = async (req, res) => {
    const userId = req.session.userId;
    const { amount } = req.body;
    const io = req.app.get('io');
    let groupId;

    const fuelAmount = parseInt(amount);
    if (isNaN(fuelAmount) || fuelAmount <= 0) {
        return res.status(400).json({ message: 'مقدار سوخت باید عدد مثبت باشد.' });
    }

    const t = await sequelize.transaction();
    try {
        groupId = await getGroupIdForUser(userId);
        if (!groupId) {
            await t.rollback();
            return res.status(403).json({ message: 'شما عضو هیچ گروهی نیستید.' });
        }

        const player = await MinigamePlayer.findOne({ where: { groupId }, transaction: t });
        const group = await Group.findByPk(groupId, { transaction: t, lock: t.LOCK.UPDATE });

        if (!player || !group) {
            await t.rollback();
            return res.status(404).json({ message: 'بازیکن یا گروه یافت نشد.' });
        }

        const discount = calculateDiscount(fuelAmount);
        const pricePerUnit = MINIGAME_CONSTANTS.FUEL_PURCHASE_COST_PER_UNIT * (1 - discount);
        const totalCost = Math.round(fuelAmount * pricePerUnit); // Use Math.round for integer scores

        if (group.score < totalCost) {
            await t.rollback();
            emitGroupNotification(io, groupId, 'امتیاز گروه شما برای خرید این مقدار سوخت کافی نیست!', 'error');
            return res.status(400).json({ message: `امتیاز کافی نیست. نیاز به ${totalCost} امتیاز.` });
        }

        group.score -= totalCost;
        player.fuel += fuelAmount;
        player.lastSeen = new Date();

        await group.save({ transaction: t });
        await player.save({ transaction: t });
        await t.commit();

        const updatedPlayerState = await getPlayerState(groupId, io);
        emitPlayerUpdate(io, groupId, updatedPlayerState);
        emitGroupNotification(io, groupId, `${fuelAmount} واحد سوخت با موفقیت خریداری شد. هزینه: ${totalCost} امتیاز.`, 'success');
        io.emit('leaderboardUpdate'); // Global event if group scores affect leaderboard

        res.json({ success: true, message: 'سوخت با موفقیت خریداری شد.', newFuel: player.fuel, newScore: group.score, cost: totalCost });

    } catch (error) {
        await t.rollback();
        console.error('Error buying fuel:', error);
        res.status(500).json({ message: error.message || 'خطا در خرید سوخت.' });
    }
};

exports.openTreasureBox = async (req, res) => {
    const userId = req.session.userId;
    const { treasureId } = req.body;
    const io = req.app.get('io');
    let groupId;

    if (!treasureId) {
        return res.status(400).json({ message: 'شناسه جعبه جایزه الزامی است.' });
    }

    const t = await sequelize.transaction();
    try {
        groupId = await getGroupIdForUser(userId);
        if (!groupId) {
            await t.rollback();
            return res.status(403).json({ message: 'شما عضو هیچ گروهی نیستید.' });
        }

        const player = await MinigamePlayer.findOne({ where: { groupId, isConnected: true }, transaction: t });
        if (!player) {
            await t.rollback();
            return res.status(404).json({ message: 'بازیکن متصل نیست یا یافت نشد.' });
        }

        const treasureBox = await MinigameTreasureBox.findByPk(treasureId, { transaction: t, lock: t.LOCK.UPDATE });

        if (!treasureBox) {
            await t.rollback();
            return res.status(404).json({ message: 'جعبه جایزه یافت نشد.' });
        }
        if (treasureBox.isOpened) {
            await t.rollback();
            emitGroupNotification(io, groupId, 'این جعبه قبلاً باز شده است.', 'warn');
            return res.status(400).json({ message: 'این جعبه قبلاً باز شده است.' });
        }

        // Check proximity (player must be on the same block as the treasure)
        if (player.positionX !== treasureBox.positionX || player.positionY !== treasureBox.positionY || player.positionZ !== treasureBox.positionZ) {
            await t.rollback();
            emitGroupNotification(io, groupId, 'برای باز کردن جعبه باید روی آن باشید.', 'warn');
            return res.status(400).json({ message: 'برای باز کردن جعبه باید روی آن باشید.' });
        }

        let message = '';
        if (treasureBox.prizeType === 'fuel') {
            player.fuel += treasureBox.prizeAmount;
            message = `شما ${treasureBox.prizeAmount} واحد سوخت پیدا کردید!`;
        } else if (treasureBox.prizeType === 'score') {
            const group = await Group.findByPk(groupId, { transaction: t, lock: t.LOCK.UPDATE });
            group.score += treasureBox.prizeAmount;
            await group.save({ transaction: t });
            io.emit('leaderboardUpdate');
            message = `گروه شما ${treasureBox.prizeAmount} امتیاز کسب کرد!`;
        }

        treasureBox.isOpened = true;
        // treasureBox.openedByGroupId = groupId; // If tracking who opened it
        await treasureBox.save({ transaction: t });
        await player.save({ transaction: t }); // Save player if fuel changed
        await t.commit();

        const updatedPlayerState = await getPlayerState(groupId, io);
        emitPlayerUpdate(io, groupId, updatedPlayerState);
        emitGroupNotification(io, groupId, message, 'success');

        // Notify all players that a treasure box was opened (and removed from their view)
        io.emit('minigame:treasureOpened', { treasureId, position: {x: treasureBox.positionX, y: treasureBox.positionY, z: treasureBox.positionZ} });


        res.json({ success: true, message, prizeType: treasureBox.prizeType, prizeAmount: treasureBox.prizeAmount, newState: updatedPlayerState });

    } catch (error) {
        await t.rollback();
        console.error('Error opening treasure box:', error);
        res.status(500).json({ message: error.message || 'خطا در باز کردن جعبه جایزه.' });
    }
};

exports.getGameState = async (req, res) => {
    const userId = req.session.userId;
    const io = req.app.get('io'); // Not strictly needed for GET but good for consistency
    let groupId;
    try {
        groupId = await getGroupIdForUser(userId);
        if (!groupId) return res.status(403).json({ message: 'شما عضو هیچ گروهی نیستید.' });

        const state = await getPlayerState(groupId, io);
        if (state.error) return res.status(404).json({ message: state.error });

        res.json(state);
    } catch (error) {
        console.error('Error getting game state:', error);
        res.status(500).json({ message: 'خطا در دریافت وضعیت بازی.' });
    }
};

// For loading screen - a simplified overview, maybe just the general map shape/biomes without details
exports.getInitialMapOverview = async (req, res) => {
    try {
        // This could return a pre-generated image path, or a very coarse grid of biome types
        // For now, just return dimensions and a message
        const mapData = await MinigameMapBlock.findAll({
            attributes: ['x', 'y', 'z', 'type'],
            // Limit for performance if map is huge, or send aggregated data
            // limit: 5000
        });
         res.json({
            // mapRadius: MINIGAME_CONSTANTS.MAP_RADIUS,
            // description: "نمای کلی جزیره مینی‌گیم",
            blocks: mapData.map(b => ({ x: b.x, y: b.y, z: b.z, type: b.type }))
            // biomes: [{name: 'Forest', color: '#228B22'}, {name: 'Desert', color: '#F4A460'}] // Example
        });
    } catch (error) {
        console.error('Error getting initial map overview:', error);
        res.status(500).json({ message: 'خطا در دریافت نمای کلی نقشه.' });
    }
};


// --- Admin Route Handlers ---
exports.adminGetMapData = async (req, res) => {
    try {
        // TEMPORARY: Limit the number of blocks for testing due to large data volume
        const blocks = await MinigameMapBlock.findAll({
            order: [['x', 'ASC'], ['y', 'ASC'], ['z', 'ASC']],
            limit: 1000 // Limit to 1000 blocks for now
        });
        const treasures = await MinigameTreasureBox.findAll({ order: [['id', 'ASC']] });
        console.log(`Admin: Sending ${blocks.length} blocks and ${treasures.length} treasures to admin panel.`);
        res.json({ blocks, treasures });
    } catch (error) {
        console.error("Admin: Error fetching map data:", error);
        res.status(500).json({ message: "خطا در دریافت اطلاعات نقشه برای ادمین." });
    }
};

exports.adminUpdateBlock = async (req, res) => {
    const { x, y, z, type, isWalkable } = req.body;
    const io = req.app.get('io');
    try {
        if (x == null || y == null || z == null || !type) {
            return res.status(400).json({ message: " مختصات کامل و نوع بلاک الزامی است." });
        }
        const walkability = isWalkable !== undefined ? Boolean(isWalkable) : true;

        const [block, created] = await MinigameMapBlock.upsert(
            { x: parseInt(x), y: parseInt(y), z: parseInt(z), type, isWalkable: walkability },
            { returning: true }
        );

        // Notify all connected minigame players about the map change
        io.emit('minigame:mapBlockUpdated', { x: block.x, y: block.y, z: block.z, type: block.type, isWalkable: block.isWalkable });

        res.json({ success: true, message: `بلاک در موقعیت (${x},${y},${z}) ${created ? 'ایجاد' : 'آپدیت'} شد.`, block });
    } catch (error) {
        console.error("Admin: Error updating/creating block:", error);
        res.status(500).json({ message: "خطا در به‌روزرسانی بلاک." });
    }
};

exports.adminAddTreasureBox = async (req, res) => {
    const { positionX, positionY, positionZ, prizeType, prizeAmount } = req.body;
    const io = req.app.get('io');
    try {
        if (positionX == null || positionY == null || positionZ == null || !prizeType || prizeAmount == null) {
            return res.status(400).json({ message: " مختصات کامل، نوع جایزه و مقدار جایزه الزامی است." });
        }
        if (parseInt(prizeAmount) <= 0) return res.status(400).json({ message: "مقدار جایزه باید مثبت باشد." });
        if (!['fuel', 'score'].includes(prizeType)) return res.status(400).json({ message: "نوع جایزه نامعتبر است."});


        const existingBox = await MinigameTreasureBox.findOne({ where: { positionX, positionY, positionZ } });
        if (existingBox && !existingBox.isOpened) {
            return res.status(400).json({ message: "یک جعبه باز نشده در این مختصات وجود دارد." });
        }
        // If an opened box exists, we can allow creating a new one (it will effectively replace it or be a new instance)
        if (existingBox && existingBox.isOpened) {
            await existingBox.destroy(); // Optional: remove old opened box before adding new one
        }


        const newTreasure = await MinigameTreasureBox.create({
            positionX: parseInt(positionX),
            positionY: parseInt(positionY),
            positionZ: parseInt(positionZ),
            prizeType,
            prizeAmount: parseInt(prizeAmount),
            isOpened: false
        });

        // Notify players about new treasure
        io.emit('minigame:treasureAdded', { id: newTreasure.id, x: newTreasure.positionX, y: newTreasure.positionY, z: newTreasure.positionZ });

        res.json({ success: true, message: 'جعبه جایزه با موفقیت اضافه شد.', treasureBox: newTreasure });
    } catch (error) {
        console.error("Admin: Error adding treasure box:", error);
        if (error.name === 'SequelizeUniqueConstraintError') {
             return res.status(400).json({ message: "خطا: یک جعبه جایزه از قبل در این مختصات وجود دارد." });
        }
        res.status(500).json({ message: "خطا در افزودن جعبه جایزه." });
    }
};

exports.adminRemoveTreasureBox = async (req, res) => {
    const { treasureId } = req.params;
    const io = req.app.get('io');
    try {
        const treasure = await MinigameTreasureBox.findByPk(treasureId);
        if (!treasure) {
            return res.status(404).json({ message: "جعبه جایزه یافت نشد." });
        }
        const position = {x: treasure.positionX, y: treasure.positionY, z: treasure.positionZ};
        await treasure.destroy();

        // Notify players about removed treasure
        io.emit('minigame:treasureRemoved', { treasureId, position });

        res.json({ success: true, message: 'جعبه جایزه با موفقیت حذف شد.' });
    } catch (error) {
        console.error("Admin: Error removing treasure box:", error);
        res.status(500).json({ message: "خطا در حذف جعبه جایزه." });
    }
};

// TODO: Add function for initial map generation if MinigameMapBlock is empty.
// This function would be called once, perhaps on server start or via an admin action.
// It should create a variety of biomes, structures, etc.
exports.initializeNewMap = async (req, res) => {
    const MAP_SIDE_LENGTH = MINIGAME_CONSTANTS.MAP_SIZE;
    const HALF_MAP_SIDE = Math.floor(MAP_SIDE_LENGTH / 2);
    const CHUNK_SIZE = 20; // Process in larger chunks if possible, or adjust based on performance

    try {
        const existingBlocksCount = await MinigameMapBlock.count();
        const forceOverwrite = req && req.query && req.query.force === 'true';

        if (existingBlocksCount > 0 && !forceOverwrite) {
            if (res) {
                return res.status(400).json({ message: "نقشه قبلاً ساخته شده است. برای بازسازی از پارامتر force=true استفاده کنید." });
            }
            console.log("Map already exists and force is not true. Skipping regeneration.");
            return;
        }

        if (forceOverwrite) {
            await MinigameMapBlock.destroy({ where: {}, truncate: true });
            await MinigameTreasureBox.destroy({ where: {}, truncate: true });
            console.log("Admin: Forced map and treasure regeneration. Old data cleared.");
        }

        console.log(`Admin: Starting initial square map generation (Size: ${MAP_SIDE_LENGTH}x${MAP_SIDE_LENGTH})...`);
        const blocksToCreate = [];

        // Create a square map with a border of water
        const waterBorder = 2; // How many blocks of water around the land
        const landStart = -HALF_MAP_SIDE + waterBorder;
        const landEnd = HALF_MAP_SIDE - waterBorder -1; // -1 because loop is <=

        for (let x = -HALF_MAP_SIDE; x < HALF_MAP_SIDE; x++) { // Iterate up to, but not including, HALF_MAP_SIDE
            for (let y = -HALF_MAP_SIDE; y < HALF_MAP_SIDE; y++) {
                let blockType = 'grass'; // Default to grass
                let isWalkable = true;
                let z = 0;

                // Determine if it's a water border or land
                if (x < landStart || x > landEnd || y < landStart || y > landEnd) {
                    blockType = 'water';
                    isWalkable = false;
                    z = 0; // Water at base level
                } else {
                    // Land area - can add more biome logic here later if needed
                    // Example: some random hills
                    if (Math.random() < 0.05) { // 5% chance of a small hill
                        z = 1;
                    }
                    // Example: some tree trunks (make them unwalkable)
                    if (Math.random() < 0.02) { // 2% chance of a tree trunk
                        blockType = 'tree_trunk';
                        z = Math.floor(Math.random() * 2) + 1; // Tree height 1 or 2
                        isWalkable = false;
                    }
                }

                blocksToCreate.push({ x, y, z, type: blockType, isWalkable });

                if (blockType === 'tree_trunk' && z > 0) {
                    // Add leaves on top of tree trunks
                    blocksToCreate.push({ x, y, z: z + 1, type: 'leaves', isWalkable: false });
                    if (z > 1) { // Taller trees get more leaves
                         blocksToCreate.push({ x, y, z: z + 2, type: 'leaves', isWalkable: false });
                    }
                }
            }
        }

        // For a square map, river/bridge logic might need adjustment or simplification.
        // Let's skip complex rivers/bridges for the first square version for simplicity.

        // Batch insert blocks
        const totalBlocks = blocksToCreate.length;
        for (let i = 0; i < totalBlocks; i += CHUNK_SIZE * CHUNK_SIZE) {
            const chunk = blocksToCreate.slice(i, i + (CHUNK_SIZE * CHUNK_SIZE));
            if (chunk.length > 0) {
                 await MinigameMapBlock.bulkCreate(chunk, { ignoreDuplicates: true });
            }
        }

        console.log(`Admin: ${totalBlocks} map blocks generated for square map.`);

        // Add some random treasure boxes on walkable land
        const treasuresToCreate = [];
        const numberOfTreasures = Math.floor((MAP_SIDE_LENGTH * MAP_SIDE_LENGTH) / 200); // Adjust density
        for (let i = 0; i < numberOfTreasures; i++) {
            const randX = Math.floor(Math.random() * (landEnd - landStart + 1)) + landStart;
            const randY = Math.floor(Math.random() * (landEnd - landStart + 1)) + landStart;

            // Find a walkable block at this x,y to place treasure
            const groundBlock = blocksToCreate.find(b => b.x === randX && b.y === randY && b.isWalkable && b.type !== 'tree_trunk' && b.type !== 'leaves');
            if (groundBlock) {
                treasuresToCreate.push({
                    positionX: randX,
                    positionY: randY,
                    positionZ: groundBlock.z, // Place on the ground block's z
                    prizeType: Math.random() > 0.5 ? 'fuel' : 'score',
                    prizeAmount: Math.floor(Math.random() * (MINIGAME_CONSTANTS.TREASURE_BOX_DEFAULT_PRIZE_MAX - MINIGAME_CONSTANTS.TREASURE_BOX_DEFAULT_PRIZE_MIN + 1)) + MINIGAME_CONSTANTS.TREASURE_BOX_DEFAULT_PRIZE_MIN,
                    isOpened: false,
                });
            }
        }
        if (treasuresToCreate.length > 0) {
            await MinigameTreasureBox.bulkCreate(treasuresToCreate, { ignoreDuplicates: true });
        }
        console.log(`Admin: ${treasuresToCreate.length} treasure boxes generated for square map.`);

        if(res) return res.json({ success: true, message: "نقشه مربعی اولیه با موفقیت ساخته شد." });
        else console.log("Map initialization complete (no HTTP response as likely called internally).")

    } catch (error) {
        console.error("Admin: Error initializing map:", error);
        if(res) return res.status(500).json({ message: "خطا در ساخت نقشه اولیه." });
    }
};

[end of app/controllers/minigameController.js]
