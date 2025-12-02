
## Visão geral

Este script é um script de testes de contrato executado na aba “Tests” da collection ou das requests da collection do Postman.  
Ele é responsável por:

- Validar o **contrato das respostas** da API BFF Vidya Force (estrutura, campos-chave, tipos e consistência).
- Padronizar a verificação de **hasError**, **BaseList**, **pedidos, produtos, parceiros, usuários**, etc.
- Rodar testes **automáticos** por endpoint com base no nome da request (`requestName`) e na URL (`moduleKey`, `pathSegments`).

O objetivo principal é:

> “Garantir que a API BFF respeita contratos mínimos e consistentes para cada tipo de endpoint, sem precisar escrever testes manuais em cada request do Postman.”

O script está organizado em seções principais:

1. **Helpers e contexto** (detecção de módulo, parse de JSON, `getMainArray` etc.).
2. **Testes genéricos de contrato** (CT-001 e CT-002).
3. **Testes específicos por módulo** (produtos, pedidos, parceiros, usuários, logística, documentos).
4. **Add-on V3** (testes adicionais para binários (PDF, imagens) e paginação (CT-017, CT-018)).
5. **Novos contratos específicos por endpoint**, complementando a cobertura para casos antes ignorados ou inadequadamente testados (CT-019 até CT-030).

---

## 1. Contexto, helpers e roteamento de requests

### 1.1. Captura de contexto da request e response

Logo no início do script, são capturadas informações fundamentais da request/response:

```javascript
const url = pm.request.url.toString().toLowerCase();
const status = pm.response.code;
const contentType = (pm.response.headers.get("Content-Type") || "").toLowerCase();
const isJson = contentType.includes("application/json");
const requestName = (pm.info.requestName || "").toLowerCase();
```

- **`url`**: URL completa em minúsculo, utilizada para identificar o módulo e o tipo de endpoint.
- **`status`**: código HTTP (200, 400, 500 etc.).
- **`contentType`**: cabeçalho de tipo de conteúdo (para saber se a resposta é JSON, PDF, imagem etc).
- **`isJson`**: flag indicando se o `Content-Type` contém `application/json`.
- **`requestName`**: nome da request no Postman, também em minúsculo. Isso é essencial para routing dos CTs (ex.: `get partner > fields`).

Em seguida, o script tenta fazer o parse do JSON caso `isJson` seja verdadeiro:

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

- **`json`**: corpo já parseado como objeto.
- **`jsonParseError`**: indica se houve erro ao fazer `response.json()`.

### 1.2. Flags de erro e cenário negativo

O script define flags para facilitar a lógica de decisão:

```javascript
const hasErrorFlag = isJson && json && json.hasError === true;
const isSuccessEnvelope = isJson && json && json.hasError === false;

const isNegativeCase =
    requestName.includes("[negativo]") ||
    requestName.includes("[error]") ||
    requestName.includes("[erro]") ||
    requestName.includes("[4xx]") ||
    requestName.includes("[5xx]");
```

- **`hasErrorFlag`**: resposta JSON com `hasError=true`.
- **`isSuccessEnvelope`**: resposta JSON com `hasError=false`.
- **`isNegativeCase`**: cenários rotulados no nome da request do Postman como casos de erro ou 4xx/5xx.  
  O script evita aplicar certas exigências de sucesso em requests marcadas como negativas.

### 1.3. Roteamento por módulo

O path da URL é quebrado em segmentos:

```javascript
const pathSegments = (pm.request.url.path || [])
    .filter(Boolean)
    .map(s => String(s).toLowerCase());
```

Depois, é derivado um `moduleKey`:

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

- Se a URL começa com **`/ppid`**, o módulo vira `ppid_<seguinte>` (ex.: `/ppid/getPrices` → `ppid_getprices`).
- Caso contrário, `moduleKey` é simplesmente o primeiro segmento (`products`, `partner`, `user`, etc.).

Esse `moduleKey`, junto de trechos da `url` e do `requestName`, é usado para decidir **quais CTs devem ser executados** para cada request.

---

## 2. Helpers de contrato

### 2.1. Detecção de BaseList

Muitos endpoints usam um envelope padrão “BaseList”:

```javascript
function isBaseListResponse(body) {
    if (!body || typeof body !== "object") return false;
    const hasHasError = body.hasError !== undefined;
    const qtdKey = Object.keys(body).find(k => k.toLowerCase() === "qtdregistros");
    const hasQtd = !!qtdKey;
    const hasData = Array.isArray(body.data);
    return hasHasError && hasQtd && hasData;
}
```

Esse helper:

- Identifica respostas que possuem:
  - `hasError`,
  - alguma forma de `qtdRegistros` (case-insensitive),
  - `data` como array.

### 2.2. Extração do “main array” da resposta

