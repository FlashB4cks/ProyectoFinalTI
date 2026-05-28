// ============================================================
// MKParts ERP — app.js (Versión 2.0 — Django Backend)
// ============================================================

// Django sirve en el mismo origen: usar rutas relativas
const API = '/api';
let productosOptionsCache = '';
let _productosData = []; // cache completo de productos

const ROLES_SISTEMA = ['Administrador', 'Ventas', 'Bodeguero', 'Contador', 'Solo Lectura'];
const PERMISOS_MAPA = {
    'Administrador': ['Dashboard','Ventas','Inventario','Compras','CRM','Contabilidad','Administración'],
    'Ventas':        ['Dashboard','Ventas','CRM'],
    'Bodeguero':     ['Dashboard','Inventario','Compras'],
    'Contador':      ['Dashboard','Contabilidad'],
    'Solo Lectura':  ['Dashboard'],
};

// Helper para obtener CSRF token (inyectado por Django en el template)
function getCsrf() {
    return typeof DJANGO_CSRF !== 'undefined' ? DJANGO_CSRF : '';
}

// Headers base con CSRF para requests de escritura
function authHeaders() {
    return {
        'Content-Type': 'application/json',
        'X-CSRFToken': getCsrf(),
    };
}


// -------- TOAST NOTIFICATIONS --------
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info' };
    toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 350);
    }, 3500);
}

// -------- HELPERS --------
async function fetchAPI(endpoint) {
    try {
        const cleanEndpoint = endpoint.endsWith('/') ? endpoint : endpoint + '/';
        const res = await fetch(API + cleanEndpoint);
        return res.ok ? await res.json() : [];
    } catch { return []; }
}

function formatQ(val) {
    return 'Q' + parseFloat(val || 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('es-GT');
}

function loadingHTML() {
    return `<div class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Cargando datos...</div>`;
}

// ====== NATIVE TABLE PAGINATION & SEARCH ======
function makeTablePagedAndFilterable(tableElement, searchPlaceholder, rowsPerPage = 5) {
    if (!tableElement) return;
    
    // 1. Crear contenedor wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'table-responsive-wrapper';
    tableElement.parentNode.insertBefore(wrapper, tableElement);
    wrapper.appendChild(tableElement);
    
    // 2. Crear Barra de Búsqueda
    const searchBar = document.createElement('div');
    searchBar.className = 'table-search-bar';
    searchBar.innerHTML = `
        <div class="search-input-container">
            <i class="fa-solid fa-magnifying-glass search-icon"></i>
            <input type="text" class="form-control table-search-input" placeholder="${searchPlaceholder || 'Buscar...'}">
        </div>
    `;
    wrapper.parentNode.insertBefore(searchBar, wrapper);
    
    // 3. Crear Controles de Paginación
    const paginationControls = document.createElement('div');
    paginationControls.className = 'table-pagination-controls';
    wrapper.parentNode.insertBefore(paginationControls, wrapper.nextSibling);
    
    const rows = Array.from(tableElement.querySelectorAll('tbody tr'));
    let filteredRows = [...rows];
    let currentPage = 1;
    
    function renderPage() {
        const totalPages = Math.ceil(filteredRows.length / rowsPerPage) || 1;
        if (currentPage > totalPages) currentPage = totalPages;
        
        // Ocultar todas las filas
        rows.forEach(r => r.style.display = 'none');
        
        // Mostrar filas de la página actual
        const start = (currentPage - 1) * rowsPerPage;
        const end = start + rowsPerPage;
        const pageRows = filteredRows.slice(start, end);
        pageRows.forEach(r => r.style.display = '');
        
        // Actualizar controles de paginación
        paginationControls.innerHTML = `
            <div class="pagination-info">
                Mostrando ${filteredRows.length ? start + 1 : 0}-${Math.min(end, filteredRows.length)} de ${filteredRows.length} registros
            </div>
            <div class="pagination-buttons">
                <button type="button" class="btn-secondary btn-sm prev-page" ${currentPage === 1 ? 'disabled' : ''}>
                    <i class="fa-solid fa-chevron-left"></i> Anterior
                </button>
                <span class="page-indicator">Página ${currentPage} de ${totalPages}</span>
                <button type="button" class="btn-secondary btn-sm next-page" ${currentPage === totalPages ? 'disabled' : ''}>
                    Siguiente <i class="fa-solid fa-chevron-right"></i>
                </button>
            </div>
        `;
        
        paginationControls.querySelector('.prev-page')?.addEventListener('click', (e) => {
            e.preventDefault();
            if (currentPage > 1) {
                currentPage--;
                renderPage();
            }
        });
        
        paginationControls.querySelector('.next-page')?.addEventListener('click', (e) => {
            e.preventDefault();
            if (currentPage < totalPages) {
                currentPage++;
                renderPage();
            }
        });
    }
    
    // Búsqueda en tiempo real
    const searchInput = searchBar.querySelector('.table-search-input');
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        filteredRows = rows.filter(row => {
            return Array.from(row.cells).some(cell => cell.textContent.toLowerCase().includes(query));
        });
        currentPage = 1;
        renderPage();
    });
    
    renderPage();
}

// -------- MODULE ROUTING --------
const moduleNames = {
    dashboard:    'Dashboard',
    ventas:       'Ventas',
    inventario:   'Inventario',
    compras:      'Compras',
    crm:          'CRM — Oportunidades',
    contabilidad: 'Contabilidad',
    sistema:      'Administración del Sistema'
};

function userHasPermission(moduleName) {
    if (typeof CURRENT_USER !== 'undefined' && CURRENT_USER.es_admin) return true;
    
    const rol = (typeof CURRENT_USER !== 'undefined' && CURRENT_USER.rol) ? CURRENT_USER.rol : 'Solo Lectura';
    const allowed = PERMISOS_MAPA[rol] || PERMISOS_MAPA['Solo Lectura'] || ['Dashboard'];
    const MODULO_A_PERMISO = {
        'dashboard': 'Dashboard',
        'ventas': 'Ventas',
        'inventario': 'Inventario',
        'compras': 'Compras',
        'crm': 'CRM',
        'contabilidad': 'Contabilidad',
        'sistema': 'Administración'
    };
    const permissionName = MODULO_A_PERMISO[moduleName] || moduleName;
    return allowed.includes(permissionName);
}

