// app/models/index.js

const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'mysql',
  logging: false,
  dialectOptions: {
    connectTimeout: 60000
  },
  pool: {
    max: 50,
    min: 10,
    acquire: 60000, // Increased from 30000
    idle: 30000    // Increased from 10000
  }
});

const db = {
  sequelize,
  Sequelize
};

db.User                    = require('./user')(sequelize, DataTypes);
db.Admin                   = require('./admin')(sequelize, DataTypes);
db.Group                   = require('./group')(sequelize, DataTypes);
db.GroupMember             = require('./GroupMember')(sequelize, DataTypes);
db.Announcement            = require('./announcement')(sequelize, DataTypes);
db.AnnouncementAttachment  = require('./announcementAttachment')(sequelize, DataTypes);
db.Content                 = require('./content')(sequelize, DataTypes);
db.ContentAttachment       = require('./contentAttachment')(sequelize, DataTypes);
db.Currency                = require('./currency')(sequelize, DataTypes);
db.Wallet                  = require('./wallet')(sequelize, DataTypes);
db.UniqueItem              = require('./uniqueItem')(sequelize, DataTypes);
db.FeatureFlag             = require('./featureFlag')(sequelize, DataTypes);
db.QuestionBankSetting     = require('./questionBankSetting')(sequelize, DataTypes);
db.Question                = require('./question')(sequelize, DataTypes);
db.PurchasedQuestion       = require('./purchasedQuestion')(sequelize, DataTypes);
db.SubmittedCombo          = require('./submittedCombo')(sequelize, DataTypes);

// Game Models
db.GameMap                 = require('./GameMap')(sequelize, DataTypes);
db.Tile                    = require('./Tile')(sequelize, DataTypes);
db.Wall                    = require('./Wall')(sequelize, DataTypes);
db.Ammunition              = require('./Ammunition')(sequelize, DataTypes);
db.AmmunitionInventory     = require('./AmmunitionInventory')(sequelize, DataTypes);
db.DeployedAmmunition      = require('./DeployedAmmunition')(sequelize, DataTypes);
db.AttackWave              = require('./AttackWave')(sequelize, DataTypes);

Object.values(db).forEach(model => {
  if (typeof model.associate === 'function') {
    model.associate(db);
  }
});

module.exports = db;