# Meet Discord Status — Desktop Agent

Agente local para Windows e macOS. Recebe eventos da extensão Meeting Webhook Notifier em `127.0.0.1:3210` e atualiza a atividade Rich Presence do Discord aberto na mesma máquina.

**Application ID configurado:** `1568258084969644102` (ID público da aplicação; nenhum token de usuário/bot é usado).

> Rich Presence aparece como atividade no perfil, não como Custom Status. Cada funcionário instala o agente e a extensão do Chrome. Não é necessário adicionar bot ao servidor.

## Uso local (desenvolvimento)

Requer Node.js 20+:

```bash
npm install
npm start
```

O agente aparece na bandeja do sistema. O menu permite testar a atividade, limpar a atividade e sair. O app inicia automaticamente no login do usuário após ser instalado.

## Extensão Chrome

Configure o webhook da Meeting Webhook Notifier para:

```text
http://127.0.0.1:3210/webhook
```

Método: POST. A extensão precisa ter permissão para acessar o endereço local.

## Gerar instaladores

Os instaladores são compilados em runners nativos pelo GitHub Actions: Windows gera `.exe` NSIS x64; macOS gera `.dmg` e `.zip` universal para Intel e Apple Silicon.

1. Crie um repositório GitHub e envie todo o conteúdo desta pasta.
2. No GitHub, abra **Actions** e execute **Build desktop installers** (ou crie uma tag `v1.0.1`).
3. Ao concluir, baixe os artefatos `windows-installer` e `macos-installer-universal` na execução do workflow.

Também é possível compilar localmente em cada sistema:

```bash
npm run dist:win   # Windows
npm run dist:mac   # macOS
```

O macOS ainda não está assinado/notarizado com certificado Apple Developer. Para distribuição interna, o Gatekeeper pode exibir um aviso e exigir que o usuário autorize a abertura. Para distribuição ampla, assine e notarize o app.

## Segurança e funcionamento

- Discord Desktop deve estar aberto para a conexão RPC.
- O agente escuta apenas em `127.0.0.1`; não altere para `0.0.0.0`.
- O Application ID é público. Nunca use token de conta pessoal.
- A detecção de entrada/saída da reunião continua sendo feita pela extensão Chrome.
