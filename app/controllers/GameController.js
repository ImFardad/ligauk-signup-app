const { Tile, Wall, Group, GameMap, DeployedAmmunition, AmmunitionInventory, Ammunition, AttackWave, sequelize } = require('../models');
const { Op } = require('sequelize'); // Import Op
const { generateDistinctColors } = require('../utils/colorGenerator');

// Helper function to create initial walls for a tile
const createInitialWalls = async (tileId, transaction) => {
    const wallData = [
        { direction: 'north', TileId: tileId, health: 100, type: 'wood' }, // Assuming default health
        { direction: 'east',  TileId: tileId, health: 100, type: 'wood' },
        { direction: 'south', TileId: tileId, health: 100, type: 'wood' },
        { direction: 'west',  TileId: tileId, health: 100, type: 'wood' },
    ];
    await Wall.bulkCreate(wallData, { transaction });
};

exports.buyTile = async (req, res) => {
    const { tileId, mapId } = req.body;
    // const groupId = req.user.groupId; // Assuming groupId is available in req.user from a middleware
    // For testing without full auth, let's assume groupId is passed or hardcoded for now
    const userId = req.session.userId;
    if (!userId) {
        return res.status(401).json({ message: "کاربر وارد نشده است." });
    }

    let groupUser;
    try {
        groupUser = await Group.findOne({
            include: [{
                model: sequelize.models.User,
                as: 'members',
                where: { id: userId }
            }]
        });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ message: "خطا در یافتن گروه کاربر."})
    }


    if (!groupUser) {
        return res.status(403).json({ message: "شما عضو هیچ گروهی نیستید یا گروه شما یافت نشد." });
    }
    const groupId = groupUser.id;


    const transaction = await sequelize.transaction();

    try {
        const activeMap = await GameMap.findOne({ where: { id: mapId, isActive: true }, transaction });
        if (!activeMap) {
            await transaction.rollback();
            return res.status(404).json({ message: "نقشه فعال مورد نظر یافت نشد." });
        }
        if (activeMap.gameLocked) {
            await transaction.rollback();
            return res.status(403).json({ message: "بازی قفل شده است و امکان خرید ملک جدید وجود ندارد." });
        }

        const tile = await Tile.findOne({ where: { id: tileId, MapId: activeMap.id }, transaction });
        if (!tile) {
            await transaction.rollback();
            return res.status(404).json({ message: "ملک مورد نظر در این نقشه یافت نشد." });
        }
        if (tile.OwnerGroupId) {
            await transaction.rollback();
            return res.status(400).json({ message: "این ملک قبلاً خریداری شده است." });
        }

        const group = await Group.findByPk(groupId, { transaction });
        // This should be groupUser, which we already fetched, but refetching in transaction for safety
        if (!group) { // Should not happen if previous check passed
            await transaction.rollback();
            return res.status(404).json({ message: "گروه شما یافت نشد." });
        }

        if (group.score < tile.price) {
            await transaction.rollback();
            return res.status(400).json({ message: "امتیاز گروه شما برای خرید این ملک کافی نیست." });
        }
        group.score -= tile.price;

        if (!group.color) {
            const existingColors = (await Group.findAll({
                attributes: ['color'],
                where: {
                    color: { [Op.ne]: null }, // Changed from sequelize.Op.ne to Op.ne
                    id: { [Op.ne]: group.id } // Changed from sequelize.Op.ne to Op.ne
                },
                transaction
            })).map(g => g.color);
            const newColor = generateDistinctColors(1, existingColors)[0];
            group.color = newColor;
        }

        await group.save({ transaction });

        tile.OwnerGroupId = groupId;
        await tile.save({ transaction });

        await createInitialWalls(tile.id, transaction);

        await transaction.commit();

        const mapData = await exports.getFullMapState(activeMap.id); // Use exported function
        req.io.emit('map-updated', { map: mapData });

        const groupInventory = await sequelize.models.AmmunitionInventory.findAll({
            where: { GroupId: groupId },
            include: [{ model: sequelize.models.Ammunition, as: 'ammunition' }]
        });
        req.io.to(`group-${groupId}`).emit('inventory-updated', { inventory: groupInventory, score: group.score });


        res.status(200).json({ message: "ملک با موفقیت خریداری شد.", tileId: tile.id, ownerGroupId: group.id, groupColor: group.color, newScore: group.score });

    } catch (error) {
        await transaction.rollback();
        console.error("Error buying tile:", error);
        res.status(500).json({ message: "خطا در خرید ملک." });
    }
};

