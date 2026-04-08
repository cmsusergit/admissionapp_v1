import { createRequire } from 'module';
const require = createRequire(import.meta.url);

try {
    const pdfmake = require('pdfmake');
    console.log('Type of pdfmake:', typeof pdfmake);
    console.log('Is pdfmake a constructor?', typeof pdfmake === 'function' && /^\s*class\s+/.test(pdfmake.toString()) ? 'Likely Class' : 'Function/Object');
    console.log('Keys of pdfmake:', Object.keys(pdfmake));
    
    if (typeof pdfmake === 'object') {
        console.log('pdfmake.default:', pdfmake.default);
        console.log('Type of pdfmake.default:', typeof pdfmake.default);
    }
} catch (e) {
    console.error('Error requiring pdfmake:', e);
}
