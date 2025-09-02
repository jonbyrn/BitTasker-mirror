#!/usr/bin/env node

/**
 * BitTasker Recovery Flow Test Script
 * Tests the complete recovery flow end-to-end
 */

import https from 'https';

const BASE_URL = 'https://us-central1-bittasker-928ff.cloudfunctions.net';

// Test data
const testEmail = 'test@example.com';
const testPublicKey = 'npub1test123456789';
const testToken = 'test-token-123';

// Helper function to make HTTP requests
function makeRequest(url, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(url, options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = JSON.parse(responseData);
          resolve({ status: res.statusCode, data: result });
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

// Test functions
async function testInitiateRecovery() {
  console.log('🧪 Testing initiateNostrRecovery...');
  
  try {
    const response = await makeRequest(`${BASE_URL}/initiateNostrRecovery`, {
      data: { email: testEmail }
    });
    
    if (response.status === 200 && response.data.result?.success) {
      console.log('✅ initiateNostrRecovery: PASSED');
      return true;
    } else {
      console.log('❌ initiateNostrRecovery: FAILED');
      console.log('Response:', response);
      return false;
    }
  } catch (error) {
    console.log('❌ initiateNostrRecovery: ERROR');
    console.log('Error:', error.message);
    return false;
  }
}

async function testVerifyRecoveryEmail() {
  console.log('🧪 Testing verifyRecoveryEmail...');
  
  try {
    const response = await makeRequest(`${BASE_URL}/verifyRecoveryEmail`, {
      data: { token: testToken }
    });
    
    if (response.status === 200 && response.data.result?.success) {
      console.log('✅ verifyRecoveryEmail: PASSED');
      return true;
    } else {
      console.log('❌ verifyRecoveryEmail: FAILED');
      console.log('Response:', response);
      return false;
    }
  } catch (error) {
    console.log('❌ verifyRecoveryEmail: ERROR');
    console.log('Error:', error.message);
    return false;
  }
}

async function testGetRecoveryData() {
  console.log('🧪 Testing getRecoveryData...');
  
  try {
    const response = await makeRequest(`${BASE_URL}/getRecoveryData`, {
      data: { publicKey: testPublicKey }
    });
    
    if (response.status === 200 && response.data.result?.success) {
      console.log('✅ getRecoveryData: PASSED');
      return true;
    } else {
      console.log('❌ getRecoveryData: FAILED');
      console.log('Response:', response);
      return false;
    }
  } catch (error) {
    console.log('❌ getRecoveryData: ERROR');
    console.log('Error:', error.message);
    return false;
  }
}

async function testCompleteRecovery() {
  console.log('🧪 Testing completeNostrRecovery...');
  
  try {
    const response = await makeRequest(`${BASE_URL}/completeNostrRecovery`, {
      data: {
        publicKey: testPublicKey,
        otp: testToken,
        recoveryPrivateKey: 'encrypted-private-key',
        encryptedPrivateKey: 'encrypted-data',
        iv: 'initialization-vector',
        authTag: 'auth-tag',
        salt: 'salt-value',
        iterations: 100000,
        deviceId: 'device-123'
      }
    });
    
    if (response.status === 200 && response.data.result?.success) {
      console.log('✅ completeNostrRecovery: PASSED');
      return true;
    } else {
      console.log('❌ completeNostrRecovery: FAILED');
      console.log('Response:', response);
      return false;
    }
  } catch (error) {
    console.log('❌ completeNostrRecovery: ERROR');
    console.log('Error:', error.message);
    return false;
  }
}

async function testInvalidateDevices() {
  console.log('🧪 Testing invalidateAllDevices...');
  
  try {
    const response = await makeRequest(`${BASE_URL}/invalidateAllDevices`, {
      data: { publicKey: testPublicKey }
    });
    
    if (response.status === 200 && response.data.result?.success) {
      console.log('✅ invalidateAllDevices: PASSED');
      return true;
    } else {
      console.log('❌ invalidateAllDevices: FAILED');
      console.log('Response:', response);
      return false;
    }
  } catch (error) {
    console.log('❌ invalidateAllDevices: ERROR');
    console.log('Error:', error.message);
    return false;
  }
}

async function testSendRecoveryEmail() {
  console.log('🧪 Testing sendRecoveryVerificationEmail...');
  
  try {
    const response = await makeRequest(`${BASE_URL}/sendRecoveryVerificationEmail`, {
      data: { 
        email: testEmail, 
        verificationToken: testToken 
      }
    });
    
    if (response.status === 200 && response.data.result?.success) {
      console.log('✅ sendRecoveryVerificationEmail: PASSED');
      return true;
    } else {
      console.log('❌ sendRecoveryVerificationEmail: FAILED');
      console.log('Response:', response);
      return false;
    }
  } catch (error) {
    console.log('❌ sendRecoveryVerificationEmail: ERROR');
    console.log('Error:', error.message);
    return false;
  }
}

// Main test runner
async function runTests() {
  console.log('🚀 Starting BitTasker Recovery Flow Tests...\n');
  
  const tests = [
    testInitiateRecovery,
    testVerifyRecoveryEmail,
    testGetRecoveryData,
    testCompleteRecovery,
    testInvalidateDevices,
    testSendRecoveryEmail
  ];
  
  let passed = 0;
  let total = tests.length;
  
  for (const test of tests) {
    const result = await test();
    if (result) passed++;
    console.log(''); // Empty line for readability
  }
  
  console.log('📊 Test Results:');
  console.log(`✅ Passed: ${passed}/${total}`);
  console.log(`❌ Failed: ${total - passed}/${total}`);
  
  if (passed === total) {
    console.log('\n🎉 All tests passed! Recovery flow is working correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Please check the errors above.');
  }
}

// Run the tests
runTests().catch(console.error);
