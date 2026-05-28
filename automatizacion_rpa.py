import psycopg2
import pandas as pd
import csv
from datetime import datetime
import os
import sys

# Configuración dinámica de base de datos (detecta si está dentro de Docker o en el Host)
DB_USER = os.environ.get("DB_USER", "postgres")
DB_PASS = os.environ.get("DB_PASS", "124566")
DB_HOST = os.environ.get("DB_HOST", "localhost")
DB_NAME = os.environ.get("DB_NAME", "ProyectoTi")
# Si hay un host de DB configurado en el env (Docker), usamos puerto interno 5432, de lo contrario 5433 (Host)
DB_PORT = os.environ.get("DB_PORT", "5432" if os.environ.get("DB_HOST") else "5433")

def conectar_db():
    return psycopg2.connect(
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASS,
        host=DB_HOST,
        port=DB_PORT
    )

# =====================================================================
# PROCESO RPA 1: Generación y Simulación de Envío de Reporte de Ventas
# =====================================================================
def generar_reporte_ventas():
    print("\n" + "="*70)
    print(" RPA PROCESO 1: GENERACIÓN DE REPORTE DIARIO DE VENTAS EN EXCEL")
    print("="*70)
    try:
        conn = conectar_db()
        print("-> Conectado a PostgreSQL exitosamente.")

        # Consulta detallada de ventas
        query = """
            SELECT 
                v.id AS folio_venta,
                v.fecha, 
                c.nombre AS cliente, 
                c.tipo AS tipo_cliente,
                p.nombre AS repuesto, 
                p.categoria,
                dv.cantidad, 
                dv.precio_unitario,
                dv.subtotal
            FROM detalle_ventas dv
            JOIN ventas v ON dv.venta_id = v.id
            JOIN clientes c ON v.cliente_id = c.id
            JOIN productos p ON dv.producto_id = p.id
            ORDER BY v.fecha DESC, v.id DESC;
        """
        
        df = pd.read_sql_query(query, conn)
        
        if df.empty:
            print("-> [Aviso] No hay registros de ventas para generar el reporte.")
            return

        fecha_str = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        nombre_archivo = f"Reporte_Ventas_Automatizado_{fecha_str}.xlsx"
        ruta_reportes = os.path.join(os.getcwd(), "reportes")
        
        if not os.path.exists(ruta_reportes):
            os.makedirs(ruta_reportes)
            
        ruta_completa = os.path.join(ruta_reportes, nombre_archivo)
        
        # Guardar reporte en formato Excel
        df.to_excel(ruta_completa, index=False, engine='openpyxl')
        print(f"-> EXCEL GENERADO: {ruta_completa}")
        print("-> [RPA Acción] Enviando notificación de reporte por correo a Gerencia...")
        print("-> NOTIFICACIÓN ENVIADA: 'Reporte de ventas de MKParts generado y guardado exitosamente.'")
        print("-> PROCESO 1 COMPLETADO EXITOSAMENTE.")

    except Exception as e:
        print(f"-> Error en Proceso 1: {e}")
    finally:
        if 'conn' in locals() and conn:
            conn.close()

