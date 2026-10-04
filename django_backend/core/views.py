from django.http import JsonResponse

def health(request):
    return JsonResponse({
        "service": "meal-planner-django",
        "status": "ok",
        "frontend_affected": False,
        "fastapi_affected": False,
    })
