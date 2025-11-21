# Documento de Casos de Teste de Contrato (Postman)

Este documento descreve, em linguagem simples, o objetivo de cada **caso de teste de contrato (CT-001 a CT-018)** do seu script do Postman, e o que significa quando cada teste **passa** ou **falha**.

---

## CT-001 – Contrato genérico de respostas JSON (estrutura e erros)

**Objetivo geral**

Garantir que qualquer resposta JSON da API siga um padrão mínimo:
- Cabeçalho (`Content-Type`) compatível com o corpo.
- Corpo realmente em JSON.
- Uso consistente do campo `hasError` e da estrutura de erro.

**Testes incluídos**

1. **[CONTRACT][GENERIC] JSON válido quando Content-Type é application/json**  
   - *Objetivo*: Confirmar que, se o servidor diz que a resposta é JSON, o corpo realmente é um JSON válido.  
   - *Se passa*: a API está retornando um corpo bem formado em JSON, compatível com o cabeçalho.  
   - *Se falha*: há risco de erro de implementação (HTML ou texto simples vindo com `Content-Type: application/json`, JSON quebrado, etc.).

2. **[CONTRACT][GENERIC] Resposta JSON não contém HTML**  
   - *Objetivo*: Evitar que páginas de erro HTML (ex.: stacktrace do servidor, tela padrão) vazem dentro de um JSON.  
   - *Se passa*: o corpo não parece conter HTML acidental (ex.: `<html>`, `<body>`).  
   - *Se falha*: provavelmente a API está devolvendo erro de infraestrutura/servidor, e não um erro de negócio tratado.

3. **[CONTRACT][GENERIC] hasError é booleano**  
   - *Objetivo*: Garantir que o campo `hasError` exista e seja sempre **true/false**, nunca string, número, etc.  
   - *Se passa*: o contrato do envelope de resposta está padronizado.  
   - *Se falha*: o front pode ter problemas para interpretar o estado de erro, já que o tipo não é o esperado.

4. **[CONTRACT][GENERIC] Estrutura de erro quando hasError = true**  
   - *Objetivo*: Quando há erro, garantir que existam campos mínimos (ex.: mensagem, lista de erros, etc.).  
   - *Se passa*: quando `hasError = true`, a API está explicando o problema de forma estruturada.  
   - *Se falha*: o cliente recebe apenas um “deu erro”, sem detalhes suficientes para tratar ou mostrar para o usuário.

5. **[CONTRACT][GENERIC] Sucesso não vaza stack/exception**  
   - *Objetivo*: Certificar que respostas de **sucesso** não tragam campos internos de erro (ex.: `stackTrace`, `exception`).  
   - *Se passa*: a API não está expondo detalhes internos em cenários bem-sucedidos.  
   - *Se falha*: é sinal de algum erro mascarado ou de má prática de segurança/exposição de informações.

6. **[CONTRACT][ERROR] Estrutura mínima de erro em respostas 4xx/5xx**  
   - *Objetivo*: Garantir que erros HTTP (4xx/5xx) também sigam um padrão mínimo de envelope de erro.  
   - *Se passa*: as falhas técnicas ou de validação estão vindo com um formato previsível.  
   - *Se falha*: o cliente terá dificuldade para tratar erros de forma uniforme (cada endpoint pode responder de um jeito).

7. **[CONTRACT][ERROR] hasError deve ser TRUE em 4xx/5xx (se presente)**
   - *Objetivo*: Se a resposta de erro (4xx/5xx) for JSON e contiver o campo `hasError`, garantir que ele seja `true`.
   - *Se passa*: o campo `hasError` é consistente com o status HTTP de erro.
   - *Se falha*: inconsistência no padrão de envelope de erro.

8. **[CONTRACT][ERROR] Resposta de erro não-JSON não deve conter HTML (stack trace)**
   - *Objetivo*: Para erros que não retornam JSON, garantir que o corpo não contenha HTML ou *stack trace* vazado.
   - *Se passa*: o erro é limpo e não expõe detalhes internos.
   - *Se falha*: risco de exposição de informações sensíveis do servidor.

---

## CT-002 – Contrato BaseList para listas paginadas

**Objetivo geral**

Validar o contrato de respostas em formato de **lista paginada**, incluindo:
- Estrutura padrão da lista.
- Coerência entre quantidade total, tamanho da lista, e paginação.

