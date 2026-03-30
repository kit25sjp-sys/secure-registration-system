# SecureReg - Feature List

## 🔐 Authentication & Authorization

### User Registration
- [Email and username validation](routes/auth.js) with server-side checks
- [Duplicate account prevention](routes/auth.js) - prevents multiple registrations with same email/username
- [Password strength validation](utils/passwordUtils.js) with requirements:
  - Minimum 8 characters
  - At least one uppercase letter
  - At least one lowercase letter
  - At least one number
  - At least one special character
  - Blocks common passwords (password, 123456, qwerty, etc.)
  - Prevents sequential patterns and character repetition
- [Google reCAPTCHA v2](routes/auth.js) integration for bot prevention
- [OTP email verification](routes/auth.js) - sends one-time password to confirm email ownership
- [Real-time validation feedback](public/js/register.js) with visual indicators (✓ success / ✗ error)

### Login & Authentication
- [Email/Username login](routes/auth.js) - users can login with either
- [Password verification](routes/auth.js) using [bcryptjs](utils/passwordUtils.js) (cost factor 12)
- [Multi-factor authentication (OTP)](routes/auth.js) - mandatory OTP challenge after password success
- [OTP resend functionality](routes/auth.js) with rate limiting
- [OTP expiration](routes/auth.js) - time-limited tokens (configurable)
- [Session-based authentication](server.js) with express-session
- [HTTP-only cookies](server.js) for secure session storage
- [Login attempt tracking](routes/auth.js) with IP logging
- [Suspicious activity detection](routes/auth.js) and logging

### Account Security
- [Account lockout policy](routes/auth.js) - temporary lockout after failed login attempts
- [Rate limiting](middleware/rateLimiter.js) on login endpoints (5 attempts per 15 minutes per IP)
- [Password change functionality](routes/auth.js) with current password verification
- [Password reuse prevention](utils/passwordUtils.js) - last 5 passwords are blocked
- [Device/session management](public/js/session-manager.js) - multiple concurrent sessions supported
- [Session expiration](server.js) - automatic timeout on inactivity

---

## 📊 Role-Based Access Control (RBAC)

### User Roles
1. **Standard User**
   - Access to [registration](public/index.html) and [login](public/login.html)
   - [Dashboard access](public/dashboard.html)
   - [Can change password](public/change-password.html)
   - View own profile

2. **Moderator / Manager**
   - All user features
   - [Read-only access to user statistics](routes/editor.js)
   - [View user list (limited data)](routes/editor.js)
   - Monitor login attempts
   - [Access to editor panel](public/editor.html)

3. **Admin**
   - Full administrative access
   - [User management (activate/deactivate/delete)](routes/admin.js)
   - [Change user roles](routes/admin.js)
   - [View comprehensive statistics](routes/admin.js)
   - [View login attempts and suspicious activity](routes/admin.js)
   - [Admin dashboard with full monitoring](public/admin.html)

---

## 📧 Email Features

### Email Services
- [Gmail SMTP integration](utils/emailService.js) using nodemailer
- [Email verification](routes/auth.js) for new registrations
- [OTP delivery](utils/emailService.js) via email
- [Password reset emails](routes/auth.js) (if feature enabled)
- [Customizable email templates](utils/emailService.js) with sender information
- [Error handling](utils/emailService.js) for failed email delivery

---

## 🛡️ Security Features

### Data Protection
- [Password hashing](utils/passwordUtils.js) with bcryptjs (cost 12) - industry standard
- [SQL injection prevention](database/db.js) using prepared statements
- [Input validation and sanitization](routes/auth.js) via express-validator
- [XSS protection](server.js) via Helmet security headers
- [CSRF protection](server.js) via Helmet Content Security Policy
- [CORS configuration](server.js) for cross-origin requests
- [SQL parameterized queries](database/db.js) throughout application