```javascript
function getMainArray(body) {
    if (!body) return [];
    if (Array.isArray(body)) return body;
    if (Array.isArray(body.data)) return body.data;
    if (body.data && typeof body.data === "object") {
        return [body.data];
    }
    return [];
}
```

Esse helper garante que:

- Se a resposta é um array diretamente, ele retorna o próprio array.
- Se existe `body.data` como array, retorna `body.data`.
- **Se `data` é objeto único**, retorna `[data]` (isso permite tratar tanto listas quanto registros únicos de forma uniforme).
- Caso contrário, retorna `[]`.

Isso é fundamental para os contratos de listas (produtos, pedidos, parceiros etc.), pois evita que o CT fique acoplado a um único formato.

### 2.3. Helpers de validação genéricos

#### `ensureAtLeastOneKey`

```javascript
function ensureAtLeastOneKey(obj, keys, msg) {
    const ok = keys.some(k => Object.prototype.hasOwnProperty.call(obj, k));
    pm.expect(ok, msg || `Deve possuir pelo menos um dos campos: ${keys.join(", ")}`).to.be.true;
}
```

- Verifica se **pelo menos um** dos campos listados existe no objeto.
- É largamente usado para validar campos-chave de identificação, como `codProd/id/sku`, `codParc`, `codPed`, etc.

#### `ensureFieldType`

```javascript
function ensureFieldType(value, expectedTypes, msg) {
    const types = Array.isArray(expectedTypes) ? expectedTypes : [expectedTypes];
    const actual = typeof value;
    const ok = types.includes(actual);
    pm.expect(ok, msg || `Tipo ${actual} não está entre os esperados: ${types.join(", ")}`).to.be.true;
}
```

- Garante que um valor seja de um tipo esperado (`number`, `string`, `boolean`).
- Aceita também uma lista de tipos, facilitando casos em que um campo pode ser string ou número, por exemplo.

---

## 3. Smoke test e gate de execução

Para qualquer request que **não seja cenário negativo** (`isNegativeCase === false`), o script aplica um **smoke test** que funciona como gate:

```javascript
if (!isNegativeCase) {
    let smokeFailed = false;

    if (status < 200 || status >= 300) {
        smokeFailed = true;
    }

    pm.test(`[SMOKE] Status 2xx esperado`, () => {
        pm.expect(status, `Status inesperado: ${status} (${pm.request.url.toString()})`).to.be.within(200, 299);
    });

    if (smokeFailed) {
        console.log(`[GATE] Smoke falhou (Status ${status}). Ignorando testes avançados para ${pm.request.url.toString()}).`);
        return;
    }

    if (hasErrorFlag) {
        pm.test("[GATE] Resposta com hasError=true deve falhar", () => {
            pm.expect.fail(`hasError=true detectado em resposta com status ${status} (${pm.request.url.toString()})`);
        });
        console.log(`[GATE] hasError=true detectado. Interrompendo testes para ${pm.request.url.toString()}.`);
        return;
    }
}
```

**Importante**:

- Se o status não for 2xx, o teste smoke falha e **interrompe** a execução dos demais CTs.
- Se `hasError=true` em um cenário que deveria ser de sucesso, também falha e interrompe.

Isso evita que contratos detalhados sejam avaliados em cima de respostas de erro.

---

## 4. Testes genéricos de contrato (CT-001 e CT-002)

### 4.1. CT-001 – JSON válido e estrutura genérica

Verifica se a resposta JSON é bem formada e se respeita as convenções de `hasError` e mensagens.

Trechos relevantes:

```javascript
pm.test("[CT-001] [CONTRACT][GENERIC] JSON válido quando Content-Type é application/json", () => {
    if (!isJson) {
        return pm.expect(true, "N/A").to.be.true;
    }
    pm.expect(jsonParseError, "Falha ao parsear JSON da resposta").to.be.false;
});
```

Depois, se `isJson` e `json` existem, ele verifica:

- Se não há HTML bruto no corpo (`<html`).
- Se `hasError` é booleano, quando presente.
- Se, no caso de `hasError=true`, há mensagem ou estrutura de erro.
- Se, no caso de sucesso (`hasError=false`), não há campos indevidos de stack ou exceção.

Também há uma variante de CT-001 para **erros JSON** (status ≥ 400) e **erros não JSON**, garantindo:

- Estrutura mínima de erro (`hasError`, `message`, `mensagem`, `error` etc.).
- Que o corpo não esteja vazio e não contenha HTML/stack trace em formato bruto.

### 4.2. CT-002 – Contrato de BaseList

Para respostas no padrão BaseList (`hasError`, `qtdRegistros`, `data` array), temos o CT-002:

- **Estrutura mínima**:
  - `hasError` presente e booleano.
  - `qtdRegistros` presente e numérico (ou string numérica).
  - `data` array.
