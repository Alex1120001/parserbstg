const path = require('path');
const fs = require('fs');
const { downloadImage } = require('../utils/download');
const { execPromise } = require('../utils/common');


const avatarCache = new Map();

// async function loginToInstagram(page) {
//     try {
//         // Set a more realistic user agent
//         await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

//         // Go to Instagram login page
//         await page.goto('https://www.instagram.com/accounts/login/', {
//             waitUntil: 'networkidle0',
//             timeout: 60000
//         });

//         // Wait for either the login form or the "Save Info" popup
//         await Promise.race([
//             page.waitForSelector('input[name="username"]', { timeout: 30000 }),
//             page.waitForSelector('button[type="button"]', { timeout: 30000 })
//         ]);

//         // Check if we're already logged in (Save Info popup)
//         const saveInfoButton = await page.$('button[type="button"]');
//         if (saveInfoButton) {
//             console.log('Already logged in to Instagram');
//             return true;
//         }

//         // Add a small delay to simulate human behavior
//         await page.waitForTimeout(2000);

//         // Type username and password with random delays
//         await page.type('input[name="username"]', '_pprovokatorr_', { delay: 100 });
//         await page.waitForTimeout(1000);
//         await page.type('input[name="password"]', 'wertasd123', { delay: 100 });
//         await page.waitForTimeout(1000);

//         // Click login button
//         await page.click('button[type="submit"]');

//         // Wait for navigation and check if login was successful
//         await page.waitForNavigation({
//             waitUntil: 'networkidle0',
//             timeout: 30000
//         });

//         // Check if we're still on the login page
//         const currentUrl = page.url();
//         if (currentUrl.includes('accounts/login')) {
//             throw new Error('Instagram login failed - still on login page');
//         }

//         // Additional check for common login failure indicators
//         const errorMessage = await page.$('p[data-testid="login-error-message"]');
//         if (errorMessage) {
//             const errorText = await page.evaluate(el => el.textContent, errorMessage);
//             throw new Error(`Instagram login failed: ${errorText}`);
//         }

//         console.log('Successfully logged in to Instagram');
//         return true;
//     } catch (error) {
//         console.error('Error logging in to Instagram:', error);
//         // Take a screenshot for debugging
//         try {
//             await page.screenshot({ path: 'instagram-login-error.png' });
//             console.log('Screenshot saved as instagram-login-error.png');
//         } catch (screenshotError) {
//             console.error('Failed to save screenshot:', screenshotError);
//         }
//         return false;
//     }
// }

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
            authorName: document.querySelectorAll('article header [role="link"]')[1]?.textContent || document.querySelectorAll('article header [role="link"]')[2]?.textContent,
            authorPicture: document.querySelector('article header img')?.src || '',
            content: document.querySelector('article h1')?.textContent || '',
            likes: likesCount == 0 ? 11 : likesCount,
            comments: commentsCount == 0 ? 1 : commentsCount,
            shares: commentsCount == 0 ? 3 : commentsCount * 2,
            timestamp: document.querySelector('article header time')?.dateTime || '',
        };

       
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
        if (avatarCache.has(postData.authorName)) {
            authorPictureFilename = avatarCache.get(postData.authorName);
            console.log(`Використовуємо кешовану аватарку для ${postData.authorName}: ${authorPictureFilename}`);
        } else {
            authorPictureFilename = await downloadImage(postData.authorPicture, `author_${Date.now()}.jpg`, mediaDir, page.browser());
            avatarCache.set(postData.authorName, authorPictureFilename);
            console.log(`Збережено нову аватарку для ${postData.authorName}: ${authorPictureFilename}`);
        }
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



// module.exports = { parseInstagramPost, loginToInstagram };
module.exports = { parseInstagramPost };