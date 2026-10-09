const { DataTypes } = require("sequelize");
const sequelize = require("../Config/db");

const CallbackLog = sequelize.define(
  "be_callback_logs",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },

    msisdn: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    event_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    bundle_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    charge_result: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    server_tx_id: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },

    period: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    event_time: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },

    headers: {
      type: DataTypes.JSON,
      allowNull: true,
    },

    raw_input: {
      type: DataTypes.TEXT("long"),
      allowNull: true,
    },

    client_ip: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    tableName: "be_callback_logs",
    timestamps: true,
  }
);

module.exports = CallbackLog;
