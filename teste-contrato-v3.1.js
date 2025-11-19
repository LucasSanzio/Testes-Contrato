// =======================================================
// BACKEND VIDYA FORCE - TESTES DE CONTRATO (v3.1)
// =======================================================

// =======================================================
// 1. CONTEXTO E HELPERS GERAIS
// =======================================================

const rawUrl = pm.request.url.toString();
const url = rawUrl.toLowerCase();
const method = pm.request.method;
const status = pm.response.code;
const contentType = (pm.response.headers.get("Content-Type") || "").toLowerCase();
const isJson = contentType.includes("application/json");
const requestName = (pm.info.requestName || "").toLowerCase();

// Tenta parsear JSON (sem quebrar se não for JSON)
let json = null;
let jsonParseError = false; // Adicionado do script do usuário
if (isJson) {
    try {
        json = pm.response.json();
    } catch (e) {
        jsonParseError = true; // Adicionado do script do usuário
    }
}



// Flags gerais de envelope de erro/sucesso (apenas em memória, não viram variáveis do Postman)
const hasErrorFlag =
  isJson &&
  json &&
  Object.prototype.hasOwnProperty.call(json, "hasError") &&
  json.hasError === true;

const isSuccessEnvelope =
  isJson &&
  json &&
  Object.prototype.hasOwnProperty.call(json, "hasError") &&
  json.hasError === false;

// Identifica se é request NEGATIVO pelo nome
const isNegativeCase =
    requestName.includes("[negativo]") ||
    requestName.includes("[error]") ||
    requestName.includes("[erro]") ||
    requestName.includes("[4xx]") ||
    requestName.includes("[5xx]");

// Segmentar path em minúsculas
const pathSegments = (pm.request.url.path || [])
    .filter(Boolean)
    .map(s => String(s).toLowerCase());

// Resolve chave de módulo automática
function getModuleKey() {
    if (!pathSegments.length) return "root";
    if (pathSegments[0] === "ppid") {
        if (pathSegments.length > 1) {
            return "ppid_" + pathSegments[1];
        }
        return "ppid_root";
    }
    return pathSegments[0];
}

const moduleKey = getModuleKey();

// =======================================================
// 1.5 SMOKE TEST + GATE (Status 2xx)
// =======================================================

// Só executa o Gate se não for um cenário negativo intencional
if (!isNegativeCase) {
    let smokeFailed = false;

    // Status deve ser 2xx (200 a 299)
    if (status < 200 || status >= 300) {
        smokeFailed = true;
    }

    // Testa o status e falha se não for 2xx
    pm.test(`[SMOKE] Status 2xx esperado`, () => {
        pm.expect(status, `Status inesperado: ${status} (${rawUrl})`).to.be.within(200, 299);
    });

    // Se o smoke falhou, interrompe o script
    if (smokeFailed) {
        console.log(`[GATE] Smoke falhou (Status ${status}). Ignorando testes avançados para ${rawUrl}.`);
        return; // <-- Interrompe a execução dos testes subsequentes
    }
    // Interrompe se hasError=true mesmo com status 2xx
    if (isSuccessEnvelope === false && hasErrorFlag === true) {
        pm.test("[GATE] Resposta com hasError=true deve falhar", () => {
            pm.expect.fail(`hasError=true detectado em resposta com status ${status} (${rawUrl})`);
        });
        console.log(`[GATE] hasError=true detectado. Interrompendo testes para ${rawUrl}.`);
        return; // <-- Interrompe execução dos testes subsequentes
    }

}

// Helpers para respostas no padrão BaseList
function isBaseListResponse(body) {
    if (!body || typeof body !== "object") return false;
    const hasHasError = Object.prototype.hasOwnProperty.call(body, "hasError");
    const hasQtd =
        Object.prototype.hasOwnProperty.call(body, "qtdRegistros") ||
        Object.prototype.hasOwnProperty.call(body, "qtdregistros");
    const hasData = Array.isArray(body.data);
    return hasHasError && hasQtd && hasData;
}

function getMainArray(body) {
    if (!body) return [];
    if (Array.isArray(body)) return body;
    if (Array.isArray(body.data)) return body.data;
    return [];
}

