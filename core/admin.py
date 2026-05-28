from django.contrib import admin
from .models import Cliente, Producto, Venta, DetalleVenta, Compra, DetalleCompra, CRMLead


class DetalleVentaInline(admin.TabularInline):
    model = DetalleVenta
    extra = 0
    readonly_fields = ('subtotal',)


class DetalleCompraInline(admin.TabularInline):
    model = DetalleCompra
    extra = 0
    readonly_fields = ('subtotal',)


@admin.register(Cliente)
class ClienteAdmin(admin.ModelAdmin):
    list_display = ('nombre', 'tipo', 'telefono')
    search_fields = ('nombre',)
    list_filter = ('tipo',)


@admin.register(Producto)
class ProductoAdmin(admin.ModelAdmin):
    list_display = ('nombre', 'categoria', 'precio_costo', 'precio_venta', 'stock')
    search_fields = ('nombre',)
    list_filter = ('categoria',)
    list_editable = ('stock', 'precio_venta')


@admin.register(Venta)
class VentaAdmin(admin.ModelAdmin):
    list_display = ('id', 'cliente', 'usuario', 'fecha', 'total')
    list_filter = ('fecha',)
    search_fields = ('cliente__nombre',)
    inlines = [DetalleVentaInline]


@admin.register(Compra)
class CompraAdmin(admin.ModelAdmin):
    list_display = ('id', 'proveedor', 'fecha', 'total')
    list_filter = ('fecha',)
    inlines = [DetalleCompraInline]


@admin.register(CRMLead)
class CRMLeadAdmin(admin.ModelAdmin):
    list_display = ('descripcion', 'cliente', 'ingreso_estimado', 'probabilidad', 'estado')
    list_filter = ('estado',)
    search_fields = ('descripcion', 'cliente__nombre')


# Personalizar el panel admin
admin.site.site_header  = 'MKParts ERP — Panel de Administración'
admin.site.site_title   = 'MKParts Admin'
admin.site.index_title  = 'Gestión del Sistema'
