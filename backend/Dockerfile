# syntax=docker/dockerfile:1
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    gfortran \
    libglib2.0-0 \
    libgl1 \
    libgomp1 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libfontconfig1 \
    libice6 \
    libgsl-dev \
    libgslcblas0 \
    libhdf5-dev \
    libhdf5-serial-dev \
    libopenmpi-dev \
    openmpi-bin \
    libxml2-dev \
    libxslt1-dev \
    libstdc++6 \
    libc6 \
    pkg-config \
    git \
    && rm -rf /var/lib/apt/lists/*

ENV LD_LIBRARY_PATH=/usr/lib/x86_64-linux-gnu

COPY backend/requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY launch_jardes.py .
COPY jardesigner/ ./jardesigner/

RUN mkdir -p /app/logs /app/backend/temp_configs /app/backend/user_uploads && \
    chmod -R 755 /app/logs /app/backend/temp_configs /app/backend/user_uploads

ENV PYTHONPATH=/app

EXPOSE 5000

WORKDIR /app/backend
CMD ["gunicorn", "--config", "gunicorn.py", "server:app"]
