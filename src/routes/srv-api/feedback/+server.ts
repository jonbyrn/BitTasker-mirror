import { json } from '@sveltejs/kit';

export async function POST({ request, fetch, locals }) {
  const baseUrl = process.env.NOCODB_BASE_URL ?? 'https://tables.bittasker.com';
  const apiToken = process.env.NOCODB_API_TOKEN ?? '';
  const tableId = process.env.NOCODB_FEEDBACK_TABLE_ID ?? 'm5ukz87c3bxhwm2';

  if (!apiToken) {
    return json({ error: 'Server not configured: NOCODB_API_TOKEN missing' }, { status: 500 });
  }

  const incoming = await request.formData();

  const required = ['npub', 'status', 'Description'];
  for (const key of required) {
    if (!incoming.has(key)) {
      return json({ error: `Missing field: ${key}` }, { status: 400 });
    }
  }

  const clientNpub = incoming.get('npub');
  const clientUsername = incoming.get('username');

  const resolvedNpub = (locals as any)?.user?.npub || clientNpub || '';
  const resolvedUsername = (locals as any)?.user?.name || clientUsername || '';

  const recordData: Record<string, any> = {
    npub: resolvedNpub,
    username: resolvedUsername,
    Status: incoming.get('status') ?? '',
    Description: incoming.get('Description') ?? '',
    'Contact Info': incoming.get('contact_info') ?? ''
  };

  const screenshot = incoming.get('Screenshot');
  if (screenshot instanceof File) {
    const uploadUrl = `${baseUrl.replace(/\/$/, '')}/api/v2/storage/upload`;
    const uploadForm = new FormData();
    uploadForm.append('file', screenshot, screenshot.name);

    const upRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'xc-token': apiToken },
      body: uploadForm
    });

    const upCt = upRes.headers.get('content-type') ?? '';
    const upBody = upCt.includes('application/json') ? await upRes.json() : await upRes.text();
    if (!upRes.ok) {
      return json({ error: 'Upload failed', details: upBody }, { status: upRes.status });
    }

    let items: any[] = [];
    if (Array.isArray(upBody)) items = upBody; else if (upBody?.list && Array.isArray(upBody.list)) items = upBody.list; else items = [upBody];
    items = items.map((it) => (it && !it.title && it.name ? { ...it, title: it.name } : it));
    recordData['Screenshot'] = items;
  }

  const url = `${baseUrl.replace(/\/$/, '')}/api/v2/tables/${tableId}/records?use_field_names=true`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xc-token': apiToken,
      'content-type': 'application/json',
      'accept': 'application/json'
    },
    body: JSON.stringify([recordData])
  });

  const contentType = res.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    return json({ error: 'Upstream error', details: body }, { status: res.status });
  }
  return json({ ok: true, data: body, sent: recordData });
}

