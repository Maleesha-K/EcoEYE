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

# Enable udev for hardware hotplugging
ENV UDEV=on

WORKDIR /app

# Install system dependencies including udev and camera libs
RUN install_packages udev v4l-utils libgl1-mesa-glx libglib2.0-0

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py ./
COPY --from=frontend-builder /app/control-app/dist /app/frontend/dist

RUN useradd --create-home --shell /bin/bash appuser \
    && usermod -aG video appuser \
    && mkdir -p /app/data \
    && chown -R appuser:appuser /app

USER appuser

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5000/health', timeout=3)"

CMD ["gunicorn", "-w", "1", "--threads", "2", "--timeout", "45", "--bind", "0.0.0.0:5000", "app:app"]
