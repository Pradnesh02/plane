FROM python:3.12-slim
RUN pip install --no-cache-dir fastembed==0.4.2
WORKDIR /app
COPY server.py .
# bake the model into the image so the first search doesn't download it
ENV FASTEMBED_CACHE_PATH=/models
RUN python -c "from fastembed import TextEmbedding; TextEmbedding('BAAI/bge-small-en-v1.5')"
EXPOSE 8000
CMD ["python", "server.py"]
