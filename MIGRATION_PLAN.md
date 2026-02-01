# Migration Plan: Full Client-Side Architecture

## Overview

Migrasi dari arsitektur backend (Python/FastAPI + SQLite) ke **full client-side** (React + IndexedDB) untuk menghilangkan kebutuhan server dan biaya hosting.

### Hasil Akhir

| Aspect | Before | After |
|--------|--------|-------|
| Server RAM | 300-500MB | **0MB** |
| Hosting Cost | $5-10/mo | **FREE** |
| Database | SQLite (server) | IndexedDB (browser) |
| PDF Generation | WeasyPrint (server) | html2pdf.js (browser) |
| OCR | Tesseract (server) | Tesseract.js (browser) |
| API Key | Server config | User input (localStorage) |
| Deployment | Docker (Python backend) | Docker (Nginx static) |

---

## Phase 1: Setup & Dependencies

### 1.1 Install New Dependencies

```bash
cd frontend
npm install dexie dexie-react-hooks    # IndexedDB wrapper
npm install openai                      # LLM API client
npm install tesseract.js                # OCR in browser
npm install html2pdf.js                 # PDF generation
npm install react-markdown remark-gfm   # Markdown rendering
npm install @tanstack/react-query       # Data fetching/caching
npm install zustand                     # State management (already have?)
```

### 1.2 Update TypeScript Config

```json
// tsconfig.json - tambahkan
{
  "compilerOptions": {
    "lib": ["ES2020", "DOM", "DOM.Iterable"]
  }
}
```

---

## Phase 2: Database Migration (SQLite → IndexedDB)

### 2.1 Create Database Schema

**File:** `frontend/src/lib/db.ts`

```typescript
import Dexie, { Table } from 'dexie';

// Types
export interface Session {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Document {
  id: string;
  sessionId: string;
  filename: string;
  content: string;        // extracted text
  fileType: string;
  createdAt: Date;
}

export interface Cluster {
  id: string;
  sessionId: string;
  name: string;
  documentIds: string[];
  createdAt: Date;
}

export interface Note {
  id: string;
  sessionId: string;
  clusterId?: string;
  title: string;
  mainNotes: string;      // markdown
  cues: string;           // markdown
  summary: string;        // markdown
  rawMarkdown: string;    // full cornell format
  status: 'pending' | 'generating' | 'completed' | 'error';
  createdAt: Date;
  updatedAt: Date;
}

export interface Settings {
  id: 'main';
  apiKey: string;
  baseUrl: string;
  model: string;
  language: 'en' | 'id';
  style: 'balanced' | 'concise' | 'indepth';
}

// Database
class CornellDB extends Dexie {
  sessions!: Table<Session>;
  documents!: Table<Document>;
  clusters!: Table<Cluster>;
  notes!: Table<Note>;
  settings!: Table<Settings>;

  constructor() {
    super('cornelius');
    
    this.version(1).stores({
      sessions: 'id, name, createdAt, updatedAt',
      documents: 'id, sessionId, filename, createdAt',
      clusters: 'id, sessionId, createdAt',
      notes: 'id, sessionId, clusterId, status, createdAt, updatedAt',
      settings: 'id'
    });
  }
}

export const db = new CornellDB();

// Initialize default settings
export async function initializeSettings(): Promise<Settings> {
  let settings = await db.settings.get('main');
  if (!settings) {
    settings = {
      id: 'main',
      apiKey: '',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'anthropic/claude-sonnet-4',
      language: 'en',
      style: 'balanced'
    };
    await db.settings.put(settings);
  }
  return settings;
}
```

### 2.2 Create Database Hooks

**File:** `frontend/src/hooks/useDatabase.ts`

