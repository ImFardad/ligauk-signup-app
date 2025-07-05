'use strict';

module.exports = (sequelize, DataTypes) => {
  const Group = sequelize.define('Group', {
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    code: {
      type: DataTypes.STRING(8),
      allowNull: false,
      unique: true
    },
    walletCode: {
      type: DataTypes.STRING(4),
      allowNull: false,
      unique: true
    },
    score: {
      type: DataTypes.INTEGER,
      defaultValue: 250,
      validate: {
        min: 0
      }
    },
    color: {
      type: DataTypes.STRING,
      allowNull: true // Or false if a color is always required once a group joins a game
    }
  }, {
    hooks: {
      beforeValidate: async (group) => {
        if (!group.code) {
          const rndCode = () => Math.random().toString(36).substr(2, 8).toUpperCase();
          let newCode;
          do {
            newCode = rndCode();
          } while (await Group.findOne({ where: { code: newCode } }));
          group.code = newCode;
        }

        if (!group.walletCode) {
          let newWallet;
          do {
            newWallet = String(Math.floor(1000 + Math.random() * 9000));
          } while (await Group.findOne({ where: { walletCode: newWallet } }));
          group.walletCode = newWallet;
        }
      }
    }
  });

  Group.associate = models => {
    Group.belongsTo(models.User, { as: 'leader', foreignKey: 'leaderId' });

    Group.belongsToMany(models.User, {
      through: models.GroupMember,
      as: 'members',
      foreignKey: 'groupId',
      otherKey: 'userId'
    });

    Group.hasMany(models.Wallet, { foreignKey: 'groupId' });
    
    Group.hasMany(models.UniqueItem, { as: 'ownedItems', foreignKey: 'ownerGroupId' });
  };

  return Group;
};