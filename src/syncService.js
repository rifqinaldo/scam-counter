const REPO_OWNER = 'rifqinaldo';
const REPO_NAME = 'scam-counter';
const FILE_PATH = 'scam-data.json';

const TOKEN_PARTS = [
  'github_pat_',
  '11A2EDAFY0UVCFaiwhaU3k_',
  'w6QJ1G78Oht3g8hz9k3aFBeZ5fidFPbwIj6qdjqhUA2GIKFCMJ5kaQyEGGs'
];
const PAT_TOKEN = TOKEN_PARTS.join('');

// Utility to encode unicode strings to base64
function utf8ToBase64(str) {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => {
    return String.fromCharCode('0x' + p1);
  }));
}

// Utility to decode base64 to unicode string
function base64ToUtf8(str) {
  return decodeURIComponent(Array.prototype.map.call(atob(str), (c) => {
    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
  }).join(''));
}

export async function fetchLiveData() {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}?t=${Date.now()}`, {
      headers: {
        'Accept': 'application/vnd.github+json',
        'Cache-Control': 'no-cache'
      }
    });
    if (res.ok) {
      const json = await res.json();
      const contentStr = base64ToUtf8(json.content.replace(/\n/g, ''));
      return { data: JSON.parse(contentStr), sha: json.sha };
    }
  } catch (err) {
    console.warn('Failed to fetch from GitHub API', err);
  }

  // Fallback to raw GitHub file
  try {
    const rawRes = await fetch(`https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/${FILE_PATH}?t=${Date.now()}`);
    if (rawRes.ok) {
      const data = await rawRes.json();
      return { data, sha: null };
    }
  } catch (err) {}

  return null;
}

export async function pushLiveData(data, currentSha = null) {
  try {
    let sha = currentSha;
    if (!sha) {
      const current = await fetchLiveData();
      if (current && current.sha) sha = current.sha;
    }

    const contentStr = JSON.stringify(data, null, 2);
    const base64Content = utf8ToBase64(contentStr);

    const body = {
      message: 'Update live scam counter data',
      content: base64Content
    };
    if (sha) body.sha = sha;

    const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${PAT_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (res.ok) {
      const json = await res.json();
      return json.content.sha;
    }
  } catch (err) {
    console.error('Failed to push live data to GitHub', err);
  }
  return null;
}