```typescript
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Session, Document, Note, Settings } from '../lib/db';

export function useSessions() {
  return useLiveQuery(() => 
    db.sessions.orderBy('updatedAt').reverse().toArray()
  );
}

export function useSession(id: string) {
  return useLiveQuery(() => db.sessions.get(id), [id]);
}

export function useDocuments(sessionId: string) {
  return useLiveQuery(() => 
    db.documents.where('sessionId').equals(sessionId).toArray(),
    [sessionId]
  );
}

export function useNotes(sessionId: string) {
  return useLiveQuery(() => 
    db.notes.where('sessionId').equals(sessionId).toArray(),
    [sessionId]
  );
}

export function useSettings() {
  return useLiveQuery(() => db.settings.get('main'));
}
```

---

## Phase 3: LLM Service (Backend API → Direct Browser Call)

### 3.1 Create LLM Client

**File:** `frontend/src/lib/llm.ts`

```typescript
import OpenAI from 'openai';
import { db } from './db';

let clientInstance: OpenAI | null = null;

export async function getLLMClient(): Promise<OpenAI> {
  const settings = await db.settings.get('main');
  
  if (!settings?.apiKey) {
    throw new Error('API key not configured. Please set your API key in Settings.');
  }

  if (!clientInstance) {
    clientInstance = new OpenAI({
      apiKey: settings.apiKey,
      baseURL: settings.baseUrl,
      dangerouslyAllowBrowser: true
    });
  }

  return clientInstance;
}

export function resetClient() {
  clientInstance = null;
}

export interface GenerateOptions {
  content: string;
  language: 'en' | 'id';
  style: 'balanced' | 'concise' | 'indepth';
  onChunk?: (chunk: string) => void;
}

export async function generateCornellNotes(options: GenerateOptions): Promise<string> {
  const client = await getLLMClient();
  const settings = await db.settings.get('main');
  
  const systemPrompt = buildSystemPrompt(options.language, options.style);
  
  const stream = await client.chat.completions.create({
    model: settings?.model || 'anthropic/claude-sonnet-4',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: options.content }
    ],
    stream: true
  });

  let result = '';
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content || '';
    result += text;
    options.onChunk?.(text);
  }
  
  return result;
}

function buildSystemPrompt(language: 'en' | 'id', style: string): string {
  // Load from embedded prompts (copy from backend/app/prompt/)
  return PROMPTS[language][style];
}
```

### 3.2 Embed Prompts

**File:** `frontend/src/lib/prompts.ts`

```typescript
// Copy content from backend/app/prompt/ files
export const PROMPTS = {
  en: {
    balanced: `...`, // dari modifier-en-balanced.md
    concise: `...`,  // dari modifier-en-concise.md
    indepth: `...`   // dari modifier-en-indepth.md
  },
  id: {
    balanced: `...`, // dari modifier-id-balanced.md
    concise: `...`,  // dari modifier-id-concise.md
    indepth: `...`   // dari modifier-id-indepth.md
  },
  base: `...` // dari note-gen.md
};
```

---

## Phase 4: Document Processing (Server → Browser)

### 4.1 Text Extraction

**File:** `frontend/src/lib/documentProcessor.ts`

```typescript
import * as pdfjs from 'pdfjs-dist';

// Set worker
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

export async function extractText(file: File): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  
  switch (extension) {
    case 'pdf':
      return extractPdfText(file);
    case 'txt':
    case 'md':
      return file.text();
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'webp':
      return extractImageText(file);
    default:
      throw new Error(`Unsupported file type: ${extension}`);
  }
}

async function extractPdfText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item: any) => item.str).join(' ') + '\n';
  }
  
  return text;
}

async function extractImageText(file: File): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  
  const worker = await createWorker('eng+ind');
  const { data: { text } } = await worker.recognize(file);
  await worker.terminate();
  
  return text;
}
```

### 4.2 OCR with Progress

**File:** `frontend/src/lib/ocr.ts`

