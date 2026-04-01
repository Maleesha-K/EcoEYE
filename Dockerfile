# Stage 1: Frontend build
FROM node:20-alpine AS frontend-builder

WORKDIR /app/control-app
COPY control-app/package*.json ./
RUN npm ci
COPY control-app/ .
RUN npm run build

# Stage 2: Runtime
FROM balenalib/raspberrypi5-debian-python:3.11-bookworm-run

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Enable udev for hardware access
ENV UDEV=1

# Working directory
WORKDIR /app

# Install system dependencies including udev, camera libs, and network-manager
RUN install_packages udev v4l-utils libgl1-mesa-glx libglib2.0-0 python3-opencv network-manager

# Ensure app directory and system packages are in path
ENV PYTHONPATH=/app:/usr/lib/python3/dist-packages

COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy all files
COPY . ./
COPY --from=frontend-builder /app/control-app/dist /app/frontend/dist

RUN mkdir -p /app/data && chmod +x /app/scripts/start.sh

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:80/health', timeout=3)"

# Use startup script
CMD ["/app/scripts/start.sh"]
