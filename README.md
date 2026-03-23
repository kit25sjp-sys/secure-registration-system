# 🔒 SecureReg – Secure Web-Based Registration System by Sujan poudel

A full-stack, security-hardened user registration platform built with **Node.js**, **Express**, and **SQLite**.  
Implements all controls described in the System Design & Required Security Enhancements documentation.

---

## 📋 Features

| Section | Feature | Implementation |
|---------|---------|---------------|
| 2.1 | Registration UI | HTML5 + CSS3 + vanilla JS |
| 2.2 | Password Strength Evaluation | Real-time graphical meter (4 levels) |
| 2.3 | CAPTCHA Bot Prevention | Server-generated SVG math challenge |
| 2.4 | Secure Password Handling | bcrypt (cost 12), never stored in plain text |
| 2.5 | XSS / SQLi / CSRF Protection | Helmet, express-validator, parameterised queries |
| 3.1 | Email Verification System | UUID token, 24-hour expiry, nodemailer |
| 3.2 | Password Reuse Prevention | Last 5 hashed passwords checked |
| 3.3 | Rate Limiting | express-rate-limit (per-IP per endpoint) |
| 3.4 | Graphical Password Strength Meter | 4-segment animated bar + checklist |
| 3.5 | Administrative Monitoring Panel | JWT-protected dashboard + full user CRUD |

---

## 🗂️ Project Structure

```
system/
├── server.js                  ← Express entry point
├── package.json
├── .env.example               ← Environment variable template
│
├── database/
│   └── db.js                  ← SQLite schema & seed (better-sqlite3)
│
├── routes/
│   ├── auth.js                ← /api/auth/* (register, login, verify-email, check-password, captcha)
│   └── admin.js               ← /api/admin/* (JWT-protected CRUD)
│
├── middleware/
│   ├── rateLimiter.js         ← express-rate-limit configuration
│   └── adminAuth.js           ← JWT verification middleware
│
├── utils/
│   ├── passwordUtils.js       ← Strength scoring + reuse check
│   └── emailService.js        ← nodemailer (Ethereal demo or real SMTP)
│
└── public/                    ← Static frontend
    ├── index.html             ← Registration page
    ├── login.html             ← Login page
    ├── verify-email.html      ← Email verification landing
    ├── admin.html             ← Admin monitoring panel
    ├── css/styles.css
    └── js/
        ├── register.js
        ├── login.js
        └── admin.js
```

---

## 🚀 Quick Start

### 1. Install dependencies

```bash
cd "c:\Users\Acer\OneDrive\Desktop\system"
npm install
```

### 2. Configure environment

```bash
copy .env.example .env
```

Edit `.env` if needed (email SMTP, secrets, etc.).  
Leave `EMAIL_HOST` blank to use **Ethereal** (free fake SMTP — email preview URLs are printed to the console).

### 3. Start the server

```bash
npm start
```

Development (auto-restart):

```bash
npm run dev
```

### 4. Open in browser

| Page | URL |
|------|-----|
| Registration | http://localhost:3000 |
| Login | http://localhost:3000/login |
| Email Verification | http://localhost:3000/verify-email?token=… |
| Admin Panel | http://localhost:3000/admin |

---

## 🔑 Default Credentials

| Role | Username | Password |
|------|----------|----------|
| Admin | `Admin12` | `123456` |

> Change this immediately in any real deployment.

---

## 🔐 Security Architecture

### Password Hashing
Passwords are hashed with **bcrypt** at cost factor **12** before storage.  
Plain-text passwords are never written to disk or logs.

### CAPTCHA
A server-side SVG math challenge (addition / subtraction / multiplication) is generated per session.  
The answer is stored server-side in an express-session — the client never receives the answer.

### Rate Limiting
| Endpoint | Limit | Window |
|----------|-------|--------|
| `POST /api/auth/register` | 5 requests | 15 min |
| `POST /api/auth/login`    | 10 requests | 15 min |
| `GET /api/auth/captcha`   | 30 requests | 5 min  |

### Account Lockout
After **5 consecutive failed logins**, the account is locked for **15 minutes**.  
The event is recorded in the `suspicious_activities` table and visible in the admin panel.

### SQL Injection Prevention
All database queries use **prepared statements** via `better-sqlite3`.  
No string interpolation is used in SQL queries.

### XSS Prevention
- `helmet` sets strict `Content-Security-Policy` headers.
- `express-validator` sanitises all user inputs.
- All values rendered in the admin panel are HTML-escaped.

### Email Verification
A UUID v4 token is generated at registration and emailed to the user.  
The token expires after **24 hours** and is invalidated on first use.

### Password Reuse Prevention
The last **5** password hashes are stored in `password_history`.  
Any update that matches a previous hash is rejected.

---

## 🗄️ Database Schema

```sql
users               -- registered accounts
password_history    -- last 5 hashes per user (reuse prevention)
admins              -- admin accounts
login_attempts      -- every login attempt (email, IP, success, timestamp)
suspicious_activities -- CAPTCHA failures, lockout events
```

---

## 📧 Email in Demo Mode

When `EMAIL_HOST` is not set, nodemailer auto-creates an **Ethereal** test account.  
The console will print a preview URL like:

```
📧  Email preview (Ethereal): https://ethereal.email/message/...
```

Open that URL to see the verification email without configuring a real mail server.

Additionally, the registration API response includes `verificationToken` in non-production mode so you can click directly from the success screen.

---

## 🛠️ Production Checklist

- [ ] Set strong `SESSION_SECRET` and `JWT_SECRET` in `.env`
- [ ] Set `NODE_ENV=production`
- [ ] Configure real SMTP credentials
- [ ] Change default admin password
- [ ] Place behind HTTPS (nginx / Caddy reverse proxy)
- [ ] Enable `cookie.secure = true` (requires HTTPS)
