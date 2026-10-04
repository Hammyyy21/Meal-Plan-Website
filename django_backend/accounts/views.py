from django.http import JsonResponse

def status(request):
    return JsonResponse({
        "module": "accounts",
        "status": "scaffolded",
        "message": "Django user-management endpoints will be added here without replacing FastAPI routes.",
    })
