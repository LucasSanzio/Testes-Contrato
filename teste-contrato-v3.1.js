// =======================================================
// BACKEND VIDYA FORCE - TESTES DE CONTRATO (v2)
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
let jsonParseError = false;
if (isJson) {
    try {
        json = pm.response.json();
    } catch (e) {
        jsonParseError = true;
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
    // Interrompe se hasError=true mesmo com status 2xx (Simplificação aplicada)
    if (hasErrorFlag) {
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
    // Refatoração: Normaliza a chave para verificar qtdRegistros
    const qtdKey = Object.keys(body).find(k => k.toLowerCase() === "qtdregistros");
    const hasQtd = !!qtdKey;
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

// 2.1 JSON válido quando Content-Type indica application/json
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
        // Busca a chave de qtdRegistros de forma case-insensitive
        const qtdKey = Object.keys(json).find(k => k.toLowerCase() === "qtdregistros");
        pm.expect(json).to.have.property(qtdKey);
        pm.expect(json).to.have.property("data").that.is.an("array");
        pm.expect(json.hasError, "hasError deve ser booleano").to.be.a("boolean");
        
        const qtd = json[qtdKey];
        const tipoQtdOk =
            typeof qtd === "number" ||
            typeof qtd === "string";
        pm.expect(tipoQtdOk, "qtdRegistros deve ser number ou string numérica").to.be.true;
    });

    pm.test("[CT-002] [CONTRACT][BaseList] Coerência entre qtdRegistros e data.length", () => {
        const qtdKey = Object.keys(json).find(k => k.toLowerCase() === "qtdregistros");
        const qtd = Number(json[qtdKey]);
        if (!Number.isNaN(qtd)) {
            pm.expect(qtd, "qtdRegistros divergente de data.length")
              .to.eql(data.length);
        }
    });

    pm.test("[CT-002] [CONTRACT][BaseList] Se qtdRegistros > 0 então data não é vazia", () => {
        const qtdKey = Object.keys(json).find(k => k.toLowerCase() === "qtdregistros");
        const qtd = Number(json[qtdKey]);
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
// (Conteúdo de CT-003 a CT-015 mantido inalterado)
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
            const hasMsg =
                json.message ||
                json.mensagem ||
                json.error ||
                (Array.isArray(json.errors) && json.errors.length > 0);
            pm.expect(!!hasMsg, "Erro de login sem mensagem detalhada").to.be.true;
        }
    });
}

// 4.2 PRODUTOS (getPrices, list, etc.)
if (
  isJson &&
  json &&
  !isNegativeCase &&
  !hasErrorFlag &&
  (
    moduleKey === "ppid_getprices" ||       // /ppid/getPrices
    moduleKey === "produto"       ||       // se você usar esse moduleKey em algum momento
    moduleKey === "products"      ||       // todos /products/*
    url.includes("/ppid/precominimo")  ||  // /ppid/precoMinimo
    url.includes("/ppid/precoporlocal") || // /ppid/precoPorLocal
    url.includes("/ppid/tabprecotop")      // /ppid/tabPrecoTop
  )
) {
    const data = getMainArray(json);

    pm.test("[CT-004] [CONTRACT][PRODUTO] Estrutura mínima de lista", () => {
        if (isBaseListResponse(json)) {
            pm.expect(data.length).to.be.at.least(0);
        }
    });

    pm.test("[CT-005] [CONTRACT][PRODUTO] Campos-chave por produto", () => {
        if (Array.isArray(data) && data.length > 0) {
            data.forEach((p, i) => {
                ensureAtLeastOneKey(
                    p,
                    ["codProd", "codprod", "id", "sku"],
                    `[PRODUTO] Item[${i}] sem identificador (codProd/id/sku)`
                );
                ensureAtLeastOneKey(
                    p,
                    ["nome", "descricao", "description"],
                    `[PRODUTO] Item[${i}] sem nome/descrição`
                );
                if (p.preco !== undefined) {
                    ensureFieldType(p.preco, ["number", "string"], `[PRODUTO] Item[${i}] preço inválido`);
                    // Adição: Preço deve ser positivo (ou zero)
                    if (typeof p.preco === 'number') {
                        pm.expect(p.preco, `[PRODUTO] Item[${i}] preço negativo`).to.be.at.least(0);
                    }
                }
            });
        }
    });
}

