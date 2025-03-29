const puppeteer = require('puppeteer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Create required directories if they don't exist
['downloads', 'media'].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
});

async function downloadImage(url, filename, mediaDir) {
    return new Promise((resolve, reject) => {
        // Skip data URLs
        if (url.startsWith('data:')) {
            resolve(filename);
            return;
        }

        // Encode the URL to handle special characters
        const encodedUrl = encodeURI(url);

        https.get(encodedUrl, (response) => {
            if (response.statusCode === 200) {
                const filepath = path.join(mediaDir, filename);
                const fileStream = fs.createWriteStream(filepath);
                response.pipe(fileStream);
                fileStream.on('finish', () => {
                    fileStream.close();
                    resolve(filename);
                });
            } else {
                reject(new Error(`Failed to download media: ${response.statusCode}`));
            }
        }).on('error', reject);
    });
}

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
        await page.goto(encodedUrl, { waitUntil: 'networkidle0', timeout: 100000 });

        // Determine if it's Facebook or Instagram
        const isFacebook = url.includes('facebook.com') || url.includes('fb.watch');
        const isInstagram = url.includes('instagram.com');

        if (isFacebook) {
            return await parseFacebookPost(page, mediaDir, language);
        } else if (isInstagram) {
            return await parseInstagramPost(page, mediaDir, language);
        } else {
            throw new Error('Unsupported social media platform');
        }
    } finally {
        await page.close();
    }
}

