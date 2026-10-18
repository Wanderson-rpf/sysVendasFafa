# Loja da Fafá

Sistema desktop para gerenciar revenda de roupas: compras para estoque, vendas, recebimentos,
inadimplência e lucro.

**Stack:** Angular 21 (standalone + signals, zoneless) · Electron 44 · SQLite (`node:sqlite`, embutido no
Electron — sem módulo nativo para compilar) · electron-builder (instalador NSIS).

## Funcionalidades

| Tela | O que faz |
|---|---|
| **Dashboard** | Vendido, lucro líquido (bruto − despesas) e margem, recebido, a receber/atraso, investido, despesas, saldo de caixa, estoque; gráfico de 12 meses (vendido × gastos); recebido por forma de pagamento; despesas por categoria; quem está devendo. Filtro por período. |
| **Entradas** | Lançamento de compras com várias peças e **vários fornecedores** por compra; frete, desconto/cupom e **comissão/cashback** (ex.: afiliado Shopee); preço de venda por peça, botão de margem padrão e lucro previsto. O frete/desconto/comissão é rateado no **custo efetivo** de cada peça. |
| **Vendas e recebimentos** | Venda a partir do estoque ou item avulso, com desconto e vencimento. Recebimento **inteiro ou parcial**, **misto** (ex.: parte cartão, parte dinheiro) e em **permuta** (serviço ou produto, com descrição). Abas: a receber, atrasadas, inadimplentes por cliente, quitadas, todas. Estorno de recebimento, cancelamento de venda (devolve ao estoque). |
| **Despesas** | Gastos avulsos que não são peças (embalagem, entrega, taxas, divulgação, material, outros). Entram no lucro líquido e no saldo de caixa. |
| **Clientes** | Telas separadas. Clientes mostra compras, total comprado e quanto cada um deve (com filtro "só quem está devendo" e atalho para as vendas em aberto). |
| **Fornecedores** | Peças e total comprado de cada fornecedor, última compra, plataforma e contato. |
| **Configurações** | Tema claro / escuro / seguir o Windows; backup manual (salvar onde quiser), restauração de arquivo, backup automático ao fechar (mantém os 15 últimos). |

## Rodando

Requisitos: Node 24+ e npm.

```bash
npm install
npm start          # Angular + Electron; recarrega a tela e reinicia o Electron quando electron/ muda
npm run preview    # build de produção aberto no Electron
npm run dist       # (no Windows) gera release/Loja-da-Fafa-Setup-x.y.z.exe
```

> Abrir `http://127.0.0.1:4200` direto no navegador mostra só o layout: o acesso ao banco existe
> apenas dentro do Electron.

## Gerando os instaladores num computador Linux

**Opção recomendada — Docker (gera o `.exe` do Windows e os pacotes Linux):** só precisa de Docker e git.

```bash
git clone <repo> && cd sysVendasFafa
./scripts/dist-docker.sh            # Windows (.exe) + Linux (AppImage e .deb)
./scripts/dist-docker.sh --win      # só o instalador do Windows
./scripts/dist-docker.sh --linux    # só os pacotes Linux
```

O script usa a imagem `electronuserland/builder:24-wine-05.26` (Node 24 + Wine). O Wine é o que permite
gerar o instalador do Windows estando no Linux. Não é preciso instalar Node no host: o `npm ci` roda dentro
do container, e o `node_modules` dele fica num volume separado (`sysvendas-node-modules`). Os downloads do
Electron ficam em cache em `~/.cache/electron*`, então a partir do segundo build ele é bem mais rápido.
O resultado sai em `release/`.

**Opção sem Docker — só pacotes Linux:** com Node 24+ instalado no Linux:

```bash
npm ci
npm run dist:linux    # release/Loja-da-Fafa-x.y.z.AppImage e release/sys-vendas-fafa_x.y.z_amd64.deb
```

