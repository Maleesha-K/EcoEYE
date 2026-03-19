# Multi-stage build for EcoEYE application

# Stage 1: Frontend Build
FROM node:18-alpine AS frontend-builder

WORKDIR /app/control-app

# Copy package files
COPY control-app/package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY control-app/ .

# Build the React application
RUN npm run build

# Stage 2: Python Runtime with Backend & Frontend
FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy Python requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy Python application files
COPY ecoeye_test*.py ./
COPY yolo26n.pt ./

# Copy built frontend from previous stage
COPY --from=frontend-builder /app/control-app/dist /app/frontend/dist

# Create a simple Python server to serve the frontend and expose APIs
RUN pip install --no-cache-dir flask flask-cors

COPY app.py ./

# Expose port 5000 for backend API
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

# Run the application
CMD ["python", "app.py"]