async function parseFacebookPost(page, mediaDir, language) {
    const postData = await page.evaluate(() => {
      

        function convertToNumber(str) {
            if (!str) return 0;

            let multiplier = 1;
            str = str.toUpperCase().trim();

            if (str.endsWith('K')) {
                multiplier = 1000;
                str = str.replace('K', '');
            } else if (str.endsWith('M')) {
                multiplier = 1000000;
                str = str.replace('M', '');
            } else if (str.endsWith('B')) {
                multiplier = 1000000000;
                str = str.replace('B', '');
            }

            return parseFloat(str) * multiplier || 0;
        }

        const data = {
            authorName: document.querySelector('h3 a')?.textContent
                || document.querySelector('h2 a')?.textContent
                || '',

            authorPicture: document.querySelector('.xdj266r.x11i5rnm.xat24cr.x1mh8g0r.xexx8yu.x4uap5.x18d9i69.xkhd6sd.x78zum5.xdt5ytf.x1iyjqo2.x1n2onr6.xqbnct6.xga75y6 .x1rg5ohu.x1n2onr6.x3ajldb.x1ja2u2z svg image')?.getAttribute('xlink:href')
                || document.querySelector('svg image')?.getAttribute('xlink:href')
                || '',

            content: document.querySelector('meta[name="description"]')?.content || '',

            likes: (() => {
                let likes = document.querySelector('.xrbpyxo.x6ikm8r.x10wlt62.xlyipyv.x1exxlbk')?.textContent
                    || document.querySelectorAll('.x1lliihq.x6ikm8r.x10wlt62.x1n2onr6.xlyipyv.xuxw1ft')[3]?.textContent
                    || document.querySelectorAll('.xdj266r.x11i5rnm.xat24cr.x1mh8g0r.xexx8yu.x4uap5.x18d9i69.xkhd6sd.x1hl2dhg.x16tdsg8.x1vvkbs.x4k7w5x.x1h91t0o.x1h9r5lt.x1jfb8zj.xv2umb2.x1beo9mf.xaigb6o.x12ejxvf.x3igimt.xarpa2k.xedcshv.x1lytzrv.x1t2pt76.x7ja8zs.x1qrby5j')[7]?.textContent;

                if (likes?.toLowerCase() === "live") {
                    likes = document.querySelectorAll('.xdj266r.x11i5rnm.xat24cr.x1mh8g0r.xexx8yu.x4uap5.x18d9i69.xkhd6sd.x1hl2dhg.x16tdsg8.x1vvkbs.x4k7w5x.x1h91t0o.x1h9r5lt.x1jfb8zj.xv2umb2.x1beo9mf.xaigb6o.x12ejxvf.x3igimt.xarpa2k.xedcshv.x1lytzrv.x1t2pt76.x7ja8zs.x1qrby5j')[7]?.textContent || '0';
                }

                return convertToNumber(likes);
            })(),

            comments: 0,
            shares: 0
        };

        // Автоматичний розрахунок comments та shares
        data.comments = Math.round(data.likes * 0.33);
        data.shares = Math.round(data.likes * 0.14);

        console.log(data);



        const urls = [];

        (async () => {
            window.performance.getEntriesByType('resource').forEach(entry => {
                if (entry.name.includes('.mp4') || entry.name.includes('.m3u8')) {
                    let url = new URL(entry.name);
                    url.searchParams.delete('bytestart');
                    url.searchParams.delete('byteend');
                    urls.push(url.toString());
                }
            });
        })();


        const imageUrlTag = ('.xdj266r.x11i5rnm.xat24cr.x1mh8g0r.xexx8yu.x4uap5.x18d9i69.xkhd6sd.x1n2onr6 .xdj266r.x11i5rnm.xat24cr.x1mh8g0r.xexx8yu.x4uap5.x18d9i69.xkhd6sd.x1n2onr6 .html-div.xdj266r.x11i5rnm.xat24cr.x1mh8g0r.xexx8yu.x4uap5.x18d9i69.xkhd6sd.x1n2onr6 a img');

        // document.querySelector('[data-pagelet="Reels"] video')
        const mediaElements = Array.from(document.querySelectorAll(`${imageUrlTag}, [data-pagelet="WatchPermalinkVideo"] video, [data-pagelet="Reels"] video`));

        const mediaUrls = mediaElements.map(el => {
            if (el.tagName.toLowerCase() === 'video') {
                return {
                    videoUrl: urls[0],
                    audioUrl: urls[3]
                };
            }
            return el.src;
        }).filter(url => typeof url === 'string' ? (url.startsWith('http:') || url.startsWith('https:')) : true);

        let typeOfPost = '';
        // document.querySelector('[data-pagelet="Reels"] video')
        const hasVideo = document.querySelector('[data-pagelet="WatchPermalinkVideo"] video') || document.querySelector('[data-pagelet="Reels"] video');
        const hasMultipleImages = mediaElements.filter(el => el.tagName.toLowerCase() === 'img').length > 1;

        if (hasVideo) {
            typeOfPost = 'Video';
        } else if (hasMultipleImages) {
            typeOfPost = 'Gallery';
        } else {
            typeOfPost = 'Picture';
        }

        return {
            ...data,
            mediaUrls,
            typeOfPost,
        };
    });

    let authorPictureFilename = '';
    if (postData.authorPicture) {
        authorPictureFilename = `author_${Date.now()}.jpg`;
        await downloadImage(postData.authorPicture, authorPictureFilename, mediaDir);
    }

    const mediaFilenames = [];
    const hasVideo = postData.typeOfPost === 'Video'; // Перевіряємо, чи пост є відео

    if (hasVideo) {
        console.log('Post contains video. Skipping image downloads.');
    }

    for (const mediaUrl of postData.mediaUrls) {
        if (hasVideo && typeof mediaUrl === 'string' && mediaUrl.toLowerCase().includes('.jpg')) {
            // Пропускаємо завантаження зображень, якщо є відео
            console.log(`Skipping image: ${mediaUrl}`);
            continue;
        }

        if (typeof mediaUrl === 'object' && mediaUrl.videoUrl && mediaUrl.audioUrl) {
            // Завантажуємо відео та звук
            const videoFilename = `video_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp4`;
            const audioFilename = `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp4`;
            const outputFilename = `merged_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp4`;

            await downloadImage(mediaUrl.videoUrl, videoFilename, mediaDir);
            await downloadImage(mediaUrl.audioUrl, audioFilename, mediaDir);

            // Об'єднуємо відео та звук за допомогою ffmpeg
            try {
                const videoPath = path.join(mediaDir, videoFilename);
                const audioPath = path.join(mediaDir, audioFilename);
                const outputPath = path.join(mediaDir, outputFilename);

                await execPromise(`ffmpeg -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a aac "${outputPath}"`);
                fs.unlinkSync(videoPath);
                fs.unlinkSync(audioPath);

                mediaFilenames.push(outputFilename);
            } catch (error) {
                console.error('Error merging video and audio:', error);
                // Якщо не вдалося об'єднати, зберігаємо відео без звуку
                mediaFilenames.push(videoFilename);
            }
        } else if (typeof mediaUrl === 'string') {
            // Завантажуємо зображення або відео
            const extension = mediaUrl.toLowerCase().includes('.mp4') || mediaUrl.toLowerCase().includes('.m3u8') ? '.mp4' : '.jpg';
            const filename = `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}${extension}`;
            await downloadImage(mediaUrl, filename, mediaDir);
            mediaFilenames.push(filename);
        }
    }

    const descriptions = postData.content ? postData.content.split('\n').filter(d => d.trim()) : [];

    return {
        platform: 'Facebook',
        language: language,
        typeOfPost: postData.typeOfPost,
        authorName: postData.authorName,
        description: (descriptions[0] || '') + '\n' + (descriptions[1] || '') + '\n' + (descriptions[2] || '') + '\n' + (descriptions[3] || ''),
        description2: '',
        description3: '',
        description4: '',
        likes: postData.likes,
        comments: postData.comments,
        shares: postData.shares,
        media: mediaFilenames.join(', '),
        authorPicture: authorPictureFilename,
        timestamp: new Date().toISOString(),
    };
}

