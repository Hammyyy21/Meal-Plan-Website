# 🍽️ Meal Plan Website

A full-stack web application designed to simplify meal planning, recipe organization, and grocery management. This project was developed as part of a Software Engineering course to demonstrate web development, database management, and collaborative software engineering.

## 📌 Overview

The Meal Plan Website provides a centralized platform for organizing meals and managing food-related information. Built with a Django backend and a dedicated frontend, the application combines database integration with web technologies to deliver a structured meal-planning experience.

## ✨ Features

- **Meal Planning:** Organize meals and create structured meal plans.
- **Recipe Management:** Manage and organize recipes.
- **Grocery Management:** Support grocery-related functionality.
- **Meal Recommendations:** Provide a foundation for meal recommendation features.
- **Database Integration:** Store and manage application data using a relational database.
- **Backend API:** Use Django-based backend functionality to support the frontend.
- **Collaborative Development:** Developed using Git and GitHub for source control and team collaboration.

*Note: Available features depend on the current implementation of the application.*

## 🛠️ Technologies Used

- **Python** — Backend programming
- **Django** — Backend web framework
- **Django REST Framework** — API development
- **PostgreSQL** — Relational database management
- **SQL** — Database schema management and migrations
- **HTML, CSS, JavaScript** — Frontend development, where applicable
- **Git & GitHub** — Version control and collaboration

## 📂 Project Structure

```text
Meal-Plan-Website/
├── django_backend/                 # Django backend
├── frontend/                       # Frontend application
├── main.py                         # Python entry point
├── requirements.txt                # Python dependencies
├── requirements-django.txt         # Django dependencies
├── schema.sql                      # Database schema
├── schema_v3.sql                   # Updated database schema
├── grocery_migration.sql           # Grocery database migration
├── recommendations_migration.sql   # Recommendation migration
├── reset_dev.sql                   # Development database reset
├── setup_db.py                     # Database setup utility
├── seed_demo.py                    # Demo data initialization
├── verify_demo.py                  # Demo environment verification
└── README.md                       # Project documentation
```

## 🚀 Getting Started

### Prerequisites

Before running the application, make sure you have installed:

- Python
- pip
- PostgreSQL
- Git
- Node.js and npm, if required by the frontend

### Installation

**1. Clone the repository**

```bash
git clone https://github.com/Hammyyy21/Meal-Plan-Website.git
```

**2. Navigate to the project directory**

```bash
cd Meal-Plan-Website
```

**3. Create and activate a virtual environment**

Windows:

```bash
python -m venv venv
venv\Scripts\activate
```

macOS/Linux:

```bash
python3 -m venv venv
source venv/bin/activate
```

**4. Install Python dependencies**

```bash
pip install -r requirements-django.txt
```

If additional dependencies are required, install those listed in `requirements.txt` as well.

### Database Configuration

1. Make sure PostgreSQL is installed and running.
2. Configure the database connection according to the backend settings.
3. Review the provided SQL schema and migration files.
4. Initialize the database using the project's setup instructions.

Do not commit database passwords, API keys, or other sensitive credentials to GitHub.

### Running the Application

Navigate to the Django backend directory:

```bash
cd django_backend
```

If the Django project's `manage.py` file is located in this directory, apply database migrations:

```bash
python manage.py migrate
```

Start the development server:

```bash
python manage.py runserver
```

The backend will typically be available at:

`http://127.0.0.1:8000/`

If the frontend uses npm, open another terminal and navigate to its directory:

```bash
cd frontend
npm install
npm run dev
```

The exact commands may vary depending on the project's configuration.

## 🗄️ Database Management

The repository includes database-related files for schema management, migrations, and development setup.

- `schema.sql` — Initial database schema.
- `schema_v3.sql` — Updated database schema.
- `grocery_migration.sql` — Grocery-related database changes.
- `recommendations_migration.sql` — Recommendation-related database changes.
- `setup_db.py` — Database setup utility.
- `seed_demo.py` — Demo data initialization.
- `verify_demo.py` — Demo environment verification.

Review SQL scripts before executing them, especially scripts designed to reset development data.

## 🎓 Project Purpose

This project was developed as part of a Software Engineering course to apply practical skills in:

- Full-stack web application development
- Backend development with Python and Django
- Relational database design and management
- API integration
- Git-based version control
- Team collaboration and software project organization

## 🔮 Future Improvements

Potential improvements include:

- Personalized meal recommendations
- Nutrition and calorie tracking
- Improved recipe search and filtering
- Weekly meal-plan customization
- Enhanced grocery list management
- Responsive design for mobile devices
- Automated testing and improved error handling
- Additional security and performance improvements

## 👨‍💻 Repository

**GitHub:** https://github.com/Hammyyy21/Meal-Plan-Website

## 📄 License

No license information is specified here. Refer to the repository for licensing details.