- **Coerência `qtdRegistros` x `data.length`**:
  - `qtdRegistros >= data.length`.
  - Se `totalPages = 1`, então `qtdRegistros === data.length`.
- **Se `qtdRegistros > 0`, então `data` não é vazia**.
- **Itens são objetos**:
  - Exceto para requests em `baseSkipKeyFieldsRequests`, onde pode haver listas de valores simples.
- **Paginação consistente**, quando há `page`, `pageSize`, `totalPages`:
  - Tipos numéricos.
  - `data.length <= pageSize`.

---

## 5. Contratos por módulo (CT-003 a CT-016)

### 5.1. Login e autenticação (CT-003)

Bloco cobre `/ppid/login` e `/ppid/newLogin`, validando:

- Presença de `hasError`.
- No sucesso:
  - token (ou estrutura de autenticação com `usuario`/`user`).
  - eventual campo de expiração (`expiraEm`/`expiresIn`).
- No erro:
  - existência de mensagem (`message`, `mensagem`, `error`, `errors`).
- Em erros 4xx/5xx:
  - `Content-Type` deve ser `application/json`.

### 5.2. Produtos (CT-004 e CT-005)

Aplica-se a:

- `/ppid/getPrices`, `/ppid/precoMinimo`, `/ppid/precoPorLocal`, `/ppid/tabPrecoTop`.
- Módulos `produto` e `products` (com exceções específicas em skips).

**CT-004 – Estrutura mínima de lista de produtos**:

- Se BaseList, apenas verifica que `data.length >= 0`.

**CT-005 – Campos-chave por produto**:

- Somente quando não está em `productSkipKeyFieldsRequests`.
- Valida:
  - Identificador de produto (algum de: `codProd`, `id`, `sku`, `CODPROD`, `CODGRUPOPROD`, `CODLOCAL` etc.).
  - Nome/descrição (`nome`, `descricao`, `DESCRLOCAL`, `DESCRGRUPOPROD`, etc.).
  - Tipo e sinal de `preco` (positivo ou zero).
  - Tipo de ID (número ou string).

### 5.3. Pedidos (CT-006 e CT-007)

Aplica-se a:

- `/ppid/orderheader`
- `/ppid/orderdetails`
- `/ppid/saldoflexpedido`
- `/products/itemorderlist`
- e módulo `pedido` (se existir).

**CT-006 – Estrutura mínima de lista de pedidos**:

- Se BaseList, apenas verifica que `data.length >= 0`.

**CT-007 – Campos-chave por pedido**:

- Só roda se a request **não** estiver em `pedidoSkipKeyFieldsRequests`.
- Valida:
  - Presença de identificador (`codPed`, `codped`, `id`).
  - Algum campo de data (`data`, `dataCriacao`, `dataEmissao`).
  - Formato da data (regex simples de `YYYY-MM-DD`).

### 5.4. Clientes (CT-008 e CT-009)

Aplica-se ao módulo `cliente`:

- **CT-008**: estrutura mínima (BaseList) de clientes.
- **CT-009**: campos-chave:
  - ID (`codCli`, `id`);
  - Nome/Razão social (`nome`, `razaoSocial`).

### 5.5. Endereços (CT-010)

Cobrem:

- módulo `endereco`;
- `/partner/viacep`.

O CT-010:

- Monta uma lista a partir de `getMainArray(json)` (ou diretamente do objeto).
- Para cada item:
  - Se existir `mensagem` objeto, valida dentro de `e.mensagem`.
  - Exige algum de:
    - `cep`;
    - `logradouro`;
    - `cidade` ou `localidade`.

Isso adequa o teste a estruturas tanto de endereços internos quanto do ViaCEP.

### 5.6. Parceiros (CT-011)

Aplica-se ao módulo `partner`, excluindo:

- `/viacep`, `/viewpdf`, `/relatorios`, `/contact/`.
- Requests presentes em `partnerSkipKeyFieldsRequests`.

Verifica:

- Estrutura mínima de BaseList.
- Campos-chave por parceiro:
  - `codParc`, `CODPARC`, `VALUE`, `CODTIPPARC`.
- Documento (CPF/CNPJ):
  - `CGC_CPF`, `CNPJ`, `cpf`, `cnpj`;
  - Apenas dígitos, tamanho 11 ou 14.

### 5.7. Usuários / Vendedores (CT-012, CT-013)

Aplica-se ao módulo `user`:

- Exclui `/versaominima`, `/imagem`, `/viewpdf`, `/relatorios`.

**CT-012 – Estrutura mínima de usuário**:

- Usa `getMainArray(json)`:
  - Aceita tanto listas (`[ ... ]`) quanto objeto único em `data`.
- Exige, em cada registro, pelo menos um identificador de usuário:
  - `nome`, `name`, `usuario`, `login`, `NOMEUSU`, `nomeUsu`.

