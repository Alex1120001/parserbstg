const puppeteer = require('puppeteer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const axios = require('axios');
const { platform } = require('os');

// Create required directories if they don't exist
['downloads', 'media'].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
});

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

            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
        }
    }
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
        const isReddit = url.includes('reddit.com');

        if (isFacebook) return await parseFacebookPost(page, mediaDir, language, url);
        else if (isInstagram) return await parseInstagramPost(page, mediaDir, language, url);
        else if (isReddit) return await parseRedditPost(page, mediaDir, language, url);
        else throw new Error('Unsupported social media platform');

    } finally {
        await page.close();
    }
}

async function parseFacebookPost(page, mediaDir, language, url) {
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

        let contentPostElement = document.querySelector('[data-ad-comet-preview="message"]');

        let textContent = '';

        if (contentPostElement) {
            function extractTextWithEmojis(element) {
                element.childNodes.forEach(node => {
                    if (node.nodeType === Node.TEXT_NODE) {
                        textContent += node.textContent + ' ';
                    } else if (node.tagName === 'IMG' && node.alt) {
                        textContent += node.alt + ' ';
                    } else {
                        extractTextWithEmojis(node);
                    }
                });
            }

            extractTextWithEmojis(contentPostElement);
            // console.log(textContent)
        }

        const textContentVideo = document.querySelector('[data-pagelet="WatchPermalinkVideo"] + div div')?.textContent;

        const data = {
            authorName: document.querySelector('h3 a')?.textContent
                || document.querySelector('h2 a')?.textContent
                || '',

            authorPicture: document.querySelector('.xdj266r.x11i5rnm.xat24cr.x1mh8g0r.xexx8yu.x4uap5.x18d9i69.xkhd6sd.x78zum5.xdt5ytf.x1iyjqo2.x1n2onr6.xqbnct6.xga75y6 .x1rg5ohu.x1n2onr6.x3ajldb.x1ja2u2z svg image')?.getAttribute('xlink:href')
                || document.querySelector('svg image')?.getAttribute('xlink:href')
                || '',

            content: textContent || textContentVideo || document.querySelector('meta[name="description"]')?.content || '',

            likes: (() => {
                let likes = document.querySelector('.xrbpyxo.x6ikm8r.x10wlt62.xlyipyv.x1exxlbk')?.textContent
                    || document.querySelectorAll('.x1lliihq.x6ikm8r.x10wlt62.x1n2onr6.xlyipyv.xuxw1ft')[3]?.textContent
                    || document.querySelectorAll('.xdj266r.x11i5rnm.xat24cr.x1mh8g0r.xexx8yu.x4uap5.x18d9i69.xkhd6sd.x1hl2dhg.x16tdsg8.x1vvkbs.x4k7w5x.x1h91t0o.x1h9r5lt.x1jfb8zj.xv2umb2.x1beo9mf.xaigb6o.x12ejxvf.x3igimt.xarpa2k.xedcshv.x1lytzrv.x1t2pt76.x7ja8zs.x1qrby5j')[7]?.textContent;

                if (likes?.toLowerCase() === "live") {
                    likes = document.querySelectorAll('.xdj266r.x11i5rnm.xat24cr.x1mh8g0r.xexx8yu.x4uap5.x18d9i69.xkhd6sd.x1hl2dhg.x16tdsg8.x1vvkbs.x4k7w5x.x1h91t0o.x1h9r5lt.x1jfb8zj.xv2umb2.x1beo9mf.xaigb6o.x12ejxvf.x3igimt.xarpa2k.xedcshv.x1lytzrv.x1t2pt76.x7ja8zs.x1qrby5j')[7]?.textContent || '0';
                }

                return convertToNumber(likes);
            })(),

            linkTitle: document.querySelector('[data-ad-rendering-role="title"]')?.textContent || '',
            linkDescription: document.querySelector('[data-ad-rendering-role="description"]')?.textContent || '',

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
        const link = document.querySelector('[data-ad-rendering-role="meta"] span')?.textContent;
        if (hasVideo) {
            typeOfPost = 'Video';
        } else if (hasMultipleImages) {
            typeOfPost = 'Gallery';
        } else if (link) {
            typeOfPost = 'Link';
        } else {
            typeOfPost = 'Picture';
        }

        return {
            ...data,
            mediaUrls,
            typeOfPost,
            link
        };
    });

    let authorPictureFilename = '';
    if (postData.authorPicture) {
        authorPictureFilename = await downloadImage(postData.authorPicture, `author_${Date.now()}.jpg`, mediaDir, page.browser());
    }

    const mediaFilenames = [];
    const hasVideo = postData.typeOfPost === 'Video';

    if (hasVideo) {
        console.log('Post contains video. Skipping image downloads.');
    }

    for (const mediaUrl of postData.mediaUrls) {
        if (hasVideo && typeof mediaUrl === 'string' && mediaUrl.toLowerCase().includes('.jpg')) {
            console.log(`Skipping image: ${mediaUrl}`);
            continue;
        }

        if (typeof mediaUrl === 'object' && mediaUrl.videoUrl && mediaUrl.audioUrl) {
            // Завантажуємо відео та звук
            const videoFilename = `video_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp4`;
            const audioFilename = `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp4`;
            const outputFilename = `merged_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp4`;

            await downloadImage(mediaUrl.videoUrl, videoFilename, mediaDir, page.browser());
            await downloadImage(mediaUrl.audioUrl, audioFilename, mediaDir, page.browser());

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
            await downloadImage(mediaUrl, filename, mediaDir, page.browser());
            mediaFilenames.push(filename);
        }
    }

    const descriptions = postData.content ? postData.content.split('\n').filter(d => d.trim()) : [];

    return {
        platform: 'Facebook',
        language: language,
        typeOfPost: postData.typeOfPost,
        authorName: postData.authorName,
        description: descriptions.join('\n'),
        description2: postData.link || '',
        description3: postData.linkTitle || '',
        description4: postData.linkDescription || '',
        likes: postData.likes,
        comments: postData.comments,
        shares: postData.shares,
        media: mediaFilenames.join(', '),
        authorPicture: authorPictureFilename,
        timestamp: new Date().toISOString(),
        url: url
    };
}

