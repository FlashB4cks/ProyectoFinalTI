const { Client } = require('pg');

const client = new Client({
    user: 'postgres',
    host: 'localhost',
    database: 'ProyectoTi',
    password: '124566',
    port: 5433,
});

async function upgradeDB() {
    try {
        await client.connect();
        console.log('Conectado a PostgreSQL (Puerto 5433)');

        // Tabla Compras
        await client.query(`
            CREATE TABLE IF NOT EXISTS compras (
                id SERIAL PRIMARY KEY,
                proveedor_id INT REFERENCES clientes(id),
                fecha DATE NOT NULL DEFAULT CURRENT_DATE,
                total NUMERIC(12, 2) DEFAULT 0
            );
        `);

        // Tabla Detalle Compras
        await client.query(`
            CREATE TABLE IF NOT EXISTS detalle_compras (
                id SERIAL PRIMARY KEY,
                compra_id INT REFERENCES compras(id),
                producto_id INT REFERENCES productos(id),
                cantidad INT NOT NULL,
                costo_unitario NUMERIC(10, 2) NOT NULL,
                subtotal NUMERIC(12, 2) GENERATED ALWAYS AS (cantidad * costo_unitario) STORED
            );
        `);

        // Tabla CRM Leads
        await client.query(`
            CREATE TABLE IF NOT EXISTS crm_leads (
                id SERIAL PRIMARY KEY,
                descripcion VARCHAR(255) NOT NULL,
                cliente_id INT REFERENCES clientes(id),
                ingreso_estimado NUMERIC(12, 2) DEFAULT 0,
                probabilidad INT CHECK (probabilidad >= 0 AND probabilidad <= 100),
                estado VARCHAR(50) DEFAULT 'Nuevo'
            );
        `);

        // Update init-db file so future docker setups have this too!
        const fs = require('fs');
        const path = require('path');
        const initSqlPath = path.join(__dirname, 'init-db', 'init.sql');
        
        let initSql = fs.readFileSync(initSqlPath, 'utf8');
        if (!initSql.includes('CREATE TABLE IF NOT EXISTS compras')) {
            initSql += `
-- Tabla Compras
CREATE TABLE IF NOT EXISTS compras (
    id SERIAL PRIMARY KEY,
    proveedor_id INT REFERENCES clientes(id),
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    total NUMERIC(12, 2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS detalle_compras (
    id SERIAL PRIMARY KEY,
    compra_id INT REFERENCES compras(id),
    producto_id INT REFERENCES productos(id),
    cantidad INT NOT NULL,
    costo_unitario NUMERIC(10, 2) NOT NULL,
    subtotal NUMERIC(12, 2) GENERATED ALWAYS AS (cantidad * costo_unitario) STORED
);

CREATE TABLE IF NOT EXISTS crm_leads (
    id SERIAL PRIMARY KEY,
    descripcion VARCHAR(255) NOT NULL,
    cliente_id INT REFERENCES clientes(id),
    ingreso_estimado NUMERIC(12, 2) DEFAULT 0,
    probabilidad INT CHECK (probabilidad >= 0 AND probabilidad <= 100),
    estado VARCHAR(50) DEFAULT 'Nuevo'
);
`;
            fs.writeFileSync(initSqlPath, initSql);
            console.log('init.sql actualizado para futuras instancias de Docker.');
        }

        console.log('Nuevas tablas de compras y CRM creadas correctamente en la BD en caliente.');
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await client.end();
    }
}

upgradeDB();
