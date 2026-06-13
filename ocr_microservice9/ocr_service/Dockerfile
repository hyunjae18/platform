FROM python:3.10-slim-bullseye

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    wget \
    && rm -rf /var/lib/apt/lists/*
    
# Copy requirements
COPY requirements.txt .

# Install dependencies with a longer timeout because OCR wheels are large
RUN pip install --retries 20 --timeout 1000 --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create directories
RUN mkdir -p uploads

# Environment variables
ENV PYTHONPATH=/app
ENV OCR_GPU=false

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]