async function parseInstagramPost(page, mediaDir, language, url) {
    const postData = await page.evaluate(async () => {
        const metaDescription = document.querySelector('meta[name="description"]').content;
        const matches = metaDescription.match(/(\d+),?(\d*) likes, (\d+) comments/);

        let likesCount = 0;
        let commentsCount = 0;

        if (matches) {
            likesCount = parseInt(matches[1] + (matches[2] ? matches[2] : ''), 10);
            commentsCount = parseInt(matches[3], 10);
        }

        const data = {
            authorName: document.querySelectorAll('article header [role="link"]')[1]?.textContent || '',
            authorPicture: document.querySelector('article header img')?.src || '',
            content: document.querySelector('article h1')?.textContent || '',
            likes: likesCount == 0 ? 11 : likesCount,
            comments: commentsCount == 0 ? 1 : commentsCount,
            shares: commentsCount == 0 ? 3 : commentsCount * 2,
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
            }
        });

        // Function to scroll through the post and collect all images
        async function collectAllImages() {
            const mediaContainer = document.querySelector('article');
            if (!mediaContainer) return [];

            const allImages = new Set();
            let previousHeight = 0;
            let attempts = 0;
            const maxAttempts = 20; // Збільшуємо кількість спроб

            while (attempts < maxAttempts) {
                // Отримуємо поточні зображення
                const currentImages = Array.from(mediaContainer.querySelectorAll('img[srcset]'))
                    .map(el => {
                        const srcset = el.getAttribute('srcset');
                        if (srcset) {
                            const srcsetUrls = srcset.split(',')
                                .map(s => s.trim().split(' ')[0]);
                            return srcsetUrls[srcsetUrls.length - 1];
                        }
                        return el.src;
                    })
                    .filter(url => url && !url.includes('avatar') && !url.includes('profile') && !url.includes('icon'));

                // Додаємо нові зображення до множини
                currentImages.forEach(url => allImages.add(url));

                // Шукаємо та натискаємо кнопки навігації
                const nextButton = document.querySelector('button[aria-label="Next"]');
                if (nextButton) {
                    nextButton.click();
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Чекаємо на завантаження нового зображення
                } else {
                    // Якщо немає кнопки "Далі", пробуємо прокрутити
                    mediaContainer.scrollTo(0, mediaContainer.scrollHeight);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                // Перевіряємо чи досягли ми кінця
                if (mediaContainer.scrollHeight === previousHeight && !nextButton) {
                    attempts++;
                }
                previousHeight = mediaContainer.scrollHeight;
            }

            return Array.from(allImages);
        }

        // Отримуємо всі зображення з поста
        const allImages = await collectAllImages();
        console.log('Знайдено зображень:', allImages.length); // Додаємо логування

        // Отримуємо медіа елементи
        const mediaContainer = document.querySelector('article');
        const mediaElements = mediaContainer ? Array.from(mediaContainer.querySelectorAll('img[srcset], video')) : [];

        // Обробляємо URL медіа
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
                return srcsetUrls[srcsetUrls.length - 1];
            }
            return el.src;
        }).filter(url => {
            if (typeof url === 'object') return true;
            return url && !url.includes('avatar') && !url.includes('profile') && !url.includes('icon');
        });

        // Визначаємо тип поста
        let typeOfPost = '';
        const hasVideo = mediaElements.some(el => el.tagName.toLowerCase() === 'video');
        const hasMultipleImages = allImages.length > 1;

        if (hasVideo) {
            typeOfPost = 'Video';
        } else if (hasMultipleImages) {
            typeOfPost = 'Collage';
        } else {
            typeOfPost = 'Picture';
        }

        return {
            ...data,
            mediaUrls: hasMultipleImages ? allImages : mediaUrls,
            typeOfPost,
        };
    });

    // Download author picture
    let authorPictureFilename = '';
    if (postData.authorPicture) {
        authorPictureFilename = await downloadImage(postData.authorPicture, `author_${Date.now()}.jpg`, mediaDir, page.browser());
    }

    // Download post media
    const mediaFilenames = [];
    for (const mediaUrl of postData.mediaUrls) {
        if (typeof mediaUrl === 'object' && mediaUrl.videoUrl && mediaUrl.audioUrl) {
            // Завантажуємо відео та звук
            const videoFilename = `video_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp4`;
            const audioFilename = `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp4`;
            const outputFilename = `merged_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp4`;

            await downloadImage(mediaUrl.videoUrl, videoFilename, mediaDir, page.browser());
            await downloadImage(mediaUrl.audioUrl, audioFilename, mediaDir, page.browser());

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
            await downloadImage(mediaUrl, filename, mediaDir, page.browser());
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
        likes: postData.likes,
        comments: postData.comments,
        shares: postData.shares,
        media: mediaFilenames.join(', '),
        authorPicture: authorPictureFilename,
        url: url
    };
}


async function parseRedditPost(page, mediaDir, language, url) {
    console.log('Parsing Reddit post...');

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });


    // const pageContent = await page.content();
    // // Зберігаємо HTML-код у файл
    // const filePath = path.join(mediaDir, 'reddit-page-content.html');
    // fs.writeFileSync(filePath, pageContent);
    // console.log(`HTML-код сторінки збережено у файл: ${filePath}`);


    const postData = await page.evaluate(() => {
        const titlePage = document.title;
        const titlePageContent = titlePage.split(':');


        const likeElement = document.querySelectorAll('faceplate-number')[2];
        const likeValue = likeElement?.getAttribute('number');



        const data = {
            authorName: titlePageContent[2]?.trim() || '',
            description: titlePageContent[0] || '',
            likes: likeValue || 0,
        };
        return data;
    });

    return {
        platform: 'Reddit',
        authorName: postData.authorName,
        likes: postData.likes,
        
    };
}
module.exports = {
    parseExcelFile
};
