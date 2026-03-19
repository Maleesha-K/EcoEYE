# EcoEYE - Docker Setup & Deployment Guide

## Project Overview

EcoEYE is an AI-powered occupancy detection system designed to optimize energy consumption in buildings using YOLOv8 object detection. The project includes:

- **Frontend**: React application with Vite (control-app/)
- **Backend**: Python-based AI service using YOLOv8 for person detection
- **Architecture**: Fully containerized for cross-platform compatibility

## Docker Architecture

This project uses a **multi-stage Docker build** for optimal image size and performance:

### Stage 1: Frontend Builder
- Uses `node:18-alpine` base image
- Builds the React/Vite application into static assets
- Output: Compiled frontend files in `/dist`

### Stage 2: Runtime
- Uses `python:3.11-slim` base image
- Installs all Python dependencies including:
  - OpenCV (cv2) for video processing
  - YOLOv8 (ultralytics) for object detection
  - PyTorch for ML inference
  - Flask & CORS for API server
- Serves both backend API and frontend static files
- Health check enabled for monitoring

## Quick Start

### Prerequisites
- Docker & Docker Compose installed
- Linux environment (or Windows with WSL2/Docker Desktop)
- No additional ports needed - container uses port 9000

### Running the Application

```bash
# Navigate to project directory
cd EcoEYE

# Build and start the container
docker compose up -d

# Check container status
docker compose ps

# View logs
docker compose logs ecoeye-app

# Stop the application
docker compose down
```

### Testing API Endpoints

Once the container is running, test these endpoints:

**Health Check:**
```bash
curl http://localhost:9000/health
```

**Application Status:**
```bash
curl http://localhost:9000/api/status
```

**Zone Configuration:**
```bash
curl http://localhost:9000/api/zones
```

**Frontend (if built):**
```
http://localhost:9000/
```

## File Structure

```
EcoEYE/
├── Dockerfile                 # Multi-stage build configuration
├── docker-compose.yml         # Container orchestration
├── .dockerignore              # Build context optimization
├── requirements.txt           # Python dependencies
├── app.py                     # Flask API server
├── ecoeye_test*.py            # YOLO detection scripts
├── yolo26n.pt                 # YOLOv8 Pre-trained model
└── control-app/               # React frontend
    ├── package.json
    ├── vite.config.js
    └── src/
```

## Configuration

### Environment Variables (in docker-compose.yml)

```yaml
PYTHONUNBUFFERED=1    # Python unbuffered output (for real-time logs)
FLASK_ENV=production  # Flask production mode
```

### Port Mapping

- **Host Port 9000** → **Container Port 5000** (Flask API)
- **Host Port 3000** → **Container Port 3000** (Optional dev server)

## Dependencies Included

### Python Packages
- opencv-python==4.8.1.78
- ultralytics==8.0.234 (YOLO)
- torch==2.1.0 (PyTorch)
- torchvision==0.16.0
- flask & flask-cors (API server)
- numpy, pillow

### Node.js Packages (Frontend)
- React 19.2.0
- Vite 7.3.1
- React Router DOM
- Recharts (for data visualization)
- Framer Motion (for animations)
- Lucide React (for icons)

## Building for Different Platforms

### For Linux Production
```bash
docker compose build --no-cache
docker compose up -d
```

### For ARM-based systems (Raspberry Pi, etc.)
```bash
docker buildx build --platform linux/arm64 -t ecoeye-app:arm64 .
```

## Monitoring & Debugging

### View Real-time Logs
```bash
docker compose logs -f ecoeye-app
```

### Execute Commands Inside Container
```bash
docker compose exec ecoeye-app bash
```

### Access Container Shell
```bash
docker exec -it ecoeye-app /bin/bash
```

## Performance Optimization

The Dockerfile is optimized for:
- **Minimal Image Size**: Multi-stage builds exclude build dependencies
- **Layer Caching**: Order of instructions optimizes Docker cache hits
- **Alpine/Slim Images**: Reduces base image footprint
- **Health Checks**: Built-in monitoring without external tools

### Image Statistics
- **Frontend Builder**: ~150MB (not included in final image)
- **Final Image Size**: ~2.5GB (includes YOLO, PyTorch, and dependencies)

## Production Recommendations

For production deployment:

1. **Use a Production WSGI Server**
   ```bash
   # Replace Flask development server with Gunicorn
   pip install gunicorn
   gunicorn --bind 0.0.0.0:5000 app:app
   ```

2. **Enable HTTPS/TLS**
   - Use a reverse proxy (Nginx, Caddy)
   - Configure SSL certificates

3. **Environment Variables**
   - Use `.env` files for sensitive data
   - Never commit credentials

4. **Resource Limits**
   ```yaml
   deploy:
     resources:
       limits:
         cpus: '2'
         memory: 4G
   ```

5. **Logging & Monitoring**
   - Integrate with centralized logging (ELK, Splunk)
   - Set up metrics collection (Prometheus, DataDog)

## Troubleshooting

### Container Won't Start
```bash
# Check logs for errors
docker compose logs ecoeye-app

# Verify port availability
netstat -ano | grep :9000
```

### High Memory Usage
- The model (YOLO + PyTorch) uses ~2GB of RAM
- Ensure Docker has sufficient memory allocation
- Consider using quantized models for edge devices

### Build Timeout
- The pip install step can take 5-10 minutes due to large packages
- Ensure stable internet connectivity
- Increase Docker build timeout if needed

## Testing Results

✅ **All Tests Passed**
- Health check endpoint: 200 OK
- Status API: Returns application info correctly
- Zones API: Returns zone configuration
- Frontend build: Successfully included in image
- Container health check: Passing

## Linux Environment Compatibility

This Docker setup is fully compatible with:
- Ubuntu 20.04+ / 22.04+
- CentOS 8+
- Debian 11+
- Any Linux distribution with Docker support

### Running on Linux

```bash
# Install Docker & Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo curl -L https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m) -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Clone and run EcoEYE
git clone <repo-url>
cd EcoEYE
docker-compose up -d

# Access application
curl http://localhost:9000/api/status
```

## Next Steps

1. **Add GPU Support**: Update Dockerfile to use nvidia/cuda base image for GPU acceleration
2. **Implement Database**: Add PostgreSQL for storing detection results
3. **Add Authentication**: Implement user authentication in Flask
4. **CI/CD Pipeline**: Set up GitHub Actions for automated Docker builds
5. **Kubernetes Deployment**: Create Helm charts for K8s deployment

## Support

For issues or questions:
- Check Docker logs: `docker compose logs ecoeye-app`
- Review Dockerfile comments for build details
- Verify all Python dependencies installed correctly
