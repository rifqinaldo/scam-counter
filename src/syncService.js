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

/**
 * Fetches live data from GitHub. Returns { data, sha } or null.
 */
export async function fetchLiveData() {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}?t=${Date.now()}`,
      {
        headers: {
          'Authorization': `token ${PAT_TOKEN}`,
          'Accept': 'application/vnd.github+json',
          'Cache-Control': 'no-cache'
        }
      }
    );
    if (res.ok) {
      const json = await res.json();
      const contentStr = base64ToUtf8(json.content.replace(/\n/g, ''));
      return { data: JSON.parse(contentStr), sha: json.sha };
    }
  } catch (err) {
    console.warn('fetchLiveData (API) failed', err);
  }

  // Fallback to raw GitHub file (no auth needed, but slower to update)
  try {
    const rawRes = await fetch(
      `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/${FILE_PATH}?t=${Date.now()}`,
      { cache: 'no-store' }
    );
    if (rawRes.ok) {
      const data = await rawRes.json();
      return { data, sha: null };
    }
  } catch (err) {}

  return null;
}

/**
 * Pushes data to GitHub with automatic SHA conflict resolution.
 * If a 409 conflict occurs (stale SHA), automatically fetches latest SHA and retries once.
 * @param {object} data - The data payload to push
 * @param {string|null} currentSha - The known current SHA, or null to auto-fetch
 * @returns {string|null} - The new SHA after successful push, or null on failure
 */
export async function pushLiveData(data, currentSha = null) {
  // Add timestamp to data so polling can do proper conflict detection
  const payload = {
    ...data,
    updatedAt: Date.now()
  };

  const doRequest = async (sha) => {
    const contentStr = JSON.stringify(payload, null, 2);
    const base64Content = utf8ToBase64(contentStr);

    const body = {
      message: `Live update: ${new Date().toISOString()}`,
      content: base64Content
    };
    if (sha) body.sha = sha;

    const res = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `token ${PAT_TOKEN}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      }
    );

    return res;
  };

  try {
    // Get SHA if not provided
    let sha = currentSha;
    if (!sha) {
      const current = await fetchLiveData();
      if (current && current.sha) sha = current.sha;
    }

    let res = await doRequest(sha);

    // If 409 Conflict (stale SHA), auto-fetch latest SHA and retry ONCE
    if (res.status === 409) {
      console.warn('SHA conflict detected, auto-retrying with fresh SHA...');
      const fresh = await fetchLiveData();
      if (fresh && fresh.sha) {
        res = await doRequest(fresh.sha);
      }
    }

    if (res.ok) {
      const json = await res.json();
      return json.content.sha;
    } else {
      const errText = await res.text();
      console.error('pushLiveData failed:', res.status, errText);
    }
  } catch (err) {
    console.error('pushLiveData error:', err);
  }

  return null;
}
