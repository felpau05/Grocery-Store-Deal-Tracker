# Local-dev image for the FastAPI backend — see docker-compose.yml at
# the repo root. Not tuned for production (no multi-stage slimming,
# runs with --reload); revisit if this ever becomes the deploy image
# too.
FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