# =====================================================================
# PROCESO RPA 2: Registro Automático / Carga Masiva desde CSV
# =====================================================================
def importar_nuevos_productos():
    print("\n" + "="*70)
    print(" RPA PROCESO 2: REGISTRO AUTOMÁTICO DE PRODUCTOS (CARGA MASIVA CSV)")
    print("="*70)
    
    csv_filename = "importar_productos.csv"
    ruta_csv = os.path.join(os.getcwd(), csv_filename)
    
    # Si no existe el archivo CSV modelo, el bot lo crea automáticamente
    if not os.path.exists(ruta_csv):
        print(f"-> [RPA Acción] No se encontró '{csv_filename}'. Creando plantilla con repuestos de prueba...")
        mock_data = [
            ["nombre", "categoria", "precio_costo", "precio_venta", "stock"],
            ["Llanta Delantera 90/90-19", "Llantas", "450.00", "600.00", "15"],
            ["Kit de Transmision Racing", "Transmisión", "200.00", "350.00", "4"],
            ["Bateria de Gel 12V", "Eléctrico", "300.00", "480.00", "5"],
            ["Aceite de Transmision 80W90 1L", "Lubricantes", "45.00", "75.00", "25"],
            ["Espejo Retrovisor Deportivo", "Accesorios", "80.00", "140.00", "8"],
            ["Pastilla Freno Cerámica Delantera", "Frenos", "95.00", "160.00", "3"],
            ["Llanta Trasera 130/70-17", "Llantas", "600.00", "850.00", "10"],
            ["Pastillas de Freno Delanteras", "Frenos", "150.00", "250.00", "12"],
            ["Aceite Sintético 10W-40 1L", "Lubricantes", "110.00", "180.00", "15"],
            ["Bujía NGK Iridium", "Motor", "70.00", "120.00", "20"],
            ["Casco Integral Certificado DOT", "Accesorios", "950.00", "1500.00", "8"]
        ]
        with open(ruta_csv, mode="w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerows(mock_data)
        print(f"-> Plantilla '{csv_filename}' creada exitosamente.")

    try:
        conn = conectar_db()
        cursor = conn.cursor()
        print("-> Conectado a PostgreSQL exitosamente.")
        print(f"-> Leyendo e importando datos desde: {ruta_csv}")
        
        productos_leidos = 0
        productos_insertados = 0
        productos_actualizados = 0
        
        with open(ruta_csv, mode="r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                productos_leidos += 1
                nombre = row["nombre"]
                categoria = row["categoria"]
                precio_costo = float(row["precio_costo"])
                precio_venta = float(row["precio_venta"])
                stock = int(row["stock"])
                
                # Comprobar si el producto ya existe
                cursor.execute("SELECT id, stock FROM productos WHERE nombre = %s;", (nombre,))
                existing = cursor.fetchone()
                
                if existing:
                    current_stock = existing[1]
                    # Solo se actualiza si el stock actual está en alerta crítica (menos de 5 unidades)
                    if current_stock >= 5:
                        print(f"-> [RPA Salto] '{nombre}' tiene stock suficiente ({current_stock} unid.). No requiere reabastecimiento.")
                    else:
                        nuevo_stock = current_stock + stock
                        cursor.execute(
                            "UPDATE productos SET precio_costo = %s, precio_venta = %s, stock = %s WHERE id = %s;",
                            (precio_costo, precio_venta, nuevo_stock, existing[0])
                        )
                        print(f"-> [RPA Reabastecido] '{nombre}' crítico ({current_stock} unid.). Reabastecido a {nuevo_stock} unidades.")
                        productos_actualizados += 1
                else:
                    # Si no existe, se inserta como nuevo producto (stock inicial)
                    cursor.execute(
                        "INSERT INTO productos (nombre, categoria, precio_costo, precio_venta, stock) VALUES (%s, %s, %s, %s, %s);",
                        (nombre, categoria, precio_costo, precio_venta, stock)
                    )
                    print(f"-> [RPA Registrado] Nuevo repuesto '{nombre}' agregado al ERP con stock de {stock} unidades.")
                    productos_insertados += 1
                    
        conn.commit()
        print(f"-> [RPA Resumen] Procesados: {productos_leidos} repuestos.")
        print(f"   - Registros nuevos agregados al ERP: {productos_insertados}")
        print(f"   - Registros de stock actualizados en el ERP: {productos_actualizados}")
        print("-> PROCESO 2 COMPLETADO EXITOSAMENTE.")

    except Exception as e:
        if 'conn' in locals() and conn:
            conn.rollback()
        print(f"-> Error en Proceso 2: {e}")
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            conn.close()

# =====================================================================
# PROCESO RPA 3: Alerta y Reporte de Stock Crítico
# =====================================================================
def alerta_stock_critico():
    print("\n" + "="*70)
    print(" RPA PROCESO 3: MONITOR DE INVENTARIO Y ALERTA DE STOCK CRÍTICO")
    print("="*70)
    try:
        conn = conectar_db()
        print("-> Conectado a PostgreSQL exitosamente.")
        print("-> Escaneando niveles de inventario en el ERP (Umbral crítico: menos de 5 unidades)...")
        
        query = """
            SELECT id, nombre, categoria, stock, precio_costo
            FROM productos
            WHERE stock < 5
            ORDER BY stock ASC;
        """
        
        df = pd.read_sql_query(query, conn)
        
        if df.empty:
            print("-> ¡EXCELENTE! Todos los productos en el ERP tienen suficiente disponibilidad.")
            print("-> No se requieren alertas de compra el día de hoy.")
            return

        print("\n🚨 ¡ALERTA DE REABASTECIMIENTO! Se detectaron los siguientes productos críticos:")
        print("-" * 75)
        for idx, row in df.iterrows():
            print(f"🔴 CÓDIGO {row['id']:03d} | {row['nombre']:<35} | Cat: {row['categoria']:<12} | STOCK: {row['stock']} unid. (Costo: Q.{row['precio_costo']})")
        print("-" * 75)
        
        # Generar archivo de alerta técnica para el departamento de compras
        fecha_str = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        nombre_alerta = f"Alerta_Stock_Critico_{fecha_str}.txt"
        ruta_reportes = os.path.join(os.getcwd(), "reportes")
        if not os.path.exists(ruta_reportes):
            os.makedirs(ruta_reportes)
            
        ruta_completa = os.path.join(ruta_reportes, nombre_alerta)
        
        with open(ruta_completa, "w", encoding="utf-8") as f:
            f.write(f"=== ALERTA AUTOMÁTICA DE COMPRAS - MKPARTS ERP ===\n")
            f.write(f"Fecha de ejecución del Bot: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"Se encontraron {len(df)} repuestos bajo el umbral mínimo (5 unidades).\n")
            f.write("-" * 80 + "\n")
            f.write(f"{'ID':<5} | {'Repuesto':<35} | {'Categoría':<15} | {'Stock':<6} | {'Costo Unitario':<10}\n")
            f.write("-" * 80 + "\n")
            for idx, row in df.iterrows():
                f.write(f"{row['id']:<5} | {row['nombre']:<35} | {row['categoria']:<15} | {row['stock']:<6} | Q.{row['precio_costo']:<10}\n")
            f.write("-" * 80 + "\n")
            f.write("Recomendación del sistema: Generar orden de compra urgente para los ítems listados.")

        print(f"\n-> ALERTA GENERADA: {ruta_completa}")
        print("-> [RPA Acción] Enviando advertencia a panel administrativo del ERP...")
        print("-> PROCESO 3 COMPLETADO EXITOSAMENTE.")

    except Exception as e:
        print(f"-> Error en Proceso 3: {e}")
    finally:
        if 'conn' in locals() and conn:
            conn.close()

# =====================================================================
# EJECUTOR PRINCIPAL (MENU DE OPERACIÓN)
# =====================================================================
def menu():
    while True:
        print("\n" + "="*50)
        print("🤖 SISTEMA DE AUTOMATIZACIÓN RPA — MKPARTS ERP 🤖")
        print("="*50)
        print("1. [Proceso 1] Generar Reporte Diario de Ventas (Excel)")
        print("2. [Proceso 2] Registro Automático de Inventario (Cargar CSV)")
        print("3. [Proceso 3] Monitor de Stock Crítico (Alerta y Reporte)")
        print("4. Ejecutar los 3 procesos automáticamente (Modo Demostración)")
        print("5. Salir")
        print("="*50)
        
        opcion = input("Seleccione una opción (1-5): ").strip()
        
        if opcion == "1":
            generar_reporte_ventas()
        elif opcion == "2":
            importar_nuevos_productos()
        elif opcion == "3":
            alerta_stock_critico()
        elif opcion == "4":
            print("\n🚀 INICIANDO EJECUCIÓN BATCH COMPLETA DE RPA EN 3 SEGUNDOS...")
            import time
            time.sleep(1)
            generar_reporte_ventas()
            time.sleep(1)
            importar_nuevos_productos()
            time.sleep(1)
            alerta_stock_critico()
            print("\n🎯 TODAS LAS AUTOMATIZACIONES RPA SE EJECUTARON SATISFACTORIAMENTE.")
        elif opcion == "5":
            print("\nCerrando el bot de automatización. ¡Hasta pronto!")
            break
        else:
            print("Opción inválida. Intente de nuevo.")

if __name__ == "__main__":
    # Si se pasa un argumento por consola (por ejemplo, para ejecutar sin interactividad desde Django)
    if len(sys.argv) > 1:
        arg = sys.argv[1]
        if arg == "--proceso1":
            print("\n🚀 INICIANDO RPA: PROCESO 1 (REPORTE DE VENTAS)...")
            generar_reporte_ventas()
            print("\n🎯 PROCESO 1 COMPLETADO EXITOSAMENTE EN SEGUNDO PLANO.")
        elif arg == "--proceso2":
            print("\n🚀 INICIANDO RPA: PROCESO 2 (CARGA MASIVA CSV)...")
            importar_nuevos_productos()
            print("\n🎯 PROCESO 2 COMPLETADO EXITOSAMENTE EN SEGUNDO PLANO.")
        elif arg == "--proceso3":
            print("\n🚀 INICIANDO RPA: PROCESO 3 (MONITOR STOCK CRÍTICO)...")
            alerta_stock_critico()
            print("\n🎯 PROCESO 3 COMPLETADO EXITOSAMENTE EN SEGUNDO PLANO.")
        elif arg == "--batch":
            print("\n🚀 INICIANDO EJECUCIÓN RPA EN MODO BATCH...")
            generar_reporte_ventas()
            importar_nuevos_productos()
            alerta_stock_critico()
            print("\n🎯 AUTOMATIZACIÓN RPA COMPLETADA EXITOSAMENTE EN SEGUNDO PLANO.")
        else:
            print(f"-> [Error] Argumento inválido: {arg}")
            sys.exit(1)
    else:
        menu()
