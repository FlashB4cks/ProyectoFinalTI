const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// PostgreSQL Database Connection
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'ProyectoTi',
    password: '124566',
    port: 5433,
});
// Test connection
pool.connect((err, client, release) => {
    if (err) {
        console.error('Error conectando a la base de datos PostgreSQL:', err.stack);
    } else {
        console.log('¡Conectado exitosamente a la base de datos PostgreSQL (ProyectoTi)!');
    }
});

// API Routes para los 5 módulos (Borrador inicial)

// 1. GET INVENTARIO (todos los campos)
app.get('/api/inventario', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, nombre, categoria, precio_costo, precio_venta, stock FROM productos ORDER BY nombre ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error inventario:', err.message);
        res.status(500).json({ error: 'Error al obtener inventario.' });
    }
});

// GET Clientes
app.get('/api/clientes', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, nombre FROM clientes ORDER BY nombre ASC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener clientes.' });
    }
});

// GET Ventas con nombre de cliente (JOIN)
app.get('/api/ventas', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT v.id, c.nombre AS cliente, v.fecha, v.total
            FROM ventas v
            JOIN clientes c ON v.cliente_id = c.id
            ORDER BY v.id DESC LIMIT 50
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener ventas.' });
    }
});


// 2. CREAR NUEVA VENTA COMPLEJA (POST) con Transacciones + Descuento de Stock
app.post('/api/ventas', async (req, res) => {
    const { cliente_id, total, lineas } = req.body;
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // 1. Validar stock suficiente ANTES de confirmar
        for (const linea of lineas) {
            const stockRes = await client.query(
                'SELECT nombre, stock FROM productos WHERE id = $1 FOR UPDATE',
                [linea.producto_id]
            );
            if (stockRes.rows.length === 0) {
                throw new Error(`Producto ID ${linea.producto_id} no encontrado.`);
            }
            const { nombre, stock } = stockRes.rows[0];
            if (stock < parseInt(linea.cantidad)) {
                throw new Error(`Stock insuficiente para "${nombre}". Disponible: ${stock}, solicitado: ${linea.cantidad}.`);
            }
        }

        // 2. Insertar Cabecera de Venta
        const resultVenta = await client.query(
            'INSERT INTO ventas (cliente_id, usuario_id, fecha, total) VALUES ($1, 1, CURRENT_DATE, $2) RETURNING id',
            [cliente_id, total]
        );
        const ventaId = resultVenta.rows[0].id;

        // 3. Insertar Líneas de Detalle y DESCONTAR STOCK
        for (const linea of lineas) {
            // Insertar detalle
            await client.query(
                'INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario) VALUES ($1, $2, $3, $4)',
                [ventaId, linea.producto_id, linea.cantidad, linea.precio_unitario]
            );
            // Descontar del inventario
            await client.query(
                'UPDATE productos SET stock = stock - $1 WHERE id = $2',
                [linea.cantidad, linea.producto_id]
            );
        }

        await client.query('COMMIT');
        res.status(201).json({ success: true, venta_id: ventaId });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error en transacción de venta:', err.message);
        // Enviar el mensaje de error específico (ej. stock insuficiente) al frontend
        res.status(400).json({ error: err.message });
    } finally {
        client.release();
    }
});

// GET Proveedores (todos los clientes sirven como proveedores)
app.get('/api/proveedores', async (req, res) => {
    try {
        const result = await pool.query("SELECT id, nombre FROM clientes ORDER BY nombre ASC");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener proveedores.' });
    }
});

// GET Compras con nombre de proveedor
app.get('/api/compras', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT c.id, COALESCE(cl.nombre, 'Proveedor Externo') AS proveedor, c.fecha, c.total
            FROM compras c
            LEFT JOIN clientes cl ON c.proveedor_id = cl.id
            ORDER BY c.id DESC LIMIT 50
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener compras.' });
    }
});

// GET CRM Leads con nombre de cliente
app.get('/api/crm', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT l.id, l.descripcion, COALESCE(cl.nombre, 'Sin asignar') AS cliente,
                   l.ingreso_estimado, l.probabilidad, l.estado
            FROM crm_leads l
            LEFT JOIN clientes cl ON l.cliente_id = cl.id
            ORDER BY l.id DESC LIMIT 50
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener leads.' });
    }
});

