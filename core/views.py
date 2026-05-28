from django.shortcuts import render, redirect
from django.contrib.auth import authenticate, login
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User, Group
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
import json

from .models import Cliente, Producto, Venta, DetalleVenta, Compra, DetalleCompra, CRMLead
from .serializers import (
    ClienteSerializer, ProductoSerializer,
    VentaListSerializer, VentaCreateSerializer,
    CompraListSerializer, CompraCreateSerializer,
    CRMLeadSerializer
)
from functools import wraps

def role_required(allowed):
    """
    Decorator to restrict access to API views based on the user's role.
    Supports either a list of allowed roles:
        @role_required(['Administrador', 'Ventas'])
    Or a dictionary mapping HTTP methods to allowed roles:
        @role_required({
            'GET': ['Administrador', 'Bodeguero', 'Ventas'],
            'POST': ['Administrador', 'Bodeguero']
        })
    """
    def decorator(view_func):
        @wraps(view_func)
        def _wrapped_view(request, *args, **kwargs):
            user = request.user
            if not user.is_authenticated:
                return Response({'error': 'No autenticado'}, status=status.HTTP_401_UNAUTHORIZED)
            
            # Superuser always has full access
            if user.is_superuser:
                return view_func(request, *args, **kwargs)
                
            grupos = list(user.groups.values_list('name', flat=True))
            user_role = grupos[0] if grupos else 'Solo Lectura'
            
            # Resolve allowed roles for the current request method
            if isinstance(allowed, dict):
                method = request.method
                allowed_roles = allowed.get(method, [])
            else:
                allowed_roles = allowed
                
            if user_role in allowed_roles:
                return view_func(request, *args, **kwargs)
                
            return Response(
                {'error': f'Acceso denegado: el rol "{user_role}" no tiene permisos para realizar esta acción.'}, 
                status=status.HTTP_403_FORBIDDEN
            )
        return _wrapped_view
    return decorator


# ─────────────────────────────────────────────
#  AUTENTICACIÓN
# ─────────────────────────────────────────────
def login_view(request):
    if request.user.is_authenticated:
        return redirect('index')

    error = None
    if request.method == 'POST':
        username = request.POST.get('username', '')
        password = request.POST.get('password', '')
        user = authenticate(request, username=username, password=password)
        if user:
            login(request, user)
            next_url = request.GET.get('next', '/')
            return redirect(next_url)
        else:
            error = 'Usuario o contraseña incorrectos.'

    return render(request, 'login.html', {'error': error})


@login_required
def erp_index(request):
    user = request.user
    grupos = list(user.groups.values_list('name', flat=True))
    rol = grupos[0] if grupos else ('Administrador' if user.is_superuser else 'Usuario')
    return render(request, 'index.html', {
        'user': user,
        'rol': rol,
        'nombre': user.get_full_name() or user.username,
    })


# ─────────────────────────────────────────────
#  DASHBOARD
# ─────────────────────────────────────────────
@api_view(['GET'])
@permission_classes([IsAuthenticated])
@role_required(['Administrador', 'Ventas', 'Bodeguero', 'Contador', 'Solo Lectura'])
def api_dashboard(request):
    from datetime import date
    hoy = date.today()
    primer_dia = hoy.replace(day=1)

    total_repuestos = Producto.objects.count()
    total_clientes  = Cliente.objects.count()
    ventas_mes      = Venta.objects.filter(fecha__gte=primer_dia).aggregate(s=Sum('total'))['s'] or 0
    leads_activos   = CRMLead.objects.exclude(estado='Ganado').count()
    ultimas_ventas  = Venta.objects.select_related('cliente').order_by('-id')[:5]

    return Response({
        'repuestos':      total_repuestos,
        'ventas_mes':     float(ventas_mes),
        'clientes':       total_clientes,
        'leads_activos':  leads_activos,
        'ultimas_ventas': [
            {'id': v.id, 'cliente': v.cliente.nombre, 'fecha': str(v.fecha), 'total': float(v.total)}
            for v in ultimas_ventas
        ],
    })


