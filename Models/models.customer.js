
const { DataTypes } = require("sequelize");
const sequelize = require("../Config/db");

const User = sequelize.define(
    "be_customers",
    {
        id: {
            type: DataTypes.UUID,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4,
        },

        msisdn: {
            type: DataTypes.TEXT,
            allowNull: false,
        },

        origin: {
            type: DataTypes.TEXT,
            allowNull: true,
        },

        referer: {
            type: DataTypes.TEXT,
            allowNull: true,
        },

        client_ip: {
            type: DataTypes.STRING(45),
            allowNull: true,
        },

        is_chargin: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },

        // Transaction ID
        transaction_id: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },

        // Homepage request logs
        host: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },

        connection_type: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },

        forwarded_for: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },

        forwarded_proto: {
            type: DataTypes.STRING(20),
            allowNull: true,
        },

        accept_header: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },

        accept_language: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },

        accept_encoding: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },

        user_agent: {
            type: DataTypes.TEXT,
            allowNull: true,
        },

        request_headers: {
            type: DataTypes.JSON,
            allowNull: true,
        },
    },
    {
        tableName: "be_customers",
        timestamps: true,
    }
);

module.exports = User;