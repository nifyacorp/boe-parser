/**
 * Secret Manager Testing Script
 * 
 * This script tests access to Google Cloud Secret Manager
 * Run with: node scripts/test-secrets.js
 */
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const secretName = 'PARSER_API_KEY';
const projectId = process.env.GOOGLE_CLOUD_PROJECT || '';

async function testSecretAccess() {
  console.log('=== Secret Manager Access Test ===');
  console.log(`Project ID: ${projectId || 'Not set'}`);
  
  if (!projectId) {
    console.error('ERROR: GOOGLE_CLOUD_PROJECT environment variable not set');
    process.exit(1);
  }
  
  try {
    // Check environment first
    console.log('\nChecking environment variables:');
    console.log(`PARSER_API_KEY environment variable: ${process.env.PARSER_API_KEY ? 'Found' : 'Not found'}`);
    
    // Check mounted secrets
    console.log('\nChecking mounted secrets:');
    const secretPath = `/etc/secrets/${secretName}`;
    try {
      const fs = await import('fs');
      if (fs.existsSync(secretPath)) {
        console.log(`Secret mounted at ${secretPath}: YES`);
        const value = fs.readFileSync(secretPath, 'utf8').trim();
        console.log(`Secret has value: ${value ? 'YES' : 'NO (empty)'}`);
      } else {
        console.log(`Secret mounted at ${secretPath}: NO`);
      }
    } catch (err) {
      console.error(`Error checking mounted secret: ${err.message}`);
    }
    
    // Try Secret Manager API
    console.log('\nAttempting to access via Secret Manager API:');
    const client = new SecretManagerServiceClient();
    
    // List all accessible secrets
    console.log('\n1. Listing accessible secrets:');
    const [secrets] = await client.listSecrets({
      parent: `projects/${projectId}`,
    });
    
    console.log(`Found ${secrets.length} accessible secrets`);
    secrets.forEach((secret, i) => {
      console.log(`${i+1}. ${secret.name}`);
    });
    
    // Try to access our specific secret
    console.log(`\n2. Attempting to access secret: ${secretName}`);
    const secretPath2 = `projects/${projectId}/secrets/${secretName}/versions/latest`;
    
    try {
      const [version] = await client.accessSecretVersion({ name: secretPath2 });
      if (version && version.payload && version.payload.data) {
        console.log(`Successfully accessed secret: ${secretName}`);
        console.log(`Secret has value: YES`);
      } else {
        console.log(`Secret accessed but payload is empty`);
      }
    } catch (secretError) {
      console.error(`Error accessing secret ${secretName}: ${secretError.message}`);
      console.error(`Error code: ${secretError.code}`);
      
      if (secretError.code === 5) {
        console.error('Secret or version not found.');
      } else if (secretError.code === 7) {
        console.error('Permission denied. Check if service account has Secret Manager Secret Accessor role.');
      }
    }
    
  } catch (error) {
    console.error('Test failed with error:', error);
  }
}

testSecretAccess().catch(err => {
  console.error('Unhandled exception:', err);
  process.exit(1);
}); 