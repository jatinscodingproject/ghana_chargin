const { getBrowser } = require("./browsermanager");
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
function forceHttp(url) {
    if (!url) return url;

    return url.replace(/^https:\/\//i, "http://");
}
async function blockSessionRecording(page) {
    try {
        await page.setRequestInterception(true);
        page.on("request", (request) => {
            const url = request.url();

            if (
                url.includes("/save-recording") &&
                url.includes("sc=nigeria")
            ) {
                console.log(
                    "🚫 Blocked session recording:",
                    url
                );

                request.abort("blockedbyclient");
                return;
            }

            request.continue();
        });

        console.log(
            "🚫 Session recording blocking enabled"
        );
    } catch (error) {
        console.error(
            "❌ Failed to enable request blocking:",
            error.message
        );

        throw error;
    }
}



const clickConfirmButton = async ({
    msisdn,
    client_ip,
    transactionId,
    headers,
}) => {
    let page;

    try {
        const browser = await getBrowser();

        // Create exactly one tab for this request.
        page = await browser.newPage();

        await page.setViewport({
            width: 1280,
            height: 900,
        });

        page.setDefaultNavigationTimeout(90000);
        page.setDefaultTimeout(30000);

        await blockSessionRecording(page);

        const finalTransactionId =
            transactionId ||
            String(
                Math.floor(
                    1000000000000000 +
                    Math.random() * 9000000000000000
                )
            );

        const finalMsisdn =
            msisdn ||
            headers?.["msisdn"] ||
            "";

        const forwardedIp =
            headers?.["x-forwarded-for"];

        const finalClientIp =
            client_ip ||
            headers?.["x-real-ip"] ||
            (typeof forwardedIp === "string"
                ? forwardedIp.split(",")[0].trim()
                : "");

        await page.setExtraHTTPHeaders({
            "x-real-ip": finalClientIp,
            "x-forwarded-for": finalClientIp,
            "x-forwarded-proto":
                headers?.["x-forwarded-proto"] || "http",
            "accept":
                headers?.["accept"] ||
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "accept-language":
                headers?.["accept-language"] || "en-US,en;q=0.9",
            "msisdn": finalMsisdn,
        });

        await page.setUserAgent(
            "Mozilla/5.0 (Linux; Android 10; K) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/153.0.0.0 Mobile Safari/537.36 " +
            "EdgA/153.0.0.0"
        );

        const consentUrl =
            "http://102.133.198.92/Redirect" +
            "?OfferCode=9916710032" +
            `&mobileNumber=${encodeURIComponent(finalMsisdn)}` +
            "&redirectUrl=http%3A%2F%2Fmobile.arenaxpro.com%2Fredirect" +
            `&transactionID=${encodeURIComponent(finalTransactionId)}`;

        console.log("[CONSENT] Opening transaction:", finalTransactionId);

        await page.goto(forceHttp(consentUrl), {
            waitUntil: "domcontentloaded",
            timeout: 90000,
        });

        // Wait for the consent slider to appear.
        await page.waitForSelector("#container", {
            visible: true,
            timeout: 30000,
        });

        await page.waitForSelector("#button", {
            visible: true,
            timeout: 30000,
        });

        await sleep(2000);

        // Do not process the next request until this swipe finishes.
        const swiped = await swipeToConfirm(page);

        if (!swiped) {
            throw new Error("Consent slider swipe failed");
        }

        console.log(
            "[CONSENT] Swipe completed:",
            finalTransactionId
        );

        // Allow the consent page to finish its immediate response.
        await sleep(9000);

        return {
            success: true,
            transactionId: finalTransactionId,
        };

    } catch (error) {
        console.error(
            "[CONSENT] Processing failed:",
            error.stack || error.message
        );

        return {
            success: false,
            error: error.message || String(error),
        };

    } finally {
        if (page && !page.isClosed()) {
            try {
                await page.close();
                console.log("[CONSENT] Tab closed");
            } catch (error) {
                console.error(
                    "[CONSENT] Unable to close tab:",
                    error.message
                );
            }
        }
    }
};

async function swipeToConfirm(page) {
    try {
        await page.waitForSelector("#container", {
            visible: true,
            timeout: 10000,
        });

        await page.waitForSelector("#button", {
            visible: true,
            timeout: 10000,
        });

        const container = await page.$("#container");
        const button = await page.$("#button");

        const containerBox = await container.boundingBox();
        const buttonBox = await button.boundingBox();

        if (!containerBox || !buttonBox) {
            throw new Error("Slider coordinates not available");
        }

        const startX = buttonBox.x + buttonBox.width / 2;
        const startY = buttonBox.y + buttonBox.height / 2;
        const endX = containerBox.x + containerBox.width - buttonBox.width / 2;

        console.log(`➡️ Start: ${startX}, ${startY}`);
        console.log(`➡️ End: ${endX}, ${startY}`);

        await page.mouse.move(startX, startY);
        await page.mouse.down();

        // Faster drag: fewer steps, no intermediate waits.
        await page.mouse.move(endX, startY, { steps: 5 });
        await page.mouse.up();

        await new Promise((resolve) => setTimeout(resolve, 300));

        const after = await button.boundingBox();
        const maxX = containerBox.x + containerBox.width - buttonBox.width;
        const atEnd = after && after.x >= maxX - 5;

        console.log(
            atEnd
                ? "✅ Slider stopped at 100%"
                : "⚠️ Slider did not stay at the end"
        );

        return !!atEnd;
    } catch (error) {
        console.error("❌ Slider error:", error.message);
        return false;
    }
}

module.exports = clickConfirmButton;