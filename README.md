# Dayflow 🌊 — Enterprise HR Management System

**Dayflow is a modern, full-stack HR management system designed to streamline employee operations, attendance monitoring, and administrative workflows in one place.**

Built with an **Employee Portal**, **HR Admin Hub**, and a **Node.js/Express/PostgreSQL** backend with JWT authentication and Role-Based Access Control (RBAC).

---

## ✨ Core Features

### 👤 Employee Portal (`employee_dashboard.html`)
* **Live Shift Management**: Real-time shift clock-in and clock-out with automatic work hours and overtime calculations.
* **Attendance History**: View past shift punch logs and compliance metrics.
* **Leave Management**: Submit leave requests (Annual, Sick, Casual) with automatic day duration calculations.
* **Leave Balance & Status**: Real-time tracking of remaining allowance and approval queue status.
* **Profile & Compensation**: Dynamic job details, department info, and payslip history.

### 🧑‍💼 HR / Admin Hub (`admin_panel.html`)
* **Executive Overview**: Real-time workforce metrics (Total Headcount, Present Today, Pending Leaves).
* **Employee Directory**: Searchable directory across name, email, department, job position, and system Login ID.
* **Leave Approval Engine**: Review pending leave justifications with one-click **Approve** and **Reject** actions.
* **Live Attendance Monitor**: Real-time monitor of today's employee arrivals (On-Time, Late, Absent, Completed).
* **Employee Registration Modal**: Add new hires with automated company `login_id` (e.g. `OIJODO20260001`) and temporary password generation.

---

## 🛠️ Tech Stack

* **Frontend**: HTML5, CSS3, JavaScript (ES6+), Tailwind CSS, Lucide Icons
* **Backend**: Node.js, Express.js, JWT (`jsonwebtoken`), Password Hashing (`bcryptjs`), CORS, dotenv
* **Database**: PostgreSQL (`pg` connection pool with automatic table schema creation)

---

## 📂 Project Structure

```text
dayflow/
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── authController.js        # Signin (email/login_id), Signup, Profile /me
│   │   │   ├── employeeController.js    # Directory listing, stats, register employee
│   │   │   ├── attendanceController.js  # Live shift clock-in/out, today status, history
│   │   │   └── leaveController.js       # Submit leave, get my leaves, approve/reject
│   │   ├── middleware/
│   │   │   └── auth.js                  # JWT verification & Role-Based Access Control
│   │   ├── routes/
│   │   │   ├── authRoutes.js
│   │   │   ├── employeeRoutes.js
│   │   │   ├── attendanceRoutes.js
│   │   │   └── leaveRoutes.js
│   │   ├── services/
│   │   │   └── employeeService.js       # Automated Login ID & Temp Password generation
│   │   ├── db.js                        # PostgreSQL connection pool
│   │   ├── seed.js                      # Automated demo database seeder
│   │   └── server.js                    # Express app & schema auto-initialization
│   ├── .env.example
│   ├── .env
│   └── package.json
│
├── login_page.html                      # Sign-in portal with role redirection
├── employee_dashboard.html              # Full Employee portal (live API connected)
├── admin_panel.html                     # Full HR Admin portal (live API connected)
└── README.md
```

---

## 🚀 Getting Started

### 1. Configure the Backend

```bash
cd backend
npm install
```

Ensure PostgreSQL is running and configure `backend/.env` with your database connection URL:

```env
PORT=5000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dayflow_db
JWT_SECRET=dayflow_super_secret_jwt_key_2026
```

### 2. Seed Demo Data

Run the database seed script to populate sample accounts, team members, attendance, and leave records:

```bash
npm run seed
```

### 3. Start the Server

```bash
npm start
```
The API server will start on `http://localhost:5000`.

### 4. Launch the Web App

Open `login_page.html` in your web browser (or use VS Code Live Server).

---

## 🔑 Demo Credentials

| Role | Email / Login ID | Password | Access Portal |
| :--- | :--- | :--- | :--- |
| **HR Administrator** | `alex.morgan@dayflow.com` (or `ADM-2026-001`) | `admin123` | `admin_panel.html` |
| **Employee** | `marcus.t@dayflow.com` (or `EMP-8842`) | `password123` | `employee_dashboard.html` |

---

## 🏆 Hackathon 2026

Dayflow was developed for Hackathon 2026 to simplify daily HR operations and provide a seamless, interconnected experience for both employees and HR leaders.
