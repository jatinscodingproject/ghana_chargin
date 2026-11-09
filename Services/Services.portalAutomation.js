
const { getBrowser } = require("./browsermanager");

const sleep = ms =>
    new Promise(resolve => setTimeout(resolve, ms));

const STAGING_REDIRECT_HOST = "20.238.64.101";
const OFFER_CODE = "9916710032";
const LANDING_URL = "http://mobile.arenaxpro.com/";
const CG_TIMEOUT = 60000;

// --------------------------------------------------
// STAGING SAFETY CHECK
// --------------------------------------------------

function getStagingUrl() {
    const testMsisdn = process.env.STAGING_TEST_MSISDN;

    if (!testMsisdn || !/^233\d{9}$/.test(testMsisdn)) {
        throw new Error(
            "Configure STAGING_TEST_MSISDN with an approved staging test number"
        );
    }

    const redirect = new URL(
        `http://${STAGING_REDIRECT_HOST}/Redirect`
    );

    redirect.searchParams.set("OfferCode", OFFER_CODE);
    redirect.searchParams.set("redirectUrl", LANDING_URL + "redirect");
    redirect.searchParams.set("mobileNumber", testMsisdn);

    if (redirect.hostname !== STAGING_REDIRECT_HOST) {
        throw new Error("Staging host validation failed");
    }

    return {
        url: redirect.toString(),
        msisdn: testMsisdn
    };
}

// --------------------------------------------------
// SECURITY FILTER
// --------------------------------------------------

async function blockSessionRecording(page) {
    await page.setRequestInterception(true);

    const stats = {
        blocked: 0,
        allowed: 0
    };

    page.on("request", request => {
        const requestUrl = request.url();

        if (
            requestUrl.includes("/save-recording") &&
            requestUrl.includes("sc=nigeria")
        ) {
            stats.blocked++;

            console.log(
                "[SECURITY] BLOCKED recording request:",
                requestUrl
            );

            request.abort("blockedbyclient").catch(() => {});
            return;
        }

        stats.allowed++;

        request.continue().catch(error => {
            console.error(
                "[SECURITY] Request continuation error:",
                error.message
            );
        });
    });

    console.log("[SECURITY] Request interception enabled");

    return stats;
}

// --------------------------------------------------
// BROWSER DIAGNOSTICS
// --------------------------------------------------

function registerDiagnostics(page, label) {
    page.on("requestfailed", request => {
        console.error(
            `[${label}] REQUEST FAILED:`,
            request.url(),
            request.failure()?.errorText
        );
    });

    page.on("pageerror", error => {
        console.error(`[${label}] PAGE ERROR:`, error.message);
    });

    page.on("response", response => {
        if (response.status() >= 400) {
            console.error(
                `[${label}] HTTP ERROR:`,
                response.status(),
                response.url()
            );
        }
    });

    page.on("framenavigated", frame => {
        if (frame === page.mainFrame()) {
            console.log(
                `[${label}] NAVIGATION:`,
                frame.url()
            );
        }
    });
}

// --------------------------------------------------
// PAGE INSPECTION
// --------------------------------------------------

async function inspectPage(page) {
    return page.evaluate(() => {
        const subscribe = document.querySelector(
            "#bannerSubscribeBtn"
        );

        const container = document.querySelector("#container");
        const sliderButton = document.querySelector("#button");

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

            sliderContainer: !!container,
            sliderButton: !!sliderButton,

            pageText:
                document.body?.innerText?.slice(0, 1500) || ""
        };
    });
}

// --------------------------------------------------
// FIND CG PAGE
// Supports same-tab navigation and popup tabs.
// --------------------------------------------------

async function findCgPage(browser, initialPage, timeoutMs) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
        const pages = await browser.pages();

        for (const candidate of pages) {
            if (candidate.isClosed()) continue;

            try {
                const state = await inspectPage(candidate);

                if (
                    state.sliderContainer &&
                    state.sliderButton
                ) {
                    console.log("[CG] Consent interface detected");
                    console.log("[CG] URL:", state.url);

                    return candidate;
                }
            } catch (_) {
                // Page may still be navigating.
            }
        }

        await sleep(500);
    }

    const state = !initialPage.isClosed()
        ? await inspectPage(initialPage).catch(() => null)
        : null;

    throw new Error(
        "CG page or slider was not detected. Last state: " +
        JSON.stringify(state)
    );
}

// --------------------------------------------------
// STAGING SLIDER TEST
// --------------------------------------------------