### Rate Limiting
- [Registration rate limiting](middleware/rateLimiter.js) - prevent brute-force registrations
- [Login rate limiting](middleware/rateLimiter.js) - prevent brute-force attacks
- [OTP verification rate limiting](middleware/rateLimiter.js) - prevent guessing attacks
- [OTP resend rate limiting](middleware/rateLimiter.js) - prevent abuse
- [IP-based throttling](middleware/rateLimiter.js) - track and limit per IP address

### Monitoring & Logging
- [Login attempt tracking](routes/auth.js) with success/failure status
- [Failed login logging](routes/auth.js) with IP, email, timestamp
- [Suspicious activity detection](routes/auth.js) (multiple failed attempts)
- [Admin dashboard statistics](routes/admin.js) - user metrics and analytics
- [Activity timestamps](database/db.js) for all critical operations

---

## 🎨 Frontend Features

### User Interface
- [Responsive design](public/css/styles.css) - works on desktop and mobile
- [Real-time password strength meter](public/js/register.js) with visual feedback
- [Form validation feedback](public/js/register.js) with error messages
- [Loading states](public/js/register.js) with spinners for async operations
- [Alert notifications](public/js/clientUtils.js) for success/error messages
- [Password visibility toggle](public/js/register.js) - show/hide password
- [Session manager](public/js/session-manager.js) for handling multiple logins

### Pages
- [Registration page](public/index.html) - create new account with validation
- [Login page](public/login.html) - authenticate with email/username
- [OTP verification page](public/otp-verify.html) - confirm email with one-time password
- [Dashboard page](public/dashboard.html) - role-specific user dashboard
- [Password change page](public/change-password.html) - update password securely
- [Admin panel](public/admin.html) - comprehensive admin management interface
- [Editor/Moderator panel](public/editor.html) - monitoring and statistics view
- [Email verification page](public/verify-email.html) - confirm email ownership

---

## 📱 Admin Features

### User Management
- [View all users](routes/admin.js) with filtering options
- [Activate/Deactivate users](routes/admin.js) - disable user accounts
- [Change user roles](routes/admin.js) - assign user/moderator/admin roles
- [Delete users](routes/admin.js) - permanently remove user accounts
- [User statistics](routes/admin.js) - total users, active users, etc.

### Analytics & Monitoring
- [Login attempt tracker](routes/admin.js) - view all login attempts
- [Suspicious activity logs](routes/admin.js) - flagged unusual login patterns
- [Failed login attempts](routes/admin.js) - monitor brute-force attacks
- [User activity timeline](routes/admin.js) - when users login/logout
- [System statistics](routes/admin.js) - overview of user engagement

### Admin Authentication
- [Dedicated admin login](routes/admin.js) - separate admin authentication
- [JWT token support](routes/admin.js) (legacy) - bearer token auth
- [Session-based admin auth](middleware/adminAuth.js) - primary authentication method
- [Admin Dashboard](public/admin.html) - centralized management interface

---

## 🗄️ Database Features

### Data Storage
- [SQLite database](database/db.js) via sql.js (WebAssembly in-memory SQLite)
- [Persistent storage](database/db.js) - database saved to disk
- [User table](database/db.js) - stores user profiles and credentials
- [Password history table](database/db.js) - tracks last 5 passwords
- [Login attempts table](database/db.js) - logs all login attempts
- [Session management](server.js) - express-session support

### Data Integrity
- [Primary keys](database/db.js) for unique identification
- [Foreign keys](database/db.js) for relationship management
- [Timestamp tracking](database/db.js) for all operations
- [Indexed queries](database/db.js) for performance
- [Transaction support](database/db.js) (via sql.js)

---

## ⚙️ Development & Configuration

### Environment Variables
- [PORT](server.js) - server port (default 3000)
- [NODE_ENV](server.js) - development/production mode
- [SESSION_SECRET](server.js) - session encryption key
- [JWT_SECRET](routes/admin.js) - JWT token signing key
- [EMAIL_USER](utils/emailService.js) - Gmail SMTP username
- [EMAIL_PASS](utils/emailService.js) - Gmail app password
- [EMAIL_FROM](utils/emailService.js) - sender email address
- [RECAPTCHA_SITE_KEY](public/index.html) - Google reCAPTCHA public key
- [RECAPTCHA_SECRET_KEY](routes/auth.js) - Google reCAPTCHA secret key
- [DEV_MODE](server.js) - accept '000000' as test OTP (development only)

