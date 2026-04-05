import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'localhost',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: process.env.SMTP_USER ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  } : undefined,
});

// For development, log emails instead of sending
const isDev = process.env.NODE_ENV !== 'production';

export async function sendEmail(to: string, subject: string, html: string) {
  if (isDev) {
    console.log(`[email-service] DEV MODE — would send to ${to}:`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Body: ${html.substring(0, 200)}...`);
    return;
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'CricScore <noreply@cricscore.app>',
    to,
    subject,
    html,
  });
}

export async function sendVerificationEmail(email: string, token: string) {
  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  const link = `${appUrl}/verify-email?token=${token}`;

  await sendEmail(email, 'Verify your CricScore email', `
    <h2>Welcome to CricScore!</h2>
    <p>Click the link below to verify your email:</p>
    <a href="${link}">${link}</a>
    <p>This link expires in 24 hours.</p>
  `);
}

export async function sendPasswordResetEmail(email: string, token: string) {
  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  const link = `${appUrl}/reset-password?token=${token}`;

  await sendEmail(email, 'Reset your CricScore password', `
    <h2>Password Reset</h2>
    <p>Click the link below to reset your password:</p>
    <a href="${link}">${link}</a>
    <p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>
  `);
}
