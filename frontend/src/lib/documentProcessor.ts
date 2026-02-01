/**
 * Document processing service - Text extraction from various file types.
 * Browser-based implementation matching backend functionality.
 */

// Supported file extensions
export const SUPPORTED_EXTENSIONS: Record<string, string> = {
  '.pptx': 'pptx',
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.txt': 'text',
  '.md': 'text',
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.webp': 'image',
};

/**
 * Extract text from a file based on its type.
 */
export async function extractText(
  file: File,
  onProgress?: (progress: number, status: string) => void
): Promise<string> {
  const extension = '.' + file.name.split('.').pop()?.toLowerCase();
  
  if (!SUPPORTED_EXTENSIONS[extension]) {
    throw new Error(`Unsupported file type: ${extension}`);
  }
  
  const docType = SUPPORTED_EXTENSIONS[extension];
  
  onProgress?.(0, `Processing ${file.name}...`);
  
  try {
    let text: string;
    
    switch (docType) {
      case 'pptx':
        text = await extractPptx(file, onProgress);
        break;
      case 'pdf':
        text = await extractPdf(file, onProgress);
        break;
      case 'docx':
        text = await extractDocx(file, onProgress);
        break;
      case 'text':
        text = await file.text();
        break;
      case 'image':
        text = await extractImage(file, onProgress);
        break;
      default:
        throw new Error(`Unknown document type: ${docType}`);
    }
    
    // Check if we got meaningful text
    if (!text || text.trim().length < 50) {
      console.warn(`Insufficient text from direct extraction for ${file.name}`);
      
      // Try OCR fallback for PDFs
      if (docType === 'pdf') {
        onProgress?.(50, 'Running OCR on PDF...');
        text = await ocrPdf(file, onProgress);
      }
    }
    
    onProgress?.(100, 'Done');
    return text.trim();
    
  } catch (error) {
    console.error(`Error extracting text from ${file.name}:`, error);
    throw error;
  }
}

/**
 * Extract text from PowerPoint file using JSZip.
 */
async function extractPptx(
  file: File,
  onProgress?: (progress: number, status: string) => void
): Promise<string> {
  const JSZip = (await import('jszip')).default;
  
  onProgress?.(10, 'Reading PPTX file...');
  
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  
  const textParts: string[] = [];
  
  // Find all slide XML files
  const slideFiles = Object.keys(zip.files)
    .filter(name => name.match(/ppt\/slides\/slide\d+\.xml$/))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)\.xml/)?.[1] || '0');
      const numB = parseInt(b.match(/slide(\d+)\.xml/)?.[1] || '0');
      return numA - numB;
    });
  
  for (let i = 0; i < slideFiles.length; i++) {
    const slideFile = slideFiles[i];
    const slideNum = i + 1;
    
    onProgress?.(10 + (80 * i / slideFiles.length), `Processing slide ${slideNum}...`);
    
    const slideXml = await zip.files[slideFile].async('text');
    const slideText = extractTextFromXml(slideXml);
    
    if (slideText) {
      textParts.push(`\n--- Slide ${slideNum} ---\n`);
      textParts.push(slideText);
    }
  }
  
  onProgress?.(90, 'Finalizing...');
  return textParts.join('\n');
}

/**
 * Extract text from XML content (used for PPTX/DOCX).
 */
function extractTextFromXml(xml: string): string {
  // Parse XML and extract text content
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');
  
  // Get all text elements (a:t for PPTX, w:t for DOCX)
  const textElements = doc.querySelectorAll('t');
  const texts: string[] = [];
  
  textElements.forEach(el => {
    const text = el.textContent?.trim();
    if (text) {
      texts.push(text);
    }
  });
  
  return texts.join(' ');
}

/**
 * Extract text from PDF using pdf.js.
 */
async function extractPdf(
  file: File,
  onProgress?: (progress: number, status: string) => void
): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');
  
  // Set worker from unpkg CDN (more reliable for production)
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  
  onProgress?.(10, 'Loading PDF...');
  
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  const textParts: string[] = [];
  const numPages = pdf.numPages;
  
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    onProgress?.(10 + (80 * pageNum / numPages), `Extracting page ${pageNum}/${numPages}...`);
    
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    
    textParts.push(`\n--- Page ${pageNum} ---\n`);
    
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ');
    
    textParts.push(pageText);
  }
  
  onProgress?.(90, 'Finalizing...');
  return textParts.join('\n');
}

