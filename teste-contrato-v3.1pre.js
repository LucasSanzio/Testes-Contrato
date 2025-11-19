// 1) Basic Auth
(function setupBasicAuth() {
  const username = pm.variables.get('username');
  const password = pm.variables.get('password');

  if (username && password) {
    const credentials = btoa(username + ':' + password);
    pm.variables.set('auto_token', credentials);
  }
})();

// 2) Sincroniza clientId -> accessData e garante header
(function syncAccessData() {
  const headerKey = 'accessData';

  // Fonte canônica:
  // - se o ambiente já tiver clientId (base64), usamos ele;
  // - se não, caímos no accessData atual.
  let value = pm.variables.get('clientId') || pm.variables.get('accessData') || '';

  // Espelha em variável accessData para os scripts de teste
  if (value) {
    pm.variables.set('accessData', value);
  }

  // Garante que o header exista e com o valor atualizado
  const headers = pm.request.headers;
  const existing = headers.get(headerKey);

  if (existing !== undefined) {
    headers.upsert({ key: headerKey, value });
  } else {
    headers.add({ key: headerKey, value });
  }
})();

