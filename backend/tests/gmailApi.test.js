const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const variableKeys = ['EMAIL_PROVIDER', 'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN', 'GMAIL_FROM', 'SMTP_HOST', 'RESEND_API_KEY', 'NODE_ENV'];
const originalEnv = Object.fromEntries(variableKeys.map(k => [k, process.env[k]]));
const originalFetch = global.fetch;
const originalLoad = Module._load;

function init() {
  for (const key of variableKeys) delete process.env[key];
  Object.assign(process.env, {
    EMAIL_PROVIDER: 'gmail_api', GMAIL_CLIENT_ID: 'test-client', GMAIL_CLIENT_SECRET: 'test-secret',
    GMAIL_REFRESH_TOKEN: 'test-refresh', GMAIL_FROM: 'sender@example.test', SMTP_HOST: 'smtp.gmail.com', NODE_ENV: 'production'
  });
  // Mock only the MIME composer: we don't need network or third-party npm packages
  Module._load = function (request, parent, isMain) {
    if (request === 'nodemailer') return {
      createTransport(options) {
        if (options.streamTransport) return { sendMail: async (mail) => ({ message: Buffer.from(`From: ${mail.from}\nTo: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.html}${(mail.attachments || []).map(a => `${a.filename}: ${Buffer.from(a.content).toString('base64')}`).join('')}`) }) };
        throw Error('SMTP was unexpectedly selected!');
      }
    };
    return originalLoad.apply(this, arguments);
  };
  for (const filename of ['../gmailApi', '../mail']) delete require.cache[require.resolve(filename)];
}
function restore() {
  Module._load = originalLoad;
  global.fetch = originalFetch;
  for (const key of variableKeys) {
    if (originalEnv[key] === undefined) delete process.env[key]; else process.env[key] = originalEnv[key];
  }
}

test('Gmail API sends OTP over HTTPS and never uses SMTP', async () => {
  init();
  const requests=[];
  global.fetch=async (url,options) => {
    requests.push({url,options});
    return url.includes('oauth2.googleapis.com')
      ? {ok:true,json:async()=>({access_token:'test-access',expires_in:3600})}
      : {ok:true,status:200,json:async()=>({id:'sent-id'})};
  };
  try {
    const {sendOTP}=require('../mail');
    assert.equal(await sendOTP('user@example.test','Test User','123456'),true);
    assert.equal(requests.length,2);
    assert.ok(requests[0].url.endsWith('/token'));
    assert.ok(requests[1].url.endsWith('/users/me/messages/send'));
    const raw=Buffer.from(JSON.parse(requests[1].options.body).raw,'base64url').toString();
    assert.match(raw,/123456/);
    assert.match(raw,/From: sender@example.test/);
    assert.equal(requests[1].options.headers.Authorization,'Bearer test-access');
  } finally {restore();}
});

test('Gmail API includes a PDF attachment in raw MIME', async () => {
  init();
  const requests=[];
  global.fetch=async (url,options) => {
    requests.push({url,options});
    return url.includes('oauth2.googleapis.com')
      ? {ok:true,json:async()=>({access_token:'test-access',expires_in:3600})}
      : {ok:true,status:200,json:async()=>({id:'sent-id'})};
  };
  try {
    const {sendWithGmailApi}=require('../gmailApi');
    await sendWithGmailApi({to:'user@example.test',subject:'Interview',html:'Your call letter',attachments:[{filename:'Interview.pdf',content:Buffer.from('%PDF-1.4')} ]});
    const raw=Buffer.from(JSON.parse(requests[1].options.body).raw,'base64url').toString();
    assert.match(raw,/Interview\.pdf/);
    assert.match(raw,/JVBERi0xLjQ=/);  // mock MIME composer serializes attachment bytes
  } finally {restore();}
});

test('Gmail OAuth refresh failure returns safe diagnostic, not tokens', async () => {
  init();
  global.fetch=async()=>({ok:false,status:400,json:async()=>({error:'invalid_grant',error_description:'do not expose user secret'})});
  try {
    const {sendOTP}=require('../mail');
    await assert.rejects(sendOTP('a@example.test','A','123456'), err => {
      assert.match(err.message,/invalid_grant/);
      assert.doesNotMatch(err.message,/do not expose/);
      return true;
    });
  } finally {restore();}
});

test('Gmail API missing configuration fails without falling back to SMTP', async () => {
  init();
  delete process.env.GMAIL_REFRESH_TOKEN;
  try {
    const {sendOTP}=require('../mail');
    await assert.rejects(sendOTP('a@example.test','A','123456'), /GMAIL_REFRESH_TOKEN/);
  } finally {restore();}
});
