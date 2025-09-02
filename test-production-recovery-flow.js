#!/usr/bin/env node

/**
 * Production Recovery Flow Test
 * This script tests the complete recovery flow end-to-end in production
 */

import https from 'https';

const BASE_URL = 'https://us-central1-bittasker-928ff.cloudfunctions.net';
const TEST_EMAIL = process.env.TEST_EMAIL || 'test@example.com'; // Test email address

// Helper function to make HTTPS requests
function makeRequest(url, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ data });
    
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
          const parsed = JSON.parse(responseData);
          resolve({
            status: res.statusCode,
            data: parsed
          });
        } catch (error) {
          resolve({
            status: res.statusCode,
            data: responseData
          });
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
  console.log('🧪 Step 1: Testing initiateNostrRecovery...');
  try {
    const response = await makeRequest(`${BASE_URL}/initiateNostrRecovery`, {
      email: TEST_EMAIL
    });
    
    if (response.status === 200 && response.data.result?.success) {
      console.log('✅ initiateNostrRecovery: PASSED');
      console.log('   📧 Recovery initiated for:', TEST_EMAIL);
      console.log('   💬 Message:', response.data.result.message);
      return true;
    } else {
      console.log('❌ initiateNostrRecovery: FAILED');
      console.log('   Response:', response);
      return false;
    }
  } catch (error) {
    console.log('❌ initiateNostrRecovery: ERROR');
    console.log('   Error:', error.message);
    return false;
  }
}

async function testEmailVerification() {
  console.log('\n🧪 Step 2: Testing sendRecoveryVerificationEmail...');
  try {
    const verificationToken = `test_token_${Date.now()}`;
    const response = await makeRequest(`${BASE_URL}/sendRecoveryVerificationEmail`, {
      email: TEST_EMAIL,
      verificationToken: verificationToken
    });
    
    if (response.status === 200 && response.data.result?.success) {
      console.log('✅ sendRecoveryVerificationEmail: PASSED');
      console.log('   📧 Email sent to:', TEST_EMAIL);
      console.log('   🔗 Verification token:', verificationToken);
      console.log('   💬 Message:', response.data.result.message);
      return { success: true, token: verificationToken };
    } else {
      console.log('❌ sendRecoveryVerificationEmail: FAILED');
      console.log('   Response:', response);
      return { success: false };
    }
  } catch (error) {
    console.log('❌ sendRecoveryVerificationEmail: ERROR');
    console.log('   Error:', error.message);
    return { success: false };
  }
}

async function testVerifyRecoveryEmail(token) {
  console.log('\n🧪 Step 3: Testing verifyRecoveryEmail...');
  try {
    const response = await makeRequest(`${BASE_URL}/verifyRecoveryEmail`, {
      token: token
    });
    
    if (response.status === 200 && response.data.result?.success) {
      console.log('✅ verifyRecoveryEmail: PASSED');
      console.log('   📧 Email verified for:', response.data.result.data.email);
      console.log('   🔑 Public key:', response.data.result.data.publicKey);
      return { success: true, data: response.data.result.data };
    } else {
      console.log('❌ verifyRecoveryEmail: FAILED');
      console.log('   Response:', response);
      return { success: false };
    }
  } catch (error) {
    console.log('❌ verifyRecoveryEmail: ERROR');
    console.log('   Error:', error.message);
    return { success: false };
  }
}

async function testGetRecoveryData(publicKey) {
  console.log('\n🧪 Step 4: Testing getRecoveryData...');
  try {
    const response = await makeRequest(`${BASE_URL}/getRecoveryData`, {
      publicKey: publicKey
    });
    
    if (response.status === 200 && response.data.result?.success) {
      console.log('✅ getRecoveryData: PASSED');
      console.log('   📊 Recovery data retrieved for:', publicKey);
      console.log('   🔐 Has recovery password:', response.data.result.data.hasRecoveryPassword);
      return { success: true, data: response.data.result.data };
    } else {
      console.log('❌ getRecoveryData: FAILED');
      console.log('   Response:', response);
      return { success: false };
    }
  } catch (error) {
    console.log('❌ getRecoveryEmail: ERROR');
    console.log('   Error:', error.message);
    return { success: false };
  }
}

async function testCompleteRecovery(publicKey, token) {
  console.log('\n🧪 Step 5: Testing completeNostrRecovery...');
  try {
    // Mock recovery data (in real scenario, this would come from user input)
    const mockRecoveryData = {
      publicKey: publicKey,
      otp: token,
      recoveryPrivateKey: 'mock_recovery_private_key',
      encryptedPrivateKey: 'mock_encrypted_private_key',
      iv: 'mock_iv',
      authTag: 'mock_auth_tag',
      salt: 'mock_salt',
      iterations: 100000,
      deviceId: `test_device_${Date.now()}`
    };
    
    const response = await makeRequest(`${BASE_URL}/completeNostrRecovery`, mockRecoveryData);
    
    if (response.status === 200 && response.data.result?.success) {
      console.log('✅ completeNostrRecovery: PASSED');
      console.log('   🔑 Access token generated');
      console.log('   👤 User data:', response.data.result.user);
      return { success: true, data: response.data.result };
    } else {
      console.log('❌ completeNostrRecovery: FAILED');
      console.log('   Response:', response);
      return { success: false };
    }
  } catch (error) {
    console.log('❌ completeNostrRecovery: ERROR');
    console.log('   Error:', error.message);
    return { success: false };
  }
}