**CT-013 – Versão mínima do app**:

- Endpoint `/user/versaominima`:
  - Exige presença de `versaoMinima`.

### 5.8. Logística (CT-014)

Aplica-se a URLs que contenham:

- `/tabelafrete`, `/regrasentregas`, `/feriados`, `/freteRegiao`, `/excecoesEntregas`.

O CT-014:

- Verifica se a estrutura é BaseList ou, se não BaseList, que seja:
  - array, ou
  - objeto, ou
  - `json.data` array.

### 5.9. Documentos (CT-015)

Aplica-se a URLs com:

- `viewdanfe`, `viewboleto`, `viewpdf`.

Quando a resposta é JSON (error envelope), verifica em erros:

- Se existe mensagem (`message`, `mensagem`, `error`, `errors`).

### 5.10. Erros JSON / não JSON (CT-001 – variantes)

Para status ≥ 400:

- **Erros JSON**:
  - Devem ter `hasError=true` (quando `hasError` existe).
  - Devem ter algum campo de mensagem/erro.
- **Erros não JSON**:
  - Corpo não pode ser vazio.
  - Não pode conter HTML/stack trace bruto.

---

## 6. Add-on V3 – Binários e paginação (CT-017 e CT-018)

### 6.1. CT-017 – Binários (PDF, DANFE, BOLETO, imagens)

Para PDFs (`/viewpdf`, `/viewdanfe`, `/viewboleto`) com status 2xx e não JSON:

- Confere:
  - `Content-Type` contendo `application/pdf`.
  - Tamanho (`responseSize`) > 1KB.
  - Cabeçalho `Content-Disposition` presente.

Para imagens (`/imagem/` e `/photo`):

- `Content-Type` compatível com `image/png`, `image/jpeg`, `image/webp`.
- Tamanho (`responseSize`) > 512 bytes.

### 6.2. CT-018 – Paginação coerente

Quando a request tem **query param `page`** (e opcional `pageSize`):

- Procura campos de página na resposta:
  - `page`, `pagina`, `paginaAtual`.
- Valida que `json[pageKey] == page da query`.
- Se existir `pageSize` na query e na resposta (`pageSize`, `tamanhoPagina`):
  - Garante que sejam iguais (`==`).

Esse CT complementa o CT-002, que já verifica que `data.length <= pageSize`.

---

## Exceções de campos-chave por request (skip lists)

Antes de entrar nos novos CTs, o script ganhou quatro *listas de exceção* (`Set`) para evitar falsos positivos em testes genéricos de contrato (principalmente CT-002, CT-005, CT-007 e CT-011).

### Skip de campos-chave para parceiros

```javascript
const partnerSkipKeyFieldsRequests = new Set([
  "get partner > fields",
  "get partner > [codparc] > getfinancialdata",
  "get partner > [partnerid] > openfinancialsecurities",
  "get partner > importardadoscnpj",
  "get partner > importardadossefaz",
  "get partner > produtoscomprados",
  "get partner > fichaparceiro",
  "get partner > [codparc] > listattachment"
]);
```

* **O que é:** conjunto de nomes de requests (em minúsculo) em que **não faz sentido cobrar `codParc`/documento** como se fossem “lista de parceiros”.
* **Onde é usado:** dentro do bloco de parceiros (CT-011), o script checa:

```javascript
if (partnerSkipKeyFieldsRequests.has(requestName)) {
    pm.expect(true, `CT-011 (Campos-chave) não se aplica para "${pm.info.requestName}"`).to.be.true;
    return;
}
```

* **Para que serve:** quando a resposta é, por exemplo, *campos configuráveis*, *dados financeiros*, *títulos em aberto*, *produtos comprados* ou *anexos*, ela não é exatamente uma “lista de parceiros”, então o CT-011 é pulado para esses endpoints e em vez disso entram CTs específicos (CT-019 a CT-026).

### Skip de campos-chave para produtos

```javascript
const productSkipKeyFieldsRequests = new Set ([
    "get products > fabricantes",
    "get products > destaques",
    "get products > ultimasvendas"
]);
```

* **O que é:** lista de requests de produtos em que a resposta **não é uma lista de produtos clássica** (com `codProd/id/sku`).
* **Onde é usado:** no CT-005 (produtos), antes de validar identificador, o script faz:

```javascript
if (productSkipKeyFieldsRequests.has(requestName)) {
    pm.expect(true, `CT-005 (Campos-chave) não se aplica para "${pm.info.requestName}"`).to.be.true;
    return;
}
```

* **Motivação:** nesses endpoints, você quer validar outros campos (por exemplo, `FABRICANTE` ou estrutura de “últimas vendas”), e não necessariamente `codProd`. Os novos CT-022 e CT-027 entram justamente para cobrir esses cenários.

