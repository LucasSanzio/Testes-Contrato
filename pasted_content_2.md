# Documento de Referência – Script de Testes de Contrato (v2)

## Visão geral

Este script é um script de testes de contrato global para o Postman, pensado para o backend Vidya Force.

Ele roda após cada requisição (na aba `Tests` da collection/requests) e:

*   Garante contratos genéricos de JSON (CT-001).
*   Valida o formato `BaseList` (CT-002).
*   Faz regras de contrato específicas por módulo/endpoint (CT-003 a CT-015).
*   Define regras para respostas de erro 4xx/5xx.
*   Faz checagens extras para binários (PDF, imagens) e paginação (CT-017, CT-018).
*   Usa o conceito de “Gate/Smoke” para bloquear testes avançados quando a resposta básica já está errada.

Abaixo, cada trecho é explicado em detalhe.

## 1. Contexto e helpers gerais

### 1.1 Coleta de informações da requisição e resposta

```javascript
const rawUrl = pm.request.url.toString();
const url = rawUrl.toLowerCase();
const method = pm.request.method;
const status = pm.response.code;
const contentType = (pm.response.headers.get("Content-Type") || "").toLowerCase();
const isJson = contentType.includes("application/json");
const requestName = (pm.info.requestName || "").toLowerCase();
```

*   `rawUrl`: pega a URL completa da requisição como string.
*   `url`: converte a URL inteira para minúsculo (`toLowerCase()`), facilitando comparações com `includes()`, sem se preocupar com *case sensivity*.
*   `method`: armazena o método HTTP (GET, POST, etc.).
*   `status`: código de status HTTP da resposta (ex: 200, 400, 500).
*   `contentType`: lê o header `Content-Type` da resposta.
    *   Se não existir, usa `""` para evitar erro de null.
    *   Converte para minúsculo.
*   `isJson`: booleano que indica se o `Content-Type` contém `"application/json"`.
*   `requestName`: nome da request no Postman em minúsculo.
    *   Usado para identificar cenários negativos por convenção de nome (`[NEGATIVO]`, `[ERROR]` etc).

### 1.2 Parse do JSON com proteção

```javascript
let json = null;
let jsonParseError = false;
if (isJson) {
    try {
        json = pm.response.json();
    } catch (e) {
        jsonParseError = true;
    }
}
```

*   `json`: vai guardar o corpo da resposta já parseado.
*   `jsonParseError`: flag para indicar se deu erro ao parsear o JSON.
*   `if (isJson)`: só tenta parsear se o `Content-Type` indicar JSON.
*   `try/catch`:
    *   `pm.response.json()` tenta converter o body em objeto.
    *   Se falhar (JSON inválido, HTML disfarçado, etc.), marca `jsonParseError = true` ao invés de quebrar o script.
*   **Para que?** Permite testar se o JSON está válido sem interromper todo o script caso o backend retorne algo inválido.

### 1.3 Flags de envelope de erro/sucesso

```javascript
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
```

Essas duas constantes identificam rapidamente o padrão de envelope:

*   `hasErrorFlag`:
    *   Verdadeiro se:
        *   A resposta é JSON;
        *   `json` existe;
        *   existe a propriedade `"hasError"`;
        *   e ela é `true`.
*   `isSuccessEnvelope`:
    *   Mesma lógica, mas `hasError === false`.
*   **Para que?** Servem para gatear testes de sucesso (não rodar testes de contrato de sucesso quando `hasError=true`) e também para seções específicas como módulos, erros, etc.

### 1.4 Identificação de cenário negativo (pelos nomes)

```javascript
const isNegativeCase =
    requestName.includes("[negativo]") ||
    requestName.includes("[error]") ||
    requestName.includes("[erro]") ||
    requestName.includes("[4xx]") ||
    requestName.includes("[5xx]");
```

O script considera que uma request é de cenário negativo se o nome da request contiver algumas tags:

