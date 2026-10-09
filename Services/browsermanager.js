const os = require("os");
const path = require("path");
const fs = require("fs");

let browser = null;
let puppeteer = null;
let browserPromise = null;
let profileDir = null;

/**
 * Load Puppeteer dynamically.
 *
 * Newer Puppeteer versions can be ESM modules.
 */
async function getPuppeteer() {
    if (!puppeteer) {
        const module = await import("puppeteer");

        puppeteer = module.default || module;
    }

    return puppeteer;
}

/**
 * Create a unique Firefox profile.
 *
 * IMPORTANT:
 * Linux is using Snap Firefox.
 *
 * The profile must therefore be inside:
 *
 * /root/snap/firefox/common
 *
 * Every PM2 process gets its own profile.
 */
function createFirefoxProfile() {
    const platform = os.platform();

    let baseDir;

    if (platform === "linux") {

        /**
         * Snap Firefox profile location.
         */
        baseDir =
            "/root/snap/firefox/common";

    } else if (platform === "win32") {

        /**
         * Windows Firefox profile location.
         */
        baseDir =
            "C:\\puppeteer";

    } else {

        throw new Error(
            `Unsupported operating system: ${platform}`
        );
    }

    /**
     * Make sure base directory exists.
     */
    fs.mkdirSync(baseDir, {
        recursive: true,
        mode: 0o755,
    });

    /**
     * Unique profile.
     *
     * PID = different PM2 process
     * Date = different launch
     * Random = extra uniqueness
     */
    const profileName =
        `mtnghana-firefox-${process.pid}-${Date.now()}-${Math.random()
            .toString(36)
            .substring(2, 8)}`;

    const profilePath =
        path.join(
            baseDir,
            profileName
        );

    /**
     * Create profile directory.
     */
    fs.mkdirSync(profilePath, {
        recursive: true,
        mode: 0o700,
    });

    /**
     * Verify profile exists.
     */
    if (!fs.existsSync(profilePath)) {

        throw new Error(
            `Firefox profile was not created: ${profilePath}`
        );
    }

    /**
     * Set permissions.
     */
    try {

        fs.chmodSync(
            profilePath,
            0o700
        );

    } catch (error) {

        console.log(
            "⚠️ Could not set Firefox profile permissions:",
            error?.message || error
        );
    }

    return profilePath;
}

/**
 * Get Firefox browser.
 */
