const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { parseExcelFile } = require('./parser');
const { generateExcelFile } = require('./excelGenerator');

const app = express();
const port = 3000;

// Створення необхідних директорій
['uploads', 'downloads', 'media'].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
});

// Налаштування multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: function (req, file, cb) {
        if (!file.originalname.match(/\.(xlsx|xls)$/)) {
            return cb(new Error('Only Excel files are allowed!'), false);
        }
        cb(null, true);
    }
});

// Статичні файли
app.use(express.static('public'));
app.use('/downloads', express.static('downloads'));
app.use('/media', express.static('media'));

// Маршрут для завантаження файлу
app.post('/upload', upload.single('file'), async (req, res) => {
    console.log('Received upload request');

    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded'
            });
        }

        // Генеруємо унікальну назву папки для цієї сесії парсингу
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const sessionDir = path.join('media', `session_${timestamp}`);
        console.log('Session directory:', sessionDir);

        // Створюємо директорію для медіа-файлів цієї сесії
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }

        console.log('Starting Excel file parsing...');
        // const results = await parseExcelFile(req.file.path, sessionDir, 'facebook');
        const language = req.body.language || 'en'; // Отримайте мову з клієнта
        const results = await parseExcelFile(req.file.path, sessionDir, language);
        console.log('Parsing completed. Results structure:');
        console.log(JSON.stringify(results, null, 2));
        console.log('First result item:', JSON.stringify(results[0], null, 2));

        console.log('Generating Excel file');
        // Генеруємо Excel файл
        const { filepath, filename } = await generateExcelFile(results);
        console.log('Excel file generated:', filepath);

        // Видаляємо тимчасовий файл
        fs.unlinkSync(req.file.path);
        console.log('Temporary file deleted');

        // Формуємо URL для завантаження
        const downloadUrl = `/downloads/${filename}.xlsx`;
        console.log('Download URL:', downloadUrl);

        res.json({
            success: true,
            downloadUrl: downloadUrl
        });
    } catch (error) {
        console.error('Error processing file:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Глобальний обробник помилок
app.use((err, req, res, next) => {
    console.error('Global error handler:', err);
    res.status(500).json({
        success: false,
        error: err.message || 'Internal server error'
    });
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
}); 