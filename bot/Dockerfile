FROM python:3.11-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

ENV CORPUS_PATH=corpus/bidaya_arab.txt \
    PORT=7860

EXPOSE 7860

CMD ["python", "main.py"]
