# Productivity Tracker

A full-stack productivity management app that combines task tracking, habit building, focus sessions, and analytics into one platform — with custom-built scoring algorithms to measure real productivity and focus over time.

🔗 **Live Demo:** [shyam-productivity-tracker.netlify.app](https://shyam-productivity-tracker.netlify.app/) *(hosted on free tier — first load may take ~30s to wake the server)*

---

## Features

- **Task Management** — create, complete, and delete tasks with priority levels and due dates; automatically sorted by due date (earliest first, undated tasks last)
- **Habit Tracking** — daily habit completion with automatic streak counting and longest-streak record
- **Pomodoro Timer** — customizable focus sessions with pause/reset, completion celebration modal, and optional sound alerts
- **Distraction Tracking** — automatic tab-switch detection during active sessions, plus manual distraction logging
- **Analytics Dashboard** — daily, weekly, and monthly views with:
  - Productivity Score and Focus Score (custom weighted algorithms)
  - Interactive Chart.js graphs for score trends, focus minutes, and distractions
  - GitHub-style consistency heatmap
- **Notes** — quick note-taking with title/content, saved per user
- **Calendar View** — visual overview of tasks and habit completions by date
- **Authentication** — secure JWT-based login/signup with hashed passwords
- **Dark/Light Theme** — toggle with persistent preference

---

## Tech Stack

**Backend**
- Node.js + Express.js
- MongoDB with Mongoose ODM
- JWT authentication + bcrypt password hashing

**Frontend**
- Vanilla JavaScript (no framework)
- HTML5 / CSS3
- Chart.js for data visualization

**Deployment**
- Backend: [Render](https://render.com)
- Frontend: [Netlify](https://netlify.com)
- Database: [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)

---

## Scoring System

The app calculates two core metrics using normalized, weighted formulas:

**Productivity Score**
```
productivityScore = (0.4 × taskScore + 0.3 × focusTimeScore + 0.2 × habitScore + 0.1 × distractionScore) × 100
```

**Focus Score**
```
focusScore = (0.6 × avgDistractionScore + 0.4 × sessionCompletionRate) × 100
```

Both scores are clamped between 0–100, with proper handling for new users (no data = 0%, not a misleading default value), division-by-zero cases, and NaN propagation.

---

## Project Structure

```
productivity-saas/
├── server/
│   ├── models/        # Mongoose schemas (User, Task, Habit, FocusSession, Distraction, DailyStats, Note)
│   ├── routes/         # Express route handlers
│   ├── middleware/     # JWT auth middleware
│   ├── server.js
│   └── .env
└── client/
    └── index.html       # Single-page frontend
```

---

## Running Locally

**Backend**
```bash
cd productivity-saas/server
npm install
npm run dev
```

Create a `.env` file in `server/`:
```
MONGODB_URI=mongodb://localhost:27017/productivity-tracker
JWT_SECRET=your_secret_key
PORT=5000
```

**Frontend**
```bash
cd productivity-saas/client
python -m http.server 5500
```

Open `http://localhost:5500` in your browser.

---

## Author

**Shyamcharan Bharathi**

---

## AWS Deployment

The app also runs fully on AWS (region ap-south-1), defined as code in `productivity-saas/deploy/`.

```
Browser -> Elastic IP :80 -> EC2 t3.micro (nginx -> Node/Express on :3000) -> MongoDB Atlas
                                   |
                         SSM Parameter Store (secrets) via IAM role
```

What was built and why:

- **CloudFormation** (`deploy/cloudformation-ec2.yaml`): one template creates and updates everything, so the setup is repeatable and changes can be previewed.
- **VPC, subnet, internet gateway, route table**: a dedicated network, since the account had no default VPC.
- **EC2 t3.micro (Amazon Linux 2023)**: the API is a long-running Express server with a persistent database connection, which suits a server better than Lambda. cloud-init installs Node 20, nginx and the app on first boot.
- **nginx**: serves the static client and proxies `/api` to Node on a private port, so the site and API share one origin (no CORS).
- **Elastic IP**: a fixed address, needed because MongoDB Atlas only accepts allowlisted IPs.
- **Security group**: only TCP 80 is open and there is no SSH; admin access is through Session Manager.
- **SSM Parameter Store + IAM role**: the MongoDB URI and JWT secret are encrypted SecureStrings; the instance role can read only those two parameters, so no secrets live in the repo or on disk in plain text.
- **IMDSv2 required** and **systemd** with `Restart=always` for hardening and self-restart.
- **Monitoring**: CloudWatch alarms (auto-recover on host failure, reboot on OS failure, high CPU), an SNS email topic and a CloudWatch dashboard.

Full explanation, design decisions, redeploy steps, security notes and future work: [`productivity-saas/deploy/AWS_DEPLOYMENT.md`](productivity-saas/deploy/AWS_DEPLOYMENT.md). A high level slide deck is in `productivity-saas/deploy/productivity-tracker-aws.pptx`.

Files in `deploy/`: `cloudformation-ec2.yaml` (deployed stack), `cloudformation.yaml` (S3 + CloudFront variant for HTTPS once the account is verified), `deploy.sh` (CLI deploy for that variant).
