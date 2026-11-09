# Textos para a Chrome Web Store

**Nome:** Meet Discord Status
**Categoria:** Produtividade
**Idioma:** Português (Brasil)
**Visibilidade sugerida:** Não listado

## Descrição curta (máx. 132 caracteres)
Mostra no Discord quando você está em uma chamada do Google Meet. Requer o app desktop Meet Discord Status.

## Descrição detalhada
Meet Discord Status avisa o app desktop de mesmo nome quando você entra e sai de uma chamada do Google Meet, para que seu status no Discord mostre que você está em reunião, com o título da chamada e o número de participantes.

Como funciona:
• Detecta a entrada e a saída da chamada, inclusive ao fechar a aba.
• Envia o título e o número de participantes para o app instalado no seu computador.
• Tudo acontece localmente: nenhum dado é enviado a servidores externos.

Importante: esta extensão precisa do app desktop "Meet Discord Status" em execução (Windows, macOS ou Linux) para funcionar.

## Justificativa das permissões
- **tabs:** detectar quando a aba do Meet é fechada ou navega para outra página, para encerrar o status.
- **alarms:** enviar um sinal periódico (heartbeat) enquanto a chamada está ativa.
- **storage:** guardar temporariamente quais abas estão em chamada, pois o service worker é suspenso pelo navegador.
- **Host http://127.0.0.1:3210/*:** comunicar com o app desktop local.
- **Content script em meet.google.com:** detectar se a aba está dentro de uma chamada e ler título e número de participantes.

## Uso de código remoto
Não. Todo o código está empacotado na extensão.

## Coleta de dados (formulário de privacidade)
Marque que NÃO coleta nenhuma categoria de dado do usuário. Marque as três declarações de conformidade.
URL da política de privacidade: publique store/PRIVACY.md (ex.: GitHub Pages ou raw do repositório) e cole o link.
