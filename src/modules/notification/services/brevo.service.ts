import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class BrevoService {
  private readonly logger = new Logger(BrevoService.name);
  private readonly apiKey: string;
  private readonly senderEmail: string;
  private readonly senderName: string;

  constructor() {
    this.apiKey = process.env.BREVO_API_KEY || '';
    this.senderEmail = process.env.BREVO_SENDER_EMAIL || '';
    this.senderName = 'Inbox Helper';
  }

  async sendEmail(to: string, subject: string, htmlContent: string): Promise<void> {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': this.apiKey,
      },
      body: JSON.stringify({
        sender: { name: this.senderName, email: this.senderEmail },
        to: [{ email: to }],
        subject,
        htmlContent: this.getEmailTemplate(htmlContent),
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      this.logger.error(`Send Email error. Status ${response.status} is with error ${errorData}`)
      throw new Error(`Brevo API error (${response.status}): ${errorData}`);
    }
  }

  private getEmailTemplate(contentHtml: string): string {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Inbox Helper Notification</title>
      <style>
        body {
          margin: 0;
          padding: 0;
          background-color: #f5f7fb;
          font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: #202532;
          -webkit-font-smoothing: antialiased;
        }
        .wrapper {
          width: 100%;
          table-layout: fixed;
          background-color: #f5f7fb;
          padding: 40px 0;
        }
        .main-table {
          max-width: 600px;
          margin: 0 auto;
          background-color: #ffffff;
          border: 1px solid #e1e5ed;
          border-radius: 14px;
          overflow: hidden;
        }
        .header {
          padding: 24px 32px;
          border-bottom: 1px solid #edf0f5;
          background-color: #ffffff;
        }
        .brand {
          color: #202532;
          font-size: 18px;
          font-weight: 800;
          text-decoration: none;
          letter-spacing: -0.5px;
        }
        .body-content {
          padding: 32px;
          font-size: 14px;
          line-height: 1.6;
          color: #202532;
          overflow-wrap: anywhere;
        }
        .footer {
          padding: 20px 32px;
          background-color: #f8f9fc;
          border-top: 1px solid #edf0f5;
          text-align: center;
          color: #6b7280;
          font-size: 12px;
        }
        @media only screen and (max-width: 600px) {
          .main-table {
            width: 100% !important;
            border-radius: 0;
            border-left: none;
            border-right: none;
          }
          .body-content, .header, .footer {
            padding: 20px !important;
          }
        }
      </style>
    </head>
    <body>
      <table class="wrapper" width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td align="center">
            <table class="main-table" width="100%" cellpadding="0" cellspacing="0" role="presentation">
              <!-- Header -->
              <tr>
                <td class="header">
                  <span class="brand">Inbox Helper</span>
                </td>
              </tr>
              <!-- Main Content Area -->
              <tr>
                <td class="body-content">
                  ${contentHtml}
                </td>
              </tr>
              <!-- Footer -->
              <tr>
                <td class="footer">
                  <p style="margin: 0;">You received this email because you are registered on Inbox Helper.</p>
                  <p style="margin: 4px 0 0 0;">&copy; ${new Date().getFullYear()} Inbox Helper. All rights reserved.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    `.trim();
  }
}
