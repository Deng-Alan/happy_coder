import { getRandomBytesAsync } from 'expo-crypto';
import { encodeBase64 } from '@/encryption/base64';
import { authGetToken } from './authGetToken';
import type { AuthCredentials } from './tokenStorage';

export async function createPersonalCredentials(): Promise<AuthCredentials> {
    const secret = await getRandomBytesAsync(32);
    const token = await authGetToken(secret);

    if (!token) {
        throw new Error('Failed to create personal credentials');
    }

    return {
        token,
        secret: encodeBase64(secret, 'base64url'),
    };
}
