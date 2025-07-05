const { Ammunition, sequelize } = require('../models');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// Multer setup for image uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, '..', 'public', 'uploads', 'ammunition_images');
        fs.mkdirSync(uploadPath, { recursive: true }); // Ensure directory exists
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'));
    }
});
const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: function (req, file, cb) {
        const filetypes = /jpeg|jpg|png|gif/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error("فایل انتخابی یک تصویر مجاز نیست. (jpeg, jpg, png, gif)"));
    }
});

exports.uploadImage = upload.single('imageFile'); // Middleware for single image upload

exports.createAmmunition = async (req, res) => {
    const { name, price, health, defenseLine, maxPerWall, isVisible } = req.body;
    if (!name || price === undefined || health === undefined || defenseLine === undefined || maxPerWall === undefined) {
        if (req.file && req.file.path) {
            try { fs.unlinkSync(req.file.path); } catch(e) { console.error("Error deleting uploaded file on validation fail:", e);}
        }
        return res.status(400).json({ message: "تمام فیلدهای الزامی (نام، قیمت، سلامت، خط دفاعی، حداکثر در دیوار) باید پر شوند." });
    }

    try {
        const newAmmunition = await Ammunition.create({
            name,
            price: parseInt(price),
            health: parseInt(health),
            defenseLine: parseInt(defenseLine),
            maxPerWall: parseInt(maxPerWall),
            isVisible: isVisible !== undefined ? (String(isVisible).toLowerCase() === 'true' || String(isVisible) === '1') : true,
            image: req.file ? `/uploads/ammunition_images/${req.file.filename}` : null
        });
        req.io.emit('admin-settings-changed', { event: 'ammo_created', message: `مهمات جدید (${name}) ایجاد شد.`, ammunition: newAmmunition });
        res.status(201).json(newAmmunition);
    } catch (error) {
        if (req.file && req.file.path) {
             try { fs.unlinkSync(req.file.path); } catch(e) { console.error("Error deleting uploaded file on db error:", e);}
        }
        console.error("Error creating ammunition:", error);
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({ message: "مهماتی با این نام از قبل موجود است." });
        }
        res.status(500).json({ message: "خطا در ایجاد مهمات." });
    }
};

exports.listAmmunitions = async (req, res) => {
    try {
        const ammunitions = await Ammunition.findAll({ order: [['name', 'ASC']] });
        res.status(200).json(ammunitions);
    } catch (error) {
        console.error("Error listing ammunitions:", error);
        res.status(500).json({ message: "خطا در دریافت لیست مهمات." });
    }
};

exports.updateAmmunition = async (req, res) => {
    const { id } = req.params;
    const { name, price, health, defenseLine, maxPerWall, isVisible } = req.body;

    try {
        const item = await Ammunition.findByPk(id);
        if (!item) {
            if (req.file && req.file.path) {
                try { fs.unlinkSync(req.file.path); } catch(e) { console.error("Error deleting uploaded file for non-existent item:", e);}
            }
            return res.status(404).json({ message: "مهمات یافت نشد." });
        }

        const oldImagePath = item.image ? path.join(__dirname, '..', 'public', item.image) : null;

        item.name = name !== undefined ? name : item.name;
        item.price = price !== undefined ? parseInt(price) : item.price;
        item.health = health !== undefined ? parseInt(health) : item.health;
        item.defenseLine = defenseLine !== undefined ? parseInt(defenseLine) : item.defenseLine;
        item.maxPerWall = maxPerWall !== undefined ? parseInt(maxPerWall) : item.maxPerWall;
        item.isVisible = isVisible !== undefined ? (String(isVisible).toLowerCase() === 'true' || String(isVisible) === '1') : item.isVisible;

        if (req.file) {
            item.image = `/uploads/ammunition_images/${req.file.filename}`;
            if (oldImagePath && oldImagePath !== path.join(__dirname, '..', 'public', item.image) && fs.existsSync(oldImagePath)) {
                try { fs.unlinkSync(oldImagePath); } catch (e) { console.warn("Could not delete old image:", oldImagePath, e.message); }
            }
        }

        await item.save();
        req.io.emit('admin-settings-changed', { event: 'ammo_updated', message: `مهمات (${item.name}) به‌روز شد.`, ammunition: item });
        res.status(200).json(item);
    } catch (error) {
        if (req.file && req.file.path) {
            try { fs.unlinkSync(req.file.path); } catch(e) { console.error("Error deleting uploaded file on update error:", e);}
        }
        console.error("Error updating ammunition:", error);
         if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({ message: "مهماتی دیگری با این نام از قبل موجود است." });
        }
        res.status(500).json({ message: "خطا در به‌روزرسانی مهمات." });
    }
};

exports.deleteAmmunition = async (req, res) => {
    const { id } = req.params;
    try {
        const item = await Ammunition.findByPk(id);
        if (!item) {
            return res.status(404).json({ message: "مهمات یافت نشد." });
        }

        const inventoryCount = await sequelize.models.AmmunitionInventory.count({ where: { AmmunitionId: id } });
        const deployedCount = await sequelize.models.DeployedAmmunition.count({ where: { AmmunitionId: id } });

        if (inventoryCount > 0 || deployedCount > 0) {
            return res.status(400).json({ message: `این مهمات (${item.name}) در حال استفاده است (${inventoryCount} در انبار, ${deployedCount} مستقر شده) و قابل حذف نیست. ابتدا آن را نامرئی کرده و از بازی خارج کنید.` });
        }

        const imagePath = item.image ? path.join(__dirname, '..', 'public', item.image) : null;
        const itemName = item.name; // Save name before destroying

        await item.destroy();

        if (imagePath && fs.existsSync(imagePath)) {
             try { fs.unlinkSync(imagePath); } catch (e) { console.warn("Could not delete image:", imagePath, e.message); }
        }
        req.io.emit('admin-settings-changed', { event: 'ammo_deleted', message: `مهمات (${itemName}) حذف شد.`, ammunitionId: id });
        res.status(200).json({ message: "مهمات با موفقیت حذف شد." });
    } catch (error) {
        console.error("Error deleting ammunition:", error);
        res.status(500).json({ message: "خطا در حذف مهمات." });
    }
};