// Helper genérico: pelo menos 1 chave presente
function ensureAtLeastOneKey(obj, keys, msg) {
    const ok = keys.some(k => Object.prototype.hasOwnProperty.call(obj, k));
    pm.expect(ok, msg || `Deve possuir pelo menos um dos campos: ${keys.join(", ")}`).to.be.true;
}

// Helper: tipo esperado
function ensureFieldType(value, expectedTypes, msg) {
    const types = Array.isArray(expectedTypes) ? expectedTypes : [expectedTypes];
    const actual = typeof value;
    const ok = types.includes(actual);
    pm.expect(ok, msg || `Tipo ${actual} não está entre os esperados: ${types.join(", ")}`).to.be.true;
}


// =======================================================
// 2. CONTRATO GERAL DE JSON
// =======================================================

// 2.1 JSON válido quando Content-Type indica application/json (Adicionado do script do usuário)
pm.test("[CT-001] [CONTRACT][GENERIC] JSON válido quando Content-Type é application/json", () => {
    if (!isJson) {
        return pm.expect(true, "N/A").to.be.true;
    }
    pm.expect(jsonParseError, "Falha ao parsear JSON da resposta").to.be.false;
});

// O restante dos testes genéricos só roda se for JSON válido
if (isJson && json && typeof json === "object") {
    const bodyStr = JSON.stringify(json).toLowerCase();

    // 2.2 Resposta JSON não contém HTML bruto
    pm.test("[CT-001] [CONTRACT][GENERIC] Resposta JSON não contém HTML", () => {
        pm.expect(bodyStr).to.not.include("<html");
    });

    // 2.3 Convenção hasError
    if (Object.prototype.hasOwnProperty.call(json, "hasError")) {
        pm.test("[CT-001] [CONTRACT][GENERIC] hasError é booleano", () => {
            pm.expect(json.hasError, "hasError deve ser booleano").to.be.a("boolean");
        });

        pm.test("[CT-001] [CONTRACT][GENERIC] Estrutura de erro quando hasError = true", () => {
            if (json.hasError === true) {
                const hasMsg =
                    json.message ||
                    json.mensagem ||
                    json.error ||
                    (Array.isArray(json.errors) && json.errors.length > 0);
                pm.expect(!!hasMsg, "hasError=true sem mensagem/erro detalhado").to.be.true;
            }
        });

        pm.test("[CT-001] [CONTRACT][GENERIC] Sucesso não vaza stack/exception", () => {
            if (json.hasError === false) {
                const lixo =
                    json.stackTrace ||
                    json.exception ||
                    json.developerMessage ||
                    json.error;
                pm.expect(!!lixo, "Campos de erro vazando em sucesso").to.be.false;
            }
        });
    }
}


// =======================================================
// 3. CONTRATO PARA ENVELOPES BASELIST
// =======================================================

// O teste de BaseList não deve rodar em cenários negativos, a menos que seja um BaseList de erro
if (isJson && json && isBaseListResponse(json) && !isNegativeCase) {
    const data = getMainArray(json);

    pm.test("[CT-002] [CONTRACT][BaseList] Estrutura mínima válida", () => {
        pm.expect(json).to.have.property("hasError");
        pm.expect(json).to.have.property("qtdRegistros");
        pm.expect(json).to.have.property("data").that.is.an("array");
        pm.expect(json.hasError, "hasError deve ser booleano").to.be.a("boolean");
        const tipoQtdOk =
            typeof json.qtdRegistros === "number" ||
            typeof json.qtdRegistros === "string";
        pm.expect(tipoQtdOk, "qtdRegistros deve ser number ou string numérica").to.be.true;
    });

    pm.test("[CT-002] [CONTRACT][BaseList] Coerência entre qtdRegistros e data.length", () => {
        const qtd = Number(json.qtdRegistros);
        if (!Number.isNaN(qtd)) {
            pm.expect(qtd, "qtdRegistros divergente de data.length")
              .to.eql(data.length);
        }
    });

    pm.test("[CT-002] [CONTRACT][BaseList] Se qtdRegistros > 0 então data não é vazia", () => {
        const qtd = Number(json.qtdRegistros);
        if (!Number.isNaN(qtd) && qtd > 0) {
            pm.expect(data.length, "qtdRegistros > 0 mas data está vazia").to.be.above(0);
        }
    });

    pm.test("[CT-002] [CONTRACT][BaseList] Itens são objetos", () => {
        data.forEach((item, i) => {
            pm.expect(item, `Item[${i}] não é objeto`).to.be.an("object");
        });
    });

    pm.test("[CT-002] [CONTRACT][BaseList] Paginação consistente (se presente)", () => {
        if (json.page !== undefined) {
            pm.expect(json.page, "page deve ser numérico").to.be.a("number");
        }
        if (json.pageSize !== undefined) {
            pm.expect(json.pageSize, "pageSize deve ser numérico").to.be.a("number");
        }
        if (json.totalPages !== undefined) {
            pm.expect(json.totalPages, "totalPages deve ser numérico").to.be.a("number");
        }
    });
}


