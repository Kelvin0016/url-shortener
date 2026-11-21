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
