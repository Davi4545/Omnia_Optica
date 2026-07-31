# OMNIA Ótica

Sistema de gestão para óticas: atendimento (lista da vez), laboratório (OS + receita),
CRM, catálogo, comissão, ponto, relatórios e painel de gestão.

Front-end modular em ES Modules, sem bundler. Back-end no Firebase (Auth + Firestore).
Compatível com o projeto existente `omnia-3b32b` — os dados atuais continuam funcionando.

---

## 1. Estrutura

```
omnia-otica/
├── index.html          Atendimento: lista da vez, metas, ranking, conquistas, registros
├── login.html          Entrar / criar conta com código da ótica / recuperar senha
├── clientes.html       CRM: retornos, aniversariantes, etapas, WhatsApp
├── laboratorio.html    OS de laboratório (kanban) + receita OD/OE completa
├── catalogo.html       Catálogo de produtos + carrinho -> WhatsApp
├── comissao.html       Simulador de comissão + faixas configuráveis
├── ponto.html          Ponto eletrônico
├── relatorios.html     Relatórios por período + não convertidos + laboratório
├── admin.html          Gestão: dados da ótica, código de acesso, usuários
│
├── css/omnia.css       Design system (tema Refração claro/escuro)
├── js/
│   ├── firebase.js     Configuração do Firebase
│   ├── utils.js        Escape XSS, datas locais, moeda, toast, modais, imagem
│   ├── db.js           Camada de dados (Firestore) — sem UI
│   ├── session.js      Guarda de autenticação + cabeçalho e navegação
│   ├── domain.js       Domínio de ótica: produtos, lentes, OS, receita, selos
│   └── app-*.js        Lógica de cada página
│
├── firestore.rules     Regras de segurança  ← PUBLIQUE ISTO
├── firestore.indexes.json
├── firebase.json       Configuração de deploy (MIME e cache corretos)
├── manifest.json       PWA
├── sw.js               Service worker
└── icon*.png / icon.svg
```

---

## 2. Deploy

```bash
npm install -g firebase-tools
firebase login
firebase use omnia-3b32b
firebase deploy
```

Isso publica o site **e** as regras do Firestore de uma vez.

Para hospedar em outro serviço (Netlify, Vercel, Apache, Nginx): suba a pasta inteira.
O único requisito é servir `.js` como `application/javascript` — o `firebase.json`
já cuida disso no Firebase Hosting.

> **Publique as regras.** Sem `firestore.rules` no ar, o login falha com
> "Não foi possível ler seu perfil". É o passo mais importante.

---

## 3. Primeira configuração (5 minutos)

**a) Crie a primeira ótica.** No Console do Firebase → Firestore, crie:

Documento `stores/loja_principal`:
```json
{ "name": "Ótica Visão Clara", "code": "visaoclara", "logo": "" }
```

Documento `storeCodes/visaoclara`:
```json
{ "storeId": "loja_principal", "store": { "name": "Ótica Visão Clara" } }
```

> `storeCodes` é o índice que permite validar o código de acesso com **uma** leitura,
> sem expor a lista de lojas. O painel de gestão mantém esse índice sozinho daqui em diante.

**b) Crie sua conta** em `login.html` usando o código `visaoclara`.

**c) Vire gestor.** No Firestore, em `users/{seu-uid}`, mude `role` para `"admin"`.
O e-mail `davi.vieira.each@gmail.com` já é reconhecido como super admin automaticamente
pelas regras (validado pelo token, não pelo cliente).

**d) Daqui em diante** tudo é pela interface: aba **Gestão** cria óticas, define códigos
de acesso, promove gestores e desativa quem saiu.

---

## 4. Modelo de dados

```
users/{uid}                role: seller|admin|superadmin, storeId, name, email, active
storeCodes/{codigo}        storeId, store:{name}          ← índice de código de acesso
stores/{storeId}           name, code, logo
  ├── app/state            estado operacional (sellers, fila, foco, metaMes)
  ├── records/{id}         atendimentos e vendas
  ├── clientes/{id}        CRM
  ├── os/{id}              ordens de serviço do laboratório
  ├── ponto/{id}           ponto eletrônico (id = sellerId_AAAA-MM-DD)
  ├── produtos/{id}        catálogo
  ├── comissaoConfig/faixas
  └── vendedores/{uid}     perfil público do consultor
```

---

## 5. Segurança — o que as regras garantem