```typescript
import { createWorker, Worker } from 'tesseract.js';

let workerInstance: Worker | null = null;

export async function getOCRWorker(): Promise<Worker> {
  if (!workerInstance) {
    workerInstance = await createWorker('eng+ind', 1, {
      logger: () => {} // Disable logging
    });
  }
  return workerInstance;
}

export async function performOCR(
  file: File,
  onProgress?: (progress: number) => void
): Promise<string> {
  const worker = await createWorker('eng+ind', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(Math.round(m.progress * 100));
      }
    }
  });

  const { data: { text } } = await worker.recognize(file);
  await worker.terminate();
  
  return text;
}
```

---

## Phase 5: PDF Generation (WeasyPrint → html2pdf.js)

### 5.1 Create PDF Service

**File:** `frontend/src/lib/pdfGenerator.ts`

```typescript
import html2pdf from 'html2pdf.js';
import { marked } from 'marked';

const CORNELL_CSS = `
  .cornell-note {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
  }
  .cornell-header {
    border-bottom: 2px solid #333;
    padding-bottom: 10px;
    margin-bottom: 20px;
  }
  .cornell-body {
    display: flex;
    gap: 20px;
    margin-bottom: 20px;
  }
  .cornell-cues {
    width: 30%;
    border-right: 1px solid #ccc;
    padding-right: 20px;
  }
  .cornell-notes {
    width: 70%;
  }
  .cornell-summary {
    border-top: 2px solid #333;
    padding-top: 20px;
    margin-top: 20px;
  }
  h1, h2, h3 { color: #2c3e50; }
  ul, ol { padding-left: 20px; }
  code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
`;

export interface CornellNote {
  title: string;
  mainNotes: string;
  cues: string;
  summary: string;
}

export async function generatePDF(note: CornellNote, filename: string): Promise<void> {
  const html = `
    <div class="cornell-note">
      <div class="cornell-header">
        <h1>${note.title}</h1>
      </div>
      <div class="cornell-body">
        <div class="cornell-cues">
          <h2>Cues</h2>
          ${marked.parse(note.cues)}
        </div>
        <div class="cornell-notes">
          <h2>Notes</h2>
          ${marked.parse(note.mainNotes)}
        </div>
      </div>
      <div class="cornell-summary">
        <h2>Summary</h2>
        ${marked.parse(note.summary)}
      </div>
    </div>
  `;

  const container = document.createElement('div');
  container.innerHTML = html;

  const style = document.createElement('style');
  style.textContent = CORNELL_CSS;
  container.prepend(style);

  await html2pdf()
    .set({
      margin: 10,
      filename: `${filename}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    })
    .from(container)
    .save();
}

