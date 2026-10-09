const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CONTAINER_SEL = "#container";
const BUTTON_SEL = "#button";

/**
 * Search the main page and every iframe for the slider container.
 * Returns the Frame (or Page) that contains it, or null on timeout.
 */
async function findSliderFrame(page, timeout = 20000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        // page.frames() includes the main frame
        for (const frame of page.frames()) {
            try {
                const el = await frame.$(CONTAINER_SEL);
                if (el) {
                    await el.dispose();
                    return frame;
                }
            } catch (_) {
                // frame may be detached mid-navigation, ignore
            }
        }
        await sleep(300);
    }
    return null;
}

/** Save screenshot + html + frame list so you can see what the browser saw. */
async function dumpDebug(page, tag = "slider-debug") {
    try {
        console.log("🔎 URL:", page.url());
        for (const f of page.frames()) {
            let has = false;
            try {
                has = !!(await f.$(CONTAINER_SEL));
            } catch (_) {}
            console.log(`   frame: ${f.url() || "(blank)"} -> has ${CONTAINER_SEL}: ${has}`);
        }
        await page.screenshot({ path: `${tag}.png`, fullPage: true });
        const fs = require("fs");
        fs.writeFileSync(`${tag}.html`, await page.content());
        console.log(`📸 Saved ${tag}.png and ${tag}.html`);
    } catch (e) {
        console.log("Debug dump failed:", e.message);
    }
}

/** One drag attempt. Returns true if the handle reached the end (or the slider vanished = success). */
async function dragOnce(page, frame) {
    const container = await frame.$(CONTAINER_SEL);
    const button = await frame.$(BUTTON_SEL);
    if (!container || !button) throw new Error("Slider elements missing");

    // Make sure it's on screen so coordinates are valid
    await container.evaluate((el) =>
        el.scrollIntoView({ block: "center", inline: "center" })
    );
    await sleep(200);

    // boundingBox() already accounts for iframe offsets in Puppeteer
    const containerBox = await container.boundingBox();
    const buttonBox = await button.boundingBox();

    if (!containerBox || !buttonBox) {
        throw new Error("Slider coordinates not available (element hidden or zero size)");
    }

    const startX = buttonBox.x + buttonBox.width / 2;
    const startY = buttonBox.y + buttonBox.height / 2;
    // Overshoot the right edge so the slider clamps to 100%
    const endX = containerBox.x + containerBox.width + 30;

    console.log(`➡️ Start: ${Math.round(startX)}, ${Math.round(startY)}`);
    console.log(`➡️ End:   ${Math.round(endX)}, ${Math.round(startY)}`);

    await page.mouse.move(startX, startY);
    await sleep(100);
    await page.mouse.down();
    await sleep(100);

    // Smooth drag with slight vertical jitter so it looks less robotic
    const steps = 40;
    for (let i = 1; i <= steps; i++) {
        const x = startX + ((endX - startX) * i) / steps;
        const y = startY + (Math.random() - 0.5) * 2;
        await page.mouse.move(x, y);
        await sleep(8 + Math.random() * 12);
    }

    // Hold at the end so the slider registers 100% before release
    await sleep(300);
    await page.mouse.move(endX, startY);
    await sleep(150);
    await page.mouse.up();

    // Give the page time to run its "confirmed" logic
    await sleep(800);

    // Verify result
    try {
        const after = await button.boundingBox();
        if (!after) {
            // Button no longer rendered -> slider was dismissed, treat as success
            console.log("✅ Slider disappeared after swipe (confirmed)");
            return true;
        }
        const maxX = containerBox.x + containerBox.width - buttonBox.width;
        const atEnd = after.x >= maxX - 5;
        console.log(atEnd ? "✅ Slider stopped at 100%" : "⚠️ Slider did not stay at the end");
        return atEnd;
    } catch (_) {
        // Element detached from DOM -> page moved on, success
        console.log("✅ Slider element removed after swipe (confirmed)");
        return true;
    }
}

async function swipeToConfirm(page, { retries = 3, findTimeout = 20000 } = {}) {
    console.log("========== SLIDER DEBUG ==========");
    console.log("page type:", page?.constructor?.name);
    console.log("url:", typeof page?.url === "function" ? page.url() : "NO URL METHOD");
    console.log("frames:", page.frames().length);
    console.log("==================================");

    try {
        // 1. Locate the slider (main page OR any iframe)
        const frame = await findSliderFrame(page, findTimeout);

        if (!frame) {
            console.error(`❌ Slider error: ${CONTAINER_SEL} not found in any frame`);
            await dumpDebug(page);
            return false;
        }

        console.log("📍 Slider found in frame:", frame.url() || "(main page)");

        // 2. Wait until both elements are actually visible
        await frame.waitForSelector(CONTAINER_SEL, { visible: true, timeout: 10000 });
        await frame.waitForSelector(BUTTON_SEL, { visible: true, timeout: 10000 });

        // 3. Try the drag, retrying if it doesn't reach the end
        for (let attempt = 1; attempt <= retries; attempt++) {
            console.log(`🔁 Attempt ${attempt}/${retries}`);
            try {
                const ok = await dragOnce(page, frame);
                if (ok) return true;
            } catch (err) {
                console.warn(`⚠️ Attempt ${attempt} failed: ${err.message}`);
            }
            await sleep(700);
        }

        console.error("❌ Slider error: all attempts failed");
        await dumpDebug(page, "slider-failed");
        return false;
    } catch (error) {
        console.error("❌ Slider error:", error.message);
        await dumpDebug(page, "slider-error");
        return false;
    }
}

module.exports = { swipeToConfirm, findSliderFrame };