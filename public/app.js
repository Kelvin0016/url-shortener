const createForm = document.getElementById('create-form');
const createResult = document.getElementById('create-result');

createForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const url = document.getElementById('url').value.trim();
  const code = document.getElementById('code').value.trim();

  const body = { url };
  if (code) body.code = code;

  const res = await fetch('/api/links', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();

  if (!res.ok) {
    createResult.textContent = `Error ${res.status}: ${data.error}`;
    return;
  }

  const shortUrl = `${location.origin}/${data.code}`;
  createResult.textContent = 'Short link: ';
  const link = document.createElement('a');
  link.href = shortUrl;
  link.textContent = shortUrl;
  createResult.append(link);

  const tokenLine = document.createElement('p');
  tokenLine.textContent = `Edit token (save it now, it is shown only once): ${data.editToken}`;
  createResult.append(tokenLine);
  loadLinks();
});

const statsForm = document.getElementById('stats-form');
const statsResult = document.getElementById('stats-result');

statsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.getElementById('stats-code').value.trim();
  const code = input.split('/').pop();

  const res = await fetch(`/api/links/${encodeURIComponent(code)}/stats`);
  const data = await res.json();

  if (!res.ok) {
    statsResult.textContent = `Error ${res.status}: ${data.error}`;
    return;
  }

  statsResult.textContent = `${data.code} → ${data.url}: ${data.clicks} clicks`;
});

const editForm = document.getElementById('edit-form');
const editResult = document.getElementById('edit-result');

editForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const code = document.getElementById('edit-code').value;
  const url = document.getElementById('edit-url').value.trim();
  const token = document.getElementById('edit-token').value.trim();

  const res = await fetch(`/api/links/${encodeURIComponent(code)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ url }),
  });
  const data = await res.json();

  if (!res.ok) {
    editResult.textContent = `Error ${res.status}: ${data.error}`;
    return;
  }

  editResult.textContent = `${data.code} now points to ${data.url}`;
  loadLinks();
});

const editCode = document.getElementById('edit-code');
const editUrl = document.getElementById('edit-url');
let linkList = [];

async function loadLinks() {
  const res = await fetch('/api/links');
  linkList = await res.json();
  const selected = editCode.value;

  editCode.replaceChildren(new Option('Choose a link…', ''));
  for (const row of linkList) {
    editCode.append(new Option(`${row.code} → ${row.url}`, row.code));
  }
  editCode.value = selected;
}

editCode.addEventListener('change', () => {
  const row = linkList.find((link) => link.code === editCode.value);
  editUrl.value = row ? row.url : '';
});

loadLinks();
