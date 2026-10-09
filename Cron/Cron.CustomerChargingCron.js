const cron = require("node-cron");
const User = require("../Models/models.customer");
const clickConfirmButton = require("../Services/Services.portalAutomation");

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

let isRunning = false;

cron.schedule("* * * * *", async () => {
    if (isRunning) {
        console.log("⏸️ Cron already running, skipping");
        return;
    }

    isRunning = true;
    console.log("▶️ Processing pending customers");

    try {
        // Fetch all pending customers without filtering by origin.
        const customers = await User.findAll({
            where: {
                is_chargin: 0,
            },
            order: [["createdAt", "ASC"]],
        });

        if (!customers.length) {
            console.log("⚠️ No pending customers found");
            return;
        }

        console.log(`📊 Pending customers: ${customers.length}`);

        let processed = 0;
        let failed = 0;

        for (const customer of customers) {
            try {
                // Reconstruct the original request headers.
                let headers = customer.request_headers || {};

                if (typeof headers === "string") {
                    try {
                        headers = JSON.parse(headers);
                    } catch {
                        headers = {};
                    }
                }

                // Fallback to individual stored fields if needed.
                headers = {
                    ...headers,
                    host: headers.host || customer.host || undefined,
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
                    origin: headers.origin || customer.origin || undefined,
                    referer: headers.referer || customer.referer || undefined,
                    msisdn: headers.msisdn || customer.msisdn || undefined,
                };

                console.log(`🔄 Processing customer: ${customer.msisdn}`);

                const success = await clickConfirmButton({
                    origin: customer.origin,
                    msisdn: customer.msisdn,
                    client_ip: customer.client_ip,
                    transactionId: customer.transaction_id,
                    headers,
                });

                if (success) {
                    await customer.update({
                        is_chargin: 1,
                    });

                    processed++;

                    console.log(
                        `✅ Processed successfully: ${customer.msisdn}`
                    );
                } else {
                    await customer.update({
                        is_chargin: -1,
                    });

                    failed++;

                    console.log(`❌ Failed: ${customer.msisdn}`);
                }
            } catch (err) {
                failed++;

                console.error(
                    `🔥 Error processing ${customer.msisdn}:`,
                    err.message
                );

                await customer.update({
                    is_chargin: -1,
                }).catch((updateError) => {
                    console.error(
                        "Failed to update customer status:",
                        updateError.message
                    );
                });
            }

            await sleep(800);
        }

        console.log(
            `📋 Completed | Success: ${processed} | Failed: ${failed}`
        );
    } catch (err) {
        console.error("🔥 Customer processing error:", err);
    } finally {
        isRunning = false;
        console.log("⏳ Cycle completed, waiting for next tick");
    }
});