### Skip de campos-chave para pedidos

```javascript
const pedidoSkipKeyFieldsRequests = new Set ([
    "get ppid > saldoflexpedido",
    "get ppid > orderheader",
    "get products > itemorderlist"
]);
```

* **O que é:** endpoints relacionados a pedido, mas onde a resposta **não é uma lista de “pedidos”** em si.
* **Onde é usado:** no CT-007 (pedidos), logo no início:

```javascript
if (pedidoSkipKeyFieldsRequests.has(requestName)) {
    return pm.expect(true, `CT-007 não se aplica para "${pm.info.requestName}"`).to.be.true;
}
```

* **Motivação:** `saldoFlexPedido`, `orderHeader` e `itemOrderList` têm estruturas próprias (saldo, header, itens por produto). Por isso eles ganham CTs dedicados (CT-028, CT-029 e CT-030).

### Skip para validação de itens BaseList

```javascript
const baseSkipKeyFieldsRequests = new Set ([
    "get products > destaques"
]);
```

* **Onde é usado:** na parte de `BaseList`, dentro de:

```javascript
pm.test("[CT-002] [CONTRACT][BaseList] Itens são objetos", () => {
     if (baseSkipKeyFieldsRequests.has(requestName)) {
        return pm.expect(true, "Ignorado para requests que retornam listas de valores simples (ex: destaques)").to.be.true;
    }
    data.forEach((item, i) => {
        pm.expect(item, `Item[${i}] não é objeto`).to.be.an("object");
    });
});
```

* **Motivação:** alguns endpoints podem retornar listas simples (valores primitivos) e não objetos complexos; para esses casos, não faz sentido exigir que cada item seja um objeto.

---

## Novos contratos específicos por endpoint (CT-019 a CT-030)

A partir daqui, entram os novos CTs que cobrem os endpoints que passaram a ser ignorados nos testes genéricos (CT-005, CT-007, CT-011). A ideia é **substituir falsos positivos genéricos por contratos sob medida** para cada tipo de resposta.

### CT-019 – Configuração de campos de parceiro (`GET partner > fields`)

Trecho do script:

```javascript
if (
    isJson &&
    json &&
    !isNegativeCase &&
    !hasErrorFlag &&
    moduleKey === "partner" &&
    requestName === "get partner > fields"
) {
    const data = getMainArray(json);

    pm.test("[CT-019] [CONTRACT][PARCEIROS] Campos de configuração devem ter nome e descricao", () => {
        pm.expect(Array.isArray(data), "[fields] Resposta não é uma lista em data").to.be.true;

        if (!Array.isArray(data) || data.length === 0) {
            return;
        }

        data.forEach((field, idx) => {
            pm.expect(field, `Field[${idx}] deve ser um objeto`).to.be.an("object");

            pm.expect(field, `Field[${idx}] deve ter 'nome'`).to.have.property("nome");
            pm.expect(field, `Field[${idx}] deve ter 'descricao'`).to.have.property("descricao");

            ensureFieldType(field.nome, "string", `Field[${idx}] nome deve ser string`);
            ensureFieldType(field.descricao, "string", `Field[${idx}] descricao deve ser string`);
        });
    });
}
```

* **O que valida:** cada entrada de configuração de campo:
  * é um objeto;
  * possui `nome` e `descricao`;
  * ambos são `string`.
* **Por que existe:** ao invés de cobrar `codParc` (CT-011), aqui o foco é garantir que a tela de configuração de campos tenha informações textuais completas e tipadas corretamente.

---

### CT-020 – Dados financeiros do parceiro (`GET partner > [codParc] > getFinancialData`)

```javascript
if (
    isJson &&
    json &&
    !isNegativeCase &&
    !hasErrorFlag &&
    moduleKey === "partner" &&
    requestName === "get partner > [codparc] > getfinancialdata"
) {
    const data = getMainArray(json);

    pm.test("[CT-020] [CONTRACT][PARCEIROS] Dados financeiros devem ter SITUACAO e BLOQUEAR", () => {
        pm.expect(Array.isArray(data), "[getFinancialData] Resposta não é uma lista em data").to.be.true;

        if (!Array.isArray(data) || data.length === 0) {
            return;
        }

        data.forEach((item, idx) => {
            pm.expect(item, `Financeiro[${idx}] deve ser um objeto`).to.be.an("object");

            pm.expect(item, `Financeiro[${idx}] deve ter 'SITUACAO'`).to.have.property("SITUACAO");
            pm.expect(item, `Financeiro[${idx}] deve ter 'BLOQUEAR'`).to.have.property("BLOQUEAR");

            ensureFieldType(item.SITUACAO, ["string", "number"], `Financeiro[${idx}] SITUACAO deve ser string ou number`);
            ensureFieldType(item.BLOQUEAR, ["string", "boolean", "number"], `Financeiro[${idx}] BLOQUEAR deve ser string/boolean/number`);
        });
    });
}
```

