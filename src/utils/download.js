const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function downloadImage(url, filename, mediaDir, browser) {
    // Skip data URLs
    if (url.startsWith('data:')) {
        return filename;
    }

    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
        try {
            const response = await axios({
                method: 'get',
                url: url,
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Referer': 'https://www.facebook.com/',
                    'Origin': 'https://www.facebook.com',
                    'Sec-Fetch-Dest': 'image',
                    'Sec-Fetch-Mode': 'no-cors',
                    'Sec-Fetch-Site': 'cross-site',
                    'Pragma': 'no-cache',
                    'Cache-Control': 'no-cache'
                }
            });

            const filepath = path.join(mediaDir, filename);
            fs.writeFileSync(filepath, response.data);
            return filename;

        } catch (error) {
            console.error(`Attempt ${retryCount + 1} failed for ${url}:`, error.message);
            retryCount++;

            if (retryCount === maxRetries) {
                console.error(`All ${maxRetries} attempts failed for ${url}`);
                throw error;
            }

            await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
        }
    }
}

module.exports = { downloadImage };