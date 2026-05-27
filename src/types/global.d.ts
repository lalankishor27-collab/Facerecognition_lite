/**
 * Global type declarations for React Native (Hermes) runtime APIs.
 *
 * These APIs are available at runtime in Hermes (RN 0.71+) but TypeScript
 * doesn't know about them because we're not using the 'dom' lib.
 */

// Web Crypto API (available in Hermes)
declare function btoa(input: string): string;
declare function atob(input: string): string;

declare interface Crypto {
  randomUUID(): string;
  getRandomValues<T extends ArrayBufferView>(array: T): T;
  subtle: SubtleCrypto;
}

declare interface SubtleCrypto {
  encrypt(algorithm: AlgorithmIdentifier | AesGcmParams, key: CryptoKey, data: BufferSource): Promise<ArrayBuffer>;
  decrypt(algorithm: AlgorithmIdentifier | AesGcmParams, key: CryptoKey, data: BufferSource): Promise<ArrayBuffer>;
  generateKey(algorithm: AesKeyGenParams, extractable: boolean, keyUsages: KeyUsage[]): Promise<CryptoKey>;
  importKey(format: string, keyData: BufferSource, algorithm: AlgorithmIdentifier, extractable: boolean, keyUsages: KeyUsage[]): Promise<CryptoKey>;
  exportKey(format: string, key: CryptoKey): Promise<ArrayBuffer>;
}

declare interface AesGcmParams {
  name: string;
  iv: BufferSource;
}

declare interface AesKeyGenParams {
  name: string;
  length: number;
}

declare interface CryptoKey {
  readonly algorithm: object;
  readonly extractable: boolean;
  readonly type: string;
  readonly usages: KeyUsage[];
}

type KeyUsage = 'encrypt' | 'decrypt' | 'sign' | 'verify' | 'deriveKey' | 'deriveBits' | 'wrapKey' | 'unwrapKey';
type AlgorithmIdentifier = string | { name: string };
type BufferSource = ArrayBufferView | ArrayBuffer;

declare var crypto: Crypto;

// Performance API (available in Hermes)
declare interface Performance {
  now(): number;
}
declare var performance: Performance | undefined;
