const XLSX = require('xlsx');
const path = require('path');

async function generateExcelFile(data) {
    // Створюємо масив даних з правильним порядком полів
    const excelData = data.map(item => {
        // Створюємо новий об'єкт тільки з потрібними полями
        return {
            'Language': item.language, 
            'Type of post': item.typeOfPost,
            'Author Name': item.authorName,
            'Description': item.description,
            'Description 2': item.description2,
            'Description 3': item.description3,
            'Description 4': item.description4,
            'Likes': item.likes,
            'Comments': item.comments,
            'Shares': item.shares,
            'Media': item.media,
            'Author_Picture': item.authorPicture
        };
    });

    // Створюємо новий робочий аркуш
    const ws = XLSX.utils.json_to_sheet(excelData);

    // Встановлюємо ширину колонок
    const colWidths = Array(11).fill({ wch: 20 }); // 11 колонок по 10 символів
    ws['!cols'] = colWidths;

    // Створюємо новий робочий зошит
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Results');

    // Генеруємо унікальну назву файлу
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `results_${timestamp}`;
    const filepath = path.join('downloads', `${filename}.xlsx`);

    // Зберігаємо файл
    XLSX.writeFile(wb, filepath);

    return { filepath, filename };
}

module.exports = {
    generateExcelFile
}; 