**Testes incluídos**

1. **[CONTRACT][BaseList] Estrutura mínima válida**  
   - *Objetivo*: Garantir que o envelope de lista tenha campos básicos (ex.: `hasError`, `data`, possivelmente `qtdRegistros`, `page`, etc.).  
   - *Se passa*: a estrutura da lista está dentro do padrão esperado.  
   - *Se falha*: a API pode estar retornando listas em formatos diferentes, dificultando reuso do front.

2. **[CONTRACT][BaseList] Coerência entre qtdRegistros e data.length**  
   - *Objetivo*: Conferir se o número total de registros informado é coerente com o tamanho da lista retornada na página, respeitando as regras de paginação (ex: `qtdRegistros >= data.length`, e `qtdRegistros == data.length` se for página única).  
   - *Se passa*: a paginação está consistente com o total reportado.  
   - *Se falha*: pode haver bug na contagem ou no cálculo de paginação.

3. **[CONTRACT][BaseList] Se qtdRegistros > 0 então data não é vazia**  
   - *Objetivo*: Evitar cenários em que a API diz que há registros, mas devolve uma lista vazia.  
   - *Se passa*: há alinhamento entre indicador de quantidade e conteúdo retornado.  
   - *Se falha*: problema de lógica na consulta/paginação (o front pode mostrar “há registros”, mas sem dados).

4. **[CONTRACT][BaseList] Itens são objetos**  
   - *Objetivo*: Garantir que cada item da lista seja um objeto com campos (não só string, número, etc.).  
   - *Se passa*: os itens têm estrutura adequada para exibição em tela.  
   - *Se falha*: o front pode não saber como interpretar cada item.

5. **[CONTRACT][BaseList] Paginação consistente (se presente)**  
   - *Objetivo*: Validar que campos de paginação (`page`, `pageSize`, `totalPages`) façam sentido entre si e que `data.length` seja menor ou igual a `pageSize`.  
   - *Se passa*: a paginação está coerente e previsível.  
   - *Se falha*: navegação por páginas pode se comportar de forma errada (pulos, páginas vazias, etc.) ou o tamanho da página está inconsistente.

---

## CT-003 – Contrato de Login (ppid_login/newLogin)

**Objetivo geral**

Validar que as respostas de **login/autenticação** mantenham:
- Envelope padrão com `hasError`.
- Dados mínimos de sessão em caso de sucesso.
- Mensagem clara em caso de erro.

**Testes incluídos**

1. **[CONTRACT][LOGIN] Envelope padrão com hasError**  
   - *Objetivo*: Checar se o login retorna o mesmo “envelope” padrão de respostas (com `hasError`).  
   - *Se passa*: o login segue o mesmo padrão de resto da API.  
   - *Se falha*: o login é um “ponto fora da curva” e pode exigir tratamento especial no front.

2. **[CONTRACT][LOGIN] Sucesso contém dados mínimos de sessão**  
   - *Objetivo*: Garantir que, em sucesso, venham dados como token, usuário, permissões mínimas etc.  
   - *Se passa*: o front terá todas as informações necessárias para manter a sessão.  
   - *Se falha*: o login até pode retornar 200, mas não entrega o que o app precisa para funcionar.

3. **[CONTRACT][LOGIN] Erro de login com mensagem clara**  
   - *Objetivo*: Validar que erros de login venham com mensagem compreensível (ex.: “usuário ou senha inválidos”) e que erros 4xx/5xx retornem `Content-Type: application/json`.  
   - *Se passa*: o usuário final consegue entender o motivo da falha e o cliente consegue tratar o erro de forma padronizada.  
   - *Se falha*: o app pode exibir mensagens genéricas/confusas, ou não conseguir ler o corpo do erro.

---

## CT-004 – Contrato de Dashboard

**Objetivo geral**

Garantir que o **dashboard** retorne um resumo estruturado, com dados de indicadores/cartões quando existirem.

**Testes incluídos**

1. **[CONTRACT][DASHBOARD] Estrutura básica**  
   - *Objetivo*: Verificar se o dashboard segue o envelope esperado e traz os campos centrais.  
   - *Se passa*: há um padrão mínimo para o consumo do dashboard.  
   - *Se falha*: o front pode ter problemas para montar a tela inicial.

