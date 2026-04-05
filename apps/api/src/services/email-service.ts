import nodemailer from 'nodemailer';
import { env } from '../config';

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST || 'localhost',
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  auth: env.SMTP_USER ? {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  } : undefined,
});

// For development, log emails instead of sending
const isDev = env.NODE_ENV !== 'production';

export async function sendEmail(to: string, subject: string, html: string) {
  if (isDev) {
    console.log(`[email-service] DEV MODE — would send to ${to}:`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Body: ${html.substring(0, 200)}...`);
    return;
  }

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to,
    subject,
    html,
  });
}

export async function sendVerificationEmail(email: string, token: string) {
  const appUrl = env.APP_URL;
  const link = `${appUrl}/verify-email?token=${token}`;

  await sendEmail(email, 'Verify your CricScore email', `
    <h2>Welcome to CricScore!</h2>
    <p>Click the link below to verify your email:</p>
    <a href="${link}">${link}</a>
    <p>This link expires in 24 hours.</p>
  `);
}

export async function sendPasswordResetEmail(email: string, token: string) {
  const appUrl = env.APP_URL;
  const link = `${appUrl}/reset-password?token=${token}`;

  await sendEmail(email, 'Reset your CricScore password', `
    <h2>Password Reset</h2>
    <p>Click the link below to reset your password:</p>
    <a href="${link}">${link}</a>
    <p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>
  `);
}