async function getBrowser() {

    /**
     * Reuse existing browser.
     *
     * Do NOT use browser.isConnected().
     */
    if (browser) {

        try {

            if (
                typeof browser.connected === "undefined" ||
                browser.connected === true
            ) {

                return browser;
            }

        } catch (error) {

            console.log(
                "⚠️ Existing Firefox instance unavailable."
            );
        }

        browser = null;
    }

    /**
     * Prevent multiple simultaneous Firefox
     * launches inside the same Node process.
     */
    if (browserPromise) {

        return browserPromise;
    }

    browserPromise = (async () => {

        const platform =
            os.platform();

        const isLinux =
            platform === "linux";

        const isWindows =
            platform === "win32";

        let executablePath;

        /**
         * =====================================
         * FIREFOX EXECUTABLE
         * =====================================
         */
        if (isLinux) {

            /**
             * Ubuntu Snap Firefox.
             */
            executablePath =
                "/snap/bin/firefox";

        } else if (isWindows) {

            executablePath =
                "C:\\Program Files\\Mozilla Firefox\\firefox.exe";

        } else {

            throw new Error(
                `Unsupported operating system: ${platform}`
            );
        }

        /**
         * Verify Firefox executable.
         */
        if (!fs.existsSync(executablePath)) {

            throw new Error(
                `Firefox executable not found: ${executablePath}`
            );
        }

        /**
         * =====================================
         * CREATE UNIQUE PROFILE
         * =====================================
         */
        profileDir =
            createFirefoxProfile();

        console.log(
            "========================================"
        );

        console.log(
            "🚀 Starting Firefox"
        );

        console.log(
            `💻 OS: ${platform}`
        );

        console.log(
            `🆔 Node PID: ${process.pid}`
        );

        console.log(
            `📍 Firefox: ${executablePath}`
        );

        console.log(
            `📁 Profile: ${profileDir}`
        );

        console.log(
            "========================================"
        );

        try {

            const puppeteerLib =
                await getPuppeteer();

            /**
             * =====================================
             * FIREFOX ARGUMENTS
             * =====================================
             */
            const firefoxArgs = [
                /**
                 * Allow this Firefox instance to use
                 * its own profile.
                 *
                 * Important when multiple PM2 workers
                 * are running.
                 */
                "-no-remote",

                /**
                 * Explicit Firefox profile.
                 */
                "-profile",

                profileDir,
            ];

            /**
             * Linux server = headless.
             */
            if (isLinux) {

                firefoxArgs.push(
                    "-headless"
                );
            }

            /**
             * Windows = visible browser.
             */
            if (isWindows) {

                firefoxArgs.push(
                    "-new-instance"
                );
            }

            console.log(
                "🦊 Firefox arguments:",
                firefoxArgs
            );

            /**
             * =====================================
             * LAUNCH FIREFOX
             * =====================================
             *
             * IMPORTANT:
             *
             * We do NOT use Puppeteer's userDataDir.
             *
             * Firefox receives the profile explicitly
             * through:
             *
             * -profile <profileDir>
             */
            const newBrowser =
                await puppeteerLib.launch({

                    browser: "firefox",

                    /**
                     * Headless is controlled by
                     * Firefox's -headless argument.
                     */
                    headless: false,

                    executablePath,

                    args: firefoxArgs,

                    acceptInsecureCerts: true,
                    timeout: 90000,
                    protocolTimeout: 120000,
                    slowMo: 100,

                    defaultViewport: null,

                    /**
                     * Keep this enabled while debugging
                     * Firefox startup.
                     */
                    dumpio: true,
                });

            /**
             * Save browser instance.
             */
            browser =
                newBrowser;

            console.log(
                "🦊 Firefox launched successfully"
            );

            console.log(
                `🆔 Node PID: ${process.pid}`
            );

            console.log(
                `📁 Firefox profile: ${profileDir}`
            );

            /**
             * Firefox disconnected.
             */
            browser.on(
    "disconnected",
    () => {
        console.log(
            "⚠️ Firefox browser disconnected"
        );

        browser = null;

        if (profileDir) {
            try {
                fs.rmSync(profileDir, {
                    recursive: true,
                    force: true,
                });

                console.log(
                    "🧹 Firefox profile removed after disconnect:",
                    profileDir
                );
            } catch (error) {
                console.error(
                    "⚠️ Could not remove Firefox profile after disconnect:",
                    error?.message || error
                );
            } finally {
                profileDir = null;
            }
        }
    }
);

            return browser;

        } catch (error) {

            console.error(
                "❌ Firefox launch failed:"
            );

            console.error(
                error?.message || error
            );

            if (error?.stack) {

                console.error(
                    error.stack
                );
            }

            browser = null;

            /**
             * Remove failed profile.
             */
            if (profileDir) {

                try {

                    fs.rmSync(
                        profileDir,
                        {
                            recursive: true,
                            force: true,
                        }
                    );

                    console.log(
                        "🧹 Removed failed Firefox profile:",
                        profileDir
                    );

                } catch (cleanupError) {

                    console.error(
                        "⚠️ Could not remove Firefox profile:",
                        cleanupError?.message ||
                            cleanupError
                    );
                }
            }

            profileDir = null;

            throw error;
        }

    })();

    try {

        return await browserPromise;

    } finally {

        browserPromise = null;
    }
}

/**
 * Close Firefox.
 */
async function closeBrowser() {

    if (!browser) {

        console.log(
            "ℹ️ Firefox is already closed."
        );

        return;
    }

    try {

        console.log(
            "🛑 Closing Firefox..."
        );

        await browser.close();

    } catch (error) {

        console.error(
            "❌ Error closing Firefox:",
            error?.message || error
        );

    } finally {

        browser = null;

        /**
         * Remove profile after browser closes.
         */
        if (profileDir) {

            try {

                fs.rmSync(
                    profileDir,
                    {
                        recursive: true,
                        force: true,
                    }
                );

                console.log(
                    "🧹 Firefox profile removed:",
                    profileDir
                );

            } catch (error) {

                console.error(
                    "⚠️ Could not remove Firefox profile:",
                    error?.message || error
                );
            }

            profileDir = null;
        }

        console.log(
            "🛑 Firefox closed"
        );
    }
}

/**
 * Export.
 */
module.exports = {
    getBrowser,
    closeBrowser,
};