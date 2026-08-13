const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST, port: +process.env.SMTP_PORT,
  secure: false, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});
exports.sendOtp = async (to, code) => {
  return transporter.sendMail({
    from: `"Auradrop" <${process.env.SMTP_USER}>`, to,
    subject: 'Your Auradrop login code',
    html: `<p>Your one-time code is <strong style="font-size:24px">${code}</strong>. Valid for 5 minutes.</p>`,
  });
};