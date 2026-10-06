/**
 * WebAuthn helper for real biometric authentication (fingerprint / Face ID).
 * Uses the navigator.credentials API with PublicKeyCredential platform authenticators.
 */

const RP_ID = window.location.hostname;
const RP_NAME = 'FinAI';

// Storage keys for the registered credential
const CRED_ID_KEY = 'finai_webauthn_cred_id';
const CRED_ENABLED_KEY = 'finai_biometric_enabled';

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Check if the device supports platform authenticators (biometrics).
 */
export async function isBiometricSupported(): Promise<boolean> {
  try {
    if (typeof PublicKeyCredential === 'undefined') return false;
    if (!PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/**
 * Register a new biometric credential for this device.
 * Triggers the OS-level biometric prompt (fingerprint / Face ID).
 * Returns true on success, false on failure/cancellation.
 */
export async function registerBiometric(): Promise<boolean> {
  try {
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    const userId = new Uint8Array(16);
    crypto.getRandomValues(userId);

    const publicKey: PublicKeyCredentialCreationOptions = {
      challenge: challenge.buffer as ArrayBuffer,
      rp: {
        name: RP_NAME,
        id: RP_ID,
      },
      user: {
        id: userId.buffer as ArrayBuffer,
        name: 'finai-user',
        displayName: 'Usuário FinAI',
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },   // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60000,
      attestation: 'none',
    };

    const credential = await navigator.credentials.create({ publicKey }) as PublicKeyCredential | null;
    if (!credential) return false;

    // Store the credential ID so we can use it for authentication later
    localStorage.setItem(CRED_ID_KEY, bufferToBase64(credential.rawId));
    localStorage.setItem(CRED_ENABLED_KEY, 'true');
    return true;
  } catch (err) {
    console.error('WebAuthn registration failed:', err);
    return false;
  }
}

/**
 * Authenticate using the registered biometric credential.
 * Triggers the OS-level biometric prompt.
 * Returns true if authentication succeeded, false otherwise.
 */
export async function authenticateBiometric(): Promise<boolean> {
  try {
    const storedCredId = localStorage.getItem(CRED_ID_KEY);
    if (!storedCredId) return false;

    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    const allowCredentials: PublicKeyCredentialDescriptor[] = [{
      type: 'public-key',
      id: base64ToBuffer(storedCredId),
      transports: ['internal'],
    }];

    const publicKey: PublicKeyCredentialRequestOptions = {
      challenge: challenge.buffer as ArrayBuffer,
      rpId: RP_ID,
      allowCredentials,
      userVerification: 'required',
      timeout: 60000,
    };

    const assertion = await navigator.credentials.get({ publicKey }) as PublicKeyCredential | null;
    if (!assertion) return false;

    return true;
  } catch (err) {
    console.error('WebAuthn authentication failed:', err);
    return false;
  }
}

/**
 * Remove the stored biometric credential (un enroll).
 */
export function unregisterBiometric(): void {
  localStorage.removeItem(CRED_ID_KEY);
  localStorage.removeItem(CRED_ENABLED_KEY);
}

/**
 * Check if biometric is enrolled (credential ID exists in storage).
 */
export function isBiometricEnrolled(): boolean {
  return !!localStorage.getItem(CRED_ID_KEY) && localStorage.getItem(CRED_ENABLED_KEY) === 'true';
}
