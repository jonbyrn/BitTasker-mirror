import { goto } from '$app/navigation';
import { NativeBiometric } from 'capacitor-native-biometric';

export function verifyIdentity() {
    NativeBiometric.verifyIdentity({
        reason: 'For easy log in',
        title: 'Log in',
        subtitle: 'Authenticate',
        description: 'Please authenticate to proceed',
        maxAttempts: 2,
        useFallback: true
    })
        .then(async () => {
            goto('profile');
        })
        .catch((err: any) => {
            console.error(err);
        });
}

export function createPasskey(email: string) {
    NativeBiometric.setCredentials({
        username: email,
        password: '',
        server: 'com.bittasker.app'
    });
    verifyIdentity();
}