*   `[negativo]`, `[error]`, `[erro]`, `[4xx]`, `[5xx]`.
*   **Para que?**
    *   Para não exigir status 2xx e outros comportamentos de sucesso quando a request foi criada intencionalmente para produzir erro.
    *   Evita falsos positivos de teste em endpoints que estão sendo testados para erro.

### 1.5 Segmentação do path da URL

```javascript
const pathSegments = (pm.request.url.path || [])
    .filter(Boolean)
    .map(s => String(s).toLowerCase());
```

*   Lê `pm.request.url.path` (array com os segmentos da URL, por exemplo `["ppid", "getPrices"]`).
*   `|| []`: se for null/undefined, usa array vazio.
*   `filter(Boolean)`: remove segmentos vazios.
*   `map(...)`: garante que cada segmento seja string e converte para minúsculo.
*   **Para que?** Facilita descobrir de forma genérica a qual módulo a URL pertence (produtos, pedidos, etc.).

### 1.6 Resolução automática de `moduleKey`

```javascript
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
```

*   `getModuleKey()`:
    *   Se não houver `pathSegments`, retorna `"root"`.
    *   Se o primeiro segmento for `"ppid"`:
        *   Se existir um segundo segmento, monta `ppid_<segundo>` (ex: `ppid_getprices`).
        *   Se não existir, usa `"ppid_root"`.
    *   Caso contrário, retorna apenas o primeiro segmento (ex: `"cliente"`, `"partner"`, `"user"`).
*   `moduleKey`: valor retornado, usado para identificar blocos de teste específicos.
*   **Para que?** Permite criar regras de contrato por módulo sem ter que escrever condições gigantescas de URL em cada teste.

### 1.5 Smoke Test + Gate

Esta parte garante que a resposta está “minimamente saudável” antes de rodar contratos complexos.

```javascript
if (!isNegativeCase) {
    let smokeFailed = false;

    // Status deve ser 2xx (200 a 299)
    if (status < 200 || status >= 300) {
        smokeFailed = true;
    }

    pm.test(`[SMOKE] Status 2xx esperado`, () => {
        pm.expect(status, `Status inesperado: ${status} (${rawUrl})`).to.be.within(200, 299);
    });

    if (smokeFailed) {
        console.log(`[GATE] Smoke falhou (Status ${status}). Ignorando testes avançados para ${rawUrl}.`);
        return;
    }

    if (hasErrorFlag) {
        pm.test("[GATE] Resposta com hasError=true deve falhar", () => {
            pm.expect.fail(`hasError=true detectado em resposta com status ${status} (${rawUrl})`);
        });
        console.log(`[GATE] hasError=true detectado. Interrompendo testes para ${rawUrl}.`);
        return;
    }
}
```

**Passo a passo:**

*   `if (!isNegativeCase)`: O Gate só se aplica a cenários que supostamente devem ser de sucesso.
*   `let smokeFailed = false`: Flag para indicar se o smoke falhou.
*   `if (status < 200 || status >= 300)`: Considera falha se o status não estiver no intervalo 2xx.
*   `pm.test('[SMOKE] Status 2xx esperado', ...)`: Cria um teste visível no Postman que verifica se o status está entre 200 e 299.
*   Se `smokeFailed` for `true`, faz um `console.log()` com mensagem explicativa e `return;`:
    *   Isso interrompe a execução do restante do script para a request atual.
    *   Ou seja, nenhum CT-001..015, binário, paginação, etc. roda nesse cenário.
*   **Verificação de `hasErrorFlag`:**
    *   Se `hasErrorFlag` é `true` (`hasError = true`) mas o status é 2xx:
        *   Cria um teste `[GATE] Resposta com hasError=true deve falhar` que sempre dá `fail`.
        *   Faz `console.log` e `return` para não rodar o restante.
*   **Para que?**
    *   Evitar testar contratos avançados quando a base já está errada (status inválido ou `hasError` inconsistente).
    *   Facilitar diagnóstico: o teste que falha é o de Smoke/Gate.

### 1.6 Helpers de contrato

#### 1.6.1 `isBaseListResponse`

