// ...existing code...
declare module 'pdfjs-dist/legacy/build/pdf' {
    const pdfjsLib: any;
    export = pdfjsLib;
}

declare module 'pdfjs-dist/legacy/build/pdf.worker.js?url' {
    const url: string;
    export default url;
}

declare module 'pdfjs-dist/legacy/build/pdf.worker.js' {
    const worker: any;
    export default worker;
}

declare module 'pdfjs-dist/*';