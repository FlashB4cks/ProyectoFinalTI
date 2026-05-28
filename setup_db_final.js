const { Client } = require('pg');

const client = new Client({
    user: 'postgres',
    host: 'localhost',
    database: 'ProyectoTi',
    password: '124566',
    port: 5432,
});

async function setupDatabaseFinal() {
    try {
        await client.connect();
        console.log('Conectado a PostgreSQL (ProyectoTi)');

        // 1. Crear Tabla Usuarios
        await client.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL,
                rol VARCHAR(50) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL
            );
        `);

        // 2. Crear Tabla Clientes
        await client.query(`
            CREATE TABLE IF NOT EXISTS clientes (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL,
                tipo VARCHAR(50) NOT NULL,
                telefono VARCHAR(20)
            );
        `);

        // 3. Crear Tabla Ventas (Cabecera)
        await client.query(`
            CREATE TABLE IF NOT EXISTS ventas (
                id SERIAL PRIMARY KEY,
                cliente_id INT REFERENCES clientes(id),
                usuario_id INT REFERENCES usuarios(id),
                fecha DATE NOT NULL DEFAULT CURRENT_DATE,
                total NUMERIC(12, 2) DEFAULT 0
            );
        `);

        // 4. Crear Tabla Detalle Ventas (Líneas)
        await client.query(`
            CREATE TABLE IF NOT EXISTS detalle_ventas (
                id SERIAL PRIMARY KEY,
                venta_id INT REFERENCES ventas(id),
                producto_id INT REFERENCES productos(id),
                cantidad INT NOT NULL,
                precio_unitario NUMERIC(10, 2) NOT NULL,
                subtotal NUMERIC(12, 2) GENERATED ALWAYS AS (cantidad * precio_unitario) STORED
            );
        `);

        console.log('Tablas relacionales creadas exitosamente.');

        // INSERTAR DATOS DE PRUEBA MASIVOS
        // Insertar Usuarios
        const resUsuarios = await client.query('SELECT COUNT(*) FROM usuarios');
        if (resUsuarios.rows[0].count === '0') {
            await client.query(`
                INSERT INTO usuarios (nombre, rol, email) VALUES
                ('Admin', 'Administrador', 'admin@mkparts.com'),
                ('Vendedor 1', 'Ventas', 'vendedor1@mkparts.com')
            `);
        }

        // Insertar Clientes
        const resClientes = await client.query('SELECT COUNT(*) FROM clientes');
        if (resClientes.rows[0].count === '0') {
            await client.query(`
                INSERT INTO clientes (nombre, tipo, telefono) VALUES
                ('Taller Dos Ruedas', 'Mayorista', '555-0011'),
                ('Moto Repuestos El Rapido', 'Distribuidor', '555-0022'),
                ('Juan Perez', 'Minorista', '555-0033')
            `);
        }

        // Insertar Ventas Históricas
        const resVentas = await client.query('SELECT COUNT(*) FROM ventas');
        if (resVentas.rows[0].count === '0') {
            await client.query(`
                INSERT INTO ventas (cliente_id, usuario_id, fecha, total) VALUES
                (1, 1, '2026-03-10', 1250.00),
                (2, 2, '2026-04-15', 3400.00),
                (3, 1, '2026-05-02', 850.00),
                (1, 2, CURRENT_DATE, 500.00)
            `);
            
            await client.query(`
                INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario) VALUES
                (1, 1, 1, 850.00),
                (1, 2, 2, 200.00),
                (2, 5, 2, 1500.00),
                (2, 3, 2, 200.00),
                (3, 1, 1, 850.00),
                (4, 2, 2, 250.00)
            `);
            console.log('Datos de prueba (Clientes, Usuarios, Ventas) insertados.');
        } else {
            console.log('Las tablas ya contienen datos de prueba.');
        }

    } catch (err) {
        console.error('Error configurando BD:', err);
    } finally {
        await client.end();
    }
}

setupDatabaseFinal();