// =======================================================
// 4. CONTRATOS POR MÓDULO / ENDPOINT
// =======================================================

// 4.1 AUTENTICAÇÃO / LOGIN (Login + newLogin)
if (isJson && json && (moduleKey === "ppid_login" || url.includes("/ppid/newlogin")) && !isNegativeCase) {
    pm.test("[CT-003] [CONTRACT][LOGIN] Envelope padrão com hasError", () => {
        pm.expect(json).to.have.property("hasError");
    });

    pm.test("[CT-003] [CONTRACT][LOGIN] Sucesso contém dados mínimos de sessão", () => {
        if (json.hasError === false && String(status)[0] === "2") {
            const hasAuthData =
                json.token ||
                json.auth ||
                json.accessToken ||
                json.bearer ||
                json.usuario ||
                json.user;
            pm.expect(!!hasAuthData, "Login sem token/usuário/autorização no sucesso").to.be.true;

            if (json.token) {
                ensureFieldType(json.token, "string", "Token de autenticação deve ser string");
            }
            if (json.expiraEm || json.expiresIn) {
                ensureFieldType(json.expiraEm || json.expiresIn, ["number", "string"], "Tempo de expiração inválido");
            }
        }
    });

    pm.test("[CT-003] [CONTRACT][LOGIN] Erro de login com mensagem clara", () => {
        if (json.hasError === true || status >= 400) {
            const msg =
                json.message ||
                json.mensagem ||
                json.error ||
                (Array.isArray(json.errors) && json.errors[0]);
            pm.expect(!!msg, "Falha de login sem mensagem de erro").to.be.true;
        }
    });
}

// 4.2 DASHBOARD (/ppid/dashboard ou /ppid/dashboard-like)
if (isJson && json && url.includes("/ppid/dashboard") && !isNegativeCase) {
    pm.test("[CT-004] [CONTRACT][DASHBOARD] Estrutura básica", () => {
        pm.expect(json).to.have.property("hasError");
        if (json.hasError === false) {
            pm.expect(
                json.data || json.resumo || json.cards || json.widgets,
                "Dashboard sem dados (data/resumo/cards/widgets)"
            ).to.exist;
        }
    });

    pm.test("[CT-004] [CONTRACT][DASHBOARD] Cards/resumos identificáveis (se existirem)", () => {
        if (json.hasError === false) {
            const blocos = [].concat(
                Array.isArray(json.data) ? json.data : [],
                Array.isArray(json.cards) ? json.cards : [],
                Array.isArray(json.widgets) ? json.widgets : []
            );
            blocos.forEach((card, i) => {
                if (!card || typeof card !== "object") return;
                ensureAtLeastOneKey(
                    card,
                    ["id", "identificador", "titulo", "label", "descricao"],
                    `[DASHBOARD] Card[${i}] sem identificador/título`
                );
                if (card.valor !== undefined || card.value !== undefined) {
                    ensureFieldType(
                        card.valor !== undefined ? card.valor : card.value,
                        ["number", "string"],
                        `[DASHBOARD] Card[${i}] valor inválido`
                    );
                }
            });
        }
    });
}

// 4.3 MENSAGENS (/ppid/message)
if (isJson && json && url.includes("/ppid/message") && !isNegativeCase) {
    const data = getMainArray(json);

    pm.test("[CT-005] [CONTRACT][MENSAGENS] Envelope e itens básicos", () => {
        pm.expect(json).to.have.property("hasError");
        if (Array.isArray(data) && data.length > 0) {
            data.forEach((m, i) => {
                ensureAtLeastOneKey(
                    m,
                    ["id", "idMsg", "message", "texto", "titulo"],
                    `[MENSAGENS] Item[${i}] sem campos mínimos`
                );
            });
        }
    });
}