exports.upgradeWall = async (req, res) => {
    const { wallId } = req.body;
    const userId = req.session.userId;
    if (!userId) return res.status(401).json({ message: "کاربر وارد نشده است." });

    let groupUser;
    try {
        groupUser = await Group.findOne({
            include: [{ model: sequelize.models.User, as: 'members', where: { id: userId } }]
        });
    } catch (e) {
        return res.status(500).json({ message: "خطا در یافتن گروه کاربر."})
    }
    if (!groupUser) return res.status(403).json({ message: "شما عضو هیچ گروهی نیستید." });
    const groupId = groupUser.id;

    const upgradeMatrix = {
        wood: { next: 'stone', cost: 150, health: 250 },
        stone: { next: 'metal', cost: 300, health: 500 },
        metal: null
    };

    const transaction = await sequelize.transaction();
    try {
        const wall = await Wall.findByPk(wallId, { include: { model: Tile, as: 'tile' }, transaction });
        if (!wall) {
            await transaction.rollback();
            return res.status(404).json({ message: "دیوار یافت نشد." });
        }
        if (wall.tile.OwnerGroupId !== groupId) {
            await transaction.rollback();
            return res.status(403).json({ message: "این دیوار متعلق به گروه شما نیست." });
        }

        const activeMap = await GameMap.findByPk(wall.tile.MapId, { transaction });
        if (activeMap.gameLocked) {
            await transaction.rollback();
            return res.status(403).json({ message: "بازی قفل شده است و امکان ارتقا دیوار وجود ندارد." });
        }

        const currentType = wall.type;
        const upgradeInfo = upgradeMatrix[currentType];

        if (!upgradeInfo) {
            await transaction.rollback();
            return res.status(400).json({ message: "این دیوار در بالاترین سطح قرار دارد." });
        }

        const group = await Group.findByPk(groupId, { transaction });
        if (group.score < upgradeInfo.cost) {
            await transaction.rollback();
            return res.status(400).json({ message: "امتیاز کافی برای ارتقا دیوار ندارید." });
        }
        group.score -= upgradeInfo.cost;
        await group.save({ transaction });

        wall.type = upgradeInfo.next;
        wall.health = upgradeInfo.health;
        await wall.save({ transaction });

        await transaction.commit();

        const mapData = await exports.getFullMapState(wall.tile.MapId);
        req.io.emit('map-updated', { map: mapData });
         const groupInventory = await sequelize.models.AmmunitionInventory.findAll({
            where: { GroupId: groupId },
            include: [{ model: sequelize.models.Ammunition, as: 'ammunition' }]
        });
        req.io.to(`group-${groupId}`).emit('inventory-updated', { inventory: groupInventory, score: group.score });


        res.status(200).json({ message: "دیوار با موفقیت ارتقا یافت.", wall, newScore: group.score });

    } catch (error) {
        await transaction.rollback();
        console.error("Error upgrading wall:", error);
        res.status(500).json({ message: "خطا در ارتقا دیوار." });
    }
};

exports.deployAmmunition = async (req, res) => {
    const { wallId, ammunitionId, quantityToDeploy } = req.body;
    const userId = req.session.userId;
    if (!userId) return res.status(401).json({ message: "کاربر وارد نشده است." });

    let groupUser;
    try {
        groupUser = await Group.findOne({
            include: [{ model: sequelize.models.User, as: 'members', where: { id: userId } }]
        });
    } catch (e) {
        return res.status(500).json({ message: "خطا در یافتن گروه کاربر."})
    }
    if (!groupUser) return res.status(403).json({ message: "شما عضو هیچ گروهی نیستید." });
    const groupId = groupUser.id;


    if (!quantityToDeploy || parseInt(quantityToDeploy, 10) <= 0) {
        return res.status(400).json({ message: "تعداد مهمات برای استقرار باید عددی مثبت باشد." });
    }
    const numQuantityToDeploy = parseInt(quantityToDeploy, 10);

    const transaction = await sequelize.transaction();
    try {
        const wall = await Wall.findByPk(wallId, { include: { model: Tile, as: 'tile' }, transaction });
        if (!wall) {
            await transaction.rollback();
            return res.status(404).json({ message: "دیوار یافت نشد." });
        }
        if (wall.tile.OwnerGroupId !== groupId) {
            await transaction.rollback();
            return res.status(403).json({ message: "این دیوار متعلق به گروه شما نیست." });
        }

        const activeMap = await GameMap.findByPk(wall.tile.MapId, { transaction });
        if (activeMap.gameLocked) {
            await transaction.rollback();
            return res.status(403).json({ message: "بازی قفل شده است و امکان استقرار مهمات وجود ندارد." });
        }

        const ammunition = await Ammunition.findByPk(ammunitionId, { transaction });
        if (!ammunition) {
            await transaction.rollback();
            return res.status(404).json({ message: "مهمات مورد نظر یافت نشد." });
        }

        const inventoryItem = await AmmunitionInventory.findOne({
            where: { GroupId: groupId, AmmunitionId: ammunitionId },
            transaction
        });

        if (!inventoryItem || inventoryItem.quantity < numQuantityToDeploy) {
            await transaction.rollback();
            return res.status(400).json({ message: "مهمات کافی در انبار ندارید." });
        }

        const deployedCount = await DeployedAmmunition.count({ where: { WallId: wallId, AmmunitionId: ammunitionId }, transaction });
        if (deployedCount + numQuantityToDeploy > ammunition.maxPerWall) {
            await transaction.rollback();
            return res.status(400).json({ message: `شما حداکثر ${ammunition.maxPerWall} عدد از این نوع مهمات را می‌توانید روی این دیوار مستقر کنید. (${deployedCount} عدد قبلا مستقر شده)` });
        }

        inventoryItem.quantity -= numQuantityToDeploy;
        await inventoryItem.save({ transaction });

        const newDeployments = [];
        for (let i = 0; i < numQuantityToDeploy; i++) {
            newDeployments.push({
                WallId: wallId,
                AmmunitionId: ammunitionId,
                health: ammunition.health
            });
        }
        const createdDeployments = await DeployedAmmunition.bulkCreate(newDeployments, { transaction, returning: true });

        await transaction.commit();

        const mapData = await exports.getFullMapState(wall.tile.MapId);
        req.io.emit('map-updated', { map: mapData });
        // req.io.emit('ammo-deployed', { wallId, tileId: wall.TileId, mapId: wall.tile.MapId, deployedAmmunitions: createdDeployments });

        const groupInventory = await AmmunitionInventory.findAll({
            where: { GroupId: groupId },
            include: [{ model: Ammunition, as: 'ammunition' }]
        });
         const groupData = await Group.findByPk(groupId, {attributes: ['score']});
        req.io.to(`group-${groupId}`).emit('inventory-updated', { inventory: groupInventory, score: groupData.score });


        res.status(200).json({ message: "مهمات با موفقیت مستقر شد." });

    } catch (error) {
        await transaction.rollback();
        console.error("Error deploying ammunition:", error);
        res.status(500).json({ message: "خطا در استقرار مهمات." });
    }
};

