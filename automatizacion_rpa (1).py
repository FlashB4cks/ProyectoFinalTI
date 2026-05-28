import psycopg2
import pandas as pd
from datetime import datetime
import os

# Configuración de base de datos
DB_USER = "postgres"
DB_PASS = "124566"
DB_HOST = "localhost"
DB_NAME = "ProyectoTi"

def generar_reporte_ventas():
    print("Iniciando Bot de Automatización RPA (Generación de Reportes)...")
    try:
        # 1. Conectar a la base de datos
        conn = psycopg2.connect(
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASS,
            host=DB_HOST,
            port="5433"
        )
        print("-> Conectado a PostgreSQL exitosamente.")

        # 2. Extraer datos (KPI: Ventas por Cliente y Producto)
        query = """
            SELECT 
                v.fecha, c.nombre AS cliente, p.nombre AS repuesto, 
                dv.cantidad, dv.subtotal
            FROM detalle_ventas dv
            JOIN ventas v ON dv.venta_id = v.id
            JOIN clientes c ON v.cliente_id = c.id
            JOIN productos p ON dv.producto_id = p.id
            ORDER BY v.fecha DESC;
        """
        
        # Leer datos a un DataFrame de pandas
        df = pd.read_sql_query(query, conn)
        
        # 3. Transformación de datos
        fecha_str = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        nombre_archivo = f"Reporte_Ventas_Automatizado_{fecha_str}.xlsx"
        ruta_reportes = os.path.join(os.getcwd(), "reportes")
        
        if not os.path.exists(ruta_reportes):
            os.makedirs(ruta_reportes)
            
        ruta_completa = os.path.join(ruta_reportes, nombre_archivo)

        # 4. Generar reporte en Excel
        df.to_excel(ruta_completa, index=False, engine='openpyxl')
        print(f"-> Reporte generado exitosamente en: {ruta_completa}")
        
        # 5. Simular envío (Notificación)
        print("-> TAREA RPA COMPLETADA: El archivo ha sido generado y esta listo para adjuntarse en el correo diario a Gerencia.")

    except Exception as e:
        print(f"-> Error en la automatizacion: {e}")
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    generar_reporte_ventas()
