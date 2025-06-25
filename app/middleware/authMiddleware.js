// app/middleware/authMiddleware.js

function isAdmin(req, res, next) {
    if (req.session.adminId) {
        return next();
    }
    // If AJAX request, send error, else redirect
    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
       return res.status(401).json({ message: 'دسترسی ادمین لازم است.'});
    }
    res.redirect('/');
}

function isUser(req, res, next) {
    if (req.session.userId) {
        return next();
    }
    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
       return res.status(401).json({ message: 'ابتدا باید وارد حساب کاربری خود شوید.'});
    }
    res.redirect('/');
}

async function isUserAndInGroup(req, res, next) {
    if (!req.session.userId) {
        if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
            return res.status(401).json({ message: 'ابتدا باید وارد حساب کاربری خود شوید.' });
        }
        return res.redirect('/');
    }
    try {
        const { GroupMember } = require('../models'); // require here to avoid circular dependency if models index requires middleware
        const groupMember = await GroupMember.findOne({ where: { userId: req.session.userId } });
        if (!groupMember) {
            if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
                return res.status(403).json({ message: 'شما عضو هیچ گروهی نیستید.' });
            }
            // Potentially redirect to a page that explains they need to join/create a group
            return res.status(403).send('شما عضو هیچ گروهی نیستید. برای دسترسی به این بخش، ابتدا به یک گروه بپیوندید.');
        }
        req.groupId = groupMember.groupId; // Attach groupId to request for convenience
        next();
    } catch (error) {
        console.error("Error in isUserAndInGroup middleware:", error);
        res.status(500).json({ message: "خطا در بررسی عضویت گروه." });
    }
}


module.exports = {
    isAdmin,
    isUser,
    isUserAndInGroup
};