// 4.4 PEDIDOS - LISTA (/ppid/orderlist)
if (isJson && json && url.includes("/ppid/orderlist") && !isNegativeCase && !hasErrorFlag) {
    const data = getMainArray(json);

    pm.test("[CT-006] [CONTRACT][PEDIDOS][Lista] Campos essenciais por pedido", () => {
        data.forEach((p, i) => {
            // Identificador
            ensureAtLeastOneKey(
                p,
                ["nunota", "NUNOTA", "numero", "id"],
                `[PEDIDOS][Lista] Pedido[${i}] sem identificador`
            );

            // Parceiro
            ensureAtLeastOneKey(
                p,
                ["codParc", "CODPARC", "cliente", "idParceiro"],
                `[PEDIDOS][Lista] Pedido[${i}] sem referência de parceiro`
            );

            // Status / situação (se existir)
            if (
                p.status !== undefined || p.STATUS !== undefined ||
                p.situacao !== undefined || p.SITUACAO !== undefined
            ) {
                ensureAtLeastOneKey(
                    p,
                    ["status", "STATUS", "situacao", "SITUACAO"],
                    `[PEDIDOS][Lista] Pedido[${i}] status/situação vazio`
                );
            }

            // Data (se informada)
            if (p.data || p.DATA || p.dtEmissao || p.DTEMISSAO) {
                const d =
                    p.data || p.DATA ||
                    p.dtEmissao || p.DTEMISSAO;
                pm.expect(String(d).length, `[PEDIDOS][Lista] Pedido[${i}] com data vazia`).to.be.above(0);
            }

            // Totais (se presentes)
            if (p.total || p.TOTAL || p.valorTotal) {
                const total = p.total || p.TOTAL || p.valorTotal;
                ensureFieldType(total, ["number", "string"], `[PEDIDOS][Lista] Pedido[${i}] total inválido`);
            }
        });
    });
}

// 4.5 PEDIDOS - DETALHE (/ppid/orderdetails)
if (isJson && json && url.includes("/ppid/orderdetails") && !isNegativeCase && !hasErrorFlag) {
    pm.test("[CT-007] [CONTRACT][PEDIDOS][Detalhe] Contém identificador do pedido", () => {
        ensureAtLeastOneKey(
            json,
            ["nunota", "NUNOTA", "numero", "id"],
            "[PEDIDOS][Detalhe] Sem identificador de pedido"
        );
    });

    pm.test("[CT-007] [CONTRACT][PEDIDOS][Detalhe] Possui itens (quando sucesso)", () => {
        if (json.hasError === false || String(status)[0] === "2") {
            const itens =
                (Array.isArray(json.itens) && json.itens) ||
                (Array.isArray(json.items) && json.items) ||
                (json.data && Array.isArray(json.data) && json.data) ||
                [];
            pm.expect(itens.length, "[PEDIDOS][Detalhe] Nenhum item retornado").to.be.above(0);
        }
    });
}

// 4.6 PEDIDOS - MUTAÇÃO (save, item, duplicar, confirmar, excluir, delete)
if (isJson && json && (
    url.includes("/ppid/ordersaveheaderclient") ||
    url.includes("/ppid/salvaritem") ||
    url.includes("/ppid/duplicar") ||
    url.includes("/ppid/confirmarpedido") ||
    url.includes("/ppid/excluiritempedido") ||
    url.includes("/ppid/orderdelete")
) && !isNegativeCase) {
    pm.test("[CT-008] [CONTRACT][PEDIDOS][Mutação] Envelope possui hasError", () => {
        pm.expect(json).to.have.property("hasError");
    });

    pm.test("[CT-008] [CONTRACT][PEDIDOS][Mutação] Sucesso retorna referência", () => {
        if (json.hasError === false && String(status)[0] === "2") {
            const hasId =
                json.nunota || json.NUNOTA || json.id || json.numero || json.success || json.sucesso;
            pm.expect(!!hasId, "Operação em pedido sem retorno mínimo (nunota/id/success)").to.be.true;
        }
    });

    pm.test("[CT-008] [CONTRACT][PEDIDOS][Mutação] Erro retorna mensagem", () => {
        if (json.hasError === true || status >= 400) {
            const msg =
                json.message ||
                json.mensagem ||
                json.error ||
                (Array.isArray(json.errors) && json.errors[0]);
            pm.expect(!!msg, "[PEDIDOS][Mutação] Erro sem mensagem").to.be.true;
        }
    });
}

