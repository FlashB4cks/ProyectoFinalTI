const { Client } = require('pg');

const client = new Client({
    user: 'postgres',
    host: 'localhost',
    database: 'ProyectoTi',
    password: '124566',
    port: 5432,
});

async function setupDatabase() {
    try {
        await client.connect();
        console.log('Conectado a PostgreSQL (ProyectoTi)');

        // Crear tabla de productos
        await client.query(`
            CREATE TABLE IF NOT EXISTS productos (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL,
                categoria VARCHAR(50),
                precio_venta NUMERIC(10, 2)
            );
        `);
        console.log('Tabla "productos" verificada/creada.');

        // Insertar repuestos de prueba si está vacía
        const result = await client.query('SELECT COUNT(*) FROM productos');
        if (result.rows[0].count === '0') {
            await client.query(`
                INSERT INTO productos (nombre, categoria, precio_venta) VALUES
                ('Llanta Trasera 130/70-17', 'Llantas', 850.00),
                ('Pastillas de Freno Delanteras', 'Frenos', 250.00),
                ('Aceite Sintético 10W-40 1L', 'Lubricantes', 180.00),
                ('Bujía NGK Iridium', 'Motor', 120.00),
                ('Casco Integral Certificado DOT', 'Accesorios', 1500.00)
            `);
            console.log('Repuestos de prueba insertados en la base de datos.');
        } else {
            console.log('La tabla "productos" ya contiene datos.');
        }

    } catch (err) {
        console.error('Error configurando la base de datos:', err);
    } finally {
        await client.end();
    }
}

setupDatabase();
