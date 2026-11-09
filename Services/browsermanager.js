
const puppeteer = require("puppeteer");
const os = require("os");

let browser = null;
let launching = null;

async function getBrowser() {
    // Reuse only a connected browser.
    if (browser) {
        try {
            if (browser.connected) {
                return browser;
            }
        } catch (error) {
            console.log("Browser connection check failed");
        }

        browser = null;
    }

    // Prevent multiple Chrome launches.
    if (launching) {
        return launching;
    }

    const isLinux = os.platform() === "linux";
    const isWindows = os.platform() === "win32";

    let executablePath;

    if (isLinux) {
        executablePath = "/usr/bin/chromium-browser";
    } else if (isWindows) {
        executablePath =
            "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
    }

    launching = (async () => {
        const newBrowser = await puppeteer.launch({
            headless: isLinux ? "new" : false,

            ...(executablePath ? { executablePath } : {}),

            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-infobars"
            ]
        });

        browser = newBrowser;

        newBrowser.on("disconnected", () => {
            console.error("⚠️ Chrome disconnected");

            if (browser === newBrowser) {
                browser = null;
            }
        });

        console.log("🚀 Chrome launched successfully");

        return newBrowser;
    })();

    try {
        return await launching;
    } finally {
        launching = null;
    }
}

async function closeBrowser() {
    const currentBrowser = browser;
    browser = null;

    if (currentBrowser) {
        try {
            await currentBrowser.close();
        } catch (error) {
            console.error("Browser close error:", error.message);
        }
    }
}

module.exports = {
    getBrowser,
    closeBrowser
};