// 4.3 PEDIDOS (list, get, etc.)
if (
  isJson &&
  json &&
  !isNegativeCase &&
  !hasErrorFlag &&
  (
    moduleKey === "pedido"               || // caso futuramente exista /pedido/...
    url.includes("/ppid/orderheader")    || // cabeçalho de pedido
    url.includes("/ppid/orderdetails")   || // itens do pedido
    url.includes("/ppid/saldoflexpedido")|| // saldo flex do pedido
    url.includes("/products/itemorderlist") // itens de pedido agrupados por produto
  )
) {
    const data = getMainArray(json);

    pm.test("[CT-006] [CONTRACT][PEDIDO] Estrutura mínima de lista", () => {
        if (isBaseListResponse(json)) {
            pm.expect(data.length).to.be.at.least(0);
        }
    });

    pm.test("[CT-007] [CONTRACT][PEDIDO] Campos-chave por pedido", () => {
        if (Array.isArray(data) && data.length > 0) {
            data.forEach((p, i) => {
                ensureAtLeastOneKey(
                    p,
                    ["codPed", "codped", "id"],
                    `[PEDIDO] Item[${i}] sem identificador (codPed/id)`
                );
                ensureAtLeastOneKey(
                    p,
                    ["data", "dataCriacao", "dataEmissao"],
                    `[PEDIDO] Item[${i}] sem data de criação`
                );
            });
        }
    });
}

// 4.4 CLIENTES (list, get, etc.)
if (isJson && json && moduleKey === "cliente" && !isNegativeCase && !hasErrorFlag) {
    const data = getMainArray(json);

    pm.test("[CT-008] [CONTRACT][CLIENTE] Estrutura mínima de lista", () => {
        if (isBaseListResponse(json)) {
            pm.expect(data.length).to.be.at.least(0);
        }
    });

    pm.test("[CT-009] [CONTRACT][CLIENTE] Campos-chave por cliente", () => {
        if (Array.isArray(data) && data.length > 0) {
            data.forEach((c, i) => {
                ensureAtLeastOneKey(
                    c,
                    ["codCli", "codcli", "id"],
                    `[CLIENTE] Item[${i}] sem identificador (codCli/id)`
                );
                ensureAtLeastOneKey(
                    c,
                    ["nome", "razaoSocial"],
                    `[CLIENTE] Item[${i}] sem nome/razão social`
                );
            });
        }
    });
}

// 4.5 ENDEREÇOS (list, get, etc.)
if (
  isJson &&
  json &&
  !isNegativeCase &&
  !hasErrorFlag &&
  (
    moduleKey === "endereco" ||
    url.includes("/partner/viacep")
  )
) {
    // Se não vier BaseList, trata json como objeto único:
    const data = getMainArray(json);
    const list = Array.isArray(data) && data.length > 0 ? data
                : Array.isArray(json) ? json
                : [json];

    pm.test("[CT-010] [CONTRACT][ENDERECO] Campos-chave por endereço", () => {
        list.forEach((e, i) => {
            ensureAtLeastOneKey(
                e,
                ["cep", "logradouro", "cidade"],
                `[ENDERECO] Item[${i}] sem campos-chave (cep/logradouro/cidade)`
            );
        });
    });
}

