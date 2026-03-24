FROM python:3.12-slim

# System deps for Chromium (browser-use 0.12.x auto-downloads Chromium via cdp-use)
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-liberation libasound2 libatk-bridge2.0-0 \
    libatk1.0-0 libcups2 libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 \
    libnspr4 libnss3 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libxss1 libxtst6 xdg-utils libx11-xcb1 libxcb1 libxext6 libxshmfence1 \
    wget ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV IN_DOCKER=true

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

EXPOSE 9000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "9000"]