```javascript
function isBaseListResponse(body) {
    if (!body || typeof body !== "object") return false;
    const hasHasError = Object.prototype.hasOwnProperty.call(body, "hasError");
    const qtdKey = Object.keys(body).find(k => k.toLowerCase() === "qtdregistros");
    const hasQtd = !!qtdKey;
    const hasData = Array.isArray(body.data);
    return hasHasError && hasQtd && hasData;
}
```

Verifica se o objeto `body` segue o padrão `BaseList`:

*   tem propriedade `hasError`.
*   tem alguma chave que (*case-insensitive*) seja `qtdRegistros`.
*   tem `data` como array.
*   **Para que?** Usado para saber quando aplicar testes específicos de lista com paginação.

#### 1.6.2 `getMainArray`

```javascript
function getMainArray(body) {
    if (!body) return [];
    if (Array.isArray(body)) return body;
    if (Array.isArray(body.data)) return body.data;
    return [];
}
```

*   Se a resposta é um array puro -> retorna ela.
*   Se tem `data` como array -> retorna `body.data`.
*   Caso contrário -> retorna array vazio.
*   **Para que?** Normalizar as respostas para que `data` seja sempre um array com os itens principais, sem depender da estrutura exata.

#### 1.6.3 `ensureAtLeastOneKey`

```javascript
function ensureAtLeastOneKey(obj, keys, msg) {
    const ok = keys.some(k => Object.prototype.hasOwnProperty.call(obj, k));
    pm.expect(ok, msg || `Deve possuir pelo menos um dos campos: ${keys.join(", ")}`).to.be.true;
}
```

*   Recebe um objeto, uma lista de chaves e uma mensagem opcional.
*   Verifica se o objeto possui pelo menos uma das chaves listadas.
*   Cria uma asserção do Postman (`pm.expect`) com a mensagem de erro adequada.
*   **Para que?** Reutilizado em vários módulos (produto, cliente, pedido, etc.) para checar campos identificadores ou descritivos.

#### 1.6.4 `ensureFieldType`

```javascript
function ensureFieldType(value, expectedTypes, msg) {
    const types = Array.isArray(expectedTypes) ? expectedTypes : [expectedTypes];
    const actual = typeof value;
    const ok = types.includes(actual);
    pm.expect(ok, msg || `Tipo ${actual} não está entre os esperados: ${types.join(", ")}`).to.be.true;
}
```

*   `expectedTypes` pode ser string (`"string"`) ou array (`["number","string"]`).
*   Descobre o `typeof` real e testa se está na lista de tipos esperados.
*   **Para que?** Facilitar validações de tipo sem repetir lógica.

## 2. Contrato geral de JSON (CT-001)

### 2.1 JSON válido quando `Content-Type` é `application/json`

```javascript
pm.test("[CT-001] [CONTRACT][GENERIC] JSON válido quando Content-Type é application/json", () => {
    if (!isJson) {
        return pm.expect(true, "N/A").to.be.true;
    }
    pm.expect(jsonParseError, "Falha ao parsear JSON da resposta").to.be.false;
});
```

Cria um teste genérico:

*   Se `isJson` for `false`, marca o teste como N/A (não aplicável).
*   Se `isJson` for `true`, exige que `jsonParseError` seja `false` (ou seja, o JSON foi parseado com sucesso).

### 2.2 Resposta JSON não contém HTML bruto

```javascript
if (isJson && json && typeof json === "object") {
    const bodyStr = JSON.stringify(json).toLowerCase();

    pm.test("[CT-001] [CONTRACT][GENERIC] Resposta JSON não contém HTML", () => {
        pm.expect(bodyStr).to.not.include("<html");
    });
    // ...
}
```

*   **Para que?** Evita que o backend retorne uma página de erro HTML disfarçada de JSON.

### 2.3 Convenção `hasError`

```javascript
// ...
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
```

*   **`hasError` é booleano:** exige que o campo seja do tipo `boolean`.
*   **Estrutura de erro:** se `hasError=true`, exige que haja algum campo de mensagem (`message`, `mensagem`, `error`, `errors`).
*   **Sucesso não vaza:** se `hasError=false`, exige que campos de erro internos (`stackTrace`, `exception`, `developerMessage`) não estejam presentes.