### Middleware
- [Helmet](server.js) - security headers
- [CORS](server.js) - cross-origin resource sharing
- [Cookie parser](server.js) - parse cookies
- [Rate limiter](middleware/rateLimiter.js) - IP-based throttling
- [Admin auth](middleware/adminAuth.js) - protect admin routes
- [Input validation](routes/auth.js) - express-validator middleware

---

## 🚀 API Endpoints

### Authentication Routes (`/api/auth`) - [routes/auth.js](routes/auth.js)
- `POST /register` - [create new user account](routes/auth.js)
- `POST /login` - [authenticate user](routes/auth.js)
- `POST /verify-otp` - [verify OTP token](routes/auth.js)
- `POST /resend-otp` - [resend OTP email](routes/auth.js)
- `GET /me` - [get current user profile](routes/auth.js)
- `POST /logout` - [end session](routes/auth.js)
- `POST /change-password` - [update password](routes/auth.js)
- `POST /check-password` - [verify current password](routes/auth.js)

### Admin Routes (`/api/admin`) - [routes/admin.js](routes/admin.js)
- `POST /login` - [admin authentication](routes/admin.js)
- `GET /stats` - [dashboard statistics](routes/admin.js)
- `GET /users` - [list all users](routes/admin.js)
- `PATCH /users/:id/toggle` - [activate/deactivate user](routes/admin.js)
- `PATCH /users/:id/role` - [change user role](routes/admin.js)
- `DELETE /users/:id` - [delete user](routes/admin.js)
- `GET /login-attempts` - [view login attempts](routes/admin.js)
- `GET /suspicious` - [view suspicious activities](routes/admin.js)

### Moderator Routes (`/api/editor`) - [routes/editor.js](routes/editor.js)
- `GET /stats` - [view statistics](routes/editor.js)
- `GET /users` - [view user list](routes/editor.js)

---

## 🛠️ Tech Stack

| Component | Technology | Purpose | Location |
|-----------|-----------|---------|----------|
| Runtime | Node.js | Server runtime | [server.js](server.js) |
| Framework | [Express.js](server.js) | Web application framework | [server.js](server.js) |
| Database | [SQLite (sql.js)](database/db.js) | Data persistence | [database/db.js](database/db.js) |
| Authentication | [express-session](server.js) | Session management | [server.js](server.js) |
| Hashing | [bcryptjs](utils/passwordUtils.js) | Password hashing | [utils/passwordUtils.js](utils/passwordUtils.js) |
| Tokens | [jsonwebtoken](routes/admin.js) | JWT authentication | [routes/admin.js](routes/admin.js) |
| Email | [nodemailer](utils/emailService.js) | Email delivery | [utils/emailService.js](utils/emailService.js) |
| Validation | [express-validator](routes/auth.js) | Input validation | [routes/auth.js](routes/auth.js) |
| Security | [helmet](server.js) | Security headers | [server.js](server.js) |
| Rate Limiting | [express-rate-limit](middleware/rateLimiter.js) | Anti-brute-force | [middleware/rateLimiter.js](middleware/rateLimiter.js) |
| CAPTCHA | [Google reCAPTCHA v2](public/index.html) | Bot prevention | [public/index.html](public/index.html) |
| Frontend | [HTML/CSS/Vanilla JS](public/js/) | User interface | [public/](public/) |

---

## 📝 Notes

- All passwords are hashed using bcrypt with cost factor 12
- OTP tokens are cryptographically secure 6-digit codes
- Development mode allows test OTP '000000' for testing (NEVER enable in production)
- Database is recreated on each server restart (in-memory SQLite)
- All SQL queries use parameterized statements
- Helmet provides comprehensive security headers
- Rate limiting is IP-based for effective DDoS/brute-force protection
- reCAPTCHA integration requires valid Site Key and Secret Key from Google

---

**Version:** 1.0.0  
**Last Updated:** March 29, 2026
