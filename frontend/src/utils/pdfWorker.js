import * as pdfjsLib from 'pdfjs-dist/build/pdf';

// 👇 Aici creăm manual un worker din fișierul local
const worker = new Worker(
    new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url),
    { type: 'module' }
);

// 👇 Setăm acest worker în PDF.js
pdfjsLib.GlobalWorkerOptions.workerPort = worker;
