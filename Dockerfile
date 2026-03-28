# Stage 1: Frontend build
FROM node:20-alpine AS frontend-builder

WORKDIR /app/control-app
COPY control-app/package*.json ./
RUN npm ci
COPY control-app/ .
RUN npm run build

# Stage 2: Runtime
FROM balenalib/raspberrypi4-64-debian-python:3.11-bookworm-run

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Enable udev for hardware access
RUN pip install --no-cache-dir -r requirements.txt

# Copy all files
COPY . ./
COPY --from=frontend-builder /app/control-app/dist /app/frontend/dist

RUN mkdir -p /app/data && chmod +x /app/scripts/start.sh

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5000/health', timeout=3)"

# Use startup script
CMD ["/app/scripts/start.sh"]
