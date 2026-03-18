import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

export interface EncryptedSecretPayload {
	ciphertext: Buffer;
	iv: Buffer;
	authTag: Buffer;
	keyVersion: number;
}

export class CredentialSecretCrypto {
	constructor(
		private readonly keys: Map<number, Buffer>,
		private readonly defaultKeyVersion: number = 1,
	) {
		if (!this.keys.has(this.defaultKeyVersion)) {
			throw new Error(`Missing encryption key for version ${this.defaultKeyVersion}`);
		}
	}

	static fromEnv(): CredentialSecretCrypto {
		const rawKey = process.env.INTEGRATION_ENCRYPTION_KEY;
		if (!rawKey) {
			throw new Error('INTEGRATION_ENCRYPTION_KEY is required for credential encryption');
		}

		const parsedKey = this.parseKey(rawKey);
		return new CredentialSecretCrypto(new Map([[1, parsedKey]]), 1);
	}

	encryptString(plainText: string, keyVersion: number = this.defaultKeyVersion): EncryptedSecretPayload {
		const key = this.getKey(keyVersion);
		const iv = randomBytes(IV_LENGTH);

		const cipher = createCipheriv(ALGORITHM, key, iv);
		const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
		const authTag = cipher.getAuthTag();

		return { ciphertext, iv, authTag, keyVersion };
	}

	decryptToString(payload: {
		ciphertext: Uint8Array;
		iv: Uint8Array;
		authTag: Uint8Array;
		keyVersion: number;
	}): string {
		const key = this.getKey(payload.keyVersion);
		const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(payload.iv));
		decipher.setAuthTag(Buffer.from(payload.authTag));

		const decrypted = Buffer.concat([
			decipher.update(Buffer.from(payload.ciphertext)),
			decipher.final(),
		]);

		return decrypted.toString('utf8');
	}

	private getKey(version: number): Buffer {
		const key = this.keys.get(version);
		if (!key) {
			throw new Error(`No encryption key configured for keyVersion=${version}`);
		}
		return key;
	}

	private static parseKey(raw: string): Buffer {
		const trimmed = raw.trim();

		if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
			return Buffer.from(trimmed, 'hex');
		}

		const base64Candidate = Buffer.from(trimmed, 'base64');
		if (base64Candidate.length === KEY_LENGTH) {
			return base64Candidate;
		}

		const utf8Candidate = Buffer.from(trimmed, 'utf8');
		if (utf8Candidate.length === KEY_LENGTH) {
			return utf8Candidate;
		}

		throw new Error(
			'INTEGRATION_ENCRYPTION_KEY must be 32 bytes (hex-64, base64-32bytes, or raw 32-char utf8)',
		);
	}
}