* **O que valida:** para cada registro financeiro:
  * existência de `SITUACAO` e `BLOQUEAR`;
  * tipos flexíveis (`string/number/boolean`) para não quebrar com diferentes modelagens.
* **Motivação:** define um contrato mínimo para indicadores de crédito/bloqueio, sem misturar com a estrutura de parceiro em si.

---

### CT-021 – Títulos em aberto do parceiro (`GET partner > [partnerId] > openFinancialSecurities`)

```javascript
if (
    isJson &&
    json &&
    !isNegativeCase &&
    !hasErrorFlag &&
    moduleKey === "partner" &&
    requestName === "get partner > [partnerid] > openfinancialsecurities"
) {
    const data = getMainArray(json);

    pm.test("[CT-021] [CONTRACT][PARCEIROS] Títulos abertos devem ter CODVEND e NOMEVEND", () => {
        pm.expect(Array.isArray(data), "[openFinancialSecurities] Resposta não é uma lista em data").to.be.true;

        if (!Array.isArray(data) || data.length === 0) {
            return;
        }

        data.forEach((titulo, idx) => {
            pm.expect(titulo, `Titulo[${idx}] deve ser um objeto`).to.be.an("object");

            pm.expect(titulo, `Titulo[${idx}] deve ter 'CODVEND'`).to.have.property("CODVEND");
            pm.expect(titulo, `Titulo[${idx}] deve ter 'NOMEVEND'`).to.have.property("NOMEVEND");

            ensureFieldType(titulo.CODVEND, ["string", "number"], `Titulo[${idx}] CODVEND deve ser string ou number`);
            ensureFieldType(titulo.NOMEVEND, "string", `Titulo[${idx}] NOMEVEND deve ser string`);
        });
    });
}
```

* **O que valida:** todo título em aberto está associado a um vendedor identificável (`CODVEND`, `NOMEVEND`).
* **Motivação:** dá rastreabilidade para cobranças e comissões, sem confundir com contrato de parceiro genérico.

---

### CT-022 – Lista de fabricantes (`GET products > fabricantes`)

```javascript
if (
    isJson &&
    json &&
    !isNegativeCase &&
    !hasErrorFlag &&
    moduleKey === "products" &&
    requestName === "get products > fabricantes"
) {
    const data = getMainArray(json);

    pm.test("[CT-022] [CONTRACT][PRODUTO] Lista de fabricantes deve ter FABRICANTE", () => {
        pm.expect(Array.isArray(data), "[fabricantes] Resposta não é uma lista em data").to.be.true;

        if (!Array.isArray(data) || data.length === 0) {
            return;
        }

        data.forEach((fab, idx) => {
            pm.expect(fab, `Fabricante[${idx}] deve ser um objeto`).to.be.an("object");

            pm.expect(fab, `Fabricante[${idx}] deve ter 'FABRICANTE'`).to.have.property("FABRICANTE");
            ensureFieldType(fab.FABRICANTE, "string", `Fabricante[${idx}] FABRICANTE deve ser string`);
        });
    });
}
```

* **O que valida:** para cada fabricante retornado:
  * registro em forma de objeto;
  * presença do campo `FABRICANTE` com tipo `string`.
* **Motivação:** em vez de exigir `codProd` (não faz sentido aqui), o contrato garante que a lista de fabricantes tem um nome legível.

---

### CT-023 – Importação de dados CNPJ/SEFAZ (`GET partner > importarDadosCnpj/SEFAZ`)

```javascript
if (
    isJson &&
    json &&
    !isNegativeCase &&
    !hasErrorFlag &&
    moduleKey === "partner" &&
    (
        requestName === "get partner > importardadoscnpj" ||
        requestName === "get partner > importardadossefaz"
    )
) {
    const body = json.data && typeof json.data === "object" ? json.data : json;

    pm.test("[CT-023] [CONTRACT][PARCEIROS] importarDados - dados cadastrais mínimos", () => {
        pm.expect(body, "[importarDados] data deve ser objeto").to.be.an("object");

        ensureAtLeastOneKey(
            body,
            ["CPF_CNPJ", "cpf_cnpj", "CGC_CPF", "cgc_cpf"],
            "[importarDados] registro sem documento (CPF/CNPJ)"
        );

        ensureAtLeastOneKey(
            body,
            ["RAZAOSOCIAL", "razaoSocial", "NOMEPARC", "nomeParc"],
            "[importarDados] registro sem nome/razão social"
        );

        ensureAtLeastOneKey(
            body,
            ["CEP", "cep"],
            "[importarDados] registro sem CEP"
        );
        ensureAtLeastOneKey(
            body,
            ["LOGRADOURO", "logradouro"],
            "[importarDados] registro sem logradouro"
        );
        ensureAtLeastOneKey(
            body,
            ["LOCALIDADE", "cidade", "CIDADE"],
            "[importarDados] registro sem cidade/localidade"
        );
    });
}
```

