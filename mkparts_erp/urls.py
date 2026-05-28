from django.contrib import admin
from django.urls import path, include
from django.contrib.auth import views as auth_views
from core import views as core_views

urlpatterns = [
    # ── Admin Panel ──────────────────────────────────────
    path('admin/', admin.site.urls),

    # ── Auth ─────────────────────────────────────────────
    path('login/',  core_views.login_view, name='login'),
    path('logout/', auth_views.LogoutView.as_view(), name='logout'),

    # ── ERP Principal (requiere login) ───────────────────
    path('', core_views.erp_index, name='index'),

    # ── API REST ──────────────────────────────────────────
    path('api/', include('core.urls')),
]
