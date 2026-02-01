# Cornelius - Cornell Notes Generator

Transform lecture materials into detailed Cornell-style notes using AI. **Fully client-side** - your data stays in your browser.

## Features

### Multi-Format Document Support
- **PowerPoint** (PPTX) - Extracts text from all slides
- **PDF** - Text extraction with OCR fallback for scanned documents
- **Word** (DOCX) - Full document text extraction
- **Images** (PNG, JPG, JPEG) - OCR-powered text recognition

### AI-Powered Note Generation
- **Smart Clustering** - Automatically groups related documents by topic
- **Cornell Notes Format** - Generates structured notes with:
  - **Cue Column** - Key questions and prompts
  - **Notes Column** - Main content and details
  - **Summary** - Concise overview
  - **Ad Libitum** - Additional insights and connections
- **Uniqueness Enforcement** - Prevents topic overlap across clusters

### Language & Style Options
| Language | Depth Options |
|----------|---------------|
| English | Concise / Balanced / In-depth |
| Bahasa Indonesia | Concise / Balanced / In-depth |

### Export Options
- **Markdown** - Single file or ZIP (Obsidian-compatible)
- **PDF** - Styled Cornell format with proper layout

### Privacy-First Architecture
- **100% Client-Side** - All processing happens in your browser
- **No Server Storage** - Documents never leave your device
- **BYOK (Bring Your Own Key)** - Use your own OpenRouter API key
- **IndexedDB Storage** - Notes persist locally in browser

### Lightweight Deployment
- **~50MB Docker Image** (Nginx + static files)
- **~32MB RAM** usage
- **Zero database server** required

## API Key Setup

This app uses **OpenRouter** for AI generation:

1. Get your free API key from [OpenRouter](https://openrouter.ai/keys)
2. Enter it in the Settings page
3. Your key is stored locally (never sent to any server except OpenRouter)

**Default Models (Free Tier):**
| Purpose | Model |
|---------|-------|
| Note Generation | `tngtech/deepseek-r1t2-chimera:free` |
| Clustering | `tngtech/deepseek-r1t2-chimera:free` |
| Key Validation | `google/gemma-3n-e2b-it:free` |

## Quick Start

### Using Docker (Recommended)

```bash
# Pull and run
docker run -d -p 8080:80 --name cornelius reletz/cornelius:latest

# Access at http://localhost:8080
```

### Using Docker Compose

```bash
# Clone repository
git clone <repo-url>
cd cornelius

# Production
docker compose up -d
# Access at http://localhost:8080

# Development (with hot reload)
docker compose -f docker-compose.dev.yml up
# Access at http://localhost:3000
```

### Manual Setup (No Docker)

```bash
cd frontend

# Install dependencies
npm install

# Development server
npm run dev
# Access at http://localhost:3000

# Build for production
npm run build
# Output in dist/
```

## Kubernetes Deployment

```yaml
# k8s/deployment.yaml
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
              memory: "64Mi"
              cpu: "20m"
            requests:
              memory: "32Mi"
              cpu: "10m"
          livenessProbe:
            httpGet:
              path: /health
              port: 80
---
apiVersion: v1
kind: Service
metadata:
  name: cornelius
  namespace: cornelius
spec:
  type: ClusterIP
  selector:
    app: cornelius
  ports:
    - port: 80
      targetPort: 80
```

```bash
# Deploy
kubectl apply -f k8s/

# Check status
kubectl get all -n cornelius

# Port forward
kubectl port-forward svc/cornelius 8080:80 -n cornelius
```

## Project Structure

```
cornelius/
├── frontend/
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── pages/           # Page components
│   │   │   ├── ConfigPage       # API key setup
│   │   │   ├── UploadPage       # Document upload & processing
│   │   │   ├── ClusteringPage   # Topic clustering
│   │   │   ├── GenerationPage   # Note generation
│   │   │   ├── ReviewPage       # Review & export
│   │   │   └── SettingsPage     # App settings
│   │   ├── lib/
│   │   │   ├── db.ts            # IndexedDB (Dexie)
│   │   │   ├── llm.ts           # LLM client (OpenAI SDK)
│   │   │   ├── clustering.ts    # Clustering logic
│   │   │   ├── documentProcessor.ts  # Text extraction
│   │   │   ├── pdfGenerator.ts  # PDF export
│   │   │   └── noteFormatter.ts # Note formatting
│   │   ├── prompts/         # LLM prompts (markdown)
│   │   └── store/           # Zustand state
│   └── package.json
├── k8s/                     # Kubernetes manifests
├── docker-compose.yml       # Production compose
├── docker-compose.dev.yml   # Development compose
├── Dockerfile               # Production (Nginx)
├── Dockerfile.dev           # Development (Vite)
├── nginx.conf               # Nginx configuration
└── README.md
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_DEFAULT_MODEL` | `tngtech/deepseek-r1t2-chimera:free` | Default LLM model |

### Browser Storage

All data stored in IndexedDB:
- `cornelius` database
  - `sessions` - Session metadata
  - `documents` - Uploaded document text
  - `clusters` - Topic clusters
  - `notes` - Generated notes
  - `settings` - API key, model preferences

## Troubleshooting

### API Key Invalid
- Ensure key starts with `sk-or-`
- Check [OpenRouter dashboard](https://openrouter.ai/keys) for key status
- Free tier has rate limits - enable rate limiting toggle if needed

### OCR Not Working
- Large images may take time (progress shown)
- Tesseract.js runs in browser - first load downloads ~15MB model
- Supported languages: English, Indonesian

### Generation Slow
- Free tier models have queue delays
- Try during off-peak hours
- Consider paid models for faster response

### Data Lost
- Data stored in browser's IndexedDB
- Clearing browser data will delete notes
- Use Export to backup important notes

## Resource Comparison

| Metric | Old (Python Backend) | New (Client-Side) |
|--------|---------------------|-------------------|
| Docker Image | 453 MB | **57 MB** |
| RAM Usage | 300-500 MB | **32-64 MB** |
| CPU Usage | High (PDF/OCR) | **Minimal** (static) |
| Database | SQLite (server) | IndexedDB (browser) |
| Hosting Cost | $5-10/mo VPS | **Free** (static host) |

## 📄 License

MIT License