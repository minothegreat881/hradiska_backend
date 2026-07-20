export default ({ env }) => ({
  // E-mail cez Gmail SMTP (dočasné — technický účet milanhrabkovsky@gmail.com).
  // Slúži na overovací kód pri registrácii a na reset hesla.
  // Heslo je Gmail App Password (16 znakov), nie bežné heslo účtu — a je LEN
  // v .env (ignorovanom gitom), nikdy nie tu.
  // Pri prechode na doménu prepnúť na SMTP hradiska.sk / Resend.
  email: {
    config: {
      provider: 'nodemailer',
      providerOptions: {
        host: env('SMTP_HOST', 'smtp.gmail.com'),
        port: env.int('SMTP_PORT', 465),
        secure: env.bool('SMTP_SECURE', true),
        auth: {
          user: env('SMTP_USER'),
          pass: env('SMTP_PASS'),
        },
      },
      settings: {
        defaultFrom: env('EMAIL_FROM', 'milanhrabkovsky@gmail.com'),
        defaultReplyTo: env('EMAIL_REPLY_TO', 'milanhrabkovsky@gmail.com'),
      },
    },
  },
});
