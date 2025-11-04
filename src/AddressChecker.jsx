import React, { useEffect, useState } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/build/pdf";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.js?url";
import { Upload } from "lucide-react";
import { motion } from "framer-motion";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { PDFDocument } from "pdf-lib";
import "./index.css";

GlobalWorkerOptions.workerSrc = workerSrc;

export default function AddressChecker() {
  const [results, setResults] = useState([]);
  const [progress, setProgress] = useState(0);
  const [darkMode, setDarkMode] = useState(false);
  const [visibleCount, setVisibleCount] = useState(100);
  const [splitPages, setSplitPages] = useState(""); // user input for splitting

  useEffect(() => {
    document.body.classList.toggle("dark", darkMode);
    localStorage.setItem("darkMode", darkMode);
  }, [darkMode]);

  useEffect(() => {
    const saved = localStorage.getItem("darkMode");
    if (saved === "true") setDarkMode(true);
  }, []);

  // 📄 Extract text from PDFs
  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    setProgress(1);
    let allResults = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();

      const parsedData = await new Promise((resolve) => {
        reader.onload = async () => {
          const typedArray = new Uint8Array(reader.result);
          const pdf = await getDocument({ data: typedArray }).promise;
          let fullText = "";

          for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const content = await page.getTextContent();
            const text = content.items.map((i) => i.str).join("\n");
            fullText += "\n" + text;
          }

          const blocks = fullText.split(/Customer Address/i).slice(1);
          const phoneRegex = /(?:\+91[\s-]?)?[6-9]\d{9}/;

          const parsed = blocks
            .map((section) => {
              const phoneMatch = section.match(phoneRegex);
              const phone = phoneMatch ? phoneMatch[0] : "None";
              const addressEnd = section.search(
                /If undelivered|COD|Prepaid|Pickup/i
              );
              const raw =
                addressEnd !== -1
                  ? section.substring(0, addressEnd).trim()
                  : section.trim();
              const lines = raw
                .split("\n")
                .map((l) => l.trim())
                .filter(Boolean);
              const name = lines[0]
                ? lines[0]
                    .toLowerCase()
                    .replace(/\b\w/g, (c) => c.toUpperCase())
                : "Unknown";

              let address1 = "None",
                address2 = "None";
              if (lines.length >= 4) {
                const addressLines = lines.slice(1, -1);
                const mid = Math.ceil(addressLines.length / 2);
                address1 = addressLines.slice(0, mid).join(", ");
                address2 = addressLines.slice(mid).join(", ");
              } else if (lines.length === 3) address1 = lines[1];
              else if (lines.length === 2) address1 = lines[1];

              const lastLine = lines[lines.length - 1] || "";
              const parts = lastLine.split(",").map((p) => p.trim());
              const city = parts[parts.length - 3] || "Unknown";
              const state = parts[parts.length - 2] || "Unknown";
              const pincode = parts[parts.length - 1] || "Unknown";

              const sizeMatch = section.match(
                /(\b(XXXL|XXL|XL|L|M|S|XS|4XL|5XL|6XL)\b)/
              );
              const size = sizeMatch ? sizeMatch[1] : "Not found";

              // ✅ FIXED Total extraction (always picks last Rs. amount)
              const totalMatches = [...section.matchAll(/Rs\.\d+\.\d{2}/g)];
              const finalTotal =
                totalMatches.length > 0
                  ? totalMatches[totalMatches.length - 1][0]
                  : "Not found";

              const modeMatch = section.match(/(COD|Prepaid)\s*:/i);
              const mode = modeMatch ? modeMatch[1].toUpperCase() : "Unknown";

              return {
                name,
                phone,
                address1,
                address2,
                city,
                state,
                pincode,
                size,
                total: finalTotal,
                mode,
              };
            })
            .filter((i) => i.phone !== "None");

          resolve(parsed);
        };
        reader.readAsArrayBuffer(file);
      });

      allResults = [...allResults, ...parsedData];
      setProgress(Math.round(((i + 1) / files.length) * 100));
    }

    setResults(allResults);
    setProgress(0);
  };

  // 💾 Export to Excel
  const handleExportExcel = () => {
    const data = results.map((item, idx) => ({
      Index: idx + 1,
      Name: item.name,
      Phone: item.phone,
      Address1: item.address1,
      Address2: item.address2,
      City: item.city,
      State: item.state,
      Pincode: item.pincode,
      Size: item.size,
      Total: item.total,
      Mode: item.mode,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Extracted");
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([buf]), "extracted_data.xlsx");
  };

  // 📎 Merge PDFs
  const handleMergePDFs = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length < 2) return alert("Select at least 2 PDFs!");
    const merged = await PDFDocument.create();
    for (let f of files) {
      const bytes = await f.arrayBuffer();
      const pdf = await PDFDocument.load(bytes);
      const pages = await merged.copyPages(pdf, pdf.getPageIndices());
      pages.forEach((p) => merged.addPage(p));
    }
    const mergedBytes = await merged.save();
    saveAs(new Blob([mergedBytes]), "merged.pdf");
  };

  // 🧠 COD Filter + Duplicate Remover
  const handleUniqueCODPDFs = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const mergedPdf = await PDFDocument.create();
    const skipPhrase = "Prepaid: Do not collect cash";
    const uniqueSet = new Set();

    for (let file of files) {
      const buf = await file.arrayBuffer();
      const copy = buf.slice(0);
      const pdf = await getDocument({ data: new Uint8Array(buf) }).promise;
      const srcPdf = await PDFDocument.load(copy);

      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const txt = await page.getTextContent();
        const text = txt.items.map((i) => i.str).join(" ");
        const norm = text.replace(/\s+/g, " ").trim();
        if (norm.includes(skipPhrase)) continue;

        let addressPart = norm.split("Customer Address")[1] || norm;
        addressPart = addressPart
          .replace(
            /Total.*|Order\s*No.*|SKU.*|If\s*undelivered.*|COD.*|Prepaid.*/gi,
            ""
          )
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");
        const key = addressPart.slice(0, 120);
        if (uniqueSet.has(key)) continue;
        uniqueSet.add(key);

        const [imported] = await mergedPdf.copyPages(srcPdf, [p - 1]);
        mergedPdf.addPage(imported);
      }
      await pdf.destroy();
    }

    const bytes = await mergedPdf.save();
    saveAs(new Blob([bytes]), "COD_unique_clean.pdf");
    alert("✅ COD-only (no Prepaid + no Duplicate CODs) PDF created!");
  };

  // ✂️ Split PDF by user input
  const handleSplitPDF = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!splitPages || isNaN(splitPages) || splitPages <= 0) {
      alert("Enter a valid number of pages per split before uploading!");
      return;
    }

    const bytes = await file.arrayBuffer();
    const pdf = await PDFDocument.load(bytes);
    const totalPages = pdf.getPageCount();
    const pagesPerSplit = parseInt(splitPages);
    let part = 1;

    for (let i = 0; i < totalPages; i += pagesPerSplit) {
      const end = Math.min(i + pagesPerSplit, totalPages);
      const newPdf = await PDFDocument.create();
      const copiedPages = await newPdf.copyPages(
        pdf,
        Array.from({ length: end - i }, (_, j) => i + j)
      );
      copiedPages.forEach((p) => newPdf.addPage(p));
      const splitBytes = await newPdf.save();
      saveAs(new Blob([splitBytes]), `split_part_${part}.pdf`);
      part++;
    }
    alert("✅ PDF successfully split!");
  };

  // 📊 Stats
  const stats = (() => {
    const sizeMap = {};
    let total = 0,
      cod = 0,
      prepaid = 0,
      dupCOD = 0;
    const unique = new Set();

    results.forEach(({ size, total: t, mode, name, address1, address2 }) => {
      sizeMap[size] = (sizeMap[size] || 0) + 1;
      if (t.startsWith("Rs.")) total += parseFloat(t.replace("Rs.", ""));
      if (mode === "COD") cod++;
      if (mode === "PREPAID") prepaid++;
      const key = `${name}|${address1}|${address2}|${mode}`.toLowerCase();
      if (unique.has(key) && mode === "COD") dupCOD++;
      unique.add(key);
    });

    return {
      totalBlocks: results.length,
      sizeCount: sizeMap,
      totalPrice: total.toFixed(2),
      codCount: cod,
      prepaidCount: prepaid,
      codDuplicateCount: dupCOD,
    };
  })();

  // Infinite scroll
  useEffect(() => {
    const handleScroll = () => {
      if (
        window.innerHeight + window.scrollY >=
        document.body.offsetHeight - 200
      ) {
        setVisibleCount((prev) =>
          prev + 100 > results.length ? results.length : prev + 100
        );
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [results]);

  return (
    <div className="container">
      <motion.div
        className="glass-card"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6 }}
      >
        <h1 className="title">Smart Address Extractor</h1>

        {/* Upload Buttons */}
        <div className="upload-section">
          <label htmlFor="pdfUpload" className="glass-button">
            <Upload size={18} /> Upload PDFs
          </label>
          <input
            id="pdfUpload"
            type="file"
            accept="application/pdf"
            multiple
            className="hidden-input"
            onChange={handleFileUpload}
          />

          <label htmlFor="mergePDF" className="glass-button">
            Merge PDFs
          </label>
          <input
            id="mergePDF"
            type="file"
            accept="application/pdf"
            multiple
            className="hidden-input"
            onChange={handleMergePDFs}
          />

          <label htmlFor="uniqueCOD" className="glass-button">
            Filter COD (Unique)
          </label>
          <input
            id="uniqueCOD"
            type="file"
            accept="application/pdf"
            multiple
            className="hidden-input"
            onChange={handleUniqueCODPDFs}
          />

          {/* ✂️ Split PDF Button */}
          <div className="split-section">
            <input
              type="number"
              placeholder="Pages per split (e.g. 200)"
              className="split-input"
              value={splitPages}
              onChange={(e) => setSplitPages(e.target.value)}
            />
            <label htmlFor="splitPDF" className="glass-button">
              Split PDF
            </label>
            <input
              id="splitPDF"
              type="file"
              accept="application/pdf"
              className="hidden-input"
              onChange={handleSplitPDF}
            />
          </div>

          <button className="glass-toggle" onClick={() => setDarkMode(!darkMode)}>
            {darkMode ? "☀️ Light Mode" : "🌙 Dark Mode"}
          </button>
        </div>

        {results.length > 0 && (
          <>
            <button className="glass-export" onClick={handleExportExcel}>
              Export to Excel
            </button>
            <div className="dashboard-glass">
              <div className="stat">
                Total Orders: <strong>{stats.totalBlocks}</strong>
              </div>
              <div className="stat">
                Total: <strong>Rs.{stats.totalPrice}</strong>
              </div>
              <div className="stat">
                COD Orders: <strong>{stats.codCount}</strong>
              </div>
              <div className="stat">
                Prepaid Orders: <strong>{stats.prepaidCount}</strong>
              </div>
              <div className="stat">
                COD Duplicates: <strong>{stats.codDuplicateCount}</strong>
              </div>
              <div className="stat">
                COD Unique:{" "}
                <strong>{stats.codCount - stats.codDuplicateCount}</strong>
              </div>
            </div>
          </>
        )}

        {/* Address Blocks */}
        <div className="grid">
          {results.slice(0, visibleCount).map((item, idx) => (
            <motion.div
              key={idx}
              className="glass-card-mini"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <div className="block-text">
                <div>
                  <strong>Name:</strong> {item.name}
                </div>
                <div>
                  <strong>Phone:</strong> {item.phone}
                </div>
                <div>
                  <strong>Address 1:</strong> {item.address1}
                </div>
                <div>
                  <strong>Address 2:</strong> {item.address2}
                </div>
                <div>
                  <strong>City:</strong> {item.city},{" "}
                  <strong>State:</strong> {item.state},{" "}
                  <strong>Pincode:</strong> {item.pincode}
                </div>
                <div>
                  <strong>Size:</strong> {item.size}
                </div>
                <div>
                  <strong>Total:</strong> {item.total}
                </div>
                <div>
                  <strong>Mode:</strong> {item.mode}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {progress > 0 && (
          <>
            <div className="progress-container">
              <div
                className="progress-bar"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="progress-text">{progress}% done</p>
          </>
        )}
      </motion.div>
    </div>
  );
}
