const { Ammunition, AmmunitionInventory, Group, sequelize } = require('../models');

exports.listAmmunitions = async (req, res) => {
    try {
        const ammunitions = await Ammunition.findAll({
            where: { isVisible: true },
            attributes: ['id', 'name', 'image', 'price', 'health', 'defenseLine', 'maxPerWall']
        });
        res.status(200).json(ammunitions);
    } catch (error) {
        console.error("Error listing ammunitions:", error);
        res.status(500).json({ message: "خطا در دریافت لیست مهمات." });
    }
};

exports.buyAmmunition = async (req, res) => {
    const { ammunitionId, quantity } = req.body;
    const userId = req.session.userId;

    if (!userId) {
        return res.status(401).json({ message: "کاربر وارد نشده است." });
    }

    let groupUser;
    try {
        groupUser = await Group.findOne({
            include: [{
                model: sequelize.models.User, // Assuming User model is registered in sequelize.models
                as: 'members',
                where: { id: userId }
            }]
        });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ message: "خطا در یافتن گروه کاربر." });
    }

    if (!groupUser) {
        return res.status(403).json({ message: "شما عضو هیچ گروهی نیستید یا گروه شما یافت نشد." });
    }
    const groupId = groupUser.id;


    if (!quantity || parseInt(quantity, 10) <= 0) {
        return res.status(400).json({ message: "تعداد مهمات برای خرید باید عددی مثبت باشد." });
    }
    const numQuantity = parseInt(quantity, 10);

    const transaction = await sequelize.transaction();
    try {
        const ammunition = await Ammunition.findOne({ where: { id: ammunitionId, isVisible: true }, transaction });
        if (!ammunition) {
            await transaction.rollback();
            return res.status(404).json({ message: "مهمات مورد نظر یافت نشد یا قابل خرید نیست." });
        }

        // Refetch group in transaction
        const group = await Group.findByPk(groupId, { transaction });
         if (!group) { // Should not happen
            await transaction.rollback();
            return res.status(404).json({ message: "گروه شما یافت نشد." });
        }

        const activeMap = await sequelize.models.GameMap.findOne({
            where: { isActive: true }, // Assuming there's a way to get the relevant map for locking check
            order: [['createdAt', 'DESC']],
            transaction
        });

        if (activeMap && activeMap.gameLocked) {
            await transaction.rollback();
            return res.status(403).json({ message: "بازی قفل شده است و امکان خرید مهمات وجود ندارد." });
        }


        const totalCost = ammunition.price * numQuantity;
        if (group.score < totalCost) {
            await transaction.rollback();
            return res.status(400).json({ message: "امتیاز گروه شما برای خرید این تعداد مهمات کافی نیست." });
        }
        group.score -= totalCost;
        await group.save({ transaction });

        let inventoryItem = await AmmunitionInventory.findOne({
            where: { GroupId: groupId, AmmunitionId: ammunitionId },
            transaction
        });

        if (inventoryItem) {
            inventoryItem.quantity += numQuantity;
        } else {
            inventoryItem = await AmmunitionInventory.create({
                GroupId: groupId,
                AmmunitionId: ammunitionId,
                quantity: numQuantity
            }, { transaction });
        }
        await inventoryItem.save({ transaction });

        await transaction.commit();

        const updatedInventory = await AmmunitionInventory.findAll({
            where: { GroupId: groupId },
            include: [{ model: Ammunition, as: 'ammunition', attributes: ['id', 'name', 'image', 'health', 'defenseLine', 'maxPerWall'] }]
        });
        req.io.to(`group-${groupId}`).emit('inventory-updated', { inventory: updatedInventory, score: group.score });

        res.status(200).json({ message: "مهمات با موفقیت خریداری شد.", inventory: updatedInventory, newScore: group.score });

    } catch (error) {
        await transaction.rollback();
        console.error("Error buying ammunition:", error);
        res.status(500).json({ message: "خطا در خرید مهمات." });
    }
};

exports.getGroupInventory = async (req, res) => {
    const userId = req.session.userId;
     if (!userId) {
        return res.status(401).json({ message: "کاربر وارد نشده است." });
    }

    let groupUser;
    try {
        groupUser = await Group.findOne({
            attributes: ['id', 'score'],
            include: [{
                model: sequelize.models.User,
                as: 'members',
                where: { id: userId },
                attributes: [] // Don't need user attributes here
            }]
        });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ message: "خطا در یافتن گروه کاربر." });
    }

    if (!groupUser) {
        return res.status(403).json({ message: "شما عضو هیچ گروهی نیستید یا گروه شما یافت نشد." });
    }
    const groupId = groupUser.id;
    const groupScore = groupUser.score;

    try {
        const inventory = await AmmunitionInventory.findAll({
            where: { GroupId: groupId },
            include: [{ model: Ammunition, as: 'ammunition', attributes: ['id', 'name', 'image', 'health', 'defenseLine', 'maxPerWall'] }],
            attributes: ['quantity', 'AmmunitionId', 'GroupId']
        });
        res.status(200).json({inventory, score: groupScore});
    } catch (error) {
        console.error("Error fetching group inventory:", error);
        res.status(500).json({ message: "خطا در دریافت انبار مهمات گروه." });
    }
};