Para gerar o `.exe` sem Docker seria preciso instalar Wine no host; o Docker evita essa configuração.

| Arquivo gerado | Para quê |
|---|---|
| `Loja-da-Fafa-Setup-x.y.z.exe` | Instalador do Windows (com atalho na área de trabalho) |
| `Loja-da-Fafa-x.y.z.AppImage` | Linux, sem instalar: `chmod +x` e dois cliques |
| `sys-vendas-fafa_x.y.z_amd64.deb` | Ubuntu/Debian/Mint: `sudo apt install ./arquivo.deb` |

Os instaladores não são assinados digitalmente: na primeira execução, o Windows SmartScreen pode avisar
"Editor desconhecido" — é só clicar em *Mais informações → Executar assim mesmo*.

## Ícone

`build/icon.png` (1024 px, usado pelo electron-builder para gerar o `.ico` do Windows e os ícones do Linux)
e `public/icone.svg`/`icone.png` (logo da barra lateral, favicon e janela) vêm de `build/icones/sacola.svg`.
Em `build/icones/` há também as alternativas `cabide.svg` e `vestido.svg`. Para trocar, copie o SVG escolhido
para `public/icone.svg` e regenere os PNGs (1024 e 256 px).

## Onde ficam os dados

- Banco: `%APPDATA%\Loja da Fafá\dados\vendas.db`
- Backups automáticos: `%APPDATA%\Loja da Fafá\dados\backups\`
- O app se chamava "Sys Vendas". Na primeira abertura com o nome novo, os dados de
  `%APPDATA%\Sys Vendas\dados` são copiados automaticamente; a pasta antiga fica intacta como cópia de segurança.

Restaurar um backup sempre salva antes uma cópia do banco atual em `backups\`.

## Estrutura

```
electron/                 processo principal (Node)
  main.ts                 janela, IPC (mapa de operações "handlers") e backup ao fechar
  preload.ts              expõe window.api.call(op, args) ao Angular
  database.ts             conexão, migrações (PRAGMA user_version) e transações
  backup.ts               VACUUM INTO, rotação de automáticos, restauração validada
  repos/                  regras de negócio e SQL por domínio
src/app/
  core/                   ApiService (ponte tipada), modelos, pipes de formatação, tema, toasts
  shared/modal.ts         modal reutilizável
  shared/filtro-periodo.ts  barra de período (atalhos + datas) usada em várias telas
  pages/                  dashboard, vendas, compras, despesas, clientes, fornecedores, configuracoes
scripts/electron.js       inicia o Electron sem ELECTRON_RUN_AS_NODE (VS Code) e, com --watch, reinicia ao recompilar
scripts/dist-docker.sh    gera os instaladores (Windows + Linux) via Docker, a partir de um Linux
build/                    ícone do instalador (icon.png) e SVGs-fonte em icones/
```

### Decisões

- **Dinheiro em centavos (INTEGER)** no banco; o Angular só trabalha com reais. A conversão é feita nos
  repositórios (`toCents` / `fromCents`).
- **Recebimento = N linhas** em `recebimentos`, uma por forma de pagamento. Isso cobre parcial, misto e
  permuta sem tabelas extras. O saldo e a situação da venda (aberta, parcial, atrasada, quitada) são
  calculados, nunca gravados.
- **Custo da venda congelado**: cada item vendido guarda o custo efetivo da peça no momento da venda, então
  editar a compra depois não altera o lucro de vendas passadas.
- **Novas mudanças de esquema**: adicione uma string nova ao fim de `MIGRATIONS` em `electron/database.ts`
  — nunca edite uma migração já publicada.
- Roteamento por hash e sem `<base href>`: o app é carregado por `file://` e isso mantém o F5 funcionando.

## Próximos passos sugeridos

- Parcelamento com vencimentos múltiplos e lembrete de cobrança por WhatsApp.
- Testes unitários dos repositórios (rateio de custo, saldo, situação).