// 4.7 PREÇOS / TABELAS
if (isJson && json && (
    url.includes("/ppid/getprices") ||
    url.includes("/ppid/gettableprices") ||
    url.includes("/ppid/pricedetails") ||
    url.includes("/ppid/precominimo")
) && !isNegativeCase && !hasErrorFlag) {
    const data = getMainArray(json);

    pm.test("[CT-009] [CONTRACT][PRECOS] Envelope com hasError", () => {
        pm.expect(json).to.have.property("hasError");
    });

    pm.test("[CT-009] [CONTRACT][PRECOS] Itens com identificadores (quando lista)", () => {
        if (Array.isArray(data) && data.length > 0) {
            data.forEach((p, i) => {
                if (p.codProd !== undefined || p.CODPROD !== undefined) {
                    pm.expect(p.codProd || p.CODPROD, `[PRECOS] Item[${i}] codProd vazio`).to.exist;
                }
                if (p.preco || p.PRECO || p.valor || p.precoLiquido) {
                    const preco = p.preco || p.PRECO || p.valor || p.precoLiquido;
                    ensureFieldType(preco, ["number", "string"], `[PRECOS] Item[${i}] preço inválido`);
                }
            });
        }
    });
}

// 4.8 PRODUTOS
if (isJson && json && moduleKey === "products" && !isNegativeCase && !hasErrorFlag) {
    const data = getMainArray(json);
    pm.test("[CT-010] [CONTRACT][PRODUTOS] Lista/Detalhe com identificador e nome", () => {
        const arr = Array.isArray(data) && data.length ? data : [json];
        arr.forEach((p, i) => {
            if (!p || typeof p !== "object") return;
            ensureAtLeastOneKey(
                p,
                ["codProd", "CODPROD", "id", "codigo","CODGRUPOPRODPAI","CodGrupoProPai","CODLOCAL","CodLocal"],
                `[PRODUTOS] Registro[${i}] sem identificador`
            );
            if (p.descricao || p.DESCRICAO || p.nome || p.NOME) {
                const desc = p.descricao || p.DESCRICAO || p.nome || p.NOME;
                pm.expect(String(desc).length, `[PRODUTOS] Registro[${i}] descrição/nome vazio`).to.be.above(0);
            }
        });
    });
}

// 4.9 PARCEIROS / CLIENTES
if (isJson && json && moduleKey === "partner" && !isNegativeCase && !hasErrorFlag && !url.includes("/fields")) {
    const data = getMainArray(json);

    pm.test("[CT-011] [CONTRACT][PARCEIROS] Envelope (quando aplicável)", () => {
        if (isBaseListResponse(json) || "hasError" in json) {
            pm.expect(json).to.have.property("hasError");
        }
    });

    pm.test("[CT-011] [CONTRACT][PARCEIROS] Campos-chave por parceiro", () => {
        if (Array.isArray(data) && data.length > 0) {
            data.forEach((p, i) => {
                ensureAtLeastOneKey(
                    p,
                    ["codParc", "CODPARC"],
                    `[PARCEIROS] Item[${i}] sem codParc`
                );
                if (p.CGC_CPF || p.CNPJ || p.cnpj || p.cpf) {
                    const doc = (p.CGC_CPF || p.CNPJ || p.cnpj || p.cpf || "").toString().replace(/\D/g, "");
                    if (doc) {
                        pm.expect([11, 14], `[PARCEIROS] Item[${i}] documento com tamanho inválido`).to.include(doc.length);
                    }
                }
            });
        }
    });
}
// 4.10 USUÁRIOS / VENDEDORES
if (
  isJson &&
  json &&
  moduleKey === "user" &&
  !isNegativeCase &&
  !hasErrorFlag &&
  !url.includes("/versaominima")
) {
    pm.test("[CT-012] [CONTRACT][USUARIO] Estrutura mínima", () => {
        const data = Array.isArray(json) ? json : getMainArray(json);
        const arr = Array.isArray(data) && data.length ? data : [json];

        arr.forEach((u, i) => {
            if (!u || typeof u !== "object") return;
            ensureAtLeastOneKey(
                u,
                ["nome", "name", "usuario", "login"],
                `[USUARIO] Registro[${i}] sem identificação`
            );
        });
    });
}

