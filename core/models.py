from django.db import models
from django.contrib.auth.models import User


class Cliente(models.Model):
    TIPOS = [('Minorista', 'Minorista'), ('Mayorista', 'Mayorista'), ('Distribuidor', 'Distribuidor')]
    nombre   = models.CharField(max_length=100)
    tipo     = models.CharField(max_length=50, choices=TIPOS, default='Minorista')
    telefono = models.CharField(max_length=20, blank=True, null=True)

    class Meta:
        db_table = 'clientes'
        ordering = ['nombre']

    def __str__(self):
        return self.nombre


class Producto(models.Model):
    CATEGORIAS = [
        ('Llantas', 'Llantas'), ('Frenos', 'Frenos'), ('Motor', 'Motor'),
        ('Lubricantes', 'Lubricantes'), ('Accesorios', 'Accesorios'),
        ('Eléctrico', 'Eléctrico'), ('Suspensión', 'Suspensión'),
        ('Transmisión', 'Transmisión'), ('Otro', 'Otro'),
    ]
    nombre       = models.CharField(max_length=100)
    categoria    = models.CharField(max_length=50, choices=CATEGORIAS, blank=True, null=True)
    precio_costo = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    precio_venta = models.DecimalField(max_digits=10, decimal_places=2)
    stock        = models.IntegerField(default=0)

    class Meta:
        db_table = 'productos'
        ordering = ['nombre']

    def __str__(self):
        return self.nombre


class Venta(models.Model):
    cliente    = models.ForeignKey(Cliente, on_delete=models.PROTECT, db_column='cliente_id')
    usuario    = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, db_column='usuario_id')
    fecha      = models.DateField(auto_now_add=True)
    total      = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        db_table = 'ventas'
        ordering = ['-id']

    def __str__(self):
        return f"V-{self.id:04d} — {self.cliente.nombre}"


class DetalleVenta(models.Model):
    venta          = models.ForeignKey(Venta, on_delete=models.CASCADE, related_name='detalles', db_column='venta_id')
    producto       = models.ForeignKey(Producto, on_delete=models.PROTECT, db_column='producto_id')
    cantidad       = models.IntegerField()
    precio_unitario = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        db_table = 'detalle_ventas'

    @property
    def subtotal(self):
        return self.cantidad * self.precio_unitario


class Compra(models.Model):
    proveedor  = models.ForeignKey(Cliente, on_delete=models.PROTECT, null=True, db_column='proveedor_id')
    fecha      = models.DateField(auto_now_add=True)
    total      = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        db_table = 'compras'
        ordering = ['-id']

    def __str__(self):
        nombre_prov = self.proveedor.nombre if self.proveedor else 'Sin proveedor'
        return f"OC-{self.id:04d} — {nombre_prov}"


class DetalleCompra(models.Model):
    compra         = models.ForeignKey(Compra, on_delete=models.CASCADE, related_name='detalles', db_column='compra_id')
    producto       = models.ForeignKey(Producto, on_delete=models.PROTECT, db_column='producto_id')
    cantidad       = models.IntegerField()
    costo_unitario = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        db_table = 'detalle_compras'

    @property
    def subtotal(self):
        return self.cantidad * self.costo_unitario


class CRMLead(models.Model):
    ESTADOS = [('Nuevo', 'Nuevo'), ('En Negociación', 'En Negociación'), ('Ganado', 'Ganado')]
    descripcion      = models.CharField(max_length=255)
    cliente          = models.ForeignKey(Cliente, on_delete=models.SET_NULL, null=True, blank=True, db_column='cliente_id')
    ingreso_estimado = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    probabilidad     = models.IntegerField(default=0)
    estado           = models.CharField(max_length=50, choices=ESTADOS, default='Nuevo')

    class Meta:
        db_table = 'crm_leads'
        ordering = ['-id']

    def __str__(self):
        return self.descripcion
