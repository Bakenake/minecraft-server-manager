import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface JwtPayload {
  userId: string;
  username: string;
  role: 'admin' | 'moderator' | 'viewer';
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiry as string,
    issuer: 'craftos-server-manager',
    audience: 'craftos-dashboard',
  } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, config.jwt.secret, {
    issuer: 'craftos-server-manager',
    audience: 'craftos-dashboard',
  });
  return decoded as JwtPayload;
}

export function decodeToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.decode(token);
    return decoded as JwtPayload | null;
  } catch {
    return null;
  }
}
