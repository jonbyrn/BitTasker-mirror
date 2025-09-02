#!/usr/bin/env node

/**
 * Test Gmail SMTP Connection
 * This script tests the Gmail SMTP connection with the provided credentials
 */

import nodemailer from 'nodemailer';

async function testGmailSMTP() {
  console.log('🧪 Testing Gmail SMTP Connection...\n');
  
  // Gmail SMTP configuration - Use environment variables
  const transporter = nodemailer.createTransporter({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false, // Use STARTTLS
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    connectionTimeout: 30000,
    greetingTimeout: 15000,
    socketTimeout: 300000,
  });

  try {
    console.log('📧 Verifying SMTP configuration...');
    await transporter.verify();
    console.log('✅ SMTP configuration verified successfully!');
    
    console.log('\n📧 Testing email sending...');
    const testEmail = {
      from: process.env.SMTP_USER,
      to: process.env.TEST_EMAIL || 'test@example.com',
      subject: 'BitTasker SMTP Test',
      text: 'This is a test email from BitTasker recovery system.',
      html: '<h1>BitTasker SMTP Test</h1><p>This is a test email from BitTasker recovery system.</p>'
    };
    
    const result = await transporter.sendMail(testEmail);
    console.log('✅ Test email sent successfully!');
    console.log('📧 Message ID:', result.messageId);
    console.log('📧 Response:', result.response);
    
  } catch (error) {
    console.error('❌ SMTP test failed:');
    console.error('Error:', error.message);
    
    if (error.message.includes('Invalid login')) {
      console.log('\n💡 Solution: The Gmail App Password might be incorrect.');
      console.log('Please check:');
      console.log('1. Gmail 2FA is enabled');
      console.log('2. App Password is correct');
      console.log('3. "Less secure app access" is disabled');
    } else if (error.message.includes('Connection timeout')) {
      console.log('\n💡 Solution: Network or firewall issue.');
      console.log('Try using a different network or check firewall settings.');
    } else {
      console.log('\n💡 Solution: Check Gmail settings and try again.');
    }
  }
}

// Run the test
testGmailSMTP().catch(console.error);
