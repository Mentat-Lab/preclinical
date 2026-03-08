# syntax=docker/dockerfile:1

# Pipecat Healthcare Agent Dockerfile
# Uses official Pipecat base image for Pipecat Cloud compatibility

FROM dailyco/pipecat-base:latest

# Install ffmpeg for audio processing (required by Cartesia TTS)
RUN apt-get update -qq \
  && apt-get install --no-install-recommends -y ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code as app.py (required by pipecat-base)
COPY bot.py app.py
COPY . .

# Start the app; it binds to $PORT (or 7860) in production mode.
CMD ["python", "app.py"]