## 3. Contrato para envelopes `BaseList` (CT-002)

```javascript
if (isJson && json && isBaseListResponse(json) && !isNegativeCase) {
    const data = getMainArray(json);

    pm.test("[CT-002] [CONTRACT][BaseList] Estrutura mínima válida", () => {
        // ... (Verifica hasError, qtdRegistros, data)
    });

    pm.test("[CT-002] [CONTRACT][BaseList] Coerência entre qtdRegistros e data.length", () => {
        // ... (Compara o valor de qtdRegistros com o tamanho do array data)
    });

    pm.test("[CT-002] [CONTRACT][BaseList] Se qtdRegistros > 0 então data não é vazia", () => {
        // ... (Verifica se a lista não está vazia quando a contagem é positiva)
    });

    pm.test("[CT-002] [CONTRACT][BaseList] Itens são objetos", () => {
        // ... (Garante que cada item dentro de data é um objeto)
    });

    pm.test("[CT-002] [CONTRACT][BaseList] Paginação consistente (se presente)", () => {
        // ... (Verifica se page, pageSize, totalPages são numéricos, se existirem)
    });
}
```

*   Só roda se for JSON, não for cenário negativo e a resposta for reconhecida como `BaseList` pelo helper.
*   **Estrutura mínima:** verifica a presença dos campos `hasError`, `qtdRegistros` e `data` (array).
*   **Coerência:** garante que o valor de `qtdRegistros` (convertido para número) é igual ao `data.length`.
*   **Itens:** garante que os itens dentro de `data` são objetos.
*   **Paginação:** verifica se os campos de paginação (`page`, `pageSize`, `totalPages`) são do tipo `number`.

## 4. Contratos por módulo / endpoint (CT-003 a CT-015)

Agora o script entra em regras mais específicas por área do sistema.

### 4.1 Autenticação / Login (`ppid_login` e `/ppid/newlogin`) – CT-003

```javascript
if (isJson && json && (moduleKey === "ppid_login" || url.includes("/ppid/newlogin")) && !isNegativeCase) {
// ...
}
```

Só roda para:

*   Resposta JSON.
*   Módulo `ppid_login` ou URL contendo `/ppid/newlogin`.
*   Cenário positivo.

#### 4.1.1 Envelope deve ter `hasError`

```javascript
    pm.test("[CT-003] [CONTRACT][LOGIN] Envelope padrão com hasError", () => {
        pm.expect(json).to.have.property("hasError");
    });
```

#### 4.1.2 Sucesso contém dados mínimos de sessão

```javascript
    pm.test("[CT-003] [CONTRACT][LOGIN] Sucesso contém dados mínimos de sessão", () => {
        if (json.hasError === false && String(status)[0] === "2") {
            // ... (verifica token, auth, accessToken, etc.)
            // ... (verifica tipo de token e expiração)
        }
    });
```

Se `hasError=false` e status 2xx:

*   exige algum campo de autenticação (`token`, `auth`, etc.).
*   se tiver `token`, exige que seja string.
*   `expiraEm`/`expiresIn` devem ser número ou string.

#### 4.1.3 Erro de login com mensagem clara

```javascript
    pm.test("[CT-003] [CONTRACT][LOGIN] Erro de login com mensagem clara", () => {
        if (json.hasError === true || status >= 400) {
            // ... (verifica message, mensagem, error, errors)
        }
    });
}
```

### 4.2 Produtos (`getPrices`, listas, etc.) – CT-004 / CT-005

```javascript
if (
  isJson &&
  json &&
  !isNegativeCase &&
  !hasErrorFlag &&
  (
    moduleKey === "ppid_getprices" ||
    moduleKey === "produto" ||
    moduleKey === "products" ||
    url.includes("/ppid/precominimo")  ||
    url.includes("/ppid/precoporlocal") ||
    url.includes("/ppid/tabprecotop")
  )
) {
    const data = getMainArray(json);
// ...
}
```

