const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const MinigameTreasureBox = sequelize.define('MinigameTreasureBox', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    positionX: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    positionY: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    positionZ: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    prizeType: {
      type: DataTypes.ENUM('fuel', 'score'), // 'score' means group score
      allowNull: false,
    },
    prizeAmount: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    isOpened: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  }, {
    timestamps: true, // To know when it was created or opened (updatedAt)
    indexes: [
      {
        unique: true,
        fields: ['positionX', 'positionY', 'positionZ'],
        name: 'unique_treasure_position' // Optional: specify index name
      }
    ]
  });

  // MinigameTreasureBox.associate = (models) => {
    // Potentially associate with who opened it, if needed later
    // MinigameTreasureBox.belongsTo(models.Group, { foreignKey: 'openedByGroupId', as: 'openerGroup' });
  // };

  return MinigameTreasureBox;
};
