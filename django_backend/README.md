# Django Backend Scaffold

This directory adds Django alongside the existing FastAPI backend.

## Important

- Existing `main.py` FastAPI code is unchanged.
- Existing `frontend/` files are unchanged.
- Django currently uses its own URL prefix: `/django/`.
- Django defaults to SQLite so running migrations cannot alter the existing PostgreSQL schema.
- PostgreSQL can be enabled later with environment variables.

## Setup

From the repository root:

```bash
python3 -m venv django_backend/.venv
source django_backend/.venv/bin/activate
pip install -r requirements-django.txt
cd django_backend
python3 manage.py migrate
python3 manage.py runserver 127.0.0.1:8001
```

Then test:

```text
http://127.0.0.1:8001/django/health/
http://127.0.0.1:8001/django/accounts/status/
```

The existing FastAPI backend can continue running separately on its own port.

## Future user-management work

The `accounts` app is reserved for the Sprint 2 user-management implementation:
registration, login, logout, session handling, and role management.

Do not change the existing frontend API calls until the team decides which backend
should own each route.
