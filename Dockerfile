FROM python:3.10-slim

# Evitar que Python escriba archivos .pyc y forzar salida sin búfer para logs en tiempo real
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Copiar e instalar requerimientos
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copiar el proyecto
COPY . /app/

# Exponer puerto de Django
EXPOSE 8000

# Arrancar servidor en la interfaz global
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
