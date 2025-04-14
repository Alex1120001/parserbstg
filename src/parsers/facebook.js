const path = require('path');
const fs = require('fs');
const { downloadImage } = require('../utils/download');
const { execPromise } = require('../utils/common');

const avatarCache = new Map();

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
        if (avatarCache.has(postData.authorName)) {
            authorPictureFilename = avatarCache.get(postData.authorName);
            console.log(`Використовуємо кешовану аватарку для ${postData.authorName}: ${authorPictureFilename}`);
        } else {
            authorPictureFilename = await downloadImage(postData.authorPicture, `author_${Date.now()}.jpg`, mediaDir, page.browser());
            avatarCache.set(postData.authorName, authorPictureFilename);
            console.log(`Збережено нову аватарку для ${postData.authorName}: ${authorPictureFilename}`);
        }
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

module.exports = { parseFacebookPost };