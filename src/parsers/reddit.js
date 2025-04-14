const path = require('path');
const fs = require('fs');
const { downloadImage } = require('../utils/download');


async function parseRedditPost(page, mediaDir, language, url) {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });

    // First, navigate through all gallery slides to load all images
    await page.evaluate(() => {
        const host = document.querySelector('gallery-carousel');
        const shadow = host?.shadowRoot;

        if (!shadow) {
            console.log('Shadow root не знайдено');
            return;
        }

        const nextBtnSelector = 'button[aria-label="Next page"]';

        function clickNextIfExists() {
            const nextButton = shadow.querySelector(nextBtnSelector);

            if (nextButton && !nextButton.disabled && !nextButton.getAttribute('aria-disabled')) {
                nextButton.click();
                // Трішки почекати, щоб встиг завантажитися новий елемент
                setTimeout(clickNextIfExists, 500);
            } else {
                console.log('Дійшли до останнього елемента.');
            }
        }

        clickNextIfExists();
    });

    // Wait for all images to load
    await new Promise(resolve => setTimeout(resolve, 2000));

    const postData = await page.evaluate(() => {
        const pageTitle = document.title;

        let postTitle = '';
        let communityName = '';
        const parts = pageTitle.split(':');

        if (parts.length > 1) {
            communityName = parts[parts.length - 1].trim();
            postTitle = parts.slice(0, -1).join(':').trim();
        } else {
            postTitle = pageTitle.trim();
        }

        const communityIcon = document.querySelector('.shreddit-subreddit-icon__icon');
        const communityAvatar = communityIcon ? communityIcon.src.split('?')[0] : '';

        let mediaUrls = [];

        function findFirstVideoSrcInShadowRoots(root = document) {
            let foundSrc = null;

            function traverse(node) {
                if (foundSrc) return; // вже знайшли
                if (node.shadowRoot) {
                    const video = node.shadowRoot.querySelector('video');
                    if (video) {
                        foundSrc = video.src;
                        return;
                    }
                    node.shadowRoot.querySelectorAll('*').forEach(traverse);
                }
            }

            root.querySelectorAll('*').forEach(traverse);
            return foundSrc;
        }

        // Спочатку шукаємо відео
        const firstVideoSrc = findFirstVideoSrcInShadowRoots();
        const singleImage = document.querySelector('.media-lightbox-img img')?.src;
        const galleryImages = Array.from(document.querySelectorAll('gallery-carousel img'));

        let typePost = 'text';

        if (firstVideoSrc) {
            mediaUrls.push(firstVideoSrc);
            typePost = 'video';
            isVideo = true;
        } else if (singleImage) {
            mediaUrls.push(singleImage);
            typePost = 'image';
        } else if (galleryImages && galleryImages.length > 0) {
            mediaUrls = galleryImages
                .filter((_, index) => index % 2 === 0)
                .map(img => img.src)
                .filter(Boolean);
            typePost = 'multi_media';
        }

        const commentTree = document.getElementById("comment-tree");
        const totalComments = commentTree?.getAttribute("totalcomments");

        const postElement = document.querySelector("shreddit-post");
        const score = postElement?.getAttribute("score");

        const description = document.querySelector('[data-post-click-location="text-body"]')?.textContent || '';

        const cleanDescription = description
            .replace(/\s*Read more\s*/g, '')
            .replace(/\n\s+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        const data = {
            typePost: typePost,
            communityName: communityName,
            postTitle: postTitle,
            description: cleanDescription || '',
            likes: document.querySelector('[data-testid="vote-button"] faceplate-number')?.textContent,
            communityAvatar: communityAvatar,
            comments: totalComments,
            score: score,
            mediaUrls: mediaUrls,
        };

        return data;
    });

    let communityAvatarFilename = '';
    if (postData.communityAvatar) {
        try {
            const extension = path.extname(postData.communityAvatar) || '.png';
            communityAvatarFilename = `community_${Date.now()}_${Math.random().toString(36).substr(2, 9)}${extension}`;
            await downloadImage(postData.communityAvatar, communityAvatarFilename, mediaDir, page.browser());
        } catch (error) {
            console.error('Помилка при завантаженні аватарки спільноти:', error);
        }
    }

    let mediaFiles = [];
    if (postData.mediaUrls && postData.mediaUrls.length > 0) {
        for (const mediaUrl of postData.mediaUrls) {
            try {
                const extension = path.extname(mediaUrl.split('?')[0]) || '.jpg';
                const mediaFile = `media_${Date.now()}_${Math.random().toString(36).substr(2, 9)}${extension}`;
                const cleanMediaFile = mediaFile.split('?')[0];
                await downloadImage(mediaUrl, cleanMediaFile, mediaDir, page.browser());
                mediaFiles.push(cleanMediaFile);
            } catch (error) {
                console.error('Помилка при завантаженні медіа:', error);
            }
        }
    }

    return {
        platform: 'Reddit',
        language: language,
        typePost: postData.typePost,
        communityName: postData.communityName,
        postTitle: postData.postTitle,
        likes: postData.score && postData.score !== '0' ? postData.score : '7',
        comments: postData.comments && postData.comments !== '0' ? postData.comments : '2',
        description: postData.description,
        authorPicture: communityAvatarFilename,
        media: mediaFiles.join(', '),
        url: url
    };
}

module.exports = { parseRedditPost };