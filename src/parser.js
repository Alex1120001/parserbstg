const puppeteer = require('puppeteer');
const XLSX = require('xlsx');
const { ensureDirectories } = require('./utils/common');
const { parseRedditPost } = require('./parsers/reddit');
const { parseInstagramPost } = require('./parsers/instagram');
const { parseFacebookPost } = require('./parsers/facebook');

ensureDirectories();

async function parseExcelFile(filePath, mediaDir, language) {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    const results = [];
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        for (const row of data) {
            if (!row.URL) continue;

            const url = row.URL.trim();
            if (!url) continue;

            console.log(`\n=== Processing URL: ${url} ===`);
            const result = await parseUrl(browser, url, mediaDir, language);
            results.push(result);

            // Add delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    } finally {
        await browser.close();
    }

    return results;
}

async function parseUrl(browser, url, mediaDir, language) {
    const page = await browser.newPage();

    try {
        // Encode the URL before navigating
        const encodedUrl = encodeURI(url);

        // Determine if it's Facebook or Instagram
        const isFacebook = url.includes('facebook.com') || url.includes('fb.watch');
        const isInstagram = url.includes('instagram.com');
        const isReddit = url.includes('reddit.com');

        if (isInstagram) {
           
            // const isLoggedIn = await loginToInstagram(page);
            // if (!isLoggedIn) {
            //     throw new Error('Failed to authenticate with Instagram');
            // }

            await page.goto(encodedUrl, { waitUntil: 'networkidle0', timeout: 100000 });
            return await parseInstagramPost(page, mediaDir, language, url);
        } else {
            // For other platforms, just navigate to the URL
            await page.goto(encodedUrl, { waitUntil: 'networkidle0', timeout: 100000 });
            if (isFacebook) return await parseFacebookPost(page, mediaDir, language, url);
            else if (isReddit) return await parseRedditPost(page, mediaDir, language, url);
            else throw new Error('Unsupported social media platform');
        }
    } finally {
        await page.close();
    }
}



module.exports = {
    parseExcelFile
};