async function parseInstagramPost(page, mediaDir, language) {
    const postData = await page.evaluate(() => {
        const data = {
            authorName: document.querySelector('article header div div div a')?.textContent || '',
            authorPicture: document.querySelector('article header img')?.src || '',
            content: document.querySelector('article h1')?.textContent || '',
            likes: document.querySelector('article section a span span').textContent || '0',
            comments: document.querySelector('article section ul li')?.textContent || '0',
            timestamp: document.querySelector('article header time')?.dateTime || '',
        };

        // Get video and audio URLs
        const urls = [];
        window.performance.getEntriesByType('resource').forEach(entry => {
            if (entry.name.includes('.mp4') || entry.name.includes('.m3u8')) {
                let url = new URL(entry.name);
                url.searchParams.delete('bytestart');
                url.searchParams.delete('byteend');
                urls.push(url.toString());
                console.log(urls)
            }

        });

        // Get media elements
        const mediaContainer = document.querySelector('article');
        const mediaElements = mediaContainer ? Array.from(mediaContainer.querySelectorAll('img[srcset], video')) : [];

        // Process media URLs
        const mediaUrls = mediaElements.map(el => {
            if (el.tagName.toLowerCase() === 'video') {
                return {
                    videoUrl: urls[0],
                    audioUrl: urls[7]
                };
            }
            const srcset = el.getAttribute('srcset');
            if (srcset) {
                const srcsetUrls = srcset.split(',')
                    .map(s => s.trim().split(' ')[0]);
                return srcsetUrls[srcsetUrls.length - 1]; // Найвища роздільна здатність
            }
            return el.src;
        }).filter(url => {
            if (typeof url === 'object') return true;
            return url && !url.includes('avatar') && !url.includes('profile') && !url.includes('icon');
        });

        // Determine post type
        let typeOfPost = '';
        const hasVideo = mediaElements.some(el => el.tagName.toLowerCase() === 'video');
        const hasMultipleImages = mediaElements.filter(el => el.tagName.toLowerCase() === 'img').length > 1;

        if (hasVideo) {
            typeOfPost = 'Video';
        } else {
            typeOfPost = 'Picture';
        }

        return {
            ...data,
            mediaUrls,
            typeOfPost,
        };
    });

    // Download author picture
    let authorPictureFilename = '';
    if (postData.authorPicture) {
        authorPictureFilename = `author_${Date.now()}.jpg`;
        await downloadImage(postData.authorPicture, authorPictureFilename, mediaDir);
    }

    // Download post media
    const mediaFilenames = [];
    for (const mediaUrl of postData.mediaUrls) {
        if (typeof mediaUrl === 'object' && mediaUrl.videoUrl && mediaUrl.audioUrl) {
            // Завантажуємо відео та звук
            const videoFilename = `video_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp4`;
            const audioFilename = `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp4`;
            const outputFilename = `merged_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp4`;

            await downloadImage(mediaUrl.videoUrl, videoFilename, mediaDir);
            await downloadImage(mediaUrl.audioUrl, audioFilename, mediaDir);

            // Об'єднуємо відео та звук за допомогою ffmpeg
            try {
                const videoPath = path.join(mediaDir, videoFilename);
                const audioPath = path.join(mediaDir, audioFilename);
                const outputPath = path.join(mediaDir, outputFilename);

                await execPromise(`ffmpeg -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a aac "${outputPath}"`);

                // Видаляємо тимчасові файли
                fs.unlinkSync(videoPath);
                fs.unlinkSync(audioPath);

                mediaFilenames.push(outputFilename);
            } catch (error) {
                console.error('Error merging video and audio:', error);
                // Якщо не вдалося об'єднати, зберігаємо відео без звуку
                mediaFilenames.push(videoFilename);
            }
        } else if (typeof mediaUrl === 'string') {
            // Визначаємо розширення файлу на основі URL
            const extension = mediaUrl.toLowerCase().includes('.mp4') || mediaUrl.toLowerCase().includes('.m3u8') ? '.mp4' : '.jpg';
            const filename = `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}${extension}`;
            await downloadImage(mediaUrl, filename, mediaDir);
            mediaFilenames.push(filename);
        }
    }

    const descriptions = postData.content.split('\n').filter(d => d.trim());

    return {
        platform: 'Instagram',
        language: language,
        typeOfPost: postData.typeOfPost,
        authorName: postData.authorName,
        description: descriptions[0] || '',
        description2: descriptions[1] || '',
        description3: descriptions[2] || '',
        description4: descriptions[3] || '',
        likes: postData.likes,
        comments: postData.comments,
        shares: '0',
        media: mediaFilenames.join(', '),
        authorPicture: authorPictureFilename,
        timestamp: new Date().toISOString()
    };
}

module.exports = {
    parseExcelFile
};
