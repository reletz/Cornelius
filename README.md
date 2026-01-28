# Cornell Notes Generator

Transform lecture materials into detailed Cornell-style notes using AI.

## 🚀 Quick Start

### Using Docker Compose (Recommended)

```bash
# Clone the repository
git clone <repo-url>
cd cornell-notes

# Production mode (single container with frontend bundled)
docker compose up -d

# Access at http://localhost:8000
```

### Development Mode

```bash
# Start with hot reloading (separate frontend + backend containers)
docker compose -f docker-compose.dev.yml up --build

# Frontend: http://localhost:3000 (Vite dev server with HMR)
# Backend API: http://localhost:8000
```

## 🐳 Docker Deployment

### Production Dockerfile

The production `Dockerfile` uses multi-stage build:

1. **Stage 1**: Build frontend (Node.js) → outputs static files
2. **Stage 2**: Runtime (Python) → serves API + static frontend

```bash
# Build production image
docker build -t cornell-notes:latest .

# Run standalone
docker run -d \
  -p 8000:8000 \
  -v $(pwd)/cornell_data:/app/data \
  --name cornell-notes \
  cornell-notes:latest
```

### Development Dockerfile

`Dockerfile.dev` is for backend development with hot reload.

```bash
# Build dev image
docker build -f Dockerfile.dev -t cornell-notes-dev .

# Run with volume mount for hot reload
docker run -d \
  -p 8000:8000 \
  -v $(pwd)/backend:/app \
  -v $(pwd)/cornell_data:/app/data \
  cornell-notes-dev
```

### Docker Compose Files

| File | Purpose | Containers |
|------|---------|------------|
| `docker-compose.yml` | Production | 1 (all-in-one) |
| `docker-compose.dev.yml` | Development | 2 (backend + frontend) |

```bash
# Production
docker compose up -d
docker compose logs -f
docker compose down

# Development (with hot reload)
docker compose -f docker-compose.dev.yml up --build
docker compose -f docker-compose.dev.yml down
```

## ☸️ Kubernetes Deployment

### Prerequisites

- Kubernetes cluster (minikube, kind, k3s, or cloud provider)
- `kubectl` configured
- Container registry access (or use local images)

### Step 1: Build and Push Image

```bash
# Build image
docker build -t your-registry/cornell-notes:latest .

# Push to registry
docker push your-registry/cornell-notes:latest

# For minikube (use local image)
eval $(minikube docker-env)
docker build -t cornell-notes:latest .
```

### Step 2: Create Kubernetes Manifests

Create `k8s/` directory with the following files:

**k8s/namespace.yaml**
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: cornell-notes
```

**k8s/pvc.yaml**
```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: cornell-notes-data
  namespace: cornell-notes
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi
```

**k8s/deployment.yaml**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cornell-notes
  namespace: cornell-notes
spec:
  replicas: 1
  selector:
    matchLabels:
      app: cornell-notes
  template:
    metadata:
      labels:
        app: cornell-notes
    spec:
      containers:
        - name: cornell-notes
          image: cornell-notes:latest
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 8000
          env:
            - name: DATABASE_URL
              value: "sqlite+aiosqlite:///./data/cornell.db"
          volumeMounts:
            - name: data
              mountPath: /app/data
          resources:
            requests:
              memory: "256Mi"
              cpu: "100m"
            limits:
              memory: "1Gi"
              cpu: "500m"
          livenessProbe:
            httpGet:
              path: /health
              port: 8000
            initialDelaySeconds: 10
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /health
              port: 8000
            initialDelaySeconds: 5
            periodSeconds: 10
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: cornell-notes-data
```

**k8s/service.yaml**
```yaml
apiVersion: v1
kind: Service
metadata:
  name: cornell-notes
  namespace: cornell-notes
spec:
  type: ClusterIP
  selector:
    app: cornell-notes
  ports:
    - port: 80
      targetPort: 8000
```

