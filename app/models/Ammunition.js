'use strict';
module.exports = (sequelize, DataTypes) => {
  const Ammunition = sequelize.define('Ammunition', {
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    image: {
      type: DataTypes.STRING, // Path to image
      allowNull: true
    },
    price: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 10
    },
    health: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Damage it can absorb'
    },
    defenseLine: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Higher number means outer line, takes damage first'
    },
    maxPerWall: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    isVisible: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Should it be shown in the ammunition store?'
    }
  });

  Ammunition.associate = function(models) {
    Ammunition.hasMany(models.AmmunitionInventory, { foreignKey: 'AmmunitionId' });
    Ammunition.hasMany(models.DeployedAmmunition, { foreignKey: 'AmmunitionId' });
  };

  return Ammunition;
};
