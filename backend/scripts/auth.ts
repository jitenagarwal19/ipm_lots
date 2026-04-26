import fs from 'fs';
import readline from 'readline';
import { google } from 'googleapis';
import path from 'path';

const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];
const TOKEN_PATH = path.join(__dirname, '../token.json');
const CREDENTIALS_PATH = path.join(__dirname, '../credentials.json');

// Load client secrets from a local file.
fs.readFile(CREDENTIALS_PATH, (err, content) => {
  if (err) {
    console.error('Error loading client secret file:', err.message);
    console.log('Make sure credentials.json is placed inside the backend/ directory.');
    process.exit(1);
  }
  authorize(JSON.parse(content.toString()));
});

function authorize(credentials: any) {
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;

  if (!client_secret || !client_id) {
    console.error('Invalid credentials.json format. Make sure you downloaded the OAuth 2.0 Client IDs JSON.');
    process.exit(1);
  }

  const redirect_uri = (redirect_uris && redirect_uris.length > 0) ? redirect_uris[0] : 'http://localhost';
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uri);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getNewToken(oAuth2Client);
    oAuth2Client.setCredentials(JSON.parse(token.toString()));
    console.log('Token already exists at', TOKEN_PATH, '- You are successfully authenticated!');
  });
}

function getNewToken(oAuth2Client: any) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('\n=============================================');
  console.log('AUTHORIZE THIS APP BY VISITING THIS URL:');
  console.log('---------------------------------------------');
  console.log(authUrl);
  console.log('=============================================\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err: any, token: any) => {
      if (err) return console.error('Error retrieving access token', err);
      oAuth2Client.setCredentials(token);
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) return console.error(err);
        console.log('Token successfully stored to', TOKEN_PATH);
      });
    });
  });
}
