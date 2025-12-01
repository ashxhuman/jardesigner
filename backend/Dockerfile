# syntax=docker/dockerfile:1
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install only essential system dependencies
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
    
# Set library paths
ENV LD_LIBRARY_PATH=/usr/lib/x86_64-linux-gnu

# Copy requirements
COPY backend/requirements.txt .

# Install Python dependencies
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY jardesigner /app/jardesigner
COPY run_jardesigner.py /app/
COPY backend /app/backend

# log file
RUN mkdir -p /clientapp/logs
RUN chmod -R 755 /clientapp/logs

# Create directories for volumes
RUN mkdir -p /clientapp/backend/temp_configs
RUN mkdir -p /clientapp/backend/user_uploads
RUN chmod -R 755 /clientapp/backend/temp_configs
RUN chmod -R 755 /clientapp/backend/user_uploads

# Set PYTHONPATH
ENV PYTHONPATH=/app

# Define volumes for persistent data
VOLUME ["/app/backend/temp_configs", "/app/backend/user_uploads"]

EXPOSE 5000

CMD  ["uvicorn" , "backend.main:socket_app", "--host" , "0.0.0.0", "--port", "5000"]