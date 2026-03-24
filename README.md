# SecureReg - Secure Web Registration System

SecureReg is a full-stack authentication and user management system built with Node.js, Express, and SQLite (via sql.js).

It includes registration, CAPTCHA, OTP verification, role-based access, password history protection, login lockout, and admin/moderator management tools.

## Current Role Model

- User: Regular authenticated user
- Moderator / Manager: Elevated user with user-monitoring access
- Admin: Full administrative access

Legacy role value editor is auto-mapped to moderator for backward compatibility.

## Core Features

- User registration with server-side validation
- **Google reCAPTCHA** bot prevention on registration
- Password hashing using bcrypt (cost 12)
- OTP email verification for registration
- OTP challenge on every successful login
- Session-based authentication for app pages
- Role-based dashboard behavior
- Admin user management (activate/deactivate/delete/change role)
- Moderator read-only user and stats view
- Password change with reuse prevention (last 5 passwords blocked)
- Login attempt tracking and suspicious activity logging
- Rate limiting on sensitive endpoints

## Security Controls

- Helmet security headers
- Google reCAPTCHA anti-bot protection
- Input validation and sanitization via express-validator
- Prepared SQL statements
- Account lockout after repeated failed login attempts
- HTTP-only session cookies
- OTP anti-automation layer

## Tech Stack

- Backend: Node.js, Express
- Database: sql.js (SQLite via WebAssembly, persisted to disk)
- Auth/session: express-session
- Hashing: bcryptjs
- Validation: express-validator
- Email: nodemailer
- Frontend: HTML/CSS/Vanilla JavaScript

## Project Structure

```text
system/
  server.js
  package.json
  create-admin.js
  database/
    db.js
  middleware/
    adminAuth.js
    rateLimiter.js
  routes/
    auth.js
    admin.js
    editor.js
  utils/
    emailService.js
    passwordUtils.js
  public/
    index.html
    login.html
    otp-verify.html
    dashboard.html
    admin.html
    editor.html
    change-password.html
    css/styles.css
    js/*.js
```

## Quick Start

1. Install dependencies

```bash
cd "c:\Users\Acer\OneDrive\Desktop\system"
npm install
```

2. Configure environment

```bash
copy .env.example .env
```

3. Start server

```bash
npm start
```

4. Open app

- Registration: http://localhost:3000/
- Login: http://localhost:3000/login
- OTP Verify: http://localhost:3000/otp-verify
- Dashboard: http://localhost:3000/dashboard
- Admin panel page: http://localhost:3000/admin
- Moderator page: http://localhost:3000/editor

## Admin API Auth Notes

Admin APIs support:

- Session-based admin auth (primary in current UI flow)
- JWT bearer token auth (legacy compatibility)

## Verified Behavior (Smoke-Tested)

The following were verified during development checks:

- GET / returns 200
- reCAPTCHA widget loads on registration page
- Invalid login returns 401
- Valid password login returns needsOtp=true
- GET /api/auth/me without session returns 401

## API Overview

Auth routes:

- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/verify-otp
- POST /api/auth/resend-otp
- GET /api/auth/me
- POST /api/auth/logout
- POST /api/auth/change-password
- POST /api/auth/check-password

Admin routes:

- POST /api/admin/login
- GET /api/admin/stats
- GET /api/admin/users
- PATCH /api/admin/users/:id/toggle
- PATCH /api/admin/users/:id/role
- DELETE /api/admin/users/:id
- GET /api/admin/login-attempts
- GET /api/admin/suspicious

Moderator routes:

- GET /api/editor/stats
- GET /api/editor/users

## Notes for Production

- Set strong SESSION_SECRET and JWT_SECRET
- Update **RECAPTCHA_SITE_KEY** and **RECAPTCHA_SECRET_KEY** in .env with your Google reCAPTCHA keys
  - Get keys from: https://www.google.com/recaptcha/admin
  - Select the reCAPTCHA type you configured for your widget
  - Your domain must be authorized in Google Console
- Use HTTPS and set secure cookies
- Configure real SMTP credentials
- Rotate default credentials immediately
- Add automated tests (no formal test suite is currently configured)

## Troubleshooting

If port 3000 is busy:

```bash
npx kill-port 3000
npm start
```

If role updates fail due to stale frontend cache, hard-refresh the browser after deployment.