* **O que valida:** os dados importados de fontes externas trazem **mínimo cadastral**:
  * documento (CPF/CNPJ);
  * nome ou razão social;
  * endereço básico (CEP, logradouro, cidade).
* **Motivação:** garante que o “auto-preenchimento” realmente devolve informações utilizáveis para criar/atualizar o cadastro.

---

### CT-024 – Produtos comprados pelo parceiro (`GET partner > produtosComprados`)

```javascript
if (
    isJson &&
    json &&
    !isNegativeCase &&
    !hasErrorFlag &&
    moduleKey === "partner" &&
    requestName === "get partner > produtoscomprados"
) {
    const root = json.data && json.data.produtosUltPedido
        ? json.data.produtosUltPedido
        : getMainArray(json);

    pm.test("[CT-024] [CONTRACT][PARCEIROS] produtosComprados - CODPRODS e CODPARC por item", () => {
        if (!Array.isArray(root) || root.length === 0) {
            return pm.expect(Array.isArray(root), "[produtosComprados] lista deve ser array").to.be.true;
        }

        root.forEach((item, idx) => {
            pm.expect(item, `ProdutoComprado[${idx}] deve ser objeto`).to.be.an("object");
            pm.expect(item, `ProdutoComprado[${idx}] deve ter CODPRODS`).to.have.property("CODPRODS");
            pm.expect(item, `ProdutoComprado[${idx}] deve ter CODPARC`).to.have.property("CODPARC");
        });
    });
}
```

* **O que valida:** cada registro de produto comprado:
  * identifica o produto (`CODPRODS`);
  * identifica o parceiro (`CODPARC`).
* **Motivação:** dá base para relatórios de histórico de compra por cliente.

---

### CT-025 – Ficha do parceiro (`GET partner > fichaParceiro`)

```javascript
if (
    isJson &&
    json &&
    !isNegativeCase &&
    !hasErrorFlag &&
    moduleKey === "partner" &&
    requestName === "get partner > fichaparceiro"
) {
    const body = json.data && typeof json.data === "object" ? json.data : json;

    pm.test("[CT-025] [CONTRACT][PARCEIROS] fichaParceiro - identificação básica", () => {
        pm.expect(body, "[fichaParceiro] data deve ser objeto").to.be.an("object");

        ensureAtLeastOneKey(
            body,
            ["NOMEPARC", "RAZAOSOCIAL", "razaoSocial"],
            "[fichaParceiro] registro sem nome/razão social"
        );

        ensureAtLeastOneKey(
            body,
            ["CPF_CNPJ", "CGC_CPF", "cpf_cnpj", "cgc_cpf"],
            "[fichaParceiro] registro sem documento (CPF/CNPJ)"
        );
    });
}
```

* **O que valida:** a ficha detalhada do parceiro **sempre** tem:
  * nome/razão social;
  * documento (CPF/CNPJ).
* **Motivação:** aqui não se cobra `codParc` porque o foco é o “cartão de identidade” do parceiro, não a lista.

---

### CT-026 – Anexos do parceiro (`GET partner > [codParc] > listAttachment`)

```javascript
if (
    isJson &&
    json &&
    !isNegativeCase &&
    !hasErrorFlag &&
    moduleKey === "partner" &&
    requestName === "get partner > [codparc] > listattachment"
) {
    const data = getMainArray(json);

    pm.test("[CT-026] [CONTRACT][PARCEIROS] listAttachment - estrutura de anexos", () => {
        pm.expect(Array.isArray(data), "[listAttachment parceiro] data deve ser array").to.be.true;

        if (!Array.isArray(data) || data.length === 0) {
            return;
        }

        data.forEach((att, idx) => {
            pm.expect(att, `Attachment[${idx}] deve ser objeto`).to.be.an("object");
            ensureAtLeastOneKey(
                att,
                ["NOMEARQ", "nomeArq", "DESCRICAO", "descricao"],
                `[Attachment] Item[${idx}] sem nome/descrição`
            );
        });
    });
}
```

* **O que valida:** cada anexo tem pelo menos:
  * nome ou descrição (`NOMEARQ`/`DESCRICAO`/variantes).
* **Motivação:** garante que a UI consiga exibir uma lista de anexos legível, mesmo sem exigir `codParc` em cada item.

---

### CT-027 – Últimas vendas de produto (`GET products > ultimasVendas`)