**k8s/ingress.yaml** (optional, for external access)
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: cornell-notes
  namespace: cornell-notes
  annotations:
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"
spec:
  ingressClassName: nginx
  rules:
    - host: cornell-notes.your-domain.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: cornell-notes
                port:
                  number: 80
```

### Step 3: Deploy

```bash
# Apply all manifests
kubectl apply -f k8s/

# Check status
kubectl get all -n cornell-notes

# View logs
kubectl logs -f deployment/cornell-notes -n cornell-notes

# Port forward for local access
kubectl port-forward svc/cornell-notes 8000:80 -n cornell-notes
# Access at http://localhost:8000
```

### Step 4: Cleanup

```bash
kubectl delete -f k8s/
```

## 🔧 Manual Setup (No Docker)

### Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Install system deps (Ubuntu/Debian)
sudo apt-get install tesseract-ocr tesseract-ocr-eng tesseract-ocr-ind

# Run development server
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## 📋 Features

- **Multi-format Support**: PPTX, PDF, DOCX, PNG, JPG
- **AI-Powered Clustering**: Automatic topic detection with uniqueness enforcement
- **Cornell Notes Generation**: Questions, Main Notes, Summary, and Ad Libitum sections
- **Customizable Prompts**: 
  - Language: English / Bahasa Indonesia
  - Depth: Concise / Balanced / In-depth
  - Custom prompts supported
- **Export Options**: Markdown (Obsidian-compatible) and PDF
- **Rate Limiting**: Toggle for free tier API protection
- **BYOK**: Bring Your Own Key - API key stored locally in browser

## 🔑 API Key Setup

This application uses **BYOK (Bring Your Own Key)** with OpenRouter:

1. Get your API key from [OpenRouter](https://openrouter.ai/keys)
2. Enter it when prompted on first use
3. Your key is stored locally in your browser (never sent to our servers)

**Models Used (Free Tier):**
- Clustering: `tngtech/deepseek-r1t2-chimera:free`
- Note Generation: `tngtech/deepseek-r1t2-chimera:free`

## 📁 Project Structure

```
cornell-notes/
├── backend/
│   ├── app/
│   │   ├── api/routes/      # API endpoints
│   │   ├── core/            # Config, database, security
│   │   ├── models/          # SQLAlchemy models
│   │   ├── schemas/         # Pydantic schemas
│   │   ├── services/        # Business logic
│   │   └── prompt/          # LLM prompts (markdown)
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── pages/           # Page components
│   │   ├── store/           # Zustand state
│   │   └── lib/             # API client, utilities
│   └── package.json
├── docker-compose.yml       # Production compose
├── docker-compose.dev.yml   # Development compose
├── Dockerfile               # Production multi-stage
├── Dockerfile.dev           # Development backend
└── README.md
```

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/config/validate-key` | Validate OpenRouter API key |
| POST | `/api/sessions/` | Create new session |
| POST | `/api/upload/` | Upload files |
| GET | `/api/upload/{session_id}` | List documents |
| POST | `/api/clusters/analyze/{session_id}` | Analyze and cluster |
| POST | `/api/generate/` | Generate notes |
| GET | `/api/generate/status/{task_id}` | Check generation progress |
| GET | `/api/export/{session_id}/markdown` | Export as Markdown/ZIP |
| GET | `/api/export/{session_id}/pdf` | Export as PDF |
| GET | `/health` | Health check |

## 🐛 Troubleshooting

### Generation Stuck
- Check backend logs: `docker compose logs -f backend`
- Free tier models may have queue delays
- Try toggling rate limiting off in Config page

### File Upload Fails
- Max file size: 50MB
- Supported formats: PPTX, PDF, DOCX, PNG, JPG, JPEG

### OCR Not Working
- Ensure tesseract is installed with language packs
- Check `TESSDATA_PREFIX` environment variable

## 📄 License

MIT License