async function testInvalidateDevices(publicKey) {
  console.log('\n🧪 Step 6: Testing invalidateAllDevices...');
  try {
    const response = await makeRequest(`${BASE_URL}/invalidateAllDevices`, {
      publicKey: publicKey
    });
    
    if (response.status === 200 && response.data.result?.success) {
      console.log('✅ invalidateAllDevices: PASSED');
      console.log('   🚫 Invalidated devices:', response.data.result.invalidatedDevices);
      return true;
    } else {
      console.log('❌ invalidateAllDevices: FAILED');
      console.log('   Response:', response);
      return false;
    }
  } catch (error) {
    console.log('❌ invalidateAllDevices: ERROR');
    console.log('   Error:', error.message);
    return false;
  }
}

async function testSMTPConfiguration() {
  console.log('\n🧪 Step 7: Testing SMTP Configuration...');
  try {
    const response = await makeRequest(`${BASE_URL}/testSMTPConfiguration`, {});
    
    if (response.status === 200 && response.data.result?.success) {
      console.log('✅ testSMTPConfiguration: PASSED');
      console.log('   📧 SMTP configuration is valid');
      console.log('   💬 Message:', response.data.result.message);
      return true;
    } else {
      console.log('❌ testSMTPConfiguration: FAILED');
      console.log('   Response:', response);
      return false;
    }
  } catch (error) {
    console.log('❌ testSMTPConfiguration: ERROR');
    console.log('   Error:', error.message);
    return false;
  }
}

// Main test function
async function runProductionRecoveryTest() {
  console.log('🚀 Starting BitTasker Production Recovery Flow Test...\n');
  console.log('📧 Test Email:', TEST_EMAIL);
  console.log('🌐 Base URL:', BASE_URL);
  console.log('⏰ Test started at:', new Date().toISOString());
  console.log('=' .repeat(60));
  
  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    steps: []
  };
  
  try {
    // Step 1: Initiate Recovery
    results.total++;
    const step1 = await testInitiateRecovery();
    results.steps.push({ name: 'Initiate Recovery', success: step1 });
    if (step1) results.passed++; else results.failed++;
    
    // Step 2: Send Verification Email
    results.total++;
    const step2 = await testEmailVerification();
    results.steps.push({ name: 'Send Verification Email', success: step2.success });
    if (step2.success) results.passed++; else results.failed++;
    
    if (!step2.success) {
      console.log('\n❌ Email sending failed. Cannot continue with recovery flow.');
      return results;
    }
    
    // Step 3: Verify Recovery Email
    results.total++;
    const step3 = await testVerifyRecoveryEmail(step2.token);
    results.steps.push({ name: 'Verify Recovery Email', success: step3.success });
    if (step3.success) results.passed++; else results.failed++;
    
    if (!step3.success) {
      console.log('\n❌ Email verification failed. Cannot continue with recovery flow.');
      return results;
    }
    
    // Step 4: Get Recovery Data
    results.total++;
    const step4 = await testGetRecoveryData(step3.data.publicKey);
    results.steps.push({ name: 'Get Recovery Data', success: step4.success });
    if (step4.success) results.passed++; else results.failed++;
    
    // Step 5: Complete Recovery
    results.total++;
    const step5 = await testCompleteRecovery(step3.data.publicKey, step2.token);
    results.steps.push({ name: 'Complete Recovery', success: step5.success });
    if (step5.success) results.passed++; else results.failed++;
    
    // Step 6: Invalidate Devices
    results.total++;
    const step6 = await testInvalidateDevices(step3.data.publicKey);
    results.steps.push({ name: 'Invalidate Devices', success: step6 });
    if (step6) results.passed++; else results.failed++;
    
    // Step 7: Test SMTP Configuration
    results.total++;
    const step7 = await testSMTPConfiguration();
    results.steps.push({ name: 'SMTP Configuration', success: step7 });
    if (step7) results.passed++; else results.failed++;
    
  } catch (error) {
    console.log('\n💥 Test execution failed:', error.message);
    results.failed++;
  }
  
  // Print results
  console.log('\n' + '=' .repeat(60));
  console.log('📊 PRODUCTION RECOVERY FLOW TEST RESULTS');
  console.log('=' .repeat(60));
  console.log(`⏰ Test completed at: ${new Date().toISOString()}`);
  console.log(`📧 Test email: ${TEST_EMAIL}`);
  console.log(`🌐 Environment: Production`);
  console.log('');
  
  // Step-by-step results
  console.log('📋 Step-by-Step Results:');
  results.steps.forEach((step, index) => {
    const status = step.success ? '✅' : '❌';
    console.log(`   ${index + 1}. ${status} ${step.name}`);
  });
  
  console.log('');
  console.log('📈 Summary:');
  console.log(`   Total Steps: ${results.total}`);
  console.log(`   ✅ Passed: ${results.passed}`);
  console.log(`   ❌ Failed: ${results.failed}`);
  console.log(`   📊 Success Rate: ${((results.passed / results.total) * 100).toFixed(1)}%`);
  
  if (results.failed === 0) {
    console.log('\n🎉 ALL TESTS PASSED! Recovery flow is working perfectly in production!');
    console.log('✅ The complete recovery flow is ready for users.');
  } else {
    console.log('\n⚠️  Some tests failed. Please check the errors above.');
    console.log('🔧 Review the failed steps and fix any issues before production use.');
  }
  
  return results;
}

// Run the test
runProductionRecoveryTest().catch(console.error);