exports.getFullMapState = async (mapId) => {
    return await GameMap.findByPk(mapId, {
        include: [
            {
                model: Tile,
                as: 'tiles',
                attributes: ['id', 'x', 'y', 'price', 'OwnerGroupId', 'MapId'],
                include: [
                    { model: Group, as: 'ownerGroup', attributes: ['id', 'name', 'color'] },
                    {
                        model: Wall,
                        as: 'walls',
                        attributes: ['id', 'direction', 'type', 'health', 'TileId'],
                        include: [
                            {
                                model: DeployedAmmunition,
                                as: 'deployedAmmunitions',
                                attributes: ['id', 'health', 'AmmunitionId', 'WallId'],
                                include: [{ model: Ammunition, as: 'ammunitionDetail', attributes: ['id', 'name', 'defenseLine', 'health' /* base health for type */, 'image'] }]
                            }
                        ]
                    }
                ]
            },
            {
                model: AttackWave,
                as: 'attackWaves',
                    where: { isExecuted: false, attackTime: { [Op.gt]: new Date() } },
                order: [['attackTime', 'ASC']],
                limit: 1,
                required: false,
                attributes: ['id', 'power', 'attackTime', 'isPowerVisible']
            }
        ],
        order: [
            [{ model: Tile, as: 'tiles' }, 'y', 'ASC'],
            [{ model: Tile, as: 'tiles' }, 'x', 'ASC'],
            [{ model: Tile, as: 'tiles' }, { model: Wall, as: 'walls' }, 'id', 'ASC'], // Consistent order for walls
            [{ model: Tile, as: 'tiles' }, { model: Wall, as: 'walls' }, {model: DeployedAmmunition, as: 'deployedAmmunitions'}, 'id', 'ASC'] // Consistent order for ammo
        ]
    });
};


exports.getMapState = async (req, res) => {
    const { mapId } = req.params;
    try {
        const gameMapData = await exports.getFullMapState(mapId);

        if (!gameMapData) {
            return res.status(404).json({ message: "نقشه یافت نشد." });
        }
        res.status(200).json(gameMapData);
    } catch (error) {
        console.error("Error getting map state:", error);
        res.status(500).json({ message: "خطا در دریافت اطلاعات نقشه." });
    }
};

// Function to get the currently active and unlocked map
exports.getActiveMap = async (req, res) => {
    try {
        const activeMap = await GameMap.findOne({
            where: { isActive: true /*, gameLocked: false */ }, // gameLocked can be true, users can still view
            order: [['createdAt', 'DESC']] // Or some other logic to pick one if multiple are active
        });

        if (!activeMap) {
            return res.status(404).json({ message: "در حال حاضر هیچ نقشه فعالی برای بازی وجود ندارد." });
        }
        // Return only basic info, full state via getMapState
        res.status(200).json({ id: activeMap.id, name: activeMap.name, size: activeMap.size, gameLocked: activeMap.gameLocked });
    } catch (error) {
        console.error("Error fetching active map:", error);
        res.status(500).json({ message: "خطا در دریافت اطلاعات نقشه فعال." });
    }
};
