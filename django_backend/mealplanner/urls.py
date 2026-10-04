from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("django/admin/", admin.site.urls),
    path("django/", include("core.urls")),
    path("django/accounts/", include("accounts.urls")),
]
