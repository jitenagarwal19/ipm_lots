import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { google } from 'googleapis';

const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');
const TOKEN_PATH = path.join(process.cwd(), 'token.json');

function ask(question: string) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise<string>((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    })
  );
}

async function main() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(`Missing credentials.json at ${CREDENTIALS_PATH}`);
  }

  const raw = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
  const credentials = JSON.parse(raw);
  const base = credentials.installed || credentials.web;
  if (!base?.client_id || !base?.client_secret) {
    throw new Error('Invalid credentials.json: expected { installed: {...} } or { web: {...} }');
  }

  const redirectUri = (base.redirect_uris && base.redirect_uris[0]) || 'http://localhost:4000';
  const oAuth2Client = new google.auth.OAuth2(base.client_id, base.client_secret, redirectUri);

  const scopes = ['https://www.googleapis.com/auth/gmail.modify'];
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes,
  });

  console.log('\nOpen this URL to authorize Gmail access:\n');
  console.log(authUrl);
  console.log('\nThen paste the "code" parameter here.\n');

  const code = await ask('Authorization code: ');
  if (!code) throw new Error('No authorization code provided.');

  const { tokens } = await oAuth2Client.getToken(code);
  if (!tokens) throw new Error('No tokens returned from Google.');

  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log(`\nSaved token to ${TOKEN_PATH}\n`);
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});