Aplica a endpoints de produto, inclusive `/ppid/getPrices`, `/ppid/precoMinimo`, etc. Só para cenários positivos e sem `hasError`.

#### 4.2.1 Estrutura mínima de lista

```javascript
    pm.test("[CT-004] [CONTRACT][PRODUTO] Estrutura mínima de lista", () => {
        if (isBaseListResponse(json)) {
            pm.expect(data.length).to.be.at.least(0);
        }
    });
```

Se for `BaseList`, `data` deve ser um array (inclusive tamanho 0 é permitido).

#### 4.2.2 Campos-chave por produto

```javascript
    pm.test("[CT-005] [CONTRACT][PRODUTO] Campos-chave por produto", () => {
        if (Array.isArray(data) && data.length > 0) {
            // ... (verifica codProd/id/sku, nome/descricao/description, e preço não negativo)
        }
    });
}
```

Garante:

*   identificador (`codProd`, `id`, `sku`).
*   nome/descrição.
*   se tiver `preco`, tipo correto e não negativo.

### 4.3 Pedidos – CT-006 / CT-007

```javascript
if (
  isJson &&
  json &&
  !isNegativeCase &&
  !hasErrorFlag &&
  (
    moduleKey === "pedido"               ||
    url.includes("/ppid/orderheader")    ||
    url.includes("/ppid/orderdetails")   ||
    url.includes("/ppid/saldoflexpedido")||
    url.includes("/products/itemorderlist")
  )
) {
    const data = getMainArray(json);
// ...
}
```

#### 4.3.1 Estrutura mínima de lista

```javascript
    pm.test("[CT-006] [CONTRACT][PEDIDO] Estrutura mínima de lista", () => {
        // ...
    });
```

#### 4.3.2 Campos-chave por pedido

```javascript
    pm.test("[CT-007] [CONTRACT][PEDIDO] Campos-chave por pedido", () => {
        if (Array.isArray(data) && data.length > 0) {
            // ... (verifica codPed/id e data/dataCriacao/dataEmissao)
        }
    });
}
```

### 4.4 Clientes – CT-008 / CT-009

```javascript
if (isJson && json && moduleKey === "cliente" && !isNegativeCase && !hasErrorFlag) {
    const data = getMainArray(json);
// ...
}
```

#### 4.4.1 Estrutura mínima

```javascript
    pm.test("[CT-008] [CONTRACT][CLIENTE] Estrutura mínima de lista", () => {
        // ...
    });
```

#### 4.4.2 Campos-chave por cliente

```javascript
    pm.test("[CT-009] [CONTRACT][CLIENTE] Campos-chave por cliente", () => {
        if (Array.isArray(data) && data.length > 0) {
            // ... (verifica codCli/id e nome/razaoSocial)
        }
    });
}
```

### 4.5 Endereços – CT-010

```javascript
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
    const data = getMainArray(json);
    const list = Array.isArray(data) && data.length > 0 ? data
                : Array.isArray(json) ? json
                : [json];
// ...
}
```

Normaliza para uma lista `list`, seja a resposta `BaseList`, array direto ou objeto único.

```javascript
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
```

### 4.6 Parceiros – CT-011

```javascript
if (
  isJson &&
  json &&
  !isNegativeCase &&
  !hasErrorFlag &&
  moduleKey === "partner" &&
  !url.includes("/viacep") &&
  !url.includes("/viewpdf") &&
  !url.includes("/relatorios") &&
  !url.includes("/contact/")
) {
    const data = getMainArray(json);
// ...
}
```

#### 4.6.1 Estrutura mínima

```javascript
    pm.test("[CT-011] [CONTRACT][PARCEIROS] Estrutura mínima de lista", () => {
        // ...
    });
```

#### 4.6.2 Campos-chave

```javascript
    pm.test("[CT-011] [CONTRACT][PARCEIROS] Campos-chave por parceiro", () => {
        if (Array.isArray(data) && data.length > 0) {
            // ... (verifica codParc/CODPARC e valida tamanho de CPF/CNPJ)
        }
    });
}
```

