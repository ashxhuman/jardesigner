# syntax=docker/dockerfile:1
FROM python:3.12-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    LD_LIBRARY_PATH=/usr/lib/x86_64-linux-gnu

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    gfortran \
    ninja-build \
    pkg-config \
    git \
    ca-certificates \
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
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /app/backend/requirements.txt

RUN python -m pip install --upgrade pip && \
    pip install --no-cache-dir -r /app/backend/requirements.txt && \
    pip install --no-cache-dir meson meson-python python-libsbml pyneuroml

# Better than building from a mutable branch name in CI:
# pin to a commit or tag if possible
ARG MOOSE_REPO=https://github.com/MooseNeuro/moose-core
ARG MOOSE_REF=development

RUN git clone --depth=1 --branch ${MOOSE_REF} ${MOOSE_REPO} /tmp/moose-core && \
    cd /tmp/moose-core && \
    pip install pint && \
    pip install scipy && \
    pip install nanobind && \
    meson setup _build -Duse_mpi=false -Dbuildtype=release && \
    meson compile -vC _build && \
    meson install -C _build && \
    rm -rf /tmp/moose-core

COPY backend/ /app/backend/
COPY launch_jardes.py /app/
COPY jardesigner/ /app/jardesigner/

RUN mkdir -p /app/logs /app/backend/temp_configs /app/backend/user_uploads && \
    chmod -R 755 /app/logs /app/backend/temp_configs /app/backend/user_uploads

EXPOSE 5000

WORKDIR /app/backend
CMD ["gunicorn", "--config", "gunicorn.py", "server:app"]