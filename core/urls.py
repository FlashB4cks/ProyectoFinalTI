from django.urls import path
from . import views

urlpatterns = [
    # Dashboard
    path('dashboard/', views.api_dashboard, name='api-dashboard'),

    # Inventario
    path('inventario/', views.api_inventario, name='api-inventario'),

    # Ventas
    path('ventas/', views.api_ventas, name='api-ventas'),

    # Compras
    path('compras/', views.api_compras, name='api-compras'),

    # CRM
    path('crm/', views.api_crm, name='api-crm'),

    # Contabilidad
    path('contabilidad/', views.api_contabilidad, name='api-contabilidad'),

    # Clientes
    path('clientes/', views.api_clientes, name='api-clientes'),
    path('clientes/maestro/', views.api_clientes_maestro, name='api-clientes-maestro'),
    path('clientes/<int:pk>/', views.api_cliente_detail, name='api-cliente-detail'),

    # Proveedores (alias de clientes)
    path('proveedores/', views.api_proveedores, name='api-proveedores'),

    # Productos
    path('productos/', views.api_productos, name='api-productos'),
    path('productos/<int:pk>/', views.api_producto_detail, name='api-producto-detail'),

    # Usuarios
    path('usuarios/', views.api_usuarios, name='api-usuarios'),
    path('usuarios/<int:pk>/', views.api_usuario_detail, name='api-usuario-detail'),

    # Roles
    path('roles/', views.api_roles, name='api-roles'),

    # RPA
    path('run-rpa/', views.api_run_rpa, name='api-run-rpa'),
]