// 4.6 PARCEIROS (list, get, etc.)
if (
  isJson &&
  json &&
  !isNegativeCase &&
  !hasErrorFlag &&
  moduleKey === "partner" &&
  !url.includes("/viacep") &&      // endereço (vai com CT-010)
  !url.includes("/viewpdf") &&     // binário
  !url.includes("/relatorios") &&  // relatórios
  !url.includes("/contact/")       // contatos podem ter outro layout
) {
    const data = getMainArray(json);

    pm.test("[CT-011] [CONTRACT][PARCEIROS] Estrutura mínima de lista", () => {
        if (isBaseListResponse(json)) {
            pm.expect(data.length).to.be.at.least(0);
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

// 4.7 USUÁRIOS / VENDEDORES
if (
  isJson &&
  json &&
  moduleKey === "user" &&
  !isNegativeCase &&
  !hasErrorFlag &&
  !url.includes("/versaominima") &&
  !url.includes("/imagem") &&       // foto
  !url.includes("/viewpdf") &&      // documento binário
  !url.includes("/relatorios")      // relatórios
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

// 4.8 CONFIGURAÇÕES / VERSÃO MÍNIMA
if (isJson && json && url.includes("/user/versaominima") && !isNegativeCase) {
    pm.test("[CT-013] [CONTRACT][CONFIG] versaoMinima presente", () => {
        pm.expect(json).to.have.property("versaoMinima");
    });
}

// 4.9 LOGÍSTICA / FRETE / FERIADOS (quando JSON)
if (
  isJson &&
  json &&
  !isNegativeCase &&
  !hasErrorFlag &&
  (
    url.includes("/tabelafrete")       ||
    url.includes("/regrasentregas")    ||
    url.includes("/feriados")          ||
    url.includes("/freteregiao")       || // /ppid/freteRegiao
    url.includes("/excecoesentregas")     // /ppid/excecoesEntregas
  )
) {
    pm.test("[CT-014] [CONTRACT][LOGISTICA] Estrutura válida", () => {
        if (!isBaseListResponse(json)) {
            pm.expect(
                Array.isArray(json) || Array.isArray(json.data) || typeof json === "object",
                "[LOGISTICA] Estrutura inesperada"
            ).to.be.true;
        }
    });
}

// 4.10 DOCUMENTOS (viewDanfe, viewBoleto, viewPdf) - quando retornam JSON de erro
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
// 5. CONTRATOS PARA RESPOSTAS DE ERRO (4xx/5xx)
// =======================================================

// 5.1 Erros JSON
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
    
    // Adição: hasError deve ser true em erros 4xx/5xx que retornam JSON
    if (Object.prototype.hasOwnProperty.call(json, "hasError")) {
        pm.test("[CT-001] [CONTRACT][ERROR] hasError deve ser TRUE em 4xx/5xx", () => {
            pm.expect(json.hasError, "hasError deve ser true em respostas de erro 4xx/5xx").to.be.true;
        });
    }
}

// 5.2 Erros Não-JSON
if (!isJson && status >= 400) {
    pm.test("[CT-001] [CONTRACT][ERROR] Resposta de erro não-JSON não deve ser vazia", () => {
        pm.expect(pm.response.text().length, "Corpo da resposta de erro não-JSON está vazio").to.be.above(0);
    });
    
    pm.test("[CT-001] [CONTRACT][ERROR] Resposta de erro não-JSON não deve conter HTML (stack trace)", () => {
        const bodyStr = pm.response.text().toLowerCase();
        pm.expect(bodyStr).to.not.include("<html");
        pm.expect(bodyStr).to.not.include("stack trace");
    });
}

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

    // Imagens (check-in /photo)
    if ((res.code >= 200 && res.code < 300) && !isJson && u.includes('/photo')) {
      pm.test('[CT-017] [BINARIO] Content-Type imagem (photo)', () =>
        pm.expect(ct).to.match(/image\/(png|jpe?g|webp)/)
      );
      pm.test('[CT-017] [BINARIO] Tamanho > 512B (photo)', () =>
        pm.expect(res.responseSize).to.be.above(512)
      );
    }
  })();

  // B) PAGINAÇÃO (Coerência de página)
  (function paginationChecks() {
    if (!isJson || isNegativeCase || !json) return;

    const q = req.url.query || [];
    const qPage = q.find(x => x.key === 'page');
    if (!qPage) return;

    const page = Number(qPage.value);
    if (!Number.isFinite(page)) return;

    const pageKey = ["page", "pagina", "paginaAtual"].find(k => json[k] !== undefined);

    if (pageKey) {
      pm.test('[CT-018] [PAG] "page" coerente entre query e resposta', () => {
        pm.expect(Number(json[pageKey])).to.eql(page);
      });
    }
  })();
})();