async function dragStagingSlider(page) {
    await page.waitForSelector("#container", {
        visible: true,
        timeout: 30000
    });

    await page.waitForSelector("#button", {
        visible: true,
        timeout: 30000
    });

    const container = await page.$("#container");
    const button = await page.$("#button");

    const containerBox = await container.boundingBox();
    const buttonBox = await button.boundingBox();

    if (!containerBox || !buttonBox) {
        throw new Error("Slider coordinates unavailable");
    }

    const startX = buttonBox.x + buttonBox.width / 2;
    const startY = buttonBox.y + buttonBox.height / 2;

    const endX =
        containerBox.x +
        containerBox.width -
        buttonBox.width / 2;

    console.log("[CG TEST] Slider detected");
    console.log("[CG TEST] Slider dimensions:", {
        containerWidth: containerBox.width,
        buttonWidth: buttonBox.width
    });

    // This test action is permitted only on the
    // separately verified non-billable staging service.
    await page.mouse.move(startX, startY);
    await page.mouse.down();

    await page.mouse.move(
        endX,
        startY,
        { steps: 25 }
    );

    await page.mouse.up();

    await sleep(1000);

    const after = await button.boundingBox();

    const maxX =
        containerBox.x +
        containerBox.width -
        buttonBox.width;

    const atEnd = !!after && after.x >= maxX - 5;

    console.log(
        atEnd
            ? "[CG TEST] Slider reached the end"
            : "[CG TEST] Slider did not reach the end"
    );

    return atEnd;
}

// --------------------------------------------------
// MAIN FUNCTION
// --------------------------------------------------

const clickConfirmButton = async ({
    msisdn,
    client_ip,
    transactionId,
    headers
}) => {
    let browser;
    let page;
    let cgPage;

    try {
        // Refuse to run without an approved staging number.
        const staging = getStagingUrl();

        if (msisdn && msisdn !== staging.msisdn) {
            throw new Error(
                "Provided MSISDN does not match staging test MSISDN"
            );
        }

        browser = await getBrowser();

        if (!browser.isConnected()) {
            throw new Error("Chrome is disconnected");
        }

        console.log("[STAGING] Chrome connected");

        page = await browser.newPage();

        await page.setViewport({
            width: 1280,
            height: 900
        });

        page.setDefaultNavigationTimeout(90000);
        page.setDefaultTimeout(30000);

        registerDiagnostics(page, "LANDING");

        const securityStats =
            await blockSessionRecording(page);

        await page.setUserAgent(
            "Mozilla/5.0 (Linux; Android 10; K) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/153.0.0.0 Mobile Safari/537.36"
        );

        await page.setExtraHTTPHeaders({
            "accept-language":
                headers?.["accept-language"] || "en-US,en;q=0.9"
        });

        // STEP 1: Open staging redirect.
        console.log("[STAGING] Opening redirect endpoint");

        const response = await page.goto(staging.url, {
            waitUntil: "domcontentloaded",
            timeout: 90000
        });

        console.log(
            "[STAGING] Redirect HTTP status:",
            response?.status() ?? "NO RESPONSE"
        );

        console.log(
            "[STAGING] Landing URL:",
            page.url()
        );

        // STEP 2: Detect landing-page Subscribe button.
        await page.waitForSelector("#bannerSubscribeBtn", {
            visible: true,
            timeout: 30000
        });

        const landingState = await inspectPage(page);

        console.log(
            "[STAGING] Landing page:",
            JSON.stringify(landingState, null, 2)
        );

        if (
            !landingState.subscribeButton ||
            landingState.subscribeButton.disabled
        ) {
            throw new Error("Subscribe button unavailable");
        }

        // STEP 3: Staging-only button interaction.
        console.log("[STAGING] Activating test Subscribe button");

        await page.click("#bannerSubscribeBtn");

        // STEP 4: Wait for CG page.
        console.log("[STAGING] Waiting for CG page");

        cgPage = await findCgPage(
            browser,
            page,
            CG_TIMEOUT
        );

        registerDiagnostics(cgPage, "CG");

        // STEP 5: Inspect CG.
        const cgState = await inspectPage(cgPage);

        console.log(
            "[CG] Page state:",
            JSON.stringify(cgState, null, 2)
        );

        // STEP 6: Test slider on staging.
        const sliderPassed =
            await dragStagingSlider(cgPage);

        // STEP 7: Final diagnostic result.
        const finalState = await inspectPage(cgPage);

        console.log("[STAGING] Final URL:", finalState.url);

        console.log(
            "[SECURITY] Blocked requests:",
            securityStats.blocked
        );

        console.log(
            "[SECURITY] Allowed requests:",
            securityStats.allowed
        );

        return {
            success: sliderPassed,
            testOnly: true,
            billable: false,
            status: sliderPassed
                ? "STAGING_UI_TEST_PASSED"
                : "STAGING_SLIDER_TEST_FAILED",

            transactionId: transactionId || null,

            security: {
                interceptionEnabled: true,
                blocked: securityStats.blocked,
                allowed: securityStats.allowed
            },

            landingPage: landingState,
            cgPage: finalState,
            sliderPassed
        };

    } catch (error) {
        console.error(
            "[STAGING TEST FAILED]",
            error.stack || error.message
        );

        return {
            success: false,
            testOnly: true,
            billable: false,
            status: "STAGING_TEST_FAILED",
            error: error.message
        };

    } finally {
        // Close only tabs created by this test.
        for (const testPage of [cgPage, page]) {
            if (
                testPage &&
                !testPage.isClosed()
            ) {
                await testPage.close().catch(() => {});
            }
        }

        console.log("[STAGING] Test tabs closed");
    }
};

module.exports = clickConfirmButton;
