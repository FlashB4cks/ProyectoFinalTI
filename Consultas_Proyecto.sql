-- ==========================================
-- PROYECTO FINAL - ADMINISTRACIÓN DE TI
-- ERP: MKParts (Venta de Repuestos)
-- Motor de Base de Datos: PostgreSQL
-- ==========================================

-- 1. Ventas por período (Agrupadas por mes)
-- Explicación: Esta consulta extrae el mes y año de la fecha de venta y suma el total vendido, 
-- ordenando los resultados cronológicamente para visualizar la tendencia mensual.
SELECT 
    TO_CHAR(fecha, 'YYYY-MM') AS periodo,
    COUNT(id) AS cantidad_ventas,
    SUM(total) AS ingresos_totales
FROM ventas
GROUP BY TO_CHAR(fecha, 'YYYY-MM')
ORDER BY periodo DESC;

-- 2. Productos más vendidos
-- Explicación: Se une la tabla de detalles de venta con el maestro de productos para contar 
-- la cantidad total de unidades vendidas por cada repuesto, ordenando de mayor a menor.
SELECT 
    p.nombre AS repuesto,
    p.categoria,
    SUM(dv.cantidad) AS unidades_vendidas,
    SUM(dv.subtotal) AS ingresos_generados
FROM detalle_ventas dv
JOIN productos p ON dv.producto_id = p.id
GROUP BY p.id, p.nombre, p.categoria
ORDER BY unidades_vendidas DESC
LIMIT 10;

-- 3. Clientes principales (Top Clientes por volumen de compras)
-- Explicación: Combina las ventas con los clientes para calcular el ticket promedio y 
-- el total gastado históricamente por cada cliente.
SELECT 
    c.nombre AS cliente,
    c.tipo AS tipo_cliente,
    COUNT(v.id) AS numero_compras,
    SUM(v.total) AS total_gastado,
    ROUND(AVG(v.total), 2) AS ticket_promedio
FROM ventas v
JOIN clientes c ON v.cliente_id = c.id
GROUP BY c.id, c.nombre, c.tipo
ORDER BY total_gastado DESC;

-- 4. Inventario disponible
-- Explicación: Consulta la tabla maestra de productos para mostrar el catálogo y su precio de venta, 
-- base necesaria para el módulo de inventario. (NOTA: Se asume que en una versión avanzada se agregaría 
-- una columna de 'stock', por ahora se lista el maestro disponible).
SELECT 
    id AS codigo_repuesto,
    nombre,
    categoria,
    precio_venta AS precio_unitario
FROM productos
ORDER BY categoria, nombre;
