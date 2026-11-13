# Painel administrativo RoCoffee — primeira etapa

Endereço após deploy (Netlify): `/admin/` (a pasta `admin/index.html` permite a rota).
Esta versão adiciona controle de acesso e um resumo **real** das assinaturas.
As páginas de mapa de calor, gravações, audiência e funil são estruturas preparadas, **sem coleta ativa** nem dados fictícios.

## Configuração obrigatória
1. Execute `admin/admin-access.sql` no SQL Editor do projeto Supabase, revisando antes se a estrutura vigente de `subscriptions` mantém os campos `plan`, `status` e `price_cents`.
2. No Supabase Authentication > Users, localize o UUID da conta que será administradora.
3. No SQL Editor, rode `insert into public.admin_users(user_id) values ('UUID-DO-ADMIN') on conflict do nothing;`.
4. Faça login no site e acesse `/admin/`.
5. Confirme com uma conta comum que a rota nega o acesso e que consultas diretas à tabela `subscriptions` só retornam os dados do próprio usuário.

**Segurança:** mostrar ou esconder HTML não substitui RLS; a política no banco controla as leituras. Nunca inserir chave service_role no frontend.

## Próximas etapas
- Eventos de e-commerce: pesquisa, produto, carrinho, início de checkout, pagamento e abandono.
- Analytics de origem (UTMs) e dispositivo, respeitando consentimento.
- Heatmaps por página e viewport com amostras agregadas.
- Replay dentro do admin por biblioteca de gravação dedicada, com consentimento, mascaramento e políticas de retenção.
- Métricas demográficas agregadas apenas quando fornecidas legalmente por fonte analítica.

**Atenção:** o valor "Receita aprovada registrada" no dashboard é apenas soma de preços cadastrados em assinaturas com status ativo e não substitui conciliação financeira.