Garante presença de `codParc` (em qualquer caixa). Se tiver documento (CPF/CNPJ), valida tamanho 11 ou 14 dígitos.

### 4.7 Usuários / Vendedores – CT-012

```javascript
if (
  isJson &&
  json &&
  moduleKey === "user" &&
  !isNegativeCase &&
  !hasErrorFlag &&
  !url.includes("/versaominima") &&
  !url.includes("/imagem") &&
  !url.includes("/viewpdf") &&
  !url.includes("/relatorios")
) {
// ...
}
```

#### 4.7.1 Estrutura mínima

```javascript
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
```

Garante que cada registro de usuário tenha algum identificador: nome, login, etc.

### 4.8 Configurações / Versão mínima – CT-013

```javascript
if (isJson && json && url.includes("/user/versaominima") && !isNegativeCase) {
    pm.test("[CT-013] [CONTRACT][CONFIG] versaoMinima presente", () => {
        pm.expect(json).to.have.property("versaoMinima");
    });
}
```

Para endpoint de versão mínima de app/cliente: exige que `versaoMinima` exista no JSON.

### 4.9 Logística / Frete / Feriados – CT-014

```javascript
if (
  isJson &&
  json &&
  !isNegativeCase &&
  !hasErrorFlag &&
  (
    url.includes("/tabelafrete")       ||
    url.includes("/regrasentregas")    ||
    url.includes("/feriados")          ||
    url.includes("/freteregiao")       ||
    url.includes("/excecoesentregas")
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
```

Aceita: `BaseList`, array direto, ou objeto – mas não aceita formatos estranhos.

### 4.10 Documentos (`viewDanfe`, `viewBoleto`, `viewPdf`) – CT-015

```javascript
if (isJson && json && (
    url.includes("viewdanfe") ||
    url.includes("viewboleto") ||
    url.includes("viewpdf")
)) {
    pm.test("[CT-015] [CONTRACT][DOCS] Erros padronizados em consultas de documentos", () => {
        if (status >= 400 || json.hasError === true) {
            // ... (verifica message, mensagem, error, errors)
        }
    });
}
```

Se a resposta de um endpoint de documento vier em JSON (normalmente erro): exige que haja mensagem clara de erro.

## 5. Contratos para respostas de erro (4xx/5xx)

### 5.1 Erros JSON

```javascript
if (isJson && json && status >= 400) {
    pm.test("[CT-001] [CONTRACT][ERROR] Estrutura mínima de erro em respostas 4xx/5xx", () => {
        // ... (verifica hasError, message, mensagem, error, errors)
    });
    
    if (Object.prototype.hasOwnProperty.call(json, "hasError")) {
        pm.test("[CT-001] [CONTRACT][ERROR] hasError deve ser TRUE em 4xx/5xx", () => {
            pm.expect(json.hasError, "hasError deve ser true em respostas de erro 4xx/5xx").to.be.true;
        });
    }
}
```

Para qualquer resposta 4xx/5xx em JSON:

*   Exige algum campo indicando erro (`hasError`, `message`, etc.).
*   Se existir `hasError`, exige que seja `true`.

### 5.2 Erros não-JSON

```javascript
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
```

Se o erro é texto/HTML, não JSON:

*   Corpo não pode ser vazio.
*   Não deve conter HTML/stack trace (proteção contra vazamento de detalhes internos).

## 7. Add-on V3 – Contratos binários e paginação (CT-017, CT-018)

A parte final é um IIFE (função auto-executável) que agrupa regras extras.

```javascript
(function V3_ADDON_CONTRACTS() {
  const req = pm.request;
  const res = pm.response;
  const ct = contentType;
  const u = url;
// ...
```

Cria aliases `req`, `res`, `ct`, `u` para simplificar o código interno.

### 7.A Binários (PDF / imagens) – CT-017

#### PDF-like

