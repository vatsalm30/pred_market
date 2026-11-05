# Cloud Run Job for the Python data pipeline (replaces the GitHub Actions crons).
# Built from the repo root by gcp/deploy.sh via Cloud Build.
FROM node:22.11.0-bookworm-slim AS node

FROM python:3.12-slim-bookworm

# pmxt launches a bundled Node server on localhost
COPY --from=node /usr/local/bin/node /usr/local/bin/node

# CPU-only torch keeps the image ~2 GB smaller than the default CUDA build
RUN pip install --no-cache-dir torch==2.12.0 --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt google-cloud-storage==3.4.1 boto3==1.40.61

# Bake the embedding model into the image so each run doesn't download it
ENV HF_HOME=/opt/hf
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"
ENV HF_HUB_OFFLINE=1 PYTHONUNBUFFERED=1

COPY *.py /opt/app/
COPY gcp/pipeline/job.py /opt/

ENTRYPOINT ["python", "/opt/job.py"]
