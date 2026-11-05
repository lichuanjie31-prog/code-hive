FROM public.ecr.aws/docker/library/python:3.12-slim
WORKDIR /app
COPY backend/requirements.lock.txt ./requirements.lock.txt
RUN pip install --no-cache-dir -r requirements.lock.txt
COPY backend/app ./app
COPY backend/migrations ./migrations
COPY backend/seed ./seed
COPY backend/alembic.ini ./alembic.ini
RUN useradd --uid 10001 --no-create-home app
USER app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-proxy-headers"]