// 4.11 CONFIGURAÇÕES / VERSÃO MÍNIMA
if (isJson && json && url.includes("/user/versaominima") && !isNegativeCase) {
    pm.test("[CT-013] [CONTRACT][CONFIG] versaoMinima presente", () => {
        pm.expect(json).to.have.property("versaoMinima");
    });
}

// 4.12 LOGÍSTICA / FRETE / FERIADOS (quando JSON)
if (isJson && json && (
    url.includes("/tabelafrete") ||
    url.includes("/regrasentregas") ||
    url.includes("/feriados")
) && !isNegativeCase && !hasErrorFlag) {
    pm.test("[CT-014] [CONTRACT][LOGISTICA] Estrutura válida", () => {
        if (!isBaseListResponse(json)) {
            pm.expect(
                Array.isArray(json) || Array.isArray(json.data) || typeof json === "object",
                "[LOGISTICA] Estrutura inesperada"
            ).to.be.true;
        }
    });
}

// 4.13 DOCUMENTOS (viewDanfe, viewBoleto, viewPdf) - quando retornam JSON de erro
if (isJson && json && (
    url.includes("viewdanfe") ||
    url.includes("viewboleto") ||
    url.includes("viewpdf")
)) {
    // Este teste é mantido mesmo em cenários negativos, pois valida o contrato de erro
    pm.test("[CT-015] [CONTRACT][DOCS] Erros padronizados em consultas de documentos", () => {
        if (status >= 400 || json.hasError === true) {
            const msg =
                json.message ||
                json.mensagem ||
                json.error ||
                json.errors;
            pm.expect(!!msg, "[DOCS] Erro em documento sem mensagem").to.be.true;
        }
    });
}


// =======================================================
// 5. CONTRATOS PARA RESPOSTAS DE ERRO (4xx/5xx) EM JSON
// =======================================================

if (isJson && json && status >= 400) {
    pm.test("[CT-001] [CONTRACT][ERROR] Estrutura mínima de erro em respostas 4xx/5xx", () => {
        const hasMensagem =
            json.hasError === true ||
            json.message ||
            json.mensagem ||
            json.error ||
            json.errors;
        pm.expect(
            hasMensagem,
            "Erro sem indicação clara (hasError/message/mensagem/error/errors)"
        ).to.exist;
    });
}


// =======================================================
// 6. SCHEMA ESTÁVEL POR ENDPOINT (BASELINE DINÂMICO)
// =======================================================

