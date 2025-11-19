// Script pré-requisição global
// === Auto-injeção de codVend em endpoints de partner/list* ===
(function addCodVendToPartnerLists() {
  try {
    const url = pm.request.url;
    const path = url.getPath(); // ex: "/partner/listByName"

    // Só mexe em rotas de partner com "list" no final do path
    const isPartner = path.startsWith("/partner/");
    const isListLike = path.toLowerCase().includes("list");

    if (!isPartner || !isListLike) {
      return; // não é alvo, sai fora
    }

    // Já tem codVend na query? então não faz nada
    const hasCodVend =
      url.query &&
      url.query.some(q => q && q.key === "codVend");

    if (hasCodVend) {
      return;
    }

    // Pega codVend de variável (collection ou environment)
    const codVend =
      pm.collectionVariables.get("codVend") ||
      pm.environment.get("codVend");

    if (!codVend) {
      // nada configurado, não adiciona pra não quebrar
      console.warn("[AUTO-codVend] Variável codVend não configurada.");
      return;
    }

    url.addQueryParams({ key: "codVend", value: String(codVend) });
  } catch (e) {
    console.warn("[AUTO-codVend] Erro ao injetar codVend:", e);
  }
})();

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
