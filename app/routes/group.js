// app/routes/group.js
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/groupController');

router.get('/my',       ctrl.getMyGroup);
router.get('/my-group-details', ctrl.getMyGroup); // New route pointing to the enhanced getMyGroup
router.get('/my-group-id', ctrl.getMyGroupId);

router.post('/transfer', ctrl.transfer);
router.post('/mentor/transfer', ctrl.mentorTransfer);
router.get('/name/:code', ctrl.getGroupNameByCode);

router.get('/ranking',     ctrl.getRanking);
router.post('/create',     ctrl.createGroup);
router.post('/add-member', ctrl.addMember);
router.post('/leave',      ctrl.leaveGroup);
router.post('/:id/remove-member', ctrl.removeMember);
router.delete('/:id',      ctrl.deleteGroup);

module.exports = router;
