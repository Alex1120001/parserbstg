const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');

const execPromise = util.promisify(exec);

// Створення необхідних директорій
function ensureDirectories() {
    ['downloads', 'media'].forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
    });
}

module.exports = { 
    execPromise,
    ensureDirectories
};