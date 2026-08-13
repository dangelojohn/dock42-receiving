// Small JSON-RPC helper for calling Odoo's `/dock42/api/*` controllers.
// Odoo's JSON-RPC controllers (`type='json'`) expect a request body of
// `{"jsonrpc":"2.0","method":"call","params":{...}}` and respond with either
// `{"result": {...}}` or `{"error": {...}}`.
export async function odooCall<T = any>(route: string, params: Record<string, any> = {}): Promise<T> {
  const res = await fetch(route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params }),
  });
  const body = await res.json();
  if (body.error) {
    throw new Error(body.error.data?.message || body.error.message || 'Request failed');
  }
  return body.result as T;
}
