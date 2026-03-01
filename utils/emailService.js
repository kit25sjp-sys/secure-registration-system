const nodemailer = require('nodemailer');

/* ──────────────────────────────────────────────────────────────
   Build the Gmail SMTP transporter.
   Requires EMAIL_USER (Gmail address) and EMAIL_PASS (App Password)
   in .env.  Falls back to Ethereal if credentials are not set.

   Gmail App Password setup:
     myaccount.google.com → Security → 2-Step Verification → App passwords
     Select app: Mail  |  Select device: Other → Generate
──────────────────────────────────────────────────────────────── */
function isGmailConfigured() {
  return !!(
    process.env.EMAIL_USER &&
    process.env.EMAIL_PASS &&
    process.env.EMAIL_PASS !== 'your-16-char-app-password'
  );
}

async function createTransporter() {
  if (isGmailConfigured()) {
    /* ── Gmail SMTP via service shorthand ── */
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,   // App Password (not your login password)
      },
    });
  }

  /* ── Fallback: Ethereal (dev / demo) ── */
  console.warn('⚠️  EMAIL_PASS not set – falling back to Ethereal demo SMTP.');
  const testAccount = await nodemailer.createTestAccount();
  return nodemailer.createTransport({
    host:   'smtp.ethereal.email',
    port:   587,
    secure: false,
    auth: { user: testAccount.user, pass: testAccount.pass },
  });
}

/* ──────────────────────────────────────────────────────────────
   Send account verification email
──────────────────────────────────────────────────────────────── */
async function sendVerificationEmail(email, username, token) {
  const baseUrl         = process.env.BASE_URL || 'http://localhost:3000';
  const verificationUrl = `${baseUrl}/verify-email?token=${token}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body{font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:20px}
    .wrap{max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.12)}
    .hdr{background:linear-gradient(135deg,#6c63ff,#764ba2);padding:40px;text-align:center}
    .hdr h1{color:#fff;margin:0;font-size:26px}
    .body{padding:40px}
    .body h2{color:#333;margin-bottom:12px}
    .body p{color:#555;line-height:1.7}
    .btn{display:inline-block;background:linear-gradient(135deg,#6c63ff,#764ba2);color:#fff;text-decoration:none;padding:14px 36px;border-radius:50px;font-size:16px;font-weight:700;margin:20px 0}
    .url-box{background:#f0f0f0;border:1px solid #ddd;border-radius:6px;padding:12px;word-break:break-all;font-family:monospace;font-size:12px;color:#444}
    .warn{color:#e74c3c;margin-top:20px}
    .ftr{background:#f8f8f8;padding:20px;text-align:center;color:#aaa;font-size:12px}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hdr"><h1>🔒 SecureReg</h1></div>
    <div class="body">
      <h2>Hi ${username}, please verify your email</h2>
      <p>Thank you for registering. Click the button below to activate your account. The link expires in <strong>24 hours</strong>.</p>
      <center><a href="${verificationUrl}" class="btn">✓ Verify Email Address</a></center>
      <p>Or copy this link into your browser:</p>
      <div class="url-box">${verificationUrl}</div>
      <p class="warn"><strong>⚠️ Do not share this link with anyone.</strong></p>
      <p>If you did not create an account, you can safely ignore this email.</p>
    </div>
    <div class="ftr">© 2026 SecureReg System · Automated message, do not reply</div>
  </div>
</body>
</html>`;

  const transporter = await createTransporter();

  const info = await transporter.sendMail({
    from:    process.env.EMAIL_FROM || '"SecureReg System" <noreply@securereg.com>',
    to:      email,
    subject: 'Verify your SecureReg email address',
    html,
  });

  /* In dev/demo mode log the Ethereal preview URL */
  const preview = nodemailer.getTestMessageUrl(info);
  if (preview) {
    console.log(`📧  Email preview (Ethereal): ${preview}`);
  }

  return info;
}

/* ──────────────────────────────────────────────────────────────
   Send OTP verification email
   otp  – plain 6-digit code (only used here; never stored plain)
──────────────────────────────────────────────────────────────── */
async function sendOTPEmail(email, username, otp) {
  /* Split OTP into individual digits for visual box display */
  const digits = otp.split('').map(d =>
    `<span style="display:inline-block;width:44px;height:54px;line-height:54px;text-align:center;font-size:28px;font-weight:800;background:#f4f3ff;border:2px solid #6c63ff;border-radius:10px;color:#6c63ff;margin:0 4px">${d}</span>`
  ).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body{font-family:Arial,sans-serif;background:#f0f2f5;margin:0;padding:20px}
    .wrap{max-width:600px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 6px 28px rgba(108,99,255,.18)}
    .hdr{background:linear-gradient(135deg,#6c63ff,#764ba2);padding:36px;text-align:center}
    .hdr h1{color:#fff;margin:0;font-size:24px;letter-spacing:.5px}
    .hdr p{color:rgba(255,255,255,.85);margin:6px 0 0;font-size:14px}
    .body{padding:40px 44px}
    .body h2{color:#1a1a2e;margin-bottom:10px;font-size:20px}
    .body p{color:#555;line-height:1.7;margin-bottom:14px}
    .otp-box{background:#f9f8ff;border:1px solid #e0dcff;border-radius:12px;padding:28px 20px;text-align:center;margin:24px 0}
    .otp-label{font-size:12px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.08em;margin-bottom:14px}
    .timer{display:inline-block;background:#fff3cd;color:#856404;border:1px solid #ffeeba;border-radius:20px;padding:6px 18px;font-size:13px;font-weight:700;margin-top:14px}
    .warn{background:#fff5f5;border:1px solid #ffc5c5;border-radius:8px;padding:14px 18px;color:#c0392b;font-size:13px;margin:18px 0}
    .warn strong{display:block;margin-bottom:4px}
    .ftr{background:#f8f8f8;padding:20px;text-align:center;color:#aaa;font-size:12px;border-top:1px solid #eee}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hdr">
      <h1>🔒 SecureReg</h1>
      <p>Email Verification Code</p>
    </div>
    <div class="body">
      <h2>Hello, ${username}!</h2>
      <p>Use the One-Time Password (OTP) below to verify your email address and activate your account.</p>

      <div class="otp-box">
        <div class="otp-label">Your verification code</div>
        <div>${digits}</div>
        <div class="timer">⏱ Valid for 5 minutes only</div>
      </div>

      <p>Enter this code on the verification page. Do <strong>not</strong> share this code with anyone.</p>

      <div class="warn">
        <strong>⚠️ Security Warning</strong>
        This code expires in 5 minutes. If you did not create an account on SecureReg,
        please ignore this email — your address will not be used.
      </div>
    </div>
    <div class="ftr">© 2026 SecureReg System · Automated message, please do not reply</div>
  </div>
</body>
</html>`;

  const transporter = await createTransporter();

  const info = await transporter.sendMail({
    from:    process.env.EMAIL_FROM || '"SecureReg System" <noreply@securereg.com>',
    to:      email,
    subject: `${otp} is your SecureReg verification code`,
    html,
  });

  const preview = nodemailer.getTestMessageUrl(info);
  if (preview) {
    console.log(`📧  OTP Email preview (Ethereal): ${preview}`);
  }

  return info;
}

module.exports = { sendVerificationEmail, sendOTPEmail, isGmailConfigured };
