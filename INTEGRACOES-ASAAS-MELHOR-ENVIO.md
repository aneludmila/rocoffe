# RoCoffee — Asaas, Melhor Envio e FAQ

## Status
- FAQ pronto no `index.html`.
- Checkout tem cotação Melhor Envio e suporte a cobrança Asaas **preparados**, mas `checkout-config.js` mantém `mercado_pago` como provedor ativo.
- Não substituir o Mercado Pago antes dos testes de sandbox e confirmação real do webhook.
- Não há renovação recorrente automática no fluxo Asaas atual: é **uma cobrança avulsa por edição**.

## Banco de dados
Executar `supabase/checkout-providers.sql` no SQL Editor do projeto RoCoffee.
O script cria `shipping_quotes`, `asaas_customers`, `asaas_charges` com RLS. Apenas o servidor pode escrever nessas tabelas.

## Supabase Edge Functions
Publicar as funções:
- `quote-melhor-envio` (JWT obrigatório)
- `create-asaas-charge` (JWT obrigatório)
- `asaas-webhook` (JWT desabilitado; valida `asaas-access-token` com segredo próprio)

### Segredos Supabase
```
ME_API_TOKEN=<token da API Melhor Envio>
ME_ENV=sandbox
ME_ORIGIN_CEP=<CEP de origem 8 dígitos>
ME_ESSENCIAL_WIDTH_CM=<largura real da caixa em cm>
ME_ESSENCIAL_HEIGHT_CM=<altura real da caixa em cm>
ME_ESSENCIAL_LENGTH_CM=<comprimento real da caixa em cm>
ME_ESSENCIAL_WEIGHT_KG=<peso real da caixa em kg>
ME_EXPERIENCIA_WIDTH_CM=<largura real da caixa em cm>
ME_EXPERIENCIA_HEIGHT_CM=<altura real da caixa em cm>
ME_EXPERIENCIA_LENGTH_CM=<comprimento real da caixa em cm>
ME_EXPERIENCIA_WEIGHT_KG=<peso real da caixa em kg>
ASAAS_API_KEY=<chave secreta de API>
ASAAS_ENV=sandbox
ASAAS_ENABLED=false
ASAAS_WEBHOOK_TOKEN=<token aleatório de pelo menos 32 caracteres>
```
`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são tratados como segredos da função Supabase. Nunca incluir em HTML, JS público ou Git.

**Importante:** antes do ambiente real, testar formato da resposta da API e regras comerciais de cotação, embalagem, preço e eventuais serviços adicionais.

## Validação antes de trocar o provedor
1. Testar um frete no sandbox Melhor Envio de origem e destino conhecidos, conferindo preço e prazo.
2. Abrir conta cliente de teste, preencher CEP, selecionar a cotação e garantir que o valor total esteja correto.
3. Gerar cobrança Asaas no sandbox, conferir nome, valor, juros, prazo e página de pagamento.
4. Confirmar por webhook autenticado, testar repetição do mesmo evento e eventos fora de ordem.
5. Garantir que o cliente não consiga marcar pagamento como aprovado diretamente no Supabase; revisar RLS e grants de `subscriptions`.
6. Publicar funções e segredos no ambiente correto, passar `ASAAS_ENABLED=true` e alterar `PAYMENT_PROVIDER` para `asaas` em `checkout-config.js`, com rollback preparado.
7. Confirmar se o webhook funciona para o ambiente de produção e se o checkout não pode gerar duplicidades.

### Atenção de segurança
No esquema legado, o cliente tem permissão `UPDATE` ampla em `subscriptions`. **A migração para Asaas não deve ir para produção com essa permissão**. Os campos de pagamento, status e valores precisam de escrita exclusivamente via backend (incluindo os caminhos legados que ainda usam Mercado Pago).

### Chave e consentimentos
- Não enviar segredos no chat nem commitá-los.
- A FAQ não afirma que o Asaas ou o frete já estejam ativos.
- Regras de frete e pagamento devem ser testadas em sandbox antes de trocar para produção.
