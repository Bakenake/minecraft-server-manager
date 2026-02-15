import { authenticator } from 'otplib';
import QRCode from 'qrcode';

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function verifyTotp(token: string, secret: string): boolean {
  return authenticator.verify({ token, secret });
}

export async function generateTotpQrCode(username: string, secret: string): Promise<string> {
  const otpauth = authenticator.keyuri(username, 'CraftOS Server Manager', secret);
  return QRCode.toDataURL(otpauth);
}
