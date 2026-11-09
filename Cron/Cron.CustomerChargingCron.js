
const cron = require("node-cron");
const User = require("../Models/models.customer");
const clickConfirmButton = require("../Services/Services.portalAutomation");
const { Op } = require("sequelize");

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

let isRunning = false;

const CRON_SCHEDULE = "* * * * *";
const START_DATE = new Date("2026-10-28T00:00:00");

cron.schedule(CRON_SCHEDULE, async () => {
    if (isRunning) {
        console.log("⏸️ Cron already running, skipping");
        return;
    }

    isRunning = true;

    console.log("▶️ Starting pending customer diagnostics");

    try {
        const customers = await User.findAll({
            where: {
                is_chargin: 0,
                createdAt: {
                    [Op.gte]: START_DATE
                }
            },
            order: [["createdAt", "DESC"]]
        });

        if (!customers.length) {
            console.log("⚠️ No pending customers found");
            return;
        }

        console.log(`📊 Pending customers: ${customers.length}`);

        let processed = 0;
        let failed = 0;
        let skipped = 0;

        for (const customer of customers) {
            try {
                // ------------------------------------------
                // STEP 1: GET DATABASE CUSTOMER INFORMATION
                // ------------------------------------------

                const msisdn = customer.msisdn;

                if (!msisdn) {
                    throw new Error(
                        "MSISDN missing from customer database record"
                    );
                }

                // ------------------------------------------
                // STEP 2: RESTORE ORIGINAL REQUEST HEADERS
                // ------------------------------------------

                let headers = customer.request_headers || {};

                if (typeof headers === "string") {
                    try {
                        headers = JSON.parse(headers);
                    } catch (error) {
                        console.error(
                            "[CRON] Invalid request_headers JSON:",
                            error.message
                        );

                        headers = {};
                    }
                }

                if (
                    !headers ||
                    typeof headers !== "object" ||
                    Array.isArray(headers)
                ) {
                    headers = {};
                }

                headers = {
                    ...headers,

                    host:
                        headers.host ||
                        customer.host ||
                        undefined,

                    connection:
                        headers.connection ||
                        customer.connection_type ||
                        undefined,

                    "x-real-ip":
                        headers["x-real-ip"] ||
                        customer.client_ip ||
                        undefined,

                    "x-forwarded-for":
                        headers["x-forwarded-for"] ||
                        customer.forwarded_for ||
                        undefined,

                    "x-forwarded-proto":
                        headers["x-forwarded-proto"] ||
                        customer.forwarded_proto ||
                        undefined,

                    accept:
                        headers.accept ||
                        customer.accept_header ||
                        undefined,

                    "accept-language":
                        headers["accept-language"] ||
                        customer.accept_language ||
                        undefined,

                    "accept-encoding":
                        headers["accept-encoding"] ||
                        customer.accept_encoding ||
                        undefined,

                    "user-agent":
                        headers["user-agent"] ||
                        customer.user_agent ||
                        undefined,

                    msisdn: msisdn
                };

                console.log("--------------------------------------");
                console.log("[CRON] Processing customer");
                console.log("[CRON] MSISDN:", msisdn);
                console.log(
                    "[CRON] Transaction ID:",
                    customer.transaction_id || "N/A"
                );

                // ------------------------------------------
                // STEP 3: RUN PORTAL DIAGNOSTICS
                // ------------------------------------------

                const result = await clickConfirmButton({
                    msisdn: msisdn,
                    client_ip: customer.client_ip,
                    transactionId: customer.transaction_id,
                    headers: headers
                });

                console.log(
                    "[CRON] Portal result:",
                    JSON.stringify(result, null, 2)
                );

                // ------------------------------------------
                // STEP 4: HANDLE DIAGNOSTIC RESULT
                // ------------------------------------------

                if (!result || typeof result !== "object") {
                    throw new Error(
                        "Invalid portal automation response"
                    );
                }

                if (result.testOnly === true) {
                    skipped++;

                    console.log(
                        "[CRON] Diagnostic-only result. " +
                        "Production charging status unchanged:",
                        msisdn
                    );

                    continue;
                }

                // This Cron must not mark a customer as charged
                // based on page loading or slider detection.
                throw new Error(
                    "Charging status cannot be updated from portal diagnostics"
                );

            } catch (err) {
                failed++;

                console.error(
                    `[CRON] Customer diagnostic failed: ${customer.msisdn}`,
                    err.message
                );

                // Leave is_chargin unchanged.
                // A diagnostic failure is not proof of a
                // subscription failure or a billing outcome.
            }

            await sleep(800);
        }

        console.log("--------------------------------------");

        console.log(
            `[CRON] Cycle completed | ` +
            `Diagnostics: ${skipped} | ` +
            `Errors: ${failed} | ` +
            `Total: ${customers.length}`
        );

    } catch (err) {
        console.error(
            "[CRON] Customer processing error:",
            err.stack || err.message
        );

    } finally {
        isRunning = false;

        console.log(
            "⏳ Cron cycle completed, waiting for next tick"
        );
    }
});

module.exports = {};
