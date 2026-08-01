// Sync: Jira/Xray -> Firestore stats/counters.{bugs,projects,testCases}.{raw,lastSynced}
// Never touches .offset (set manually via stats-admin.html).
// Firestore no longer stores a .front field — front = raw + offset is computed here,
// right before publishing, and written ONLY to the public static file (stats.json),
// which is what antonionuzzi.com actually reads. Firestore (raw/offset) is never
// exposed to the public site.
//
// Required environment variables (set as GitHub Actions secrets):
//   JIRA_EMAIL, JIRA_API_TOKEN, XRAY_CLIENT_ID, XRAY_CLIENT_SECRET, FIREBASE_PASSWORD

const fs = require('fs');
const path = require('path');

const JIRA_BASE = 'https://facilitygrid.atlassian.net';
const JIRA_ACCOUNT_ID = '712020:fa86873e-8fde-4edc-9638-9d8f71fbf71f';
const FIREBASE_API_KEY = 'AIzaSyDdFk-2f8EBqepoRXC10yoASiBQ3gpMt4k';
const FIREBASE_PROJECT_ID = 'cantinho-b2b09';
const FIREBASE_EMAIL = 'antonionuzzi@gmail.com';

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function jiraAuthHeader() {
  const email = requireEnv('JIRA_EMAIL');
  const token = requireEnv('JIRA_API_TOKEN');
  return 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
}

async function jiraPost(path, body) {
  const res = await fetch(JIRA_BASE + path, {
    method: 'POST',
    headers: {
      Authorization: jiraAuthHeader(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Jira POST ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function countBugs() {
  const jql = `reporter = "${JIRA_ACCOUNT_ID}" AND issuetype = Bug`;
  const data = await jiraPost('/rest/api/3/search/approximate-count', { jql });
  return data.count;
}

async function countEpics() {
  const jql = `(assignee = "${JIRA_ACCOUNT_ID}" OR reporter = "${JIRA_ACCOUNT_ID}") AND issuetype != Epic`;
  const directEpics = new Set();
  const otherParents = new Set();
  let token;
  while (true) {
    const body = { jql, fields: ['customfield_10002', 'parent'], maxResults: 100 };
    if (token) body.nextPageToken = token;
    const page = await jiraPost('/rest/api/3/search/jql', body);
    for (const issue of page.issues || []) {
      const f = issue.fields;
      if (!f) continue;
      if (f.customfield_10002) directEpics.add(f.customfield_10002);
      if (f.parent) {
        if (f.parent.fields?.issuetype?.name === 'Epic') directEpics.add(f.parent.key);
        else otherParents.add(f.parent.key);
      }
    }
    if (page.isLast || !page.nextPageToken) break;
    token = page.nextPageToken;
  }
  // Second hop: some issues (e.g. Xray Tests) only carry an Epic link via their own parent.
  if (otherParents.size) {
    const keys = [...otherParents];
    const body = { jql: `key in (${keys.join(',')})`, fields: ['customfield_10002', 'parent'], maxResults: 100 };
    const page = await jiraPost('/rest/api/3/search/jql', body);
    for (const issue of page.issues || []) {
      const f = issue.fields;
      if (!f) continue;
      if (f.customfield_10002) directEpics.add(f.customfield_10002);
      if (f.parent?.fields?.issuetype?.name === 'Epic') directEpics.add(f.parent.key);
    }
  }
  return directEpics.size;
}

async function xrayAuthToken() {
  const res = await fetch('https://xray.cloud.getxray.app/api/v2/authenticate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: requireEnv('XRAY_CLIENT_ID'),
      client_secret: requireEnv('XRAY_CLIENT_SECRET'),
    }),
  });
  if (!res.ok) throw new Error(`Xray auth failed: ${res.status}`);
  const token = await res.json();
  return token;
}

async function xrayGraphQL(token, query) {
  const res = await fetch('https://xray.cloud.getxray.app/api/v2/graphql', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const json = await res.json();
  if (json.errors) throw new Error('Xray GraphQL error: ' + JSON.stringify(json.errors));
  return json.data;
}

async function countTestSteps() {
  const token = await xrayAuthToken();
  const jql = `assignee = "${JIRA_ACCOUNT_ID}"`;
  let start = 0;
  let total = 0;
  let totalSteps = 0;
  while (true) {
    const query = `{ getTests(jql: ${JSON.stringify(jql)}, limit: 100, start: ${start}) { total results { steps { id } } } }`;
    const data = await xrayGraphQL(token, query);
    const page = data.getTests;
    for (const t of page.results) totalSteps += (t.steps || []).length;
    total = page.total;
    start += 100;
    if (start >= total) break;
  }
  return totalSteps;
}

async function firebaseSignIn() {
  const password = requireEnv('FIREBASE_PASSWORD');
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: FIREBASE_EMAIL, password, returnSecureToken: true }),
    }
  );
  if (!res.ok) throw new Error(`Firebase sign-in failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.idToken;
}

async function writeRaw(idToken, { bugs, projects, testCases }) {
  const now = new Date().toISOString();
  const maskFields = [
    'bugs.raw', 'bugs.lastSynced',
    'projects.raw', 'projects.lastSynced',
    'testCases.raw', 'testCases.lastSynced',
  ];
  const mask = maskFields.map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
  const body = {
    fields: {
      bugs: { mapValue: { fields: { raw: { integerValue: String(bugs) }, lastSynced: { stringValue: now } } } },
      projects: { mapValue: { fields: { raw: { integerValue: String(projects) }, lastSynced: { stringValue: now } } } },
      testCases: { mapValue: { fields: { raw: { integerValue: String(testCases) }, lastSynced: { stringValue: now } } } },
    },
  };
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/stats/counters?${mask}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + idToken, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Firestore write failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function intField(doc, key, field) {
  const v = doc?.fields?.[key]?.mapValue?.fields?.[field]?.integerValue;
  return v !== undefined ? parseInt(v, 10) : 0;
}

async function readCounters(idToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/stats/counters`;
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + idToken } });
  if (!res.ok) throw new Error(`Firestore read failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function writePublicFile(front) {
  const outPath = path.join(__dirname, '..', 'stats.json');
  fs.writeFileSync(outPath, JSON.stringify(front, null, 2) + '\n');
  console.log('Wrote', outPath, JSON.stringify(front));
}

async function main() {
  console.log('Counting bugs...');
  const bugs = await countBugs();
  console.log('bugs =', bugs);

  console.log('Counting epics...');
  const projects = await countEpics();
  console.log('projects =', projects);

  console.log('Counting test steps...');
  const testCases = await countTestSteps();
  console.log('testCases =', testCases);

  console.log('Signing in to Firebase...');
  const idToken = await firebaseSignIn();

  console.log('Writing raw values to Firestore...');
  await writeRaw(idToken, { bugs, projects, testCases });

  console.log('Reading back offsets to compute front...');
  const doc = await readCounters(idToken);
  const front = {
    bugs: bugs + intField(doc, 'bugs', 'offset'),
    projects: projects + intField(doc, 'projects', 'offset'),
    testCases: testCases + intField(doc, 'testCases', 'offset'),
  };

  writePublicFile(front);

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
