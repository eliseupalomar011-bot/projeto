# ETS2 Freight DLL

Esta pasta prepara a DLL que deve ser instalada em:

```text
Euro Truck Simulator 2/bin/win_x64/plugins/
```

## Objetivo

A DLL fica carregada pelo ETS2 via SCS Telemetry SDK. Ela deve:

- ler telemetria diretamente do jogo;
- ler comandos locais gerados pelo cliente em:

```text
%USERPROFILE%/Documents/ETS2Freight/truck-lock.json
```

- aplicar o bloqueio do caminhão quando `locked = true`.

## Ponto importante

O backend/admin apenas envia o comando. O Electron grava o estado local. A DLL e a parte que roda dentro do ETS2 e precisa transformar esse comando em efeito real no jogo.

Segundo a documentacao da SCS, o Telemetry SDK fornece acesso a telemetria e, desde a versao 1.14, suporte a dispositivos basicos de entrada. Para bloqueio real do caminhao, o caminho correto e usar o SDK de entrada/telemetria da SCS dentro da DLL. O Electron sozinho nao consegue travar fisicamente o caminhao dentro do jogo.

## Build esperado

1. Baixe o SCS Telemetry SDK oficial.
2. Copie os headers do SDK para `plugin-dll/vendor/scs-sdk/`.
3. Abra um terminal com Visual Studio Build Tools.
4. Rode:

```bash
cmake -S plugin-dll -B plugin-dll/build -A x64
cmake --build plugin-dll/build --config Release
```

5. Copie a DLL gerada para:

```text
Steam/steamapps/common/Euro Truck Simulator 2/bin/win_x64/plugins/
```

Ao abrir o ETS2, ele deve avisar que o SDK foi ativado.

## Estado atual

O projeto contem um esqueleto de DLL. A implementacao final do bloqueio depende dos headers e callbacks do SDK oficial instalados na pasta `vendor/scs-sdk`.