| Risco | Proteção |
|---|---|
| Ler dados de outra ótica | Todo acesso exige vínculo comprovado no perfil (`member(storeId)`) |
| Ler a base de usuários inteira | Leitura só do próprio perfil ou, para gestor, da própria ótica |
| Auto-promoção a gestor | Update próprio não pode alterar `role`, `active` nem `storeId` |
| Conta desativada continuar usando | `isActive()` é verificado no servidor em cada operação |
| Forjar super admin no cliente | Super admin é validado pelo **e-mail do token**, não por campo editável |
| Vazar a lista de lojas | `storeCodes` permite `get` pontual, `list` é proibido |
| Vendedor alterar preços | `/produtos` e `/comissaoConfig` exigem gestor |
| Apagar histórico de vendas | `records` update/delete só para gestor |

---

## 6. Decisões de engenharia

- **Datas sempre locais.** `dateKey()`/`monthKey()` usam horário local. `toISOString()`
  retorna UTC e viraria o dia após as 21h no Brasil — bug clássico, evitado em todo o código.
- **Gravação agrupada.** O estado operacional é salvo com debounce de 400 ms, e é forçado
  ao fechar a aba. Reduz custo no Firestore e corrida entre dispositivos.
- **Preservação de campos.** O documento `app/state` é gravado inteiro, então a normalização
  preserva campos desconhecidos — caso contrário cada gravação apagaria dados de outra versão.
- **Ordem no cadastro.** Autentica primeiro, consulta o código depois: a leitura de
  `storeCodes` exige usuário autenticado. Se o código for inválido, a conta recém-criada
  é removida para não deixar órfã.
- **XSS.** Toda string vinda do usuário passa por `esc()` antes de virar HTML.
- **Imagens.** Comprimidas no navegador (384 px) antes de salvar, para não estourar
  o limite de 1 MB por documento do Firestore.
- **Service worker.** HTML usa network-first (nunca prende o usuário numa versão velha);
  assets usam stale-while-revalidate; Firebase nunca é cacheado. Caminhos relativos,
  então funciona também em subpasta.

---

## 7. Limitações conhecidas

- **Excluir usuário** remove apenas o perfil no Firestore; a credencial no Firebase Auth
  precisa ser removida no Console (ou via Admin SDK). Por isso a interface usa *desativar*,
  que já bloqueia o acesso pelas regras.
- **Relatórios** carregam a coleção `records` completa da loja. Para bases muito grandes
  (acima de ~50 mil registros), o próximo passo natural é paginar por período com
  `where('dataKey','>=',...)` e criar o índice correspondente.
- **Ponto** não tem geolocalização nem foto — é um registro simples de horários.

---

## 8. Testes automatizados

A pasta `testes/` roda o app num DOM real (jsdom) com Firebase falso em memória.
São **88 testes** em 5 suítes — veja `testes/README.md` para executar.

| Suíte | Testes | Cobre |
|---|---|---|
| `unit.mjs`  | 37 | Datas locais, moeda BR, escape XSS, graus da receita, agregações |
| `integ.mjs` |  8 | Cada página carrega e renderiza sem erro de runtime |
| `fluxo.mjs` | 34 | Venda ponta a ponta, OS, comissão, ponto, carrinho, gestão |
| `vazio.mjs` |  8 | Loja nova, banco totalmente vazio (primeiro dia de uso) |
| `perm.mjs`  |  9 | Vendedor não vê ação que a regra do Firestore bloqueia |

### Defeitos encontrados e corrigidos por estes testes

1. **Violação de camada** — `app-admin.js` importava o Firestore direto, furando
   o `db.js`. Só apareceu porque o teste roda fora do navegador. Corrigido com
   `updateStore()` na camada de dados.
2. **Falha silenciosa de permissão** — CRM e Laboratório mostravam "Excluir" para
   vendedores, mas as regras exigem gestor: o clique não faria nada e não haveria
   mensagem. Agora o botão é escondido, como já ocorria no catálogo.
3. **Listagem de usuários ampla demais** — um gestor da ótica A conseguiria listar
   usuários da ótica B. A regra `allow list` agora exige que cada documento
   retornado pertença à própria loja.

O teste de regressão mais importante é o `fluxo.mjs`: ele grava um campo
desconhecido no estado e confirma que ele **sobrevive** à gravação — é a trava
contra o bug de perda de dados voltar.
