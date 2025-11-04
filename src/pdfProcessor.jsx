// // ✅ pdfProcessor.js — final working version for Vite + React
// import { PDFDocument } from "pdf-lib";
// import * as pdfjsLib from "pdfjs-dist";
// import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url"; // 👈 local worker (no CDN)

// // setup pdf.js worker
// pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

// /*
//   Function: processFilesAndMerge
//   - Reads multiple PDFs.
//   - Removes pages containing the skipPhrase (default: "Prepaid: Do not collect cash").
//   - Merges all remaining pages into one new PDF.
// */
// export async function processFilesAndMerge(fileList, options = {}) {
//   const skipPhrase = options.skipPhrase || "Prepaid: Do not collect cash";
//   const outPdf = await PDFDocument.create();
//   const summary = [];
//   let keptPages = 0;
//   let skippedPages = 0;

//   for (const file of fileList) {
//     // ✅ Clone ArrayBuffer to avoid detached buffer error
//     const arrayBuffer = await file.arrayBuffer();
//     const arrayCopy = arrayBuffer.slice(0);

//     // 1️⃣ load with pdfjs-dist to extract page texts
//     const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
//     const pdfjsDoc = await loadingTask.promise;
//     const numPages = pdfjsDoc.numPages;
//     summary.push(`File: ${file.name} - Pages: ${numPages}`);

//     // 2️⃣ load again with pdf-lib to copy pages safely
//     const srcPdfDoc = await PDFDocument.load(arrayCopy);

//     for (let p = 1; p <= numPages; p++) {
//       const page = await pdfjsDoc.getPage(p);
//       const textContent = await page.getTextContent();
//       const pageText = textContent.items.map(i => i.str).join(" ");
//       const normalized = pageText.replace(/\s+/g, " ").trim();

//       if (normalized.includes(skipPhrase)) {
//         skippedPages++;
//         summary.push(`  Page ${p}: ❌ Skipped (contains "${skipPhrase}")`);
//         continue;
//       }

//       // ✅ Copy page into merged output
//       const [importedPage] = await outPdf.copyPages(srcPdfDoc, [p - 1]);
//       outPdf.addPage(importedPage);
//       keptPages++;
//       summary.push(`  Page ${p}: ✅ Kept`);
//     }

//     await pdfjsDoc.destroy();
//   }

//   summary.unshift(`✅ Kept pages: ${keptPages} | ❌ Skipped pages: ${skippedPages}`);

//   // ✅ save merged PDF and return as Blob
//   const mergedPdfBytes = await outPdf.save();
//   const blob = new Blob([mergedPdfBytes], { type: "application/pdf" });
//   return { mergedPdfBlob: blob, summary };
// }
