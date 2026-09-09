import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;
export const resend = resendApiKey ? new Resend(resendApiKey) : null;

export const DEFAULT_FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL || "berkembang.id <onboarding@resend.dev>";

interface SendPasswordResetEmailParams {
  to: string;
  code: string;
  expiresInMinutes?: number;
}

export async function sendPasswordResetOtpEmail({
  to,
  code,
  expiresInMinutes = 5,
}: SendPasswordResetEmailParams): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    console.warn(
      `[Resend] RESEND_API_KEY belum dikonfigurasi. Kode OTP pemulihan untuk ${to} adalah: ${code}`
    );
    // Jika di development / test tanpa key, izinkan flow berlanjut dengan log console
    return { success: true };
  }

  try {
    const htmlContent = `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kode Pengaturan Ulang Kata Sandi - berkembang.id</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 32px 16px; color: #1e293b;">
  <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <tr>
      <td style="padding: 32px 32px 20px 32px; text-align: center; border-bottom: 1px solid #f1f5f9;">
        <h2 style="margin: 0; color: #001b85; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">berkembang.id</h2>
      </td>
    </tr>
    <tr>
      <td style="padding: 32px;">
        <h1 style="margin: 0 0 16px; font-size: 20px; font-weight: 700; color: #0f172a;">Atur Ulang Kata Sandi</h1>
        <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #475569;">
          Kami menerima permintaan untuk mengatur ulang kata sandi akun berkembang.id Anda. Masukkan kode verifikasi 6 digit berikut pada aplikasi:
        </p>

        <div style="background-color: #f0f4ff; border: 1px dashed #001b85; border-radius: 12px; padding: 20px; text-align: center; margin: 0 0 24px;">
          <span style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #001b85; display: inline-block; padding-left: 8px;">
            ${code}
          </span>
        </div>

        <p style="margin: 0 0 12px; font-size: 13px; color: #64748b; line-height: 1.5;">
          ⏱️ Kode ini hanya berlaku selama <strong>${expiresInMinutes} menit</strong>. Jangan berikan kode ini kepada siapa pun, termasuk staf berkembang.id.
        </p>
        <p style="margin: 0; font-size: 13px; color: #94a3b8; line-height: 1.5;">
          Bila Anda tidak meminta pengaturan ulang kata sandi, abaikan surel ini. Kata sandi akun Anda tetap aman.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding: 20px 32px; background-color: #f8fafc; border-top: 1px solid #f1f5f9; text-align: center;">
        <p style="margin: 0; font-size: 12px; color: #94a3b8;">
          © ${new Date().getFullYear()} berkembang.id • Platform Ekosistem & Pendampingan Usaha
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const { data, error } = await resend.emails.send({
      from: DEFAULT_FROM_EMAIL,
      to,
      subject: `Kode Verifikasi Reset Kata Sandi Anda: ${code}`,
      html: htmlContent,
    });

    if (error) {
      console.error("[Resend Error]", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gagal mengirim email";
    console.error("[Resend Exception]", err);
    return { success: false, error: message };
  }
}
