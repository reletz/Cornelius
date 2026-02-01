/**
 * PDF generation service using html2pdf.js.
 * Browser-based implementation matching backend functionality.
 */
import { marked } from 'marked';

// Cornell CSS - matches backend CORNELL_CSS
const CORNELL_CSS = `
@page {
    size: A4;
    margin: 2cm 1.5cm;
}

body {
    font-family: 'Georgia', 'Times New Roman', serif;
    font-size: 11pt;
    line-height: 1.6;
    color: #333;
}

h1 {
    font-size: 18pt;
    color: #1a1a1a;
    border-bottom: 2px solid #333;
    padding-bottom: 0.5em;
    margin-top: 0;
    page-break-after: avoid;
}

h2 {
    font-size: 14pt;
    color: #2a2a2a;
    margin-top: 1.5em;
    border-left: 4px solid #4a90d9;
    padding-left: 0.5em;
    page-break-after: avoid;
}

h3 {
    font-size: 12pt;
    color: #3a3a3a;
    margin-top: 1em;
    page-break-after: avoid;
}

h4 {
    font-size: 11pt;
    color: #4a4a4a;
    font-style: italic;
}

p {
    margin: 0.5em 0;
    text-align: justify;
}

ul, ol {
    margin: 0.5em 0;
    padding-left: 1.5em;
}

li {
    margin: 0.25em 0;
}

code {
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 10pt;
    background-color: #f5f5f5;
    padding: 0.1em 0.3em;
    border-radius: 3px;
}

pre {
    background-color: #f5f5f5;
    padding: 1em;
    border-radius: 5px;
    overflow-x: auto;
    font-size: 9pt;
    page-break-inside: avoid;
}

pre code {
    background: none;
    padding: 0;
}

blockquote {
    border-left: 3px solid #ccc;
    margin: 1em 0;
    padding-left: 1em;
    color: #666;
    font-style: italic;
}

table {
    width: 100%;
    border-collapse: collapse;
    margin: 1em 0;
    page-break-inside: avoid;
}

th, td {
    border: 1px solid #ddd;
    padding: 0.5em;
    text-align: left;
}

th {
    background-color: #f5f5f5;
    font-weight: bold;
}

hr {
    border: none;
    border-top: 1px solid #ddd;
    margin: 1.5em 0;
}

strong {
    color: #1a1a1a;
}

/* Cornell-specific sections */
.questions-cues {
    background-color: #fffbeb;
    padding: 1em;
    border-radius: 5px;
    margin: 1em 0;
}

.summary {
    background-color: #f0f9ff;
    padding: 1em;
    border-radius: 5px;
    margin: 1em 0;
}

.ad-libitum {
    background-color: #f0fdf4;
    padding: 1em;
    border-radius: 5px;
    margin: 1em 0;
}

/* Page breaks */
.page-break {
    page-break-after: always;
}
`;

/**
 * Convert markdown content to PDF and trigger download.
 */
export async function generatePdf(
  markdownContent: string,
  filename: string
): Promise<void> {
  const html2pdf = (await import('html2pdf.js')).default;
  
  // Convert markdown to HTML
  const htmlContent = await marked.parse(markdownContent, {
    gfm: true,
    breaks: true,
  });
  
  // Build full HTML document
  const container = document.createElement('div');
  container.innerHTML = htmlContent;
  
  // Add styles
  const style = document.createElement('style');
  style.textContent = CORNELL_CSS;
  container.prepend(style);
  
  // Generate PDF
  await html2pdf()
    .set({
      margin: [20, 15, 20, 15], // top, left, bottom, right in mm
      filename: `${filename}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { 
        scale: 2,
        useCORS: true,
        letterRendering: true,
      },
      jsPDF: { 
        unit: 'mm', 
        format: 'a4', 
        orientation: 'portrait',
      },
    } as any)
    .from(container)
    .save();
}

/**
 * Generate PDF from multiple notes combined.
 */
export async function generateCombinedPdf(
  notes: string[],
  filename: string
): Promise<void> {
  // Combine all notes with page breaks
  const combined = notes.join('\n\n---\n\n');
  return generatePdf(combined, filename);
}

/**
 * Generate PDF as Blob (for preview or custom handling).
 */
export async function generatePdfBlob(
  markdownContent: string
): Promise<Blob> {
  const html2pdf = (await import('html2pdf.js')).default;
  
  // Convert markdown to HTML
  const htmlContent = await marked.parse(markdownContent, {
    gfm: true,
    breaks: true,
  });
  
  // Build full HTML document
  const container = document.createElement('div');
  container.innerHTML = htmlContent;
  
  // Add styles
  const style = document.createElement('style');
  style.textContent = CORNELL_CSS;
  container.prepend(style);
  
  // Generate PDF as blob
  const blob = await html2pdf()
    .set({
      margin: [20, 15, 20, 15],
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { 
        scale: 2,
        useCORS: true,
        letterRendering: true,
      },
      jsPDF: { 
        unit: 'mm', 
        format: 'a4', 
        orientation: 'portrait',
      },
    } as any)
    .from(container)
    .outputPdf('blob');
  
  return blob;
}

/**
 * Download markdown content as .md file.
 */
export function downloadMarkdown(
  content: string,
  filename: string
): void {
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.md`;
  a.click();
  
  URL.revokeObjectURL(url);
}

/**
 * Download multiple markdown files as ZIP.
 */
export async function downloadMarkdownZip(
  notes: { filename: string; content: string }[],
  zipFilename: string
): Promise<void> {
  const JSZip = (await import('jszip')).default;
  
  const zip = new JSZip();
  
  notes.forEach(note => {
    zip.file(`${note.filename}.md`, note.content);
  });
  
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `${zipFilename}.zip`;
  a.click();
  
  URL.revokeObjectURL(url);
}
