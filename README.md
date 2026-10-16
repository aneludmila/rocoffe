# RoCoffee ☕

Plataforma de assinatura de cafés especiais de Rondônia, com foco em valorizar a origem, os produtores e a experiência de conhecer novos cafés amazônicos.

## Site

[Visitar RoCoffee](https://rocoffee.netlify.app/)

## Funcionalidades

- Apresentação da marca e dos planos de assinatura.
- Página de assinatura e fluxo de autenticação.
- Área de conta do assinante.
- Integração com Supabase para autenticação e dados.
- Fluxo de checkout com Mercado Pago e página de retorno do pagamento.

> **Atenção:** a presença do fluxo de checkout no código não garante que os pagamentos estejam operacionais. Valide as configurações do Mercado Pago e faça testes antes de receber pagamentos reais.

## Estrutura principal

| Arquivo/pasta | Finalidade |
| --- | --- |
| `index.html` | Página inicial |
| `assinatura.html` | Página de assinatura |
| `login.html` | Entrada e cadastro |
| `minha-conta.html` | Área do usuário |
| `pagamento-retorno.html` | Retorno do checkout |
| `obrigada.html` | Confirmação |
| `typography.css` | Estilos tipográficos |
| `supabase-client.js` | Cliente do Supabase |
| `supabase/` | Esquema e funções de backend |

## Desenvolvimento local

O front-end utiliza HTML, CSS e JavaScript. Para testar as páginas localmente, utilize um servidor HTTP estático, por exemplo:

```bash
python -m http.server 8000
```

Acesse `http://localhost:8000`. Recursos de autenticação e pagamento dependem de serviços externos configurados corretamente.

## Segurança

- Nunca publique chaves privadas, tokens do Mercado Pago, senhas ou arquivos `.env`.
- Credenciais sensíveis devem permanecer em variáveis de ambiente no backend/Edge Functions.
- Chaves públicas do Supabase no navegador não substituem as políticas de Row Level Security (RLS).
- Antes de ativar pagamentos, valide as permissões do banco, o checkout e o tratamento seguro do retorno da transação.

## Projeto

Desenvolvido para a **RoCoffee**, uma experiência de assinatura de cafés especiais amazônicos.
