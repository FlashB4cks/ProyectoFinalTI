-- Crear Tabla Usuarios
CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    rol VARCHAR(50) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL
);

-- Crear Tabla Clientes
CREATE TABLE IF NOT EXISTS clientes (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    tipo VARCHAR(50) NOT NULL,
    telefono VARCHAR(20)
);

-- Crear Tabla Productos
CREATE TABLE IF NOT EXISTS productos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    categoria VARCHAR(50),
    precio_costo NUMERIC(10, 2) DEFAULT 0,
    precio_venta NUMERIC(10, 2),
    stock INT DEFAULT 0
);


-- Crear Tabla Ventas
CREATE TABLE IF NOT EXISTS ventas (
    id SERIAL PRIMARY KEY,
    cliente_id INT REFERENCES clientes(id),
    usuario_id INT REFERENCES usuarios(id),
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    total NUMERIC(12, 2) DEFAULT 0
);

-- Crear Tabla Detalle Ventas
CREATE TABLE IF NOT EXISTS detalle_ventas (
    id SERIAL PRIMARY KEY,
    venta_id INT REFERENCES ventas(id),
    producto_id INT REFERENCES productos(id),
    cantidad INT NOT NULL,
    precio_unitario NUMERIC(10, 2) NOT NULL,
    subtotal NUMERIC(12, 2) GENERATED ALWAYS AS (cantidad * precio_unitario) STORED
);

-- Datos de Prueba: Productos
INSERT INTO productos (nombre, categoria, precio_venta) VALUES
('Llanta Trasera 130/70-17', 'Llantas', 850.00),
('Pastillas de Freno Delanteras', 'Frenos', 250.00),
('Aceite Sintético 10W-40 1L', 'Lubricantes', 180.00),
('Bujía NGK Iridium', 'Motor', 120.00),
('Casco Integral Certificado DOT', 'Accesorios', 1500.00);

-- Datos de Prueba: Usuarios
INSERT INTO usuarios (nombre, rol, email) VALUES
('Admin', 'Administrador', 'admin@mkparts.com'),
('Vendedor 1', 'Ventas', 'vendedor1@mkparts.com');

-- Datos de Prueba: Clientes
INSERT INTO clientes (nombre, tipo, telefono) VALUES
('Taller Dos Ruedas', 'Mayorista', '555-0011'),
('Moto Repuestos El Rapido', 'Distribuidor', '555-0022'),
('Juan Perez', 'Minorista', '555-0033');

-- Datos de Prueba: Ventas y Detalles
INSERT INTO ventas (cliente_id, usuario_id, fecha, total) VALUES
(1, 1, '2026-03-10', 1250.00),
(2, 2, '2026-04-15', 3400.00),
(3, 1, '2026-05-02', 850.00),
(1, 2, CURRENT_DATE, 500.00);

INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario) VALUES
(1, 1, 1, 850.00),
(1, 2, 2, 200.00),
(2, 5, 2, 1500.00),
(2, 3, 2, 200.00),
(3, 1, 1, 850.00),
(4, 2, 2, 250.00);

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