/**
 * OCR fallback for scanned PDFs using pdf.js + Tesseract.js.
 */
async function ocrPdf(
  file: File,
  onProgress?: (progress: number, status: string) => void
): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');
  const { createWorker } = await import('tesseract.js');
  
  // Set worker from unpkg CDN (more reliable for production)
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  
  onProgress?.(10, 'Loading PDF for OCR...');
  
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  // Create Tesseract worker
  const worker = await createWorker('eng+ind');
  
  const textParts: string[] = [];
  const numPages = pdf.numPages;
  
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    onProgress?.(10 + (80 * pageNum / numPages), `OCR page ${pageNum}/${numPages}...`);
    
    const page = await pdf.getPage(pageNum);
    
    // Render page to canvas
    const scale = 2.0; // Higher scale for better OCR
    const viewport = page.getViewport({ scale });
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    await page.render({
      canvasContext: context,
      viewport: viewport,
      canvas: canvas,
    } as any).promise;
    
    // Convert to blob and run OCR
    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b!), 'image/png');
    });
    
    const { data: { text } } = await worker.recognize(blob);
    
    textParts.push(`\n--- Page ${pageNum} (OCR) ---\n`);
    textParts.push(text);
  }
  
  await worker.terminate();
  
  onProgress?.(90, 'Finalizing OCR...');
  return textParts.join('\n');
}

/**
 * Extract text from Word document using JSZip.
 */
async function extractDocx(
  file: File,
  onProgress?: (progress: number, status: string) => void
): Promise<string> {
  const JSZip = (await import('jszip')).default;
  
  onProgress?.(10, 'Reading DOCX file...');
  
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  
  onProgress?.(50, 'Extracting text...');
  
  // Read document.xml
  const documentXml = await zip.files['word/document.xml']?.async('text');
  if (!documentXml) {
    throw new Error('Invalid DOCX file: missing document.xml');
  }
  
  const parser = new DOMParser();
  const doc = parser.parseFromString(documentXml, 'text/xml');
  
  const textParts: string[] = [];
  
  // Get paragraphs (w:p elements)
  const paragraphs = doc.querySelectorAll('p');
  paragraphs.forEach(p => {
    const texts = p.querySelectorAll('t');
    const paraText = Array.from(texts)
      .map(t => t.textContent)
      .join('');
    
    if (paraText.trim()) {
      textParts.push(paraText);
    }
  });
  
  // Get tables
  const tables = doc.querySelectorAll('tbl');
  tables.forEach(table => {
    const rows = table.querySelectorAll('tr');
    rows.forEach(row => {
      const cells = row.querySelectorAll('tc');
      const rowText = Array.from(cells)
        .map(cell => {
          const texts = cell.querySelectorAll('t');
          return Array.from(texts).map(t => t.textContent).join('');
        })
        .filter(t => t.trim())
        .join(' | ');
      
      if (rowText.trim()) {
        textParts.push(rowText);
      }
    });
  });
  
  onProgress?.(90, 'Finalizing...');
  return textParts.join('\n');
}

/**
 * Extract text from image using Tesseract.js OCR.
 */
async function extractImage(
  file: File,
  onProgress?: (progress: number, status: string) => void
): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  
  onProgress?.(10, 'Loading OCR engine...');
  
  const worker = await createWorker('eng+ind', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        onProgress?.(10 + m.progress * 80, 'Recognizing text...');
      }
    },
  });
  
  const { data: { text } } = await worker.recognize(file);
  
  await worker.terminate();
  
  onProgress?.(100, 'Done');
  return text;
}

/**
 * Check if file type is supported.
 */
export function isFileSupported(filename: string): boolean {
  const extension = '.' + filename.split('.').pop()?.toLowerCase();
  return extension in SUPPORTED_EXTENSIONS;
}

/**
 * Get file type description.
 */
export function getFileType(filename: string): string {
  const extension = '.' + filename.split('.').pop()?.toLowerCase();
  return SUPPORTED_EXTENSIONS[extension] || 'unknown';
}