export async function generateMarkdownFile(content: string, filename: string): Promise<void> {
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.md`;
  a.click();
  
  URL.revokeObjectURL(url);
}
```

---

## Phase 6: Update UI Components

### 6.1 Settings Page (New)

**File:** `frontend/src/pages/SettingsPage.tsx`

```typescript
import { useState, useEffect } from 'react';
import { db, initializeSettings, Settings } from '../lib/db';
import { resetClient } from '../lib/llm';

export function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    initializeSettings().then(setSettings);
  }, []);

  const handleSave = async () => {
    if (settings) {
      await db.settings.put(settings);
      resetClient(); // Reset LLM client to use new settings
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  if (!settings) return <div>Loading...</div>;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">API Key</label>
          <input
            type="password"
            className="w-full p-2 border rounded"
            value={settings.apiKey}
            onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
            placeholder="sk-or-..."
          />
          <p className="text-xs text-gray-500 mt-1">
            Get your API key from OpenRouter, OpenAI, or other providers
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Base URL</label>
          <input
            type="url"
            className="w-full p-2 border rounded"
            value={settings.baseUrl}
            onChange={(e) => setSettings({ ...settings, baseUrl: e.target.value })}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Model</label>
          <select
            className="w-full p-2 border rounded"
            value={settings.model}
            onChange={(e) => setSettings({ ...settings, model: e.target.value })}
          >
            <option value="anthropic/claude-sonnet-4">Claude Sonnet 4</option>
            <option value="anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet</option>
            <option value="openai/gpt-4o">GPT-4o</option>
            <option value="openai/gpt-4o-mini">GPT-4o Mini</option>
            <option value="google/gemini-pro-1.5">Gemini 1.5 Pro</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Language</label>
            <select
              className="w-full p-2 border rounded"
              value={settings.language}
              onChange={(e) => setSettings({ ...settings, language: e.target.value as 'en' | 'id' })}
            >
              <option value="en">English</option>
              <option value="id">Bahasa Indonesia</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Style</label>
            <select
              className="w-full p-2 border rounded"
              value={settings.style}
              onChange={(e) => setSettings({ ...settings, style: e.target.value as any })}
            >
              <option value="balanced">Balanced</option>
              <option value="concise">Concise</option>
              <option value="indepth">In-depth</option>
            </select>
          </div>
        </div>

        <button
          onClick={handleSave}
          className="w-full py-2 px-4 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          {saved ? '✓ Saved!' : 'Save Settings'}
        </button>
      </div>

      <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded">
        <h3 className="font-medium text-yellow-800">Privacy Note</h3>
        <p className="text-sm text-yellow-700 mt-1">
          Your API key and all data are stored locally in your browser. 
          Nothing is sent to our servers.
        </p>
      </div>
    </div>
  );
}
```

### 6.2 Update App Router

```typescript
// Add Settings route to App.tsx
import { SettingsPage } from './pages/SettingsPage';

// In routes:
<Route path="/settings" element={<SettingsPage />} />
```

---

## Phase 7: Remove Backend & Update Structure

### 7.1 Files to Delete

```
backend/                    # Entire folder
docker-compose.dev.yml      # Old dev compose (optional keep)
Dockerfile.dev              # Old dev dockerfile
```

### 7.2 Update Project Structure

```
cornelius/
├── frontend/
│   ├── public/
│   │   └── ...
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   │   └── useDatabase.ts   # NEW
│   │   ├── lib/
│   │   │   ├── db.ts            # NEW: IndexedDB
│   │   │   ├── llm.ts           # NEW: LLM client
│   │   │   ├── ocr.ts           # NEW: Tesseract.js
│   │   │   ├── pdfGenerator.ts  # NEW: html2pdf
│   │   │   ├── documentProcessor.ts  # NEW
│   │   │   ├── prompts.ts       # NEW: embedded prompts
│   │   │   └── utils.ts
│   │   ├── pages/
│   │   │   ├── SettingsPage.tsx # NEW
│   │   │   └── ...
│   │   └── ...
│   ├── package.json
│   └── ...
├── Dockerfile              # UPDATED: Nginx static
├── docker-compose.yml      # UPDATED: simplified
├── k8s/                    # KEEP: update for static
├── .github/
│   └── workflows/
│       └── cd.yml          # UPDATED: build static image
├── README.md
├── LICENSE
└── SPEC.md
```

### 7.3 New Dockerfile (Nginx Static)

**File:** `Dockerfile`

```dockerfile
# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy frontend
COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# Production stage - Nginx
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/dist /usr/share/nginx/html

# Custom nginx config for SPA routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
```

### 7.4 Nginx Config

**File:** `nginx.conf`

```nginx
server {
    listen 80;
    server_name _;
    
    root /usr/share/nginx/html;
    index index.html;
    
    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
    gzip_min_length 1000;
    
    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # SPA routing - fallback to index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
```

### 7.5 Docker Compose (Simplified)

**File:** `docker-compose.yml`

```yaml
version: '3.8'

services:
  cornelius:
    build: .
    ports:
      - "3000:80"
    restart: unless-stopped
    # Extremely low resource usage!
    deploy:
      resources:
        limits:
          memory: 32M   # Nginx only needs ~10-20MB
          cpus: '0.1'
```

---

## Phase 8: Deployment (Docker + K8s)

### 8.1 Update GitHub Actions

**File:** `.github/workflows/cd.yml`

```yaml
name: CD - Build and Push Docker Image

on:
  push:
    branches:
      - main
  workflow_dispatch:

env:
  REGISTRY: docker.io
  IMAGE_NAME: reletz/cornelius

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    
    permissions:
      contents: read

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to Docker Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}

      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest
          cache-from: type=registry,ref=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:buildcache
          cache-to: type=registry,ref=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:buildcache,mode=max
```

### 8.2 Update Kubernetes Deployment

**File:** `k8s/deployment.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cornelius
  namespace: cornelius
spec:
  replicas: 1
  selector:
    matchLabels:
      app: cornelius
  template:
    metadata:
      labels:
        app: cornelius
    spec:
      containers:
        - name: cornelius
          image: reletz/cornelius:latest
          ports:
            - containerPort: 80
          resources:
            limits:
              memory: "32Mi"    # Nginx only!
              cpu: "100m"
            requests:
              memory: "16Mi"
              cpu: "10m"
          livenessProbe:
            httpGet:
              path: /
              port: 80
            initialDelaySeconds: 5
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /
              port: 80
            initialDelaySeconds: 3
            periodSeconds: 5
```

### 8.3 Update Service

**File:** `k8s/service.yaml`

```yaml
apiVersion: v1
kind: Service
metadata:
  name: cornelius
  namespace: cornelius
spec:
  selector:
    app: cornelius
  ports:
    - port: 80
      targetPort: 80
  type: ClusterIP
```

---

## Migration Checklist

### Phase 1: Setup ✅
- [x] Install new npm dependencies
- [x] Update TypeScript config (already correct)

### Phase 2: Database ✅
- [x] Create `lib/db.ts` with Dexie schema
- [x] Create `hooks/useDatabase.ts`
- [ ] Test IndexedDB operations

### Phase 3: LLM
- [ ] Create `lib/llm.ts`
- [ ] Embed prompts from backend
- [ ] Test API calls from browser

### Phase 4: Document Processing
- [ ] Create `lib/documentProcessor.ts`
- [ ] Create `lib/ocr.ts`
- [ ] Test PDF and image extraction

### Phase 5: PDF Generation
- [ ] Create `lib/pdfGenerator.ts`
- [ ] Test PDF export

### Phase 6: UI Updates
- [ ] Create SettingsPage
- [ ] Update all pages to use IndexedDB
- [ ] Remove API calls to backend
- [ ] Add Settings to navigation

### Phase 7: Cleanup & Docker
- [ ] Delete backend/ folder
- [ ] Create new Dockerfile (Nginx)
- [ ] Create nginx.conf
- [ ] Update docker-compose.yml
- [ ] Update k8s manifests

### Phase 8: Deploy
- [ ] Update GitHub Actions
- [ ] Build and push Docker image
- [ ] Deploy to k8s
- [ ] Test deployment

---

## Estimated Timeline

| Phase | Effort |
|-------|--------|
| Phase 1: Setup | ✅ Done |
| Phase 2: Database | ✅ Done |
| Phase 3: LLM | 1-2 hours |
| Phase 4: Document Processing | 2-3 hours |
| Phase 5: PDF Generation | 1-2 hours |
| Phase 6: UI Updates | 3-4 hours |
| Phase 7: Cleanup & Docker | 1 hour |
| Phase 8: Deploy | 1 hour |
| **Total Remaining** | **~10-13 hours** |

---

## Post-Migration Benefits

✅ **Drastically lower RAM** - Nginx only ~16-32MB vs 300-500MB  
✅ **Better privacy** - All data stays in user's browser  
✅ **Offline capable** - Can work without internet (except LLM calls)  
✅ **Simpler architecture** - No Python/SQLite to maintain  
✅ **Faster startup** - Nginx starts instantly  
✅ **User-controlled API** - User provides own API key  