2. **[CONTRACT][DASHBOARD] Cards/resumos identificáveis (se existirem)**  
   - *Objetivo*: Validar que, se houver cards/resumos, eles venham identificados (ex.: título, valor, tipo).  
   - *Se passa*: o app consegue exibir corretamente os indicadores.  
   - *Se falha*: os dados podem até existir, mas sem organização clara para exibição.

---

## CT-005 – Contrato de Mensagens

**Objetivo geral**

Validar que o módulo de **mensagens/avisos** siga o padrão de envelope e traga itens com informações mínimas.

**Testes incluídos**

1. **[CONTRACT][MENSAGENS] Envelope e itens básicos**  
   - *Objetivo*: Garantir que exista um envelope padrão e que cada mensagem tenha pelo menos identificador e texto.  
   - *Se passa*: o app consegue listar e exibir as mensagens corretamente.  
   - *Se falha*: as mensagens podem aparecer quebradas ou não aparecer.

---

## CT-006 – Contrato de Pedidos – Lista

**Objetivo geral**

Garantir que a **lista de pedidos** retorne itens com os campos essenciais (ex.: número do pedido, cliente, situação).

**Testes incluídos**

1. **[CONTRACT][PEDIDOS][Lista] Campos essenciais por pedido**  
   - *Objetivo*: Verificar se cada pedido da lista tem identificador (tipo `number` ou `string`), dados do cliente, status mínimo e data com formato válido (`YYYY-MM-DD`).  
   - *Se passa*: o usuário consegue enxergar os pedidos de forma clara e completa na lista, com dados de identificação e tempo corretos.  
   - *Se falha*: a tela de pedidos pode ficar sem informação suficiente, ou a data pode vir em formato inválido.

---

## CT-007 – Contrato de Pedidos – Detalhe

**Objetivo geral**

Validar que o **detalhe de um pedido** traga:
- Identificador claro do pedido.
- Itens corretos quando o retorno é de sucesso.

**Testes incluídos**

1. **[CONTRACT][PEDIDOS][Detalhe] Contém identificador do pedido**  
   - *Objetivo*: Garantir que o detalhe deixe claro de qual pedido se trata (ex.: número/id) e que o ID seja do tipo `number` ou `string`.  
   - *Se passa*: o front consegue relacionar o detalhe com a linha da lista.  
   - *Se falha*: pode haver confusão ou impossibilidade de saber que pedido está sendo exibido.

2. **[CONTRACT][PEDIDOS][Detalhe] Possui itens (quando sucesso)**  
   - *Objetivo*: Validar que, em caso de sucesso, o pedido traga a lista de itens.  
   - *Se passa*: o usuário vê os produtos/serviços daquele pedido.  
   - *Se falha*: o pedido é exibido “vazio” mesmo estando ok no banco, sinal de bug na consulta.

---

## CT-008 – Contrato de Pedidos – Mutação (save/itens/duplicar/confirmar/excluir/delete)

**Objetivo geral**

Garantir que as operações que **alteram** pedidos (criar, editar, duplicar, confirmar, excluir) tenham:
- Envelope de erro padrão.
- Retorno de referência em caso de sucesso.
- Mensagem clara em caso de falha.

**Testes incluídos**

1. **[CONTRACT][PEDIDOS][Mutação] Envelope possui hasError**  
   - *Objetivo*: Conferir se toda operação de mutação retorna o envelope com `hasError`.  
   - *Se passa*: o app consegue saber se a operação deu certo ou não de forma padronizada.  
   - *Se falha*: será mais difícil para o front entender se o pedido foi realmente alterado.

2. **[CONTRACT][PEDIDOS][Mutação] Sucesso retorna referência**  
   - *Objetivo*: Em sucesso, garantir que volte alguma referência útil (ex.: id do pedido, código de confirmação).  
   - *Se passa*: o sistema consegue continuar o fluxo (ex.: abrir o pedido recém-criado).  
   - *Se falha*: a operação pode até ocorrer, mas o app não sabe qual registro foi afetado.

3. **[CONTRACT][PEDIDOS][Mutação] Erro retorna mensagem**  
   - *Objetivo*: Validar que erros de mutação venham com mensagem clara para o usuário.  
   - *Se passa*: o usuário entende por que a operação falhou (ex.: falta de permissão, dados inválidos).  
   - *Se falha*: o app pode exibir mensagens genéricas do tipo “erro desconhecido”.