(function schemaStableKeys(){
  try {
    const res = pm.response;
    const req = pm.request;

    // Reaproveita helpers se existirem; caso contrário, auto-detecta
    let _isJson = (typeof isJson !== 'undefined') ? isJson : false;
    let _json = (typeof json !== 'undefined') ? json : null;

    if (!_isJson) {
        const ct = (res.headers.get('Content-Type') || '').toLowerCase();
        _isJson = ct.includes('json'); // simples e seguro
    }

    if (!_json && _isJson) {
      try { _json = res.json(); } catch(_e) { /* noop */ }
    }
    if (!_isJson || !_json || typeof _json !== 'object') return;

    // Normaliza path: usa segmentos do Postman, remove barra final, lower-case
    const segs = (req && req.url && Array.isArray(req.url.path) ? req.url.path : []).filter(Boolean).map(String);
    const pathKey = ('/' + segs.join('/')).replace(/\/+$/,'').toLowerCase(); // ex.: "/ppid/getprices"

    // Amostra de chaves (prioriza primeiro item do array)
    const pickSample = (j) => Array.isArray(j) ? j[0] : (Array.isArray(j.data) ? j.data[0] : j);
    const sample = pickSample(_json);
    if (!sample || typeof sample !== 'object') return;

    const toKeySet = (o) => Object.keys(o || {}).sort().join(',');
    const actual = toKeySet(sample);

    // Mapa de schemas explícitos por endpoint (ordenado para comparação)
    const SCHEMA_KEYS = {
      '/ppid/getprices': toKeySet({ codProd:1, codTab:1, nomeTab:1, nuTab:1, preco:1, precoFlex:1 }),
      // Adicione outros endpoints aqui, se quiser validação estrita
    };

    const expected = SCHEMA_KEYS[pathKey];

    if (expected) {
      // Validação estrita pelo mapa
      pm.test('[CT-016] [SCHEMA] Conjunto de chaves estável', function(){
        pm.expect(actual).to.eql(expected);
      });

      // Checagem de uniformidade de itens no array
      const arr = Array.isArray(_json?.data) ? _json.data : (Array.isArray(_json) ? _json : []);
      if (Array.isArray(arr) && arr.length) {
        const divergente = arr.find(it => toKeySet(it) !== expected);
        pm.test('[CT-016] [SCHEMA] Todos os itens seguem o mesmo conjunto de chaves', function(){
          pm.expect(divergente, 'Itens divergentes no conjunto de chaves').to.be.undefined;
        });
      }
      return; // Já validado por mapa
    }

    // Baseline por endpoint (robusto) — ignora baselines antigos gravados como 'erro'
    const baseKey = `v3_schema::${req.method}::${pathKey}`;
    const prevRaw = pm.collectionVariables.get(baseKey);
    const prev = (typeof prevRaw === 'string' && prevRaw.toLowerCase() === 'erro') ? null : prevRaw;

    if (prev) {
      pm.test('[CT-016] [SCHEMA] Conjunto de chaves estável (baseline)', function(){
        pm.expect(actual).to.eql(prev);
      });
    } else {
      pm.collectionVariables.set(baseKey, actual);
      pm.test('[CT-016] [SCHEMA] Baseline inicial registrada', function(){
        pm.expect(true).to.be.true;
      });
    }
  } catch(err) {
    // Não derruba o runner por erro de script; registra de forma controlada
    pm.test('[CT-016] [SCHEMA] Erro de script (tratado)', function(){
      pm.expect.fail(String(err && err.message || err));
    });
  }
})();


// =======================================================
// 7. ADD-ON V3 - CONTRATOS BINÁRIOS E PAGINAÇÃO
// =======================================================

(function V3_ADDON_CONTRACTS() {
  // Recria o contexto local para usar as variáveis do escopo global do Postman
  const req = pm.request;
  const res = pm.response;
  const ct = contentType;
  const u = url;

  // A) BINÁRIOS (PDF / DANFE / BOLETO / IMAGENS)
  (function binaryChecks() {
    // PDF-like
    if ((res.code >= 200 && res.code < 300) && !isJson && (u.includes('/viewpdf') || u.includes('/viewdanfe') || u.includes('/viewboleto'))) {
      pm.test('[CT-017] [BINARIO] Content-Type PDF', () => pm.expect(ct).to.include('application/pdf'));
      pm.test('[CT-017] [BINARIO] Tamanho > 1KB', () => pm.expect(res.responseSize).to.be.above(1024));
      pm.test('[CT-017] [BINARIO] Content-Disposition presente', () => {
        const cd = res.headers.get('Content-Disposition') || '';
        pm.expect(cd.length > 0, 'Content-Disposition ausente').to.be.true;
      });
    }

    // Imagens (produto/usuário)
    if ((res.code >= 200 && res.code < 300) && !isJson && u.includes('/imagem/')) {
      pm.test('[CT-017] [BINARIO] Content-Type imagem', () =>
        pm.expect(ct).to.match(/image\/(png|jpe?g|webp)/));
      pm.test('[CT-017] [BINARIO] Tamanho > 512B', () => pm.expect(res.responseSize).to.be.above(512));
    }
  })();

  // B) PAGINAÇÃO (Coerência de página)
  (function paginationChecks() {
    if (!isJson || !url.includes('/ppid/getprices') || isNegativeCase) return;

    // Coerência com a query (mantido por ser um teste de contrato de dados)
    if (json && json.page !== undefined) {
        const q = req.url.query || [];
        const qPage = q.find(x => x.key === 'page');
        const page = qPage ? Number(qPage.value) : undefined;

        if (page !== undefined) {
          pm.test('[CT-018] [PAG] "page" coerente entre query e resposta', () => {
            pm.expect(Number(json.page)).to.eql(Number(page));
          });
        }
    }
  })();
})();