function applyRolePermissions() {
    const sidebarItems = ['dashboard', 'ventas', 'inventario', 'compras', 'crm', 'contabilidad', 'sistema'];
    sidebarItems.forEach(mod => {
        const navEl = document.getElementById('nav-' + mod);
        if (navEl) {
            if (userHasPermission(mod)) {
                navEl.style.display = '';
            } else {
                navEl.style.display = 'none';
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    applyRolePermissions();
    showModule('dashboard');
});

function showModule(name, event) {
    // Validar permisos antes de enrutar
    if (!userHasPermission(name)) {
        showToast('Acceso denegado: no tienes permisos para acceder a este módulo.', 'error');
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        if (name !== 'dashboard') {
            showModule('dashboard');
        }
        return;
    }

    // Actualizar sidebar activo
    document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
    const navEl = event ? (event.currentTarget || event.target.closest('li')) : document.getElementById('nav-' + name);
    if (navEl) navEl.classList.add('active');

    // Actualizar breadcrumb
    const crumb = document.getElementById('current-module-name');
    if (crumb) crumb.textContent = moduleNames[name] || name;

    // Renderizar módulo
    const content = document.getElementById('module-content');
    const renderers = {
        dashboard:    renderDashboard,
        ventas:       renderVentas,
        inventario:   renderInventario,
        compras:      renderCompras,
        crm:          renderCRM,
        contabilidad: renderContabilidad,
        sistema:      renderSistema
    };

    if (renderers[name]) {
        renderers[name](content);
    } else {
        content.innerHTML = `<h2>Módulo "${name}" en construcción</h2>`;
    }
}

// ============================================================
// MÓDULO: DASHBOARD
// ============================================================
async function renderDashboard(container) {
    container.innerHTML = `
        <h1 class="module-title fade-in"><i class="fa-solid fa-chart-pie" style="color:var(--accent)"></i> Dashboard</h1>
        <div class="kpi-grid fade-in" id="kpi-grid">${loadingHTML()}</div>
        <div class="card fade-in">
            <div class="card-header">
                <h3><i class="fa-solid fa-clock-rotate-left"></i> Últimas Ventas</h3>
                <button class="btn-secondary btn-sm" onclick="showModule('ventas')"><i class="fa-solid fa-arrow-right"></i> Ver todas</button>
            </div>
            <div id="dashboard-recent-sales">${loadingHTML()}</div>
        </div>
    `;

    const data = await fetchAPI('/dashboard');
    if (!data || !data.repuestos) {
        document.getElementById('kpi-grid').innerHTML = `<p style="color:var(--danger)">Error cargando métricas. Verifica que el servidor esté corriendo.</p>`;
        return;
    }

    document.getElementById('kpi-grid').innerHTML = `
        <div class="kpi-card fade-in">
            <span class="kpi-icon" style="color:var(--accent)"><i class="fa-solid fa-boxes-stacked"></i></span>
            <div class="kpi-value">${parseInt(data.repuestos).toLocaleString()}</div>
            <div class="kpi-label">Total Repuestos en Stock</div>
        </div>
        <div class="kpi-card fade-in" style="animation-delay:0.08s">
            <span class="kpi-icon" style="color:var(--success)"><i class="fa-solid fa-receipt"></i></span>
            <div class="kpi-value">${formatQ(data.ventas_mes)}</div>
            <div class="kpi-label">Ventas Este Mes</div>
        </div>
        <div class="kpi-card fade-in" style="animation-delay:0.16s">
            <span class="kpi-icon" style="color:var(--info)"><i class="fa-solid fa-users"></i></span>
            <div class="kpi-value">${parseInt(data.clientes).toLocaleString()}</div>
            <div class="kpi-label">Clientes Registrados</div>
        </div>
        <div class="kpi-card fade-in" style="animation-delay:0.24s">
            <span class="kpi-icon" style="color:var(--warning)"><i class="fa-solid fa-handshake"></i></span>
            <div class="kpi-value">${parseInt(data.leads_activos).toLocaleString()}</div>
            <div class="kpi-label">Leads CRM Activos</div>
        </div>
    `;

    const ventas = data.ultimas_ventas || [];
    if (ventas.length === 0) {
        document.getElementById('dashboard-recent-sales').innerHTML = `<p style="color:var(--text-muted); padding: 20px 0;">No hay ventas registradas aún.</p>`;
    } else {
        document.getElementById('dashboard-recent-sales').innerHTML = `
            <table>
                <thead><tr><th>ID</th><th>Cliente</th><th>Fecha</th><th>Total</th></tr></thead>
                <tbody>
                    ${ventas.map(v => `
                        <tr>
                            <td><span style="color:var(--accent); font-weight:600">V-${String(v.id).padStart(4,'0')}</span></td>
                            <td>${v.cliente}</td>
                            <td>${formatDate(v.fecha)}</td>
                            <td style="font-weight:600">${formatQ(v.total)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }
}

// ============================================================
// MÓDULO: VENTAS
// ============================================================
async function renderVentas(container) {
    container.innerHTML = `
        <h1 class="module-title fade-in"><i class="fa-solid fa-receipt" style="color:var(--accent)"></i> Ventas</h1>
        <div class="card fade-in">
            <div class="card-header">
                <h3><i class="fa-solid fa-list"></i> Historial de Órdenes</h3>
                <div style="display:flex; gap:10px">
                    <button class="btn-secondary" onclick="ejecutarRPA(event)" id="btn-ejecutar-rpa">
                        <i class="fa-solid fa-robot"></i> Ejecutar RPA
                    </button>
                    <button class="btn-primary" onclick="openModal('venta')">
                        <i class="fa-solid fa-plus"></i> Nueva Venta
                    </button>
                </div>
            </div>
            <div id="ventas-table-container">${loadingHTML()}</div>
        </div>
    `;
    await loadVentasTable();
}

async function ejecutarRPA(e) {
    e.preventDefault();
    
    const modal = document.getElementById('modal-container');
    const modalBox = document.getElementById('modal-box');
    modalBox.className = 'modal-box'; // reset class
    modalBox.style.maxWidth = '550px'; // beautiful size
    
    document.getElementById('modal-title').innerText = '🤖 Panel de Control RPA — MKParts Bot';
    
    document.getElementById('modal-body').innerHTML = `
        <p style="color:var(--text-muted); margin-bottom:16px; font-size:0.88rem">
            Selecciona el proceso de automatización que deseas ejecutar en el servidor de base de datos:
        </p>
        <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:20px">
            <!-- Proceso 1 -->
            <label class="rpa-option-card" style="display:flex; align-items:flex-start; gap:12px; background:rgba(30,30,46,0.5); border:1px solid var(--border-color); padding:12px; border-radius:8px; cursor:pointer; transition:all 0.2s">
                <input type="radio" name="rpa-process" value="1" checked style="margin-top:4px; accent-color:var(--accent)">
                <div>
                    <strong style="color:var(--text-color); font-size:0.92rem; display:block"><i class="fa-solid fa-file-excel" style="color:#22c55e; margin-right:4px"></i> Proceso 1: Generar Reporte de Ventas (Excel)</strong>
                    <span style="color:var(--text-muted); font-size:0.8rem; display:block; margin-top:2px">Extrae todas las ventas del ERP y exporta un archivo formateado a Excel en la carpeta de reportes.</span>
                </div>
            </label>

            <!-- Proceso 2 -->
            <label class="rpa-option-card" style="display:flex; align-items:flex-start; gap:12px; background:rgba(30,30,46,0.5); border:1px solid var(--border-color); padding:12px; border-radius:8px; cursor:pointer; transition:all 0.2s">
                <input type="radio" name="rpa-process" value="2" style="margin-top:4px; accent-color:var(--accent)">
                <div>
                    <strong style="color:var(--text-color); font-size:0.92rem; display:block"><i class="fa-solid fa-file-csv" style="color:#38bdf8; margin-right:4px"></i> Proceso 2: Carga Masiva de Productos (CSV)</strong>
                    <span style="color:var(--text-muted); font-size:0.8rem; display:block; margin-top:2px">Lee importar_productos.csv, agrega nuevos repuestos y actualiza inteligentemente el stock de los existentes.</span>
                </div>
            </label>

            <!-- Proceso 3 -->
            <label class="rpa-option-card" style="display:flex; align-items:flex-start; gap:12px; background:rgba(30,30,46,0.5); border:1px solid var(--border-color); padding:12px; border-radius:8px; cursor:pointer; transition:all 0.2s">
                <input type="radio" name="rpa-process" value="3" style="margin-top:4px; accent-color:var(--accent)">
                <div>
                    <strong style="color:var(--text-color); font-size:0.92rem; display:block"><i class="fa-solid fa-triangle-exclamation" style="color:#ef4444; margin-right:4px"></i> Proceso 3: Monitor de Inventario Crítico (Alertas)</strong>
                    <span style="color:var(--text-muted); font-size:0.8rem; display:block; margin-top:2px">Escanea niveles de stock, detecta repuestos con menos de 5 unidades y genera una alerta TXT urgente.</span>
                </div>
            </label>

            <!-- Todos (Batch) -->
            <label class="rpa-option-card" style="display:flex; align-items:flex-start; gap:12px; background:rgba(30,30,46,0.5); border:1px solid var(--border-color); padding:12px; border-radius:8px; cursor:pointer; transition:all 0.2s">
                <input type="radio" name="rpa-process" value="all" style="margin-top:4px; accent-color:var(--accent)">
                <div>
                    <strong style="color:var(--text-color); font-size:0.92rem; display:block"><i class="fa-solid fa-cubes" style="color:var(--accent); margin-right:4px"></i> Ejecución Completa (3 Procesos)</strong>
                    <span style="color:var(--text-muted); font-size:0.8rem; display:block; margin-top:2px">Corre de forma secuencial y automatizada todos los procesos RPA de corrido (modo demostración).</span>
                </div>
            </label>
        </div>
        
        <div style="display:flex; gap:12px">
            <button type="button" onclick="closeModal()" class="btn-secondary" style="flex:1">
                Cancelar
            </button>
            <button type="button" id="btn-confirmar-rpa" class="btn-primary" style="flex:2">
                <i class="fa-solid fa-play"></i> Iniciar Automatización
            </button>
        </div>
    `;
    
    modal.style.display = 'flex';
    
    // Añadir estilo dinámico cuando cambie la selección (opcional, pero se ve premium)
    const cards = document.querySelectorAll('.rpa-option-card');
    cards.forEach(card => {
        const radio = card.querySelector('input[type="radio"]');
        if (radio.checked) {
            card.style.border = '1px solid var(--accent)';
            card.style.background = 'rgba(239, 68, 68, 0.05)';
        }
        card.addEventListener('click', () => {
            cards.forEach(c => {
                c.style.border = '1px solid var(--border-color)';
                c.style.background = 'rgba(30,30,46,0.5)';
            });
            card.style.border = '1px solid var(--accent)';
            card.style.background = 'rgba(239, 68, 68, 0.05)';
            radio.checked = true;
        });
    });

    document.getElementById('btn-confirmar-rpa').addEventListener('click', async () => {
        const selectedRadio = document.querySelector('input[name="rpa-process"]:checked');
        const processVal = selectedRadio ? selectedRadio.value : 'all';
        
        // Mostrar estado de carga dentro del modal
        document.getElementById('modal-body').innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:40px 20px; text-align:center">
                <i class="fa-solid fa-robot fa-bounce" style="font-size:3rem; color:var(--accent); margin-bottom:20px"></i>
                <h4 style="color:var(--text-color); margin-bottom:8px">Bot RPA en Ejecución</h4>
                <p style="color:var(--text-muted); font-size:0.88rem; max-width:320px; line-height:1.4">
                    Conectando con el servidor, iniciando script Python de forma asíncrona y capturando salida de terminal...
                </p>
                <div style="width:100%; max-width:260px; height:4px; background:var(--border-color); border-radius:2px; margin-top:20px; overflow:hidden; position:relative">
                    <div style="position:absolute; height:100%; width:50%; background:var(--accent); border-radius:2px; animation: rpa-progress-bar 1.5s infinite ease-in-out"></div>
                </div>
            </div>
            
            <style>
                @keyframes rpa-progress-bar {
                    0% { left: -50%; }
                    100% { left: 100%; }
                }
            </style>
        `;
        
        showToast('🤖 Bot RPA iniciado en segundo plano...', 'info');
        
        try {
            const res = await fetch(API + '/run-rpa/', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ process: processVal })
            });
            
            const data = await res.json();
            
            if (res.ok && data.success) {
                showToast('✓ RPA completado con éxito. Datos actualizados.', 'success');
                await loadVentasTable();
                
                // Redimensionar para la consola grande retro
                modalBox.classList.add('large');
                
                document.getElementById('modal-title').innerText = '🤖 Consola de Ejecución RPA — MKParts Bot';
                document.getElementById('modal-body').innerHTML = `
                    <p style="color:var(--text-muted); margin-bottom:12px; font-size:0.88rem">
                        El robot de Python se ejecutó de forma no interactiva en el servidor de base de datos. Salida del terminal:
                    </p>
                    <div style="background:#050508; padding:18px; border:1px solid var(--border-color); border-radius:8px; font-family:'Courier New', monospace; white-space:pre-wrap; max-height:350px; overflow-y:auto; font-size:0.82rem; color:#22c55e; box-shadow:inset 0 0 10px rgba(0,0,0,0.8); line-height:1.4">
                        ${data.stdout}
                    </div>
                    <button type="button" onclick="closeModal()" class="btn-primary" style="margin-top:16px; width:100%">
                        <i class="fa-solid fa-circle-check"></i> Entendido
                    </button>
                `;
            } else {
                showToast(data.error || 'Error al ejecutar el script RPA.', 'error');
                closeModal();
            }
        } catch (err) {
            showToast('Error de conexión con el servidor.', 'error');
            closeModal();
        }
    });
}

async function loadVentasTable() {
    const container = document.getElementById('ventas-table-container');
    if (!container) return;
    const ventas = await fetchAPI('/ventas');
    if (!ventas.length) {
        container.innerHTML = `<p style="color:var(--text-muted); padding:20px 0">No hay ventas registradas. ¡Crea tu primera venta!</p>`;
        return;
    }
    container.innerHTML = `
        <table>
            <thead><tr><th>Nº Orden</th><th>Cliente</th><th>Fecha</th><th>Total</th><th>Estado</th></tr></thead>
            <tbody>
                ${ventas.map(v => `
                    <tr>
                        <td><span style="color:var(--accent); font-weight:600">V-${String(v.id).padStart(4,'0')}</span></td>
                        <td>${v.cliente}</td>
                        <td>${formatDate(v.fecha)}</td>
                        <td style="font-weight:600">${formatQ(v.total)}</td>
                        <td><span class="badge badge-green">Pagado</span></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    makeTablePagedAndFilterable(container.querySelector('table'), 'Buscar ventas por cliente o Nº...');
}

// ============================================================
// MÓDULO: INVENTARIO
// ============================================================
async function renderInventario(container) {
    container.innerHTML = `
        <h1 class="module-title fade-in"><i class="fa-solid fa-boxes-stacked" style="color:var(--accent)"></i> Inventario de Repuestos</h1>
        <div class="card fade-in">
            <div class="card-header">
                <h3><i class="fa-solid fa-warehouse"></i> Stock Actual</h3>
                <button class="btn-secondary btn-sm" onclick="renderInventario(document.getElementById('module-content'))"><i class="fa-solid fa-rotate"></i> Actualizar</button>
            </div>
            <div id="inventario-table-container">${loadingHTML()}</div>
        </div>
    `;
    const productos = await fetchAPI('/inventario');
    const container2 = document.getElementById('inventario-table-container');
    if (!container2) return;

    if (!productos.length) {
        container2.innerHTML = `<p style="color:var(--text-muted); padding:20px 0">No hay productos registrados en el inventario.</p>`;
        return;
    }

    // Cache para los formularios
    productosOptionsCache = productos.map(p => `<option value="${p.id}" data-precio="${p.precio_venta}">${p.nombre} (${formatQ(p.precio_venta)})</option>`).join('');

    container2.innerHTML = `
        <table>
            <thead><tr><th>ID</th><th>Nombre</th><th>Categoría</th><th>Precio Costo</th><th>Precio Venta</th><th>Stock</th></tr></thead>
            <tbody>
                ${productos.map(p => {
                    const stockLevel = p.stock > 20 ? 'badge-green' : p.stock > 5 ? 'badge-yellow' : 'badge-red';
                    return `
                        <tr>
                            <td style="color:var(--text-muted)">#${p.id}</td>
                            <td style="font-weight:500">${p.nombre}</td>
                            <td>${p.categoria || '—'}</td>
                            <td>${formatQ(p.precio_costo)}</td>
                            <td style="font-weight:600; color:var(--accent-hover)">${formatQ(p.precio_venta)}</td>
                            <td><span class="badge ${stockLevel}">${p.stock || 0} uds</span></td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
    makeTablePagedAndFilterable(container2.querySelector('table'), 'Buscar productos...');
}

// ============================================================
// MÓDULO: COMPRAS
// ============================================================
async function renderCompras(container) {
    container.innerHTML = `
        <h1 class="module-title fade-in"><i class="fa-solid fa-truck-fast" style="color:var(--accent)"></i> Compras y Proveedores</h1>
        <div class="card fade-in">
            <div class="card-header">
                <h3><i class="fa-solid fa-clipboard-list"></i> Órdenes de Compra</h3>
                <button class="btn-primary" onclick="openModal('compra')"><i class="fa-solid fa-plus"></i> Nueva Orden</button>
            </div>
            <div id="compras-table-container">${loadingHTML()}</div>
        </div>
    `;
    await loadComprasTable();
}

async function loadComprasTable() {
    const container = document.getElementById('compras-table-container');
    if (!container) return;
    const compras = await fetchAPI('/compras');
    if (!compras.length) {
        container.innerHTML = `<p style="color:var(--text-muted); padding:20px 0">No hay órdenes de compra registradas.</p>`;
        return;
    }
    container.innerHTML = `
        <table>
            <thead><tr><th>Nº Orden</th><th>Proveedor</th><th>Fecha</th><th>Total</th></tr></thead>
            <tbody>
                ${compras.map(c => `
                    <tr>
                        <td><span style="color:var(--accent); font-weight:600">OC-${String(c.id).padStart(4,'0')}</span></td>
                        <td>${c.proveedor}</td>
                        <td>${formatDate(c.fecha)}</td>
                        <td style="font-weight:600">${formatQ(c.total)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    makeTablePagedAndFilterable(container.querySelector('table'), 'Buscar compras por proveedor o Nº...');
}

// ============================================================
// MÓDULO: CRM
// ============================================================
async function renderCRM(container) {
    container.innerHTML = `
        <h1 class="module-title fade-in"><i class="fa-solid fa-users" style="color:var(--accent)"></i> CRM — Oportunidades</h1>
        <div class="card fade-in">
            <div class="card-header">
                <h3><i class="fa-solid fa-bullseye"></i> Pipeline de Ventas</h3>
                <button class="btn-primary" onclick="openModal('crm')"><i class="fa-solid fa-plus"></i> Nuevo Lead</button>
            </div>
            <div id="crm-table-container">${loadingHTML()}</div>
        </div>
    `;
    await loadCRMTable();
}

async function loadCRMTable() {
    const container = document.getElementById('crm-table-container');
    if (!container) return;
    const leads = await fetchAPI('/crm');
    if (!leads.length) {
        container.innerHTML = `<p style="color:var(--text-muted); padding:20px 0">No hay leads registrados. ¡Agrega tu primera oportunidad!</p>`;
        return;
    }
    container.innerHTML = `
        <table>
            <thead><tr><th>Oportunidad</th><th>Cliente</th><th>Ingreso Est.</th><th>Probabilidad</th><th>Estado</th></tr></thead>
            <tbody>
                ${leads.map(l => {
                    const estadoBadge = l.estado === 'Ganado' ? 'badge-green' : l.estado === 'En Negociación' ? 'badge-yellow' : 'badge-blue';
                    return `
                        <tr>
                            <td style="font-weight:500">${l.descripcion}</td>
                            <td>${l.cliente}</td>
                            <td style="font-weight:600; color:var(--success)">${formatQ(l.ingreso_estimado)}</td>
                            <td>
                                <div style="display:flex; align-items:center; gap:8px;">
                                    <div style="flex:1; background:var(--border-color); border-radius:4px; height:6px;">
                                        <div style="width:${l.probabilidad}%; background:var(--accent); height:100%; border-radius:4px;"></div>
                                    </div>
                                    <span style="font-size:0.8rem; color:var(--text-muted)">${l.probabilidad}%</span>
                                </div>
                            </td>
                            <td><span class="badge ${estadoBadge}">${l.estado}</span></td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
    makeTablePagedAndFilterable(container.querySelector('table'), 'Buscar oportunidades...');
}

// ============================================================
// MÓDULO: CONTABILIDAD
// ============================================================
async function renderContabilidad(container) {
    container.innerHTML = `
        <h1 class="module-title fade-in"><i class="fa-solid fa-file-invoice-dollar" style="color:var(--accent)"></i> Contabilidad</h1>
        <div id="contabilidad-content" class="fade-in">${loadingHTML()}</div>
    `;
    const data = await fetchAPI('/contabilidad');
    const balanceClass = data.balance >= 0 ? 'balance-pos' : 'balance-neg';
    const balanceColor = data.balance >= 0 ? 'var(--info)' : 'var(--warning)';

    document.getElementById('contabilidad-content').innerHTML = `
        <div class="balance-grid">
            <div class="balance-card ingresos">
                <h4><i class="fa-solid fa-arrow-trend-up"></i> Ingresos del Mes</h4>
                <div class="amount" style="color:var(--success)">${formatQ(data.ingresos)}</div>
            </div>
            <div class="balance-card gastos">
                <h4><i class="fa-solid fa-arrow-trend-down"></i> Gastos del Mes</h4>
                <div class="amount" style="color:var(--danger)">${formatQ(data.gastos)}</div>
            </div>
            <div class="balance-card ${balanceClass}">
                <h4><i class="fa-solid fa-scale-balanced"></i> Balance Neto</h4>
                <div class="amount" style="color:${balanceColor}">${formatQ(data.balance)}</div>
            </div>
        </div>
        <div class="card">
            <div class="card-header">
                <h3><i class="fa-solid fa-chart-bar"></i> Resumen Financiero del Mes</h3>
            </div>
            <table>
                <thead><tr><th>Concepto</th><th>Monto</th><th>Variación</th></tr></thead>
                <tbody>
                    <tr>
                        <td><i class="fa-solid fa-circle" style="color:var(--success); margin-right:8px"></i> Total Ventas (Ingresos)</td>
                        <td style="font-weight:600; color:var(--success)">${formatQ(data.ingresos)}</td>
                        <td><span class="badge badge-green"><i class="fa-solid fa-arrow-up"></i> Ingresos</span></td>
                    </tr>
                    <tr>
                        <td><i class="fa-solid fa-circle" style="color:var(--danger); margin-right:8px"></i> Total Compras (Gastos)</td>
                        <td style="font-weight:600; color:var(--danger)">${formatQ(data.gastos)}</td>
                        <td><span class="badge badge-red"><i class="fa-solid fa-arrow-down"></i> Gastos</span></td>
                    </tr>
                    <tr style="border-top: 2px solid var(--border-color)">
                        <td style="font-weight:700">Balance Neto</td>
                        <td style="font-weight:700; color:${balanceColor}">${formatQ(data.balance)}</td>
                        <td><span class="badge ${data.balance >= 0 ? 'badge-blue' : 'badge-yellow'}">${data.balance >= 0 ? 'Positivo' : 'Negativo'}</span></td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;
}

// ============================================================
// MÓDULO: ADMINISTRACIÓN DEL SISTEMA
// ============================================================

function renderSistema(container) {
    container.innerHTML = `
        <h1 class="module-title fade-in"><i class="fa-solid fa-gear" style="color:var(--accent)"></i> Administración del Sistema</h1>
        <div class="tab-bar fade-in">
            <button class="tab-btn active" id="tab-usuarios" onclick="switchTab('usuarios')">
                <i class="fa-solid fa-users-gear"></i> Usuarios
            </button>
            <button class="tab-btn" id="tab-roles" onclick="switchTab('roles')">
                <i class="fa-solid fa-shield-halved"></i> Roles y Permisos
            </button>
            <button class="tab-btn" id="tab-maestro" onclick="switchTab('maestro')">
                <i class="fa-solid fa-database"></i> Datos Maestros
            </button>
        </div>
        <div id="tab-content"></div>
    `;
    switchTab('usuarios');
}

function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById('tab-' + tab);
    if (btn) btn.classList.add('active');
    const tabs = { usuarios: loadTabUsuarios, roles: loadTabRoles, maestro: loadTabMaestro };
    if (tabs[tab]) tabs[tab]();
}

// ---- TAB: USUARIOS ----
async function loadTabUsuarios() {
    const content = document.getElementById('tab-content');
    content.innerHTML = loadingHTML();
    const usuarios = await fetchAPI('/usuarios');

    content.innerHTML = `
        <div class="card fade-in">
            <div class="card-header">
                <h3><i class="fa-solid fa-user-plus"></i> Usuarios del Sistema</h3>
                <button class="btn-primary" onclick="openModal('usuario')"><i class="fa-solid fa-plus"></i> Nuevo Usuario</button>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Usuario</th>
                        <th>Correo Electrónico</th>
                        <th>Rol</th>
                        <th>Estado</th>
                        <th>Fecha Creación</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    ${usuarios.map(u => `
                        <tr id="user-row-${u.id}">
                            <td>
                                <span class="user-avatar">${u.nombre.charAt(0).toUpperCase()}</span>
                                <strong>${u.nombre}</strong>
                            </td>
                            <td style="color:var(--text-muted)">${u.email}</td>
                            <td><span class="badge badge-blue">${u.rol}</span></td>
                            <td>
                                ${u.activo
                                    ? '<span class="badge badge-green"><i class="fa-solid fa-circle" style="font-size:0.5rem"></i> Activo</span>'
                                    : '<span class="badge badge-red"><i class="fa-solid fa-circle" style="font-size:0.5rem"></i> Inactivo</span>'
                                }
                            </td>
                            <td style="color:var(--text-muted); font-size:0.82rem">${u.fecha_creacion ? new Date(u.fecha_creacion).toLocaleDateString('es-GT') : '—'}</td>
                            <td>
                                <button class="action-btn" onclick="editarUsuario(${u.id}, '${u.nombre}', '${u.rol}', ${u.activo})">
                                    <i class="fa-solid fa-pen"></i> Editar
                                </button>
                                ${u.activo ? `
                                <button class="action-btn danger" onclick="desactivarUsuario(${u.id}, '${u.nombre}')">
                                    <i class="fa-solid fa-ban"></i> Desactivar
                                </button>` : ''}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
    makeTablePagedAndFilterable(content.querySelector('table'), 'Buscar usuarios...');
}

async function desactivarUsuario(id, nombre) {
    if (!confirm(`¿Desactivar al usuario "${nombre}"?`)) return;
    const res = await fetch(API + '/usuarios/' + id + '/', { method: 'DELETE', headers: authHeaders() });
    if (res.ok) {
        showToast(`Usuario "${nombre}" desactivado.`, 'info');
        loadTabUsuarios();
    } else {
        showToast('Error al desactivar usuario.', 'error');
    }
}

function editarUsuario(id, nombre, rol, activo) {
    const rolesOptions = ROLES_SISTEMA.map(r => `<option value="${r}" ${r === rol ? 'selected' : ''}>${r}</option>`).join('');
    const modal = document.getElementById('modal-container');
    const modalBox = document.getElementById('modal-box');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    modalBox.classList.remove('large');
    title.innerText = `Editar Usuario — ${nombre}`;
    body.innerHTML = `
        <form onsubmit="guardarEdicionUsuario(event, ${id})">
            <div class="form-group">
                <label>Nombre Completo</label>
                <input type="text" id="edit_nombre" class="form-control" value="${nombre}" required>
            </div>
            <div class="form-group">
                <label>Rol Asignado</label>
                <select id="edit_rol" class="form-control">${rolesOptions}</select>
            </div>
            <div class="form-group">
                <label>Estado</label>
                <select id="edit_activo" class="form-control">
                    <option value="true" ${activo ? 'selected' : ''}>Activo</option>
                    <option value="false" ${!activo ? 'selected' : ''}>Inactivo</option>
                </select>
            </div>
            <button type="submit" class="btn-primary" style="width:100%; margin-top:12px; padding:11px">
                <i class="fa-solid fa-floppy-disk"></i> Guardar Cambios
            </button>
        </form>
    `;
    modal.style.display = 'flex';
}

async function guardarEdicionUsuario(e, id) {
    e.preventDefault();
    const payload = {
        nombre: document.getElementById('edit_nombre').value,
        rol: document.getElementById('edit_rol').value,
        activo: document.getElementById('edit_activo').value === 'true'
    };
    const res = await fetch(API + '/usuarios/' + id + '/', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(payload)
    });
    if (res.ok) {
        showToast('Usuario actualizado correctamente.', 'success');
        closeModal();
        loadTabUsuarios();
    } else {
        showToast('Error al actualizar el usuario.', 'error');
    }
}

// ---- TAB: ROLES Y PERMISOS ----
function loadTabRoles() {
    const content = document.getElementById('tab-content');
    content.innerHTML = `
        <div class="card fade-in">
            <div class="card-header">
                <h3><i class="fa-solid fa-shield-halved"></i> Roles y Permisos del Sistema</h3>
            </div>
            <p style="color:var(--text-muted); margin-bottom:20px; font-size:0.88rem">
                Los roles definen qué módulos puede acceder cada usuario. El Administrador tiene acceso total.
            </p>
            <table>
                <thead>
                    <tr><th>Rol</th><th>Módulos con Acceso</th><th>Nivel</th></tr>
                </thead>
                <tbody>
                    ${Object.entries(PERMISOS_MAPA).map(([rol, perms]) => `
                        <tr>
                            <td><strong>${rol}</strong></td>
                            <td>
                                <div class="perm-grid">
                                    ${perms.map(p => `<span class="perm-chip"><i class="fa-solid fa-check" style="font-size:0.65rem"></i> ${p}</span>`).join('')}
                                </div>
                            </td>
                            <td>
                                ${rol === 'Administrador'
                                    ? '<span class="badge badge-red">Completo</span>'
                                    : rol === 'Solo Lectura'
                                    ? '<span class="badge badge-yellow">Limitado</span>'
                                    : '<span class="badge badge-blue">Parcial</span>'}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        <div class="card fade-in" style="margin-top:0">
            <div class="card-header">
                <h3><i class="fa-solid fa-circle-info"></i> Política de Acceso</h3>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
                <div style="padding:16px; border:1px solid var(--border-color); border-radius:8px;">
                    <p style="color:var(--accent-hover); font-weight:600; margin-bottom:8px"><i class="fa-solid fa-lock"></i> Principio de Menor Privilegio</p>
                    <p style="color:var(--text-muted); font-size:0.85rem">Cada usuario solo accede a los módulos necesarios para su función. Minimiza riesgos de seguridad.</p>
                </div>
                <div style="padding:16px; border:1px solid var(--border-color); border-radius:8px;">
                    <p style="color:var(--success); font-weight:600; margin-bottom:8px"><i class="fa-solid fa-eye"></i> Auditoría</p>
                    <p style="color:var(--text-muted); font-size:0.85rem">Todas las ventas quedan registradas con el ID del usuario que las realizó, para trazabilidad completa.</p>
                </div>
            </div>
        </div>
    `;
}

// ---- TAB: DATOS MAESTROS ----
async function loadTabMaestro() {
    const content = document.getElementById('tab-content');
    content.innerHTML = loadingHTML();

    const [clientes, productos] = await Promise.all([
        fetchAPI('/clientes/maestro'),
        fetchAPI('/inventario')
    ]);

    content.innerHTML = `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; align-items:start">

            <!-- CLIENTES -->
            <div class="card fade-in">
                <div class="card-header">
                    <h3><i class="fa-solid fa-address-book"></i> Clientes</h3>
                    <button class="btn-primary btn-sm" onclick="openModal('nuevoCliente')"><i class="fa-solid fa-plus"></i> Agregar</button>
                </div>
                <table>
                    <thead><tr><th>Nombre</th><th>Tipo</th><th>Teléfono</th><th></th></tr></thead>
                    <tbody id="tabla-clientes-maestro">
                        ${clientes.map(c => `
                            <tr>
                                <td style="font-weight:500">${c.nombre}</td>
                                <td><span class="badge ${c.tipo === 'Mayorista' ? 'badge-red' : c.tipo === 'Distribuidor' ? 'badge-yellow' : 'badge-blue'}">${c.tipo}</span></td>
                                <td style="color:var(--text-muted)">${c.telefono || '—'}</td>
                                <td>
                                    <button class="action-btn" onclick="editarCliente(${c.id},'${c.nombre.replace(/'/g,"\\'")}','${c.tipo}','${c.telefono || ''}')">
                                        <i class="fa-solid fa-pen"></i>
                                    </button>
                                    <button class="action-btn danger" onclick="eliminarCliente(${c.id},'${c.nombre.replace(/'/g,"\\'")}')">
                                        <i class="fa-solid fa-trash"></i>
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>

            <!-- PRODUCTOS -->
            <div class="card fade-in" style="animation-delay:0.1s">
                <div class="card-header">
                    <h3><i class="fa-solid fa-box-open"></i> Productos / Repuestos</h3>
                    <button class="btn-primary btn-sm" onclick="openModal('nuevoProducto')"><i class="fa-solid fa-plus"></i> Agregar</button>
                </div>
                <table>
                    <thead><tr><th>Nombre</th><th>Categoría</th><th>P. Venta</th><th>Stock</th><th></th></tr></thead>
                    <tbody id="tabla-productos-maestro">
                        ${productos.map(p => `
                            <tr>
                                <td style="font-weight:500">${p.nombre}</td>
                                <td style="color:var(--text-muted)">${p.categoria || '—'}</td>
                                <td style="color:var(--accent-hover); font-weight:600">${formatQ(p.precio_venta)}</td>
                                <td><span class="badge ${p.stock > 10 ? 'badge-green' : p.stock > 3 ? 'badge-yellow' : 'badge-red'}">${p.stock}</span></td>
                                <td>
                                    <button class="action-btn" onclick="editarProducto(${p.id},'${p.nombre.replace(/'/g,"\\'")}','${p.categoria||''}',${p.precio_costo||0},${p.precio_venta},${p.stock||0})">
                                        <i class="fa-solid fa-pen"></i>
                                    </button>
                                    <button class="action-btn danger" onclick="eliminarProducto(${p.id},'${p.nombre.replace(/'/g,"\\'")}')">
                                        <i class="fa-solid fa-trash"></i>
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    makeTablePagedAndFilterable(document.getElementById('tabla-clientes-maestro').parentNode, 'Buscar clientes...');
    makeTablePagedAndFilterable(document.getElementById('tabla-productos-maestro').parentNode, 'Buscar productos...');
}

// ---- CRUD Clientes ----
function editarCliente(id, nombre, tipo, telefono) {
    const tipos = ['Minorista','Mayorista','Distribuidor'];
    const modal = document.getElementById('modal-container');
    const modalBox = document.getElementById('modal-box');
    modalBox.classList.remove('large');
    document.getElementById('modal-title').innerText = `Editar Cliente — ${nombre}`;
    document.getElementById('modal-body').innerHTML = `
        <form onsubmit="guardarCliente(event, ${id})">
            <div class="form-group"><label>Nombre</label>
                <input type="text" id="cl_nombre" class="form-control" value="${nombre}" required>
            </div>
            <div class="form-group"><label>Tipo</label>
                <select id="cl_tipo" class="form-control">
                    ${tipos.map(t => `<option ${t===tipo?'selected':''}>${t}</option>`).join('')}
                </select>
            </div>
            <div class="form-group"><label>Teléfono</label>
                <input type="text" id="cl_tel" class="form-control" value="${telefono}">
            </div>
            <button type="submit" class="btn-primary" style="width:100%; margin-top:12px; padding:11px">
                <i class="fa-solid fa-floppy-disk"></i> Guardar
            </button>
        </form>`;
    modal.style.display = 'flex';
}

async function guardarCliente(e, id) {
    e.preventDefault();
    const payload = {
        nombre: document.getElementById('cl_nombre').value,
        tipo: document.getElementById('cl_tipo').value,
        telefono: document.getElementById('cl_tel').value
    };
    const url = id ? API + '/clientes/' + id + '/' : API + '/clientes/';
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(payload) });
    if (res.ok) {
        showToast(id ? 'Cliente actualizado.' : 'Cliente creado exitosamente.', 'success');
        closeModal();
        loadTabMaestro();
    } else {
        const d = await res.json();
        showToast(d.error || 'Error al guardar cliente.', 'error');
    }
}

async function eliminarCliente(id, nombre) {
    if (!confirm(`¿Eliminar al cliente "${nombre}"? Esta acción no se puede deshacer.`)) return;
    const res = await fetch(API + '/clientes/' + id + '/', { method: 'DELETE', headers: authHeaders() });
    const d = await res.json();
    if (res.ok) { showToast('Cliente eliminado.', 'info'); loadTabMaestro(); }
    else showToast(d.error, 'error');
}

// ---- CRUD Productos ----
function editarProducto(id, nombre, categoria, precio_costo, precio_venta, stock) {
    const modal = document.getElementById('modal-container');
    const modalBox = document.getElementById('modal-box');
    modalBox.classList.remove('large');
    document.getElementById('modal-title').innerText = id ? `Editar Producto — ${nombre}` : 'Nuevo Producto';
    document.getElementById('modal-body').innerHTML = `
        <form onsubmit="guardarProducto(event, ${id || 0})">
            <div class="form-group"><label>Nombre del Repuesto</label>
                <input type="text" id="pr_nombre" class="form-control" value="${nombre}" required>
            </div>
            <div class="form-group"><label>Categoría</label>
                <select id="pr_cat" class="form-control">
                    ${['Llantas','Frenos','Motor','Lubricantes','Accesorios','Eléctrico','Suspensión','Transmisión','Otro'].map(c=>
                        `<option ${c===categoria?'selected':''}>${c}</option>`
                    ).join('')}
                </select>
            </div>
            <div style="display:flex; gap:12px">
                <div class="form-group" style="flex:1"><label>Precio Costo (Q)</label>
                    <input type="number" id="pr_costo" class="form-control" step="0.01" value="${precio_costo}" required>
                </div>
                <div class="form-group" style="flex:1"><label>Precio Venta (Q)</label>
                    <input type="number" id="pr_venta" class="form-control" step="0.01" value="${precio_venta}" required>
                </div>
                <div class="form-group" style="flex:1"><label>Stock Inicial</label>
                    <input type="number" id="pr_stock" class="form-control" min="0" value="${stock}" required>
                </div>
            </div>
            <button type="submit" class="btn-primary" style="width:100%; margin-top:12px; padding:11px">
                <i class="fa-solid fa-floppy-disk"></i> Guardar Producto
            </button>
        </form>`;
    modal.style.display = 'flex';
}

async function guardarProducto(e, id) {
    e.preventDefault();
    const payload = {
        nombre: document.getElementById('pr_nombre').value,
        categoria: document.getElementById('pr_cat').value,
        precio_costo: document.getElementById('pr_costo').value,
        precio_venta: document.getElementById('pr_venta').value,
        stock: document.getElementById('pr_stock').value
    };
    const url = id ? API + '/productos/' + id + '/' : API + '/productos/';
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(payload) });
    if (res.ok) {
        showToast(id ? 'Producto actualizado.' : 'Producto creado exitosamente.', 'success');
        closeModal();
        loadTabMaestro();
    } else {
        const d = await res.json();
        showToast(d.error || 'Error al guardar producto.', 'error');
    }
}

async function eliminarProducto(id, nombre) {
    if (!confirm(`¿Eliminar el producto "${nombre}"? Esta acción no se puede deshacer.`)) return;
    const res = await fetch(API + '/productos/' + id + '/', { method: 'DELETE', headers: authHeaders() });
    const d = await res.json();
    if (res.ok) { showToast('Producto eliminado.', 'info'); loadTabMaestro(); }
    else showToast(d.error, 'error');
}

// ============================================================
// MODAL SYSTEM
// ============================================================
async function openModal(tipo) {
    const modal = document.getElementById('modal-container');
    const modalBox = document.getElementById('modal-box');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');

    modal.style.display = 'flex';

    if (tipo === 'venta') {
        modalBox.classList.add('large');
        title.innerText = 'Nueva Orden de Venta';
        body.innerHTML = loadingHTML();

        const [clientes, productos] = await Promise.all([
            fetchAPI('/clientes'),
            fetchAPI('/inventario')
        ]);

        // Guardar en cache global para uso inmediato
        _productosData = productos;
        productosOptionsCache = productos.map(p => `<option value="${p.id}" data-precio="${p.precio_venta}">${p.nombre} (${formatQ(p.precio_venta)})</option>`).join('');

        const clOptions = clientes.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
        // Build producto options inline to guarantee they are available
        const prodOpts = productosOptionsCache;

        body.innerHTML = `
            <form onsubmit="submitVenta(event)">
                <div style="display:flex; gap:16px; flex-wrap:wrap;">
                    <div class="form-group" style="flex:2; min-width:200px">
                        <label>Cliente</label>
                        <select id="venta_cliente_id" class="form-control" required>
                            <option value="">— Seleccionar cliente —</option>
                            ${clOptions}
                        </select>
                    </div>
                    <div class="form-group" style="flex:1; min-width:160px">
                        <label>Fecha</label>
                        <input class="form-control" value="${new Date().toLocaleDateString('es-GT')}" disabled>
                    </div>
                </div>
                <div style="margin:4px 0 12px">
                    <button type="button" class="btn-secondary btn-sm" onclick="addLineaModal()"><i class="fa-solid fa-plus"></i> Añadir Producto</button>
                </div>
                <table class="dynamic-table">
                    <thead><tr><th style="width:48%">Producto</th><th>Cant.</th><th>Precio (Q)</th><th>Subtotal</th><th></th></tr></thead>
                    <tbody id="lineas-modal-body"></tbody>
                </table>
                <div class="totals-section">
                    <div><span>Subtotal:</span><span id="lbl-subtotal">Q0.00</span></div>
                    <div><span>IVA (12%):</span><span id="lbl-iva">Q0.00</span></div>
                    <div class="total-final"><span>Total a Pagar:</span><span id="lbl-total">Q0.00</span></div>
                </div>
                <button type="submit" class="btn-primary" style="width:100%; margin-top:16px; font-size:1rem; padding:12px">
                    <i class="fa-solid fa-check"></i> Confirmar Venta
                </button>
            </form>
        `;
        // setTimeout(0) garantiza que el DOM ya procesó el innerHTML antes de insertar filas
        setTimeout(() => addLineaModal(), 0);

    } else if (tipo === 'compra') {
        modalBox.classList.add('large');
        title.innerText = 'Nueva Orden de Compra';
        body.innerHTML = loadingHTML();

        const [proveedores, productos] = await Promise.all([
            fetchAPI('/proveedores'),
            fetchAPI('/inventario')
        ]);
        _productosData = productos;
        productosOptionsCache = productos.map(p => `<option value="${p.id}" data-precio="${p.precio_costo || p.precio_venta}">${p.nombre} (costo: ${formatQ(p.precio_costo || 0)})</option>`).join('');
        const provOptions = proveedores.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');

        body.innerHTML = `
            <form onsubmit="submitCompra(event)">
                <div style="display:flex; gap:16px; flex-wrap:wrap;">
                    <div class="form-group" style="flex:2; min-width:200px">
                        <label>Proveedor</label>
                        <select id="compra_proveedor_id" class="form-control" required>
                            <option value="">— Seleccionar proveedor —</option>
                            ${provOptions}
                        </select>
                    </div>
                    <div class="form-group" style="flex:1; min-width:160px">
                        <label>Fecha</label>
                        <input class="form-control" value="${new Date().toLocaleDateString('es-GT')}" disabled>
                    </div>
                </div>
                <div style="margin:4px 0 12px">
                    <button type="button" class="btn-secondary btn-sm" onclick="addLineaModal()"><i class="fa-solid fa-plus"></i> Añadir Artículo</button>
                </div>
                <table class="dynamic-table">
                    <thead><tr><th style="width:48%">Producto</th><th>Cant.</th><th>Costo (Q)</th><th>Subtotal</th><th></th></tr></thead>
                    <tbody id="lineas-modal-body"></tbody>
                </table>
                <div class="totals-section">
                    <div class="total-final"><span>Total de Compra:</span><span id="lbl-total">Q0.00</span></div>
                    <span id="lbl-subtotal" style="display:none"></span><span id="lbl-iva" style="display:none"></span>
                </div>
                <button type="submit" class="btn-primary" style="width:100%; margin-top:16px; font-size:1rem; padding:12px">
                    <i class="fa-solid fa-check"></i> Confirmar Orden
                </button>
            </form>
        `;
        // Fix DOM timing
        setTimeout(() => addLineaModal(), 0);

    } else if (tipo === 'crm') {
        modalBox.classList.remove('large');
        title.innerText = 'Nuevo Lead — Oportunidad';
        body.innerHTML = loadingHTML();

        const clientes = await fetchAPI('/clientes');
        const clOptions = clientes.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');

        body.innerHTML = `
            <form onsubmit="submitCRM(event)">
                <div class="form-group">
                    <label>Descripción de la Oportunidad</label>
                    <input type="text" id="crm_desc" class="form-control" required placeholder="Ej: Venta de flotilla de cascos">
                </div>
                <div class="form-group">
                    <label>Cliente Relacionado</label>
                    <select id="crm_cliente" class="form-control" required>
                        <option value="">— Seleccionar cliente —</option>
                        ${clOptions}
                    </select>
                </div>
                <div style="display:flex; gap:12px;">
                    <div class="form-group" style="flex:1">
                        <label>Ingreso Estimado (Q)</label>
                        <input type="number" id="crm_ingreso" class="form-control" step="0.01" min="0" required placeholder="0.00">
                    </div>
                    <div class="form-group" style="flex:1">
                        <label>Probabilidad (%)</label>
                        <input type="number" id="crm_prob" class="form-control" min="0" max="100" required placeholder="0–100">
                    </div>
                </div>
                <div class="form-group">
                    <label>Estado del Lead</label>
                    <select id="crm_estado" class="form-control">
                        <option value="Nuevo">🔵 Nuevo</option>
                        <option value="En Negociación">🟡 En Negociación</option>
                        <option value="Ganado">🟢 Ganado</option>
                    </select>
                </div>
                <button type="submit" class="btn-primary" style="width:100%; margin-top:16px; padding:12px; font-size:1rem">
                    <i class="fa-solid fa-check"></i> Guardar Lead
                </button>
            </form>
        `;

    } else if (tipo === 'usuario') {
        modalBox.classList.remove('large');
        title.innerText = 'Nuevo Usuario';
        const rolesOptions = ROLES_SISTEMA.map(r => `<option value="${r}">${r}</option>`).join('');
        body.innerHTML = `
            <form onsubmit="submitNuevoUsuario(event)">
                <div class="form-group">
                    <label>Nombre Completo</label>
                    <input type="text" id="nu_nombre" class="form-control" required placeholder="Ej: María González">
                </div>
                <div class="form-group">
                    <label>Correo Electrónico</label>
                    <input type="email" id="nu_email" class="form-control" required placeholder="usuario@mkparts.com">
                </div>
                <div class="form-group">
                    <label>Contraseña</label>
                    <input type="password" id="nu_password" class="form-control" required placeholder="Contraseña de acceso" minlength="4">
                </div>
                <div class="form-group">
                    <label>Rol Asignado</label>
                    <select id="nu_rol" class="form-control">${rolesOptions}</select>
                </div>
                <div style="background:var(--bg-color); border:1px solid var(--border-color); border-radius:8px; padding:12px; margin-top:4px; font-size:0.82rem; color:var(--text-muted)">
                    <i class="fa-solid fa-circle-info" style="color:var(--info)"></i>
                    El usuario recibirá acceso según el rol asignado. Los permisos se configuran en la pestaña <strong>Roles y Permisos</strong>.
                </div>
                <button type="submit" class="btn-primary" style="width:100%; margin-top:16px; padding:11px">
                    <i class="fa-solid fa-user-plus"></i> Crear Usuario
                </button>
            </form>
        `;

    } else if (tipo === 'nuevoCliente') {
        modalBox.classList.remove('large');
        title.innerText = 'Nuevo Cliente';
        // Reutilizamos la misma función pero con id=0
        editarCliente(0, '', 'Minorista', '');
        document.getElementById('modal-title').innerText = 'Nuevo Cliente';
        // Patch form action
        document.getElementById('modal-body').querySelector('form').setAttribute('onsubmit', 'guardarCliente(event, 0)');
        return; // editarCliente ya mostró el modal

    } else if (tipo === 'nuevoProducto') {
        modalBox.classList.remove('large');
        title.innerText = 'Nuevo Producto';
        editarProducto(0, '', 'Llantas', 0, 0, 0);
        document.getElementById('modal-title').innerText = 'Nuevo Producto';
        return;
    }
}

async function submitNuevoUsuario(e) {
    e.preventDefault();
    const payload = {
        nombre: document.getElementById('nu_nombre').value,
        email: document.getElementById('nu_email').value,
        password: document.getElementById('nu_password').value,
        rol: document.getElementById('nu_rol').value
    };
    const res = await fetch(API + '/usuarios/', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok) {
        showToast(`✓ Usuario "${payload.nombre}" creado con rol ${payload.rol}.`, 'success');
        closeModal();
        loadTabUsuarios();
    } else {
        showToast(data.error || 'Error al crear usuario.', 'error');
    }
}


function closeModal() {
    document.getElementById('modal-container').style.display = 'none';
    const box = document.getElementById('modal-box');
    if (box) box.classList.remove('large');
}

// -------- Dynamic product lines --------
function addLineaModal() {
    const tbody = document.getElementById('lineas-modal-body');
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td>
            <select class="form-control prod-select" onchange="updateLinePriceModal(this)" required>
                <option value="">— Seleccione —</option>
                ${productosOptionsCache}
            </select>
        </td>
        <td><input type="number" class="form-control prod-qty" value="1" min="1" oninput="calcTotals()" required></td>
        <td><input type="number" class="form-control prod-price" value="0.00" step="0.01" oninput="calcTotals()" required></td>
        <td class="prod-sub" style="white-space:nowrap; font-weight:500">Q0.00</td>
        <td>
            <span style="color:var(--danger); cursor:pointer; padding:4px 8px" onclick="this.closest('tr').remove(); calcTotals()">
                <i class="fa-solid fa-trash"></i>
            </span>
        </td>
    `;
    tbody.appendChild(tr);
}

function updateLinePriceModal(sel) {
    const opt = sel.options[sel.selectedIndex];
    const precio = opt.getAttribute('data-precio') || 0;
    sel.closest('tr').querySelector('.prod-price').value = precio;
    calcTotals();
}

function calcTotals() {
    let subtotal = 0;
    document.querySelectorAll('#lineas-modal-body tr').forEach(row => {
        const qty = parseFloat(row.querySelector('.prod-qty')?.value) || 0;
        const price = parseFloat(row.querySelector('.prod-price')?.value) || 0;
        const sub = qty * price;
        const subEl = row.querySelector('.prod-sub');
        if (subEl) subEl.textContent = formatQ(sub);
        subtotal += sub;
    });

    const lblSub = document.getElementById('lbl-subtotal');
    const lblIva = document.getElementById('lbl-iva');
    const lblTotal = document.getElementById('lbl-total');

    if (lblSub && lblSub.style.display !== 'none') {
        const iva = subtotal * 0.12;
        const total = subtotal + iva;
        lblSub.textContent = formatQ(subtotal);
        lblIva.textContent = formatQ(iva);
        lblTotal.textContent = formatQ(total);
        return total;
    } else {
        if (lblTotal) lblTotal.textContent = formatQ(subtotal);
        return subtotal;
    }
}

// -------- SUBMIT HANDLERS --------
async function submitVenta(e) {
    e.preventDefault();
    const cliente_id = document.getElementById('venta_cliente_id').value;
    const total = calcTotals();
    const lineas = getLineas();
    if (!lineas.length) { showToast('Agrega al menos un producto.', 'error'); return; }

    // Deshabilitar botón para evitar doble envío
    const btn = e.target.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...'; }

    try {
        const res = await fetch(API + '/ventas/', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ cliente_id, total, lineas })
        });
        const data = await res.json();
        if (res.ok) {
            showToast(`✓ Venta V-${String(data.venta_id).padStart(4,'0')} confirmada. Stock actualizado.`, 'success');
            closeModal();
            await loadVentasTable();
        } else {
            // Mostrar el mensaje exacto del servidor (stock insuficiente, etc.)
            showToast(data.error || 'Error al guardar la venta.', 'error');
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Confirmar Venta'; }
        }
    } catch {
        showToast('Error de conexión con el servidor.', 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Confirmar Venta'; }
    }
}

async function submitCompra(e) {
    e.preventDefault();
    const proveedor_id = document.getElementById('compra_proveedor_id').value;
    const total = calcTotals();
    const lineas = getLineas();
    if (!lineas.length) { showToast('Agrega al menos un artículo a la orden.', 'error'); return; }

    // Deshabilitar botón para evitar doble envío
    const btn = e.target.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...'; }

    try {
        const res = await fetch(API + '/compras/', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ proveedor_id, total, lineas })
        });
        const data = await res.json();
        if (res.ok) {
            showToast(`✓ Orden OC-${String(data.compra_id).padStart(4,'0')} generada exitosamente. Stock actualizado.`, 'success');
            closeModal();
            await loadComprasTable();
        } else {
            showToast(data.error || 'Error al registrar la compra.', 'error');
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Confirmar Orden'; }
        }
    } catch {
        showToast('Error de conexión con el servidor.', 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Confirmar Orden'; }
    }
}

async function submitCRM(e) {
    e.preventDefault();
    const payload = {
        descripcion: document.getElementById('crm_desc').value,
        cliente_id: document.getElementById('crm_cliente').value,
        ingreso_estimado: document.getElementById('crm_ingreso').value,
        probabilidad: document.getElementById('crm_prob').value,
        estado: document.getElementById('crm_estado').value
    };
    try {
        const res = await fetch(API + '/crm/', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            showToast('✓ Lead CRM guardado correctamente.', 'success');
            closeModal();
            await loadCRMTable();
        } else {
            showToast('Error al guardar el lead.', 'error');
        }
    } catch { showToast('Error de conexión con el servidor.', 'error'); }
}

function getLineas() {
    const lineas = [];
    document.querySelectorAll('#lineas-modal-body tr').forEach(row => {
        const producto_id = row.querySelector('.prod-select')?.value;
        const cantidad = parseFloat(row.querySelector('.prod-qty')?.value) || 0;
        const precio_unitario = parseFloat(row.querySelector('.prod-price')?.value) || 0;
        if (producto_id && cantidad > 0) {
            lineas.push({ producto_id, cantidad, precio_unitario });
        }
    });
    return lineas;
}

// Close modal clicking outside
document.addEventListener('click', (e) => {
    const modal = document.getElementById('modal-container');
    if (e.target === modal) closeModal();
});