```javascript
if (
    isJson &&
    json &&
    !isNegativeCase &&
    !hasErrorFlag &&
    moduleKey === "products" &&
    requestName === "get products > ultimasvendas"
) {
    const data = getMainArray(json);

    pm.test("[CT-027] [CONTRACT][PRODUTO] ultimasVendas - estrutura básica de venda", () => {
        pm.expect(Array.isArray(data), "[ultimasVendas] data deve ser array").to.be.true;

        if (!Array.isArray(data) || data.length === 0) {
            return;
        }

        data.forEach((v, idx) => {
            pm.expect(v, `Venda[${idx}] deve ser objeto`).to.be.an("object");

            ensureAtLeastOneKey(
                v,
                ["CODPARC", "codParc", "CODVEND", "NUNOTA"],
                `[ultimasVendas] Venda[${idx}] sem identificação (parceiro/vendedor/nota)`
            );
        });
    });
}
```

* **O que valida:** cada linha de “últimas vendas” tem **alguma identificação**:
  * parceiro, ou vendedor, ou número da nota.
* **Motivação:** em relatórios de histórico de venda por produto, você sempre terá como rastrear o registro.

---

### CT-028 – Saldo flex do pedido (`GET ppid > saldoFlexPedido`)

```javascript
if (
    isJson &&
    json &&
    !isNegativeCase &&
    !hasErrorFlag &&
    moduleKey === "ppid" &&
    requestName === "get ppid > saldoflexpedido"
) {
    const body = json.data && typeof json.data === "object" ? json.data : json;

    pm.test("[CT-028] [CONTRACT][PEDIDO] saldoFlexPedido - campo SALDO presente", () => {
        pm.expect(body, "[saldoFlexPedido] data deve ser objeto").to.be.an("object");
        pm.expect(body, "[saldoFlexPedido] deve ter campo SALDO").to.have.property("SALDO");
    });
}
```

* **O que valida:** a resposta de saldo flex:
  * vem em formato de objeto;
  * contém o campo `SALDO`.
* **Motivação:** substitui a cobrança genérica de `codPed/id` (CT-007) por algo coerente com o objetivo do endpoint (valor de saldo).

---

### CT-029 – Cabeçalho do pedido (`GET ppid > orderHeader`)

```javascript
if (
    isJson &&
    json &&
    !isNegativeCase &&
    !hasErrorFlag &&
    moduleKey === "ppid" &&
    requestName === "get ppid > orderheader"
) {
    const body = json.data && typeof json.data === "object" ? json.data : json;

    pm.test("[CT-029] [CONTRACT][PEDIDO] orderHeader - campos principais", () => {
        pm.expect(body, "[orderHeader] data deve ser objeto").to.be.an("object");

        ensureAtLeastOneKey(
            body,
            ["CODTIPOPER", "codTipOper"],
            "[orderHeader] sem tipo de operação (CODTIPOPER)"
        );

        ensureAtLeastOneKey(
            body,
            ["CODPARC", "codParc", "CODPARCDEST", "CODPARCDEV"],
            "[orderHeader] sem referência de parceiro"
        );
    });
}
```

* **O que valida:** o header do pedido tem:
  * tipo de operação (`CODTIPOPER` ou similar);
  * algum código de parceiro (cliente/destinatário/devolução).
* **Motivação:** foca na identidade “global” do pedido, e não em campos de itens ou detalhes.

---

### CT-030 – Itens do pedido agrupados por produto (`GET products > itemOrderList`)

```javascript
if (
    isJson &&
    json &&
    !isNegativeCase &&
    !hasErrorFlag &&
    moduleKey === "products" &&
    requestName === "get products > itemorderlist"
) {
    const data = getMainArray(json);

    pm.test("[CT-030] [CONTRACT][PEDIDO] itemOrderList - produto e quantidade por item", () => {
        pm.expect(Array.isArray(data), "[itemOrderList] data deve ser array").to.be.true;

        if (!Array.isArray(data) || data.length === 0) {
            return;
        }

        data.forEach((item, idx) => {
            pm.expect(item, `ItemOrderList[${idx}] deve ser objeto`).to.be.be.an("object");

            ensureAtLeastOneKey(
                item,
                ["CODPROD", "codProd", "CODPRODS"],
                `[itemOrderList] Item[${idx}] sem identificador de produto`
            );

            ensureAtLeastOneKey(
                item,
                ["QTD", "QTDNEG", "quantidade", "QTDE"],
                `[itemOrderList] Item[${idx}] sem quantidade`
            );
        });
    });
}
```

* **O que valida:** cada linha de `itemOrderList`:
  * identifica um produto (`CODPROD`/`CODPRODS`);
  * informa uma quantidade (`QTD`, `QTDNEG`, `QTDE` etc.).
* **Motivação:** garante um contrato mínimo para telas/relatórios que agregam itens de pedido por produto, sem aplicar o CT-007 genérico de “lista de pedidos”.
