'use strict';
module.exports = (sequelize, DataTypes) => {
  const AmmunitionInventory = sequelize.define('AmmunitionInventory', {
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    // GroupId and AmmunitionId are defined here for the composite unique key
    // and are also implicitly created by the associations.
    GroupId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Groups', // Ensure this matches your actual table name for Groups
        key: 'id'
      }
    },
    AmmunitionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Ammunitions', // Ensure this matches your actual table name for Ammunitions
        key: 'id'
      }
    }
  }, {
    indexes: [
      {
        unique: true,
        fields: ['GroupId', 'AmmunitionId']
      }
    ]
  });

  AmmunitionInventory.associate = function(models) {
    AmmunitionInventory.belongsTo(models.Group, {
      foreignKey: 'GroupId', // Explicitly stating to match the column defined above
      as: 'group'
    });
    AmmunitionInventory.belongsTo(models.Ammunition, {
      foreignKey: 'AmmunitionId', // Explicitly stating to match the column defined above
      as: 'ammunition'
    });
  };

  return AmmunitionInventory;
};