---

## CT-009 – Contrato de Preços / Tabelas

**Objetivo geral**

Garantir que a API de **preços/tabelas**:
- Use o envelope padrão de erro.
- Traga itens identificáveis (produto, tabela, preço).

**Testes incluídos**

1. **[CONTRACT][PRECOS] Envelope com hasError**  
   - *Objetivo*: Verificar se a resposta de preços segue o mesmo padrão de erro/sucesso.  
   - *Se passa*: o cliente sabe se a consulta foi bem-sucedida ou não.  
   - *Se falha*: o módulo de preços foge do padrão, exigindo tratamento especial.

2. **[CONTRACT][PRECOS] Itens com identificadores (quando lista)**  
   - *Objetivo*: Garantir que cada item de preço tenha campos que identifiquem produto e tabela (ex.: `codProd`, `codTab`, `nomeTab`).  
   - *Se passa*: o app consegue mostrar de qual produto/tabela cada preço pertence.  
   - *Se falha*: pode ficar impossível relacionar o preço ao produto correto.

---

## CT-010 – Contrato de Produtos (Lista e Detalhe)

**Objetivo geral**

Validar que as respostas de **produtos** (lista ou detalhe) tenham identificador e nome, no mínimo.

**Testes incluídos**

1. **[CON1. **[CONTRACT][PRODUTO] Campos essenciais**  
   - *Objetivo*: Checar se sempre há um código de produto (tipo `number` ou `string`), um nome/descrição e se o preço (se presente) é não negativo.  
   - *Se passa*: produtos podem ser exibidos e selecionados corretamente pelo usuário, com dados de preço válidos.  
   - *Se falha*: o catálogo pode ficar confuso, ou o preço pode vir com tipo incorreto ou valor negativo.ível de usar.

---

## CT-011 – Contrato de Parceiros / Clientes

**Objetivo geral**

Garantir que as respostas de **parceiros/clientes** estejam padronizadas e tragam campos-chave.

**Testes incluídos**

1. **[CONTRACT][PARCEIROS] Envelope (quando aplicável)**  
   - *Objetivo*: Validar que o módulo de parceiros use o envelope padrão de resposta.  
   - *Se passa*: se integra bem com o restante do app.  
   - *Se falha*: o front precisa tratar esse módulo de forma diferente.

2. **[CONTRACT][PARCEIROS] Campos-chave por parceiro**  
   - *Objetivo*: Confirmar a presença de campos essenciais como código do parceiro, nome/razão social e, se presente, validar o formato do documento (CPF/CNPJ) para ter 11 ou 14 dígitos.  
   - *Se passa*: o usuário identifica claramente cada cliente/parceiro, e os dados de documento estão limpos e corretos.  
   - *Se falha*: telas de seleção de cliente podem ficar quebradas ou confusas, ou o documento pode vir em formato inválido.

---

## CT-012 – Contrato de Usuários / Vendedores

**Objetivo geral**

Certificar que respostas de **usuários/vendedores** tenham estrutura mínima para identificação.

**Testes incluídos**

1. **[CONTRACT][USUARIO] Estrutura mínima**  
   - *Objetivo*: Garantir que cada usuário/vendedor venha com identificador e informações básicas (ex.: nome).  
   - *Se passa*: o sistema consegue listar e relacionar atividades a cada usuário.  
   - *Se falha*: relatórios e telas de seleção de usuário ficam comprometidos.

---

## CT-013 – Contrato de Configuração – Versão Mínima do App

**Objetivo geral**

Garantir que o endpoint de **configuração** informe a **versão mínima do app** que pode se conectar.

**Testes incluídos**

1. **[CONTRACT][CONFIG] versaoMinima presente**  
   - *Objetivo*: Validar que exista um campo claro indicando a versão mínima suportada.  
   - *Se passa*: é possível forçar atualizações de versão do app de forma controlada.  
   - *Se falha*: o backend não consegue orientar o app sobre compatibilidade de versão.

---

## CT-014 – Contrato de Logística / Frete / Feriados

**Objetivo geral**

Garantir que respostas relacionadas a **frete, prazos e feriados** tenham estrutura consistente.

**Testes incluídos**

1. **[CONTRACT][LOGISTICA] Estrutura válida**  
   - *Objetivo*: Verificar se a resposta traz campos mínimos (ex.: prazo, tipo de frete, feriados considerados).  
   - *Se passa*: o app consegue calcular e mostrar prazos e opções de entrega.  
   - *Se falha*: cálculos de prazo/frete podem ficar errados ou impossíveis.

---

## CT-015 – Contrato de Documentos (viewDanfe / viewBoleto / viewPdf) com erro em JSON

**Objetivo geral**

Validar que consultas de **documentos** que poderiam retornar binário (PDF, boleto, DANFE) retornem **erro em JSON padronizado** quando algo dá errado.

**Testes incluídos**

1. **[CONTRACT][DOCS] Erros padronizados em consultas de documentos**  
   - *Objetivo*: Garantir que, na falha, a API não devolva um binário “quebrado”, mas sim um JSON de erro.  
   - *Se passa*: o app consegue mostrar uma mensagem de erro legível em vez de um PDF inválido.  
   - *Se falha*: o usuário pode receber um arquivo corrompido ou sem explicação.

---

## CT-017 – Contratos binários (PDF / DANFE / BOLETO / Imagens)

**Objetivo geral**

Validar o contrato de **respostas binárias**, garantindo que PDFs e imagens sejam devolvidos de forma correta.

**Testes incluídos**

1. **[BINARIO] Content-Type PDF**  
   - *Objetivo*: Verificar se respostas de documentos (viewPdf, viewDanfe, viewBoleto) vêm com `Content-Type` de PDF.  
   - *Se passa*: o arquivo é identificado corretamente como PDF.  
   - *Se falha*: o navegador/app pode não abrir o documento corretamente.

2. **[BINARIO] Tamanho > 1KB**  
   - *Objetivo*: Evitar PDFs “vazios” ou extremamente pequenos que indicam erro.  
   - *Se passa*: o arquivo provavelmente contém conteúdo real.  
   - *Se falha*: o backend pode estar retornando um PDF corrompido ou incompleto.

3. **[BINARIO] Content-Disposition presente**  
   - *Objetivo*: Garantir que o cabeçalho `Content-Disposition` exista, permitindo nomear/baixar o arquivo corretamente.  
   - *Se passa*: o app consegue baixar ou abrir o arquivo com um nome adequado.  
   - *Se falha*: o comportamento de download/visualização pode ficar estranho.

4. **[BINARIO] Content-Type imagem**  
   - *Objetivo*: Para endpoints de imagens (`/imagem/`), validar que o `Content-Type` seja de imagem (PNG/JPEG/WEBP).  
   - *Se passa*: o app consegue mostrar a imagem normalmente.  
   - *Se falha*: o arquivo pode não ser exibido, ou ser de um tipo inesperado.

5. **[BINARIO] Tamanho > 512B**  
   - *Objetivo*: Evitar imagens “vazias” ou quebradas.  
   - *Se passa*: a imagem provavelmente contém conteúdo visual válido.  
   - *Se falha*: sinal de erro na geração ou recuperação da imagem.

6. **[BINARIO] Content-Type e Tamanho para /photo**
   - *Objetivo*: Validar que endpoints de imagem de check-in (`/photo`) também retornem `Content-Type` de imagem e tenham tamanho mínimo.
   - *Se passa*: as fotos de check-in são exibidas corretamente.
   - *Se falha*: as fotos podem não carregar ou vir em formato inválido.

---

## CT-018 – Coerência de Paginação (Geral)

**Objetivo geral**

Garantir que a paginação do endpoint `/ppid/getprices` seja coerente entre a **query da requisição** e o **JSON de resposta**.

**Testes incluídos**

1. **[PAG] "page" coerente entre query e resposta**  
   - *Objetivo*: Verificar se o `page` enviado na URL é o mesmo `page` retornado no JSON.  
   - *Se passa*: a API está respeitando a página solicitada pelo cliente.  
   - *Se falha*: a API pode estar ignorando ou calculando errado a página (o usuário vê dados de outra página sem perceber).

2. **[PAG] "pageSize" coerente entre query e resposta**
   - *Objetivo*: Verificar se o `pageSize` enviado na URL é o mesmo `pageSize` retornado no JSON.
   - *Se passa*: a API está respeitando o tamanho de página solicitado.
   - *Se falha*: a API pode estar ignorando o tamanho de página, retornando mais ou menos itens do que o esperado.

---
