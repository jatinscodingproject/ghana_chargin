const puppeteer = require("puppeteer");
const os = require("os");

let browser = null;

async function getBrowser() {
  if (browser) return browser;

  const isLinux = os.platform() === "linux";
  const isWindows = os.platform() === "win32";

  let executablePath;

  if (isLinux) {
    executablePath = "/usr/bin/chromium-browser";
  } else if (isWindows) {
    executablePath =
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  }

  browser = await puppeteer.launch({
    headless: isLinux ? "new" : false,
    executablePath,

    ignoreHTTPSErrors: true,

    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-infobars",
      "--disable-features=HttpsFirstMode",
      "--disable-web-security",
      ...(isLinux ? [] : ["--start-maximized"]),
    ],

    ignoreDefaultArgs: ["--enable-automation"],
  });

  console.log("🚀 Chrome launched (shared browser)");
  return browser;
}

async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
    console.log("🛑 Chrome closed");
  }
}

module.exports = { getBrowser, closeBrowser };