```javascript
    // PDF-like
    if ((res.code >= 200 && res.code < 300) && !isJson && (u.includes('/viewpdf') || u.includes('/viewdanfe') || u.includes('/viewboleto'))) {
      pm.test('[CT-017] [BINARIO] Content-Type PDF', () => pm.expect(ct).to.include('application/pdf'));
      pm.test('[CT-017] [BINARIO] Tamanho > 1KB', () => pm.expect(res.responseSize).to.be.above(1024));
      pm.test('[CT-017] [BINARIO] Content-Disposition presente', () => {
        const cd = res.headers.get('Content-Disposition') || '';
        pm.expect(cd.length > 0, 'Content-Disposition ausente').to.be.true;
      });
    }
```

Para `/viewpdf`, `/viewdanfe`, `/viewboleto` com status 2xx e não-JSON:

*   `Content-Type` deve incluir `application/pdf`.
*   Tamanho da resposta > 1KB.
*   Header `Content-Disposition` deve existir (download inline/anexo).

#### Imagens (`/imagem/`)

```javascript
    if ((res.code >= 200 && res.code < 300) && !isJson && u.includes('/imagem/')) {
      pm.test('[CT-017] [BINARIO] Content-Type imagem', () =>
        pm.expect(ct).to.match(/image\/(png|jpe?g|webp)/));
      pm.test('[CT-017] [BINARIO] Tamanho > 512B', () => pm.expect(res.responseSize).to.be.above(512));
    }
```

Para `/imagem/` (fotos de produto/usuário):

*   `Content-Type` deve ser imagem (`png`/`jpg`/`webp`).
*   Tamanho mínimo 512 bytes.

#### Imagens (`/photo`)

```javascript
    if ((res.code >= 200 && res.code < 300) && !isJson && u.includes('/photo')) {
      pm.test('[CT-017] [BINARIO] Content-Type imagem (photo)', () =>
        pm.expect(ct).to.match(/image\/(png|jpe?g|webp)/)
      );
      pm.test('[CT-017] [BINARIO] Tamanho > 512B (photo)', () =>
        pm.expect(res.responseSize).to.be.above(512)
      );
    }
  })();
```

Mesma lógica para endpoints que contenham `/photo`.

*   **Para que?** Garante que endpoints binários não estão devolvendo HTML de erro silencioso, e que o conteúdo faz sentido como arquivo.

### 7.B Paginação – CT-018

```javascript
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
```

**Passo a passo:**

*   Só roda se:
    *   Resposta é JSON.
    *   Não é cenário negativo.
    *   `json` existe.
*   Lê a query string da request e procura o parâmetro `'page'`.
*   Se existir:
    *   Converte o valor para número.
    *   Procura uma propriedade no JSON que represente a página atual: `"page"`, `"pagina"` ou `"paginaAtual"`.
    *   Se encontrar, cria o teste: `[CT-018] [PAG] "page" coerente entre query e resposta`.
    *   Compara o número da query com o número retornado no corpo.
*   **Para que?** Garante que a paginação está consistente: se você pediu `page=2`, a resposta não vem falando que está na página 1 ou 3, por exemplo.

## Como esse script organiza seus testes de contrato

**Resumindo:**

*   **Gate (Smoke):**
    *   Bloqueia tudo se o básico (status 2xx e `hasError`) estiver errado em cenários positivos.
*   **Contratos genéricos (CT-001):**
    *   JSON válido, sem HTML, convenção `hasError`.
*   **`BaseList` (CT-002):**
    *   Coerência de `qtdRegistros`, `data`, paginação básica.
*   **Contratos por módulo (CT-003 a CT-015):**
    *   Valida o que faz sentido para cada área: Login, produtos, pedidos, clientes, endereços, parceiros, usuários, logística, documentos.
*   **Contratos de erro:**
    *   Tanto JSON quanto não-JSON, sempre exigindo mensagem clara e evitando vazamento de stack trace.
*   **Add-on V3:**
    *   Binários (PDF/imagem).
    *   Paginação coerente (CT-017, CT-018).
