from rest_framework import serializers
from django.contrib.auth.models import User, Group
from .models import Cliente, Producto, Venta, DetalleVenta, Compra, DetalleCompra, CRMLead


class ClienteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cliente
        fields = '__all__'


class ProductoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Producto
        fields = '__all__'


class DetalleVentaSerializer(serializers.ModelSerializer):
    subtotal = serializers.ReadOnlyField()

    class Meta:
        model = DetalleVenta
        fields = ['id', 'producto', 'cantidad', 'precio_unitario', 'subtotal']


class VentaListSerializer(serializers.ModelSerializer):
    cliente = serializers.StringRelatedField()

    class Meta:
        model = Venta
        fields = ['id', 'cliente', 'fecha', 'total']


class VentaCreateSerializer(serializers.ModelSerializer):
    lineas = serializers.ListField(child=serializers.DictField(), write_only=True)

    class Meta:
        model = Venta
        fields = ['cliente', 'total', 'lineas']

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, 'copy') else dict(data)
        if 'cliente_id' in data and 'cliente' not in data:
            data['cliente'] = data['cliente_id']
        return super().to_internal_value(data)

    def create(self, validated_data):
        from django.db import transaction
        lineas = validated_data.pop('lineas')
        request = self.context.get('request')

        with transaction.atomic():
            # Validar stock antes de crear
            for linea in lineas:
                prod = Producto.objects.select_for_update().get(id=linea['producto_id'])
                cantidad = int(linea['cantidad'])
                if prod.stock < cantidad:
                    raise serializers.ValidationError(
                        f'Stock insuficiente para "{prod.nombre}". Disponible: {prod.stock}, solicitado: {cantidad}.'
                    )

            # Crear venta
            usuario = request.user if request else None
            venta = Venta.objects.create(
                cliente=validated_data['cliente'],
                usuario=usuario,
                total=validated_data['total']
            )

            # Crear detalles y descontar stock
            for linea in lineas:
                prod = Producto.objects.select_for_update().get(id=linea['producto_id'])
                cantidad = int(linea['cantidad'])
                DetalleVenta.objects.create(
                    venta=venta,
                    producto=prod,
                    cantidad=cantidad,
                    precio_unitario=linea['precio_unitario']
                )
                prod.stock -= cantidad
                prod.save()

        return venta


class CompraListSerializer(serializers.ModelSerializer):
    proveedor = serializers.StringRelatedField()

    class Meta:
        model = Compra
        fields = ['id', 'proveedor', 'fecha', 'total']


class CompraCreateSerializer(serializers.ModelSerializer):
    lineas = serializers.ListField(child=serializers.DictField(), write_only=True)

    class Meta:
        model = Compra
        fields = ['proveedor', 'total', 'lineas']

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, 'copy') else dict(data)
        if 'proveedor_id' in data and 'proveedor' not in data:
            data['proveedor'] = data['proveedor_id']
        return super().to_internal_value(data)

    def create(self, validated_data):
        from django.db import transaction
        lineas = validated_data.pop('lineas')

        with transaction.atomic():
            compra = Compra.objects.create(
                proveedor=validated_data.get('proveedor'),
                total=validated_data['total']
            )
            for linea in lineas:
                prod = Producto.objects.select_for_update().get(id=linea['producto_id'])
                cantidad = int(linea['cantidad'])
                DetalleCompra.objects.create(
                    compra=compra,
                    producto=prod,
                    cantidad=cantidad,
                    costo_unitario=linea['precio_unitario']
                )
                prod.stock += cantidad
                prod.precio_costo = linea['precio_unitario']
                prod.save()

        return compra


class CRMLeadSerializer(serializers.ModelSerializer):
    cliente_nombre = serializers.SerializerMethodField()

    class Meta:
        model = CRMLead
        fields = ['id', 'descripcion', 'cliente', 'cliente_nombre', 'ingreso_estimado', 'probabilidad', 'estado']

    def get_cliente_nombre(self, obj):
        return obj.cliente.nombre if obj.cliente else 'Sin asignar'

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, 'copy') else dict(data)
        if 'cliente_id' in data and 'cliente' not in data:
            data['cliente'] = data['cliente_id']
        return super().to_internal_value(data)


class UsuarioSerializer(serializers.ModelSerializer):
    nombre     = serializers.SerializerMethodField()
    rol        = serializers.SerializerMethodField()
    activo     = serializers.BooleanField(source='is_active')
    fecha_creacion = serializers.DateTimeField(source='date_joined', read_only=True)

    class Meta:
        model = User
        fields = ['id', 'nombre', 'email', 'rol', 'activo', 'fecha_creacion']

    def get_nombre(self, obj):
        return obj.get_full_name() or obj.username

    def get_rol(self, obj):
        grupos = obj.groups.all()
        return grupos.first().name if grupos.exists() else ('Administrador' if obj.is_superuser else 'Sin rol')