# ─────────────────────────────────────────────
#  INVENTARIO
# ─────────────────────────────────────────────
@api_view(['GET'])
@permission_classes([IsAuthenticated])
@role_required(['Administrador', 'Bodeguero', 'Ventas'])
def api_inventario(request):
    productos = Producto.objects.all()
    return Response(ProductoSerializer(productos, many=True).data)


# ─────────────────────────────────────────────
#  VENTAS
# ─────────────────────────────────────────────
@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
@role_required(['Administrador', 'Ventas'])
def api_ventas(request):
    if request.method == 'GET':
        ventas = Venta.objects.select_related('cliente').order_by('-id')[:50]
        return Response(VentaListSerializer(ventas, many=True).data)

    serializer = VentaCreateSerializer(data=request.data, context={'request': request})
    if serializer.is_valid():
        try:
            venta = serializer.save()
            return Response({'success': True, 'venta_id': venta.id}, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    return Response({'error': str(serializer.errors)}, status=status.HTTP_400_BAD_REQUEST)


# ─────────────────────────────────────────────
#  COMPRAS
# ─────────────────────────────────────────────
@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
@role_required(['Administrador', 'Bodeguero'])
def api_compras(request):
    if request.method == 'GET':
        compras = Compra.objects.select_related('proveedor').order_by('-id')[:50]
        return Response(CompraListSerializer(compras, many=True).data)

    serializer = CompraCreateSerializer(data=request.data)
    if serializer.is_valid():
        try:
            compra = serializer.save()
            return Response({'success': True, 'compra_id': compra.id}, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    return Response({'error': str(serializer.errors)}, status=status.HTTP_400_BAD_REQUEST)


# ─────────────────────────────────────────────
#  CRM
# ─────────────────────────────────────────────
@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
@role_required(['Administrador', 'Ventas'])
def api_crm(request):
    if request.method == 'GET':
        leads = CRMLead.objects.select_related('cliente').order_by('-id')
        return Response(CRMLeadSerializer(leads, many=True).data)

    serializer = CRMLeadSerializer(data=request.data)
    if serializer.is_valid():
        lead = serializer.save()
        return Response({'success': True, 'lead_id': lead.id}, status=status.HTTP_201_CREATED)
    return Response({'error': str(serializer.errors)}, status=status.HTTP_400_BAD_REQUEST)


# ─────────────────────────────────────────────
#  CONTABILIDAD
# ─────────────────────────────────────────────
@api_view(['GET'])
@permission_classes([IsAuthenticated])
@role_required(['Administrador', 'Contador'])
def api_contabilidad(request):
    from datetime import date
    primer_dia = date.today().replace(day=1)
    ingresos = Venta.objects.filter(fecha__gte=primer_dia).aggregate(s=Sum('total'))['s'] or 0
    gastos   = Compra.objects.filter(fecha__gte=primer_dia).aggregate(s=Sum('total'))['s'] or 0
    return Response({
        'ingresos': float(ingresos),
        'gastos':   float(gastos),
        'balance':  float(ingresos) - float(gastos),
    })


# ─────────────────────────────────────────────
#  CLIENTES
# ─────────────────────────────────────────────
@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
@role_required(['Administrador', 'Ventas'])
def api_clientes(request):
    if request.method == 'GET':
        return Response(ClienteSerializer(Cliente.objects.all(), many=True).data)
    s = ClienteSerializer(data=request.data)
    if s.is_valid():
        obj = s.save()
        return Response({'success': True, 'id': obj.id}, status=status.HTTP_201_CREATED)
    return Response({'error': str(s.errors)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
@role_required(['Administrador', 'Ventas'])
def api_cliente_detail(request, pk):
    try:
        obj = Cliente.objects.get(pk=pk)
    except Cliente.DoesNotExist:
        return Response({'error': 'Cliente no encontrado.'}, status=404)

    if request.method == 'GET':
        return Response(ClienteSerializer(obj).data)
    elif request.method == 'PUT':
        s = ClienteSerializer(obj, data=request.data, partial=True)
        if s.is_valid():
            s.save()
            return Response({'success': True})
        return Response({'error': str(s.errors)}, status=400)
    elif request.method == 'DELETE':
        try:
            obj.delete()
            return Response({'success': True})
        except Exception:
            return Response({'error': 'No se puede eliminar: el cliente tiene registros asociados.'}, status=400)


# ─────────────────────────────────────────────
#  PROVEEDORES (mismos clientes)
# ─────────────────────────────────────────────
@api_view(['GET'])
@permission_classes([IsAuthenticated])
@role_required(['Administrador', 'Bodeguero'])
def api_proveedores(request):
    return Response(ClienteSerializer(Cliente.objects.all(), many=True).data)


# ─────────────────────────────────────────────
#  PRODUCTOS
# ─────────────────────────────────────────────
@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
@role_required({
    'GET': ['Administrador', 'Bodeguero', 'Ventas'],
    'POST': ['Administrador', 'Bodeguero']
})
def api_productos(request):
    if request.method == 'GET':
        return Response(ProductoSerializer(Producto.objects.all(), many=True).data)
    s = ProductoSerializer(data=request.data)
    if s.is_valid():
        obj = s.save()
        return Response({'success': True, 'id': obj.id}, status=status.HTTP_201_CREATED)
    return Response({'error': str(s.errors)}, status=400)


@api_view(['GET', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
@role_required({
    'GET': ['Administrador', 'Bodeguero', 'Ventas'],
    'PUT': ['Administrador', 'Bodeguero'],
    'DELETE': ['Administrador', 'Bodeguero']
})
def api_producto_detail(request, pk):
    try:
        obj = Producto.objects.get(pk=pk)
    except Producto.DoesNotExist:
        return Response({'error': 'Producto no encontrado.'}, status=404)

    if request.method == 'GET':
        return Response(ProductoSerializer(obj).data)
    elif request.method == 'PUT':
        s = ProductoSerializer(obj, data=request.data, partial=True)
        if s.is_valid():
            s.save()
            return Response({'success': True})
        return Response({'error': str(s.errors)}, status=400)
    elif request.method == 'DELETE':
        try:
            obj.delete()
            return Response({'success': True})
        except Exception:
            return Response({'error': 'No se puede eliminar: el producto tiene registros asociados.'}, status=400)


# ─────────────────────────────────────────────
#  USUARIOS
# ─────────────────────────────────────────────
@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
@role_required(['Administrador'])
def api_usuarios(request):
    if request.method == 'GET':
        users = User.objects.all().order_by('id')
        data = []
        for u in users:
            grupos = list(u.groups.values_list('name', flat=True))
            data.append({
                'id': u.id,
                'nombre': u.get_full_name() or u.username,
                'email': u.email,
                'rol': grupos[0] if grupos else ('Administrador' if u.is_superuser else 'Sin rol'),
                'activo': u.is_active,
                'fecha_creacion': u.date_joined.isoformat(),
            })
        return Response(data)

    # POST — Crear nuevo usuario
    data = request.data
    nombre   = data.get('nombre', '').strip()
    email    = data.get('email', '').strip()
    rol      = data.get('rol', 'Ventas')
    password = data.get('password', 'mkparts2026')  # default password

    if not nombre or not email:
        return Response({'error': 'Nombre y correo son requeridos.'}, status=400)

    # Generar username desde email
    username = email.split('@')[0]
    base_username = username
    counter = 1
    while User.objects.filter(username=username).exists():
        username = f"{base_username}{counter}"
        counter += 1

    if User.objects.filter(email=email).exists():
        return Response({'error': 'Ya existe un usuario con ese correo electrónico.'}, status=400)

    try:
        partes = nombre.split(' ', 1)
        first_name = partes[0]
        last_name  = partes[1] if len(partes) > 1 else ''

        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name,
        )
        # Asignar grupo/rol
        grupo, _ = Group.objects.get_or_create(name=rol)
        user.groups.add(grupo)

        return Response({'success': True, 'id': user.id, 'username': username}, status=201)
    except Exception as e:
        return Response({'error': str(e)}, status=400)


@api_view(['PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
@role_required(['Administrador'])
def api_usuario_detail(request, pk):
    try:
        user = User.objects.get(pk=pk)
    except User.DoesNotExist:
        return Response({'error': 'Usuario no encontrado.'}, status=404)

    if request.method == 'PUT':
        data   = request.data
        nombre = data.get('nombre', user.get_full_name())
        rol    = data.get('rol')
        activo = data.get('activo', user.is_active)

        partes = nombre.split(' ', 1)
        user.first_name = partes[0]
        user.last_name  = partes[1] if len(partes) > 1 else ''
        user.is_active  = activo
        user.save()

        if rol:
            user.groups.clear()
            grupo, _ = Group.objects.get_or_create(name=rol)
            user.groups.add(grupo)

        return Response({'success': True})

    elif request.method == 'DELETE':
        # Soft delete: desactivar
        user.is_active = False
        user.save()
        return Response({'success': True})


# ─────────────────────────────────────────────
#  ROLES
# ─────────────────────────────────────────────
@api_view(['GET'])
@permission_classes([IsAuthenticated])
@role_required(['Administrador'])
def api_roles(request):
    return Response([
        {'nombre': 'Administrador', 'permisos': ['dashboard','ventas','inventario','compras','crm','contabilidad','sistema']},
        {'nombre': 'Ventas',        'permisos': ['dashboard','ventas','crm']},
        {'nombre': 'Bodeguero',     'permisos': ['dashboard','inventario','compras']},
        {'nombre': 'Contador',      'permisos': ['dashboard','contabilidad']},
        {'nombre': 'Solo Lectura',  'permisos': ['dashboard']},
    ])


# Endpoint de clientes para datos maestros (incluye todos los campos)
@api_view(['GET'])
@permission_classes([IsAuthenticated])
@role_required(['Administrador'])
def api_clientes_maestro(request):
    return Response(ClienteSerializer(Cliente.objects.all(), many=True).data)


# ====== EJECUCIÓN RPA ======
@api_view(['POST'])
@permission_classes([IsAuthenticated])
@role_required(['Administrador', 'Ventas'])
def api_run_rpa(request):
    import subprocess
    import os
    from django.conf import settings
    try:
        script_path = os.path.join(settings.BASE_DIR, 'automatizacion_rpa.py')
        
        # Obtener el proceso seleccionado desde el cuerpo de la petición POST
        selected_proc = request.data.get('process', 'all')
        
        # Determinar el argumento correspondiente para el script Python
        if selected_proc == '1':
            flag = '--proceso1'
        elif selected_proc == '2':
            flag = '--proceso2'
        elif selected_proc == '3':
            flag = '--proceso3'
        else:
            flag = '--batch'
            
        # Ejecutar en segundo plano con el parámetro dinámico
        process = subprocess.Popen(
            ['python', script_path, flag],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding='utf-8'
        )
        stdout, stderr = process.communicate()
        
        if process.returncode == 0:
            # Detectar y extraer archivos generados desde el terminal (stdout)
            generated_files = []
            for line in stdout.split('\n'):
                if "EXCEL GENERADO:" in line:
                    parts = line.split("EXCEL GENERADO:")
                    if len(parts) > 1:
                        filepath = parts[1].strip()
                        filename = os.path.basename(filepath)
                        generated_files.append({
                            'type': 'excel',
                            'name': filename
                        })
                elif "ALERTA GENERADA:" in line:
                    parts = line.split("ALERTA GENERADA:")
                    if len(parts) > 1:
                        filepath = parts[1].strip()
                        filename = os.path.basename(filepath)
                        generated_files.append({
                            'type': 'txt',
                            'name': filename
                        })
                        
            return Response({
                'success': True,
                'message': 'RPA ejecutado exitosamente en el servidor.',
                'stdout': stdout,
                'files': generated_files
            })
        else:
            return Response({
                'success': False,
                'error': stderr or stdout or 'Código de salida fallido del bot RPA.'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
    except Exception as e:
        return Response({
            'success': False,
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ====== DESCARGAR REPORTE RPA ======
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_download_report(request):
    import os
    from django.conf import settings
    from django.http import FileResponse, Http404
    
    filename = request.GET.get('file', '')
    if not filename:
        return Response({'error': 'Nombre de archivo requerido.'}, status=400)
        
    # Seguridad: prevenir Directory Traversal usando basename
    filename = os.path.basename(filename)
    file_path = os.path.join(settings.BASE_DIR, 'reportes', filename)
    
    if os.path.exists(file_path):
        response = FileResponse(open(file_path, 'rb'), as_attachment=True, filename=filename)
        return response
    else:
        raise Http404("El reporte solicitado no existe en el servidor.")
