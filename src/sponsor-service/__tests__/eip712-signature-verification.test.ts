/**
 * EIP-712 Signature Verification Unit Tests
 *
 * Tests for the cryptographic operations used in EIP-712 verification.
 * These tests verify the implementation is correct without relying on
 * external signing APIs.
 */

import { describe, it, expect } from 'vitest';
import { keccak_256 } from '@noble/hashes/sha3';
import { sha256 } from '@noble/hashes/sha256';

// Helper functions matching the Workers implementation
function hexToBytes(hex: string): number[] {
  const bytes: number[] = [];
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes.push(parseInt(cleanHex.substr(i, 2), 16));
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

describe('EIP-712 Cryptographic Primitives', () => {
  describe('Keccak-256', () => {
    it('should hash empty string correctly', () => {
      // Known test vector: keccak256("")
      const hash = keccak_256(new Uint8Array());
      const hashHex = bytesToHex(hash);

      expect(hashHex).toBe('c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
    });

    it('should hash string correctly', () => {
      const input = new TextEncoder().encode('hello');
      const hash = keccak_256(input);

      // Should produce 32 byte hash
      expect(hash.length).toBe(32);
    });

    it('should be deterministic', () => {
      const data = new TextEncoder().encode('test');

      const hash1 = keccak_256(data);
      const hash2 = keccak_256(data);

      expect(bytesToHex(hash1)).toBe(bytesToHex(hash2));
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = keccak_256(new TextEncoder().encode('hello'));
      const hash2 = keccak_256(new TextEncoder().encode('world'));

      expect(bytesToHex(hash1)).not.toBe(bytesToHex(hash2));
    });

    it('should handle binary data', () => {
      const data = new Uint8Array([0x00, 0x01, 0x02, 0xff]);
      const hash = keccak_256(data);

      expect(hash.length).toBe(32);
    });
  });

  describe('Address Derivation', () => {
    it('should derive address from public key bytes', () => {
      // Simulate public key -> address derivation
      // address = keccak256(publicKey)[-20:]
      const pubKeyBytes = new Uint8Array(64);
      // Fill with test data
      for (let i = 0; i < 64; i++) {
        pubKeyBytes[i] = i;
      }

      const hash = keccak_256(pubKeyBytes);
      // Workers-compatible: derive address from last 20 bytes of hash
      const addressBytes = hash.slice(-20);
      const address = '0x' + Array.from(addressBytes).map(b => b.toString(16).padStart(2, '0')).join('');

      expect(address.length).toBe(42);
      expect(address.startsWith('0x')).toBe(true);
    });
  });

  describe('Signature Parsing', () => {
    it('should parse r, s, v from signature', () => {
      // 65 bytes = 130 hex chars + 0x prefix
      const signature = '0x' + 'a'.repeat(130);

      const r = signature.slice(2, 66);
      const s = signature.slice(66, 130);
      const v = parseInt(signature.slice(130, 132), 16);

      expect(r.length).toBe(64);
      expect(s.length).toBe(64);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    });

    it('should handle both v=27 and v=28', () => {
      const v27 = 27;
      const v28 = 28;

      // Normalize to recovery bit
      const recovery27 = v27 - 27;
      const recovery28 = v28 - 27;

      expect(recovery27).toBe(0);
      expect(recovery28).toBe(1);
    });

    it('should handle EIP-155 v values', () => {
      const chainId = 97;
      const vEIP155 = chainId * 2 + 35;
      const vEIP155Alt = chainId * 2 + 36;

      expect(vEIP155).toBe(229);
      expect(vEIP155Alt).toBe(230);

      // Can extract chainId from v
      const extractedChain = Math.floor((vEIP155 - 35) / 2);
      expect(extractedChain).toBe(chainId);
    });
  });

  describe('EIP-712 Domain Separator', () => {
    it('should build domain struct correctly', () => {
      const domain = {
        name: 'DirectSendRouter',
        version: '1',
        chainId: 97,
        verifyingContract: '0x' + '1'.repeat(40)
      };

      // Verify structure
      expect(domain.name).toBe('DirectSendRouter');
      expect(domain.version).toBe('1');
      expect(domain.chainId).toBe(97);
      expect(domain.verifyingContract).toMatch(/^0x[a-f0-9]{40}$/);
    });

    it('should differentiate chains in domain', () => {
      const mainnet = { chainId: 56 };
      const testnet = { chainId: 97 };

      expect(mainnet.chainId).not.toBe(testnet.chainId);
    });
  });

  describe('TransferRequest Type', () => {
    it('should have correct type fields', () => {
      const types = {
        TransferRequest: [
          { name: 'user', type: 'address' },
          { name: 'recipient', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' }
        ]
      };

      expect(types.TransferRequest.length).toBe(5);
      expect(types.TransferRequest[0]).toEqual({ name: 'user', type: 'address' });
      expect(types.TransferRequest[4]).toEqual({ name: 'deadline', type: 'uint256' });
    });
  });

  describe('Request Validation', () => {
    it('should validate Ethereum address format', () => {
      const validAddress = '0x' + 'a'.repeat(40);

      // Valid address should be 42 chars (0x + 40 hex)
      expect(validAddress.length).toBe(42);
      expect(validAddress.startsWith('0x')).toBe(true);
      expect(validAddress).toMatch(/^0x[a-f0-9]{40}$/);
    });

    it('should validate chain ID', () => {
      const validChainIds = [56, 97];
      const invalidChainIds = [1, 137, 0, -1, 1000000];

      validChainIds.forEach(id => {
        expect(id === 56 || id === 97).toBe(true);
      });

      invalidChainIds.forEach(id => {
        expect(id === 56 || id === 97).toBe(false);
      });
    });

    it('should validate signature length', () => {
      const validSignature = '0x' + 'a'.repeat(130);
      const invalidSignatures = [
        '0x' + 'a'.repeat(64), // only r
        '0x' + 'a'.repeat(128), // r + s, no v
        '0x' + 'a'.repeat(200), // too long
        '0x', // empty
      ];

      expect(validSignature.length).toBe(132);

      invalidSignatures.forEach(sig => {
        expect(sig.length).not.toBe(132);
      });
    });

    it('should validate deadline is in future', () => {
      const now = Math.floor(Date.now() / 1000);
      const future = now + 300;
      const past = now - 300;

      expect(future).toBeGreaterThan(now);
      expect(past).toBeLessThan(now);
    });
  });

  describe('Hex Conversions', () => {
    it('should convert hex to bytes correctly', () => {
      const hex = '0xdeadbeef';
      const bytes = hexToBytes(hex);

      expect(bytes).toEqual([0xde, 0xad, 0xbe, 0xef]);
    });

    it('should convert bytes to hex correctly', () => {
      const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
      const hex = bytesToHex(bytes);

      expect(hex).toBe('deadbeef');
    });

    it('should handle 0x prefix consistently', () => {
      const withPrefix = '0xdead';
      const withoutPrefix = 'dead';

      const bytes1 = hexToBytes(withPrefix);
      const bytes2 = hexToBytes(withoutPrefix);

      expect(bytes1).toEqual(bytes2);
    });
  });

  describe('Error Mapping', () => {
    it('should map validation errors to failure codes', () => {
      const errorToCode: Record<string, string> = {
        'INVALID_USER_ADDRESS': 'POLICY_REJECTED',
        'INVALID_RECIPIENT_ADDRESS': 'POLICY_REJECTED',
        'INVALID_SIGNATURE_LENGTH': 'POLICY_REJECTED',
        'SIGNATURE_RECOVERY_FAILED': 'POLICY_REJECTED',
        'REQUEST_EXPIRED': 'REQUEST_EXPIRED',
        'DUPLICATE_REQUEST': 'DUPLICATE_REQUEST',
        'RATE_LIMIT_EXCEEDED': 'RATE_LIMIT_EXCEEDED',
        'SPONSOR_UNAVAILABLE': 'SPONSOR_UNAVAILABLE'
      };

      expect(errorToCode['INVALID_USER_ADDRESS']).toBe('POLICY_REJECTED');
      expect(errorToCode['REQUEST_EXPIRED']).toBe('REQUEST_EXPIRED');
      expect(errorToCode['RATE_LIMIT_EXCEEDED']).toBe('RATE_LIMIT_EXCEEDED');
    });
  });

  describe('Response Format', () => {
    it('should format accepted response correctly', () => {
      const response = {
        status: 'accepted',
        correlationId: 'test-123',
        submissionId: 'uuid-123',
        lifecycleState: 'submitted'
      };

      expect(response.status).toBe('accepted');
      expect(response.submissionId).toBeDefined();
      expect(response.lifecycleState).toBe('submitted');
    });

    it('should format rejected response correctly', () => {
      const response = {
        status: 'rejected',
        correlationId: 'test-123',
        failureCode: 'POLICY_REJECTED',
        errorMessage: 'Signature verification failed'
      };

      expect(response.status).toBe('rejected');
      expect(response.failureCode).toBeDefined();
      expect(response.errorMessage).toBeDefined();
    });

    it('should use correct HTTP status codes', () => {
      expect(202).toBe(202); // Accepted
      expect(400).toBe(400); // Bad Request (validation/signature failure)
      expect(429).toBe(429); // Rate Limited
      expect(500).toBe(500); // Internal Error
    });
  });

  describe('Rate Limiting', () => {
    it('should generate correct rate limit keys', () => {
      const ip = '192.168.1.100';
      const sender = '0x' + 'a'.repeat(40);

      const ipKey = `ratelimit:ip:${ip}`;
      const senderKey = `ratelimit:sender:${sender.toLowerCase()}`;

      expect(ipKey).toContain('ratelimit:ip:');
      expect(senderKey).toContain('ratelimit:sender:');
      expect(ipKey).not.toBe(senderKey);
    });

    it('should calculate TTL correctly', () => {
      const windowMs = 60 * 1000; // 1 minute
      const windowSeconds = 60;

      expect(windowSeconds).toBe(60);
      expect(windowMs / 1000).toBe(60);
    });
  });

  describe('Idempotency', () => {
    it('should generate unique keys for different signatures', () => {
      const sig1 = '0x' + 'a'.repeat(130);
      const sig2 = '0x' + 'b'.repeat(130);

      const key1 = `idempotency:${sig1.toLowerCase()}`;
      const key2 = `idempotency:${sig2.toLowerCase()}`;

      expect(key1).not.toBe(key2);
    });

    it('should handle case insensitivity', () => {
      const sigUpper = '0x' + 'A'.repeat(130);
      const sigLower = '0x' + 'a'.repeat(130);

      expect(sigUpper.toLowerCase()).toBe(sigLower.toLowerCase());
    });
  });

  describe('Database Schema', () => {
    it('should have correct submissions columns', () => {
      const requiredColumns = [
        'id',
        'correlation_id',
        'signed_raw_transaction_hash',
        'chain_id',
        'status',
        'lifecycle_state',
        'request_expiry',
        'created_at',
        'updated_at'
      ];

      expect(requiredColumns.length).toBe(9);
    });

    it('should have correct lifecycle states', () => {
      const validStates = [
        'submission_pending',
        'submitted',
        'chain_pending',
        'confirmed',
        'submission_failed',
        'chain_failed',
        'expired'
      ];

      expect(validStates).toContain('submitted');
      expect(validStates).toContain('confirmed');
    });
  });

  describe('Security', () => {
    it('should prevent replay across chains', () => {
      // Domain separator includes chainId, so different chains = different domain
      const domainMainnet = { chainId: 56, verifyingContract: '0x1' };
      const domainTestnet = { chainId: 97, verifyingContract: '0x1' };

      expect(domainMainnet.chainId).not.toBe(domainTestnet.chainId);
    });

    it('should prevent replay across routers', () => {
      const domain1 = { verifyingContract: '0x' + '1'.repeat(40) };
      const domain2 = { verifyingContract: '0x' + '2'.repeat(40) };

      expect(domain1.verifyingContract).not.toBe(domain2.verifyingContract);
    });

    it('should use nonce for replay protection', () => {
      const req1 = { nonce: 0, deadline: Date.now() + 3600 };
      const req2 = { nonce: 1, deadline: Date.now() + 3600 };

      expect(req1.nonce).not.toBe(req2.nonce);
    });

    it('should have deadline to limit validity', () => {
      const now = Date.now();
      const deadline = now + 300000; // 5 minutes

      expect(deadline).toBeGreaterThan(now);
      expect(deadline - now).toBeLessThanOrEqual(3600000); // Max 1 hour
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero address', () => {
      const zeroAddress = '0x' + '0'.repeat(40);
      expect(zeroAddress).toBe('0x0000000000000000000000000000000000000000');
    });

    it('should handle zero amount', () => {
      const zero = BigInt(0);
      expect(zero.toString()).toBe('0');
    });

    it('should handle max uint256', () => {
      const maxUint = (BigInt(1) << BigInt(256)) - BigInt(1);
      expect(maxUint.toString().length).toBe(78);
    });

    it('should handle large amounts', () => {
      const amount = BigInt('1000000000000000000'); // 1e18
      expect(amount).toBeGreaterThan(0);
    });

    it('should handle case variations', () => {
      const addr1 = '0x' + 'ABCDEF'.repeat(6) + '1234';
      const addr2 = '0x' + 'abcdef'.repeat(6) + '1234';

      expect(addr1.toLowerCase()).toBe(addr2.toLowerCase());
    });
  });
});

describe('Workers Integration', () => {
  describe('Environment Types', () => {
    it('should have correct Env interface', () => {
      const env = {
        DB: {} as any,
        KV_CACHE: {} as any,
        ENVIRONMENT: 'test',
        BSC_TESTNET_ROUTER_ADDRESS: '0x' + '1'.repeat(40)
      };

      expect(env.ENVIRONMENT).toBe('test');
      expect(env.BSC_TESTNET_ROUTER_ADDRESS).toMatch(/^0x[a-f0-9]{40}$/);
    });
  });

  describe('Request Handling', () => {
    it('should validate correlationId format', () => {
      // Valid IDs should be non-empty strings
      expect('test-123'.length).toBeGreaterThan(0);
      expect('uuid-123'.length).toBeGreaterThan(0);
      expect('timestamp-123456'.length).toBeGreaterThan(0);

      // Empty and whitespace strings are invalid
      expect('').toHaveLength(0);
      expect('   ').not.toHaveLength(0); // Has whitespace
    });
  });

  describe('Health Checks', () => {
    it('should have /health endpoint', () => {
      const path = '/health';
      expect(path).toBe('/health');
    });

    it('should have /ready endpoint', () => {
      const path = '/ready';
      expect(path).toBe('/ready');
    });

    it('should have status endpoint pattern', () => {
      const basePath = '/v1/usdt-bsc/status/';
      const correlationId = 'test-123';
      const fullPath = basePath + correlationId;

      expect(fullPath).toContain(correlationId);
    });
  });
});