// GET Contabilidad (ingresos vs gastos del mes)
app.get('/api/contabilidad', async (req, res) => {
    try {
        const ingresosRes = await pool.query(
            "SELECT COALESCE(SUM(total),0) AS total FROM ventas WHERE EXTRACT(MONTH FROM fecha)=EXTRACT(MONTH FROM CURRENT_DATE) AND EXTRACT(YEAR FROM fecha)=EXTRACT(YEAR FROM CURRENT_DATE)"
        );
        const gastosRes = await pool.query(
            "SELECT COALESCE(SUM(total),0) AS total FROM compras WHERE EXTRACT(MONTH FROM fecha)=EXTRACT(MONTH FROM CURRENT_DATE) AND EXTRACT(YEAR FROM fecha)=EXTRACT(YEAR FROM CURRENT_DATE)"
        );
        const ingresos = parseFloat(ingresosRes.rows[0].total);
        const gastos = parseFloat(gastosRes.rows[0].total);
        res.json({ ingresos, gastos, balance: ingresos - gastos });
    } catch (err) {
        res.status(500).json({ error: 'Error en contabilidad.' });
    }
});

// GET Dashboard Metrics (4 KPIs)
app.get('/api/dashboard', async (req, res) => {
    try {
        const repuestosRes = await pool.query('SELECT COUNT(*) AS total FROM productos');
        const ventasRes = await pool.query(
            "SELECT COALESCE(SUM(total),0) AS ventas_mes FROM ventas WHERE EXTRACT(MONTH FROM fecha)=EXTRACT(MONTH FROM CURRENT_DATE)"
        );
        const clientesRes = await pool.query('SELECT COUNT(*) AS total FROM clientes');
        const leadsRes = await pool.query("SELECT COUNT(*) AS total FROM crm_leads WHERE estado != 'Ganado'");
        const ultimasVentasRes = await pool.query(`
            SELECT v.id, c.nombre AS cliente, v.fecha, v.total
            FROM ventas v JOIN clientes c ON v.cliente_id = c.id
            ORDER BY v.id DESC LIMIT 5
        `);
        res.json({
            repuestos: repuestosRes.rows[0].total,
            ventas_mes: ventasRes.rows[0].ventas_mes || 0,
            clientes: clientesRes.rows[0].total,
            leads_activos: leadsRes.rows[0].total,
            ultimas_ventas: ultimasVentasRes.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener dashboard.' });
    }
});

// Start Server

// POST Nueva Compra (Transaccional)
app.post('/api/compras', async (req, res) => {
    const { proveedor_id, total, lineas } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const resultCompra = await client.query(
            'INSERT INTO compras (proveedor_id, fecha, total) VALUES ($1, CURRENT_DATE, $2) RETURNING id',
            [proveedor_id, total]
        );
        const compraId = resultCompra.rows[0].id;

        for (const linea of lineas) {
            await client.query(
                'INSERT INTO detalle_compras (compra_id, producto_id, cantidad, costo_unitario) VALUES ($1, $2, $3, $4)',
                [compraId, linea.producto_id, linea.cantidad, linea.precio_unitario] // en front enviamos precio_unitario pero aqui es costo
            );
        }
        await client.query('COMMIT');
        res.status(201).json({ success: true, compra_id: compraId });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error en compra:', err);
        res.status(500).json({ error: 'Error al registrar compra.' });
    } finally {
        client.release();
    }
});

// POST Nuevo Lead CRM
app.post('/api/crm', async (req, res) => {
    const { descripcion, cliente_id, ingreso_estimado, probabilidad, estado } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO crm_leads (descripcion, cliente_id, ingreso_estimado, probabilidad, estado) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [descripcion, cliente_id, ingreso_estimado, probabilidad, estado]
        );
        res.status(201).json({ success: true, lead_id: result.rows[0].id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al registrar lead.' });
    }
});

// GET Dashboard Metrics
app.get('/api/dashboard', async (req, res) => {
    try {
        const repuestosRes = await pool.query('SELECT COUNT(*) AS total FROM productos');
        const ventasRes = await pool.query('SELECT SUM(total) AS ventas_mes FROM ventas WHERE EXTRACT(MONTH FROM fecha) = EXTRACT(MONTH FROM CURRENT_DATE)');
        
        res.json({
            repuestos: repuestosRes.rows[0].total,
            ventas_mes: ventasRes.rows[0].ventas_mes || 0
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener dashboard.' });
    }
});

// ============================================================
// GESTIÓN DEL SISTEMA
// ============================================================

// GET Todos los usuarios
app.get('/api/usuarios', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, nombre, rol, email, activo, fecha_creacion FROM usuarios ORDER BY id ASC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener usuarios.' });
    }
});

// POST Crear nuevo usuario
app.post('/api/usuarios', async (req, res) => {
    const { nombre, rol, email } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO usuarios (nombre, rol, email, activo) VALUES ($1, $2, $3, TRUE) RETURNING id',
            [nombre, rol, email]
        );
        res.status(201).json({ success: true, id: result.rows[0].id });
    } catch (err) {
        if (err.code === '23505') { // unique constraint email
            res.status(400).json({ error: 'Ya existe un usuario con ese correo electrónico.' });
        } else {
            res.status(500).json({ error: 'Error al crear usuario.' });
        }
    }
});

// PUT Actualizar usuario (nombre, rol, activo)
app.put('/api/usuarios/:id', async (req, res) => {
    const { nombre, rol, activo } = req.body;
    try {
        await pool.query(
            'UPDATE usuarios SET nombre=$1, rol=$2, activo=$3 WHERE id=$4',
            [nombre, rol, activo, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Error al actualizar usuario.' });
    }
});

// DELETE Desactivar usuario (soft delete)
app.delete('/api/usuarios/:id', async (req, res) => {
    try {
        await pool.query('UPDATE usuarios SET activo = FALSE WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Error al desactivar usuario.' });
    }
});

// GET Roles disponibles (lista estática de roles del sistema)
app.get('/api/roles', async (req, res) => {
    res.json([
        { nombre: 'Administrador', permisos: ['dashboard', 'ventas', 'inventario', 'compras', 'crm', 'contabilidad', 'sistema'] },
        { nombre: 'Ventas',        permisos: ['dashboard', 'ventas', 'crm'] },
        { nombre: 'Bodeguero',     permisos: ['dashboard', 'inventario', 'compras'] },
        { nombre: 'Contador',      permisos: ['dashboard', 'contabilidad'] },
        { nombre: 'Solo Lectura',  permisos: ['dashboard'] },
    ]);
});

// POST Nuevo cliente (Datos Maestros)
app.post('/api/clientes', async (req, res) => {
    const { nombre, tipo, telefono } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO clientes (nombre, tipo, telefono) VALUES ($1, $2, $3) RETURNING id',
            [nombre, tipo || 'Minorista', telefono]
        );
        res.status(201).json({ success: true, id: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ error: 'Error al crear cliente.' });
    }
});

// PUT Actualizar cliente
app.put('/api/clientes/:id', async (req, res) => {
    const { nombre, tipo, telefono } = req.body;
    try {
        await pool.query('UPDATE clientes SET nombre=$1, tipo=$2, telefono=$3 WHERE id=$4', [nombre, tipo, telefono, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Error al actualizar cliente.' });
    }
});

// DELETE Cliente
app.delete('/api/clientes/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM clientes WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'No se puede eliminar: el cliente tiene registros asociados.' });
    }
});

// GET Todos los clientes (para datos maestros, incluye teléfono)
app.get('/api/clientes/maestro', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, nombre, tipo, telefono FROM clientes ORDER BY nombre ASC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener clientes.' });
    }
});

// POST Nuevo producto (Datos Maestros)
app.post('/api/productos', async (req, res) => {
    const { nombre, categoria, precio_costo, precio_venta, stock } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO productos (nombre, categoria, precio_costo, precio_venta, stock) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [nombre, categoria, precio_costo || 0, precio_venta, stock || 0]
        );
        res.status(201).json({ success: true, id: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ error: 'Error al crear producto.' });
    }
});

// PUT Actualizar producto
app.put('/api/productos/:id', async (req, res) => {
    const { nombre, categoria, precio_costo, precio_venta, stock } = req.body;
    try {
        await pool.query(
            'UPDATE productos SET nombre=$1, categoria=$2, precio_costo=$3, precio_venta=$4, stock=$5 WHERE id=$6',
            [nombre, categoria, precio_costo, precio_venta, stock, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Error al actualizar producto.' });
    }
});

// DELETE Producto
app.delete('/api/productos/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM productos WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'No se puede eliminar: el producto tiene ventas o compras asociadas.' });
    }
});

// Start Server
app.listen(port, () => {
    console.log(`ERP de Motocicletas corriendo en http://localhost:${port} (Docker)`);
});
