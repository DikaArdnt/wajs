const waVersion = require('@wppconnect/wa-version');
const fs = require('fs');
const path = require('path');
const playwright = require('playwright');

const { WhatsWebURL } = require('./Constant');
const { LoadUtils, StoreObject } = require('./Injected');

async function preparePage(page, version) {
    page.route('https://web.whatsapp.com/**', (route) => {
        if (route.request().url() === WhatsWebURL) {
            return route.fulfill({
                status: 200,
                contentType: 'text/html',
                body: waVersion.getPageContent(version),
            });
        }

        return route.continue();
    });

    page.addInitScript(() => {
        // Remove existent service worker
        navigator.serviceWorker
            .getRegistrations()
            .then((registrations) => {
                for (const registration of registrations) {
                    registration.unregister();
                }
            })
            .catch(() => null);

        navigator.serviceWorker.register = new Promise(() => { });

        setInterval(() => {
            window.onerror = console.error;
            window.onunhandledrejection = console.error;
            (window).wppForceMainLoad = true;
        }, 500);
    });

    page.on('load', async (page) => {
        setTimeout(async () => {
            await page.addScriptTag({
                path: require.resolve('@wppconnect/wa-js'),
            });
        }, 1000);
    });
}

async function getPage(options = {}) {
    const browserName = options.browser || 'chromium';
    const WWebVersion = options.version || waVersion.getLatestVersion();

    let browser;
    let page;
    if (options.browserWS) {
        browser = await playwright[browserName].connect(options.browserWS, options.playwright);
        page = await browser.newPage();
    }

    if (options.sessionName && typeof options.sessionName === 'string') {
        const sessionPath = path.resolve(options?.sessionPath || './.wajs_auth/');
        const sessionName = options?.sessionName || 'session';
        const dirPath = path.join(sessionPath, sessionName);

        if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });

        browser = await playwright[browserName].launchPersistentContext(dirPath, { ...options.playwright, args: options.args });
        page = browser.pages().length ? browser.pages()[0] : await browser.newPage();
    } else {
        browser = await playwright[browserName].launch({ ...options.playwright, args: options.args });
        page = await browser.newPage();
    }

    await preparePage(page, WWebVersion);

    await page.goto(WhatsWebURL, {
        waitUntil: 'load',
        timeout: 0,
        referer: 'https://whatsapp.com/'
    });

    page.setDefaultTimeout(0);

    await page.waitForFunction(() => (window).Debug?.VERSION, {}, { timeout: 0 }).catch(() => null);

    const version = await page
        .evaluate(() => (window).Debug.VERSION)
        .catch(() => null);

    console.log('WhatsApp Version: ', version);

    await page.waitForFunction(() => window.WPP?.isReady, {}, { timeout: 0 });

    // setup options WPP
    await page.evaluate((options) => {
        window.WPPConfig = options;
    }, options);

    // Load Store
    await page.evaluate(StoreObject);

    // Check window.Store Injection
    await page.waitForFunction('window.Store != undefined');

    //Load util functions (serializers, helper functions)
    await page.evaluate(LoadUtils);

    return { browser, page };
}

module.exports = { getPage, preparePage };