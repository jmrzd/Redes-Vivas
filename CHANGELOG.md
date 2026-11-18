# Histórico de alterações — Redes Vivas

## 16 de novembro de 2026 — Página web reconstruída na cena 3D

- Recuperada a **montagem visual da página web** que aparecia no simulador HTML original fornecido pelo grupo.
- Corrigido um bug: a função de atualização do navegador 3D estava definida, porém não era executada durante a renderização. Agora ela recebe as alterações do próprio motor da simulação.
- A visualização mostra **quatro partes independentes** (cabeçalho azul, imagem verde, texto e botão ciano) somente após os respectivos pacotes terem sido recebidos.
- A barra de endereço acompanha a digitação; o texto de status acompanha a resolução de DNS, abertura TCP, pedido HTTP, recebimento e conclusão. As mensagens de falha continuam visíveis.
- A representação aparece **tanto no palco 3D embutido como no explorador 3D em tela cheia**, sem duplicar estados ou acrescentar tráfego fictício.
- Nos celulares, a área do navegador foi separada visualmente da rede: equipamentos continuam acessíveis por toque. A responsividade foi validada em 390 × 844 e 320 × 700, além de 1440 × 900 no computador.
- Canvas 2D e CSS mantidos, **sem Three.js, WebGL ou dependências adicionais**; atualização de DOM limitada às alterações do estado da página.
- Capturas atuais em `assets/preview-laboratorio.webp` e `assets/preview-mobile.webp`.
- Testes automatizados: navegação pelos 12 módulos, presença do navegador, chegada parcial e completa das quatro partes, barra de endereço, troca entre Cena 3D e explorador, ausência de erros JavaScript e ausência de rolagem horizontal.

## Versões anteriores

Consulte o histórico de commits para as etapas de abertura animada, projeção 3D dos dispositivos, camadas OSI isométricas, meios de transmissão, correções de zoom e otimização de arrasto no celular.

### 16/11/2026 — Layout móvel dedicado
- Separação visual dos nós 3D da abertura, sem alteração da cena de desktop.
- Melhoria nos tamanhos das etiquetas e na legibilidade dos botões em aparelhos pequenos.
- Ampliação da área 3D do módulo Página web para preservar a navegação e a montagem da página.


## 18/11/2026 · 3D acelerado opcional / referência Netverse

- Preservada versão anterior no branch `backup-estavel-antes-netverse-2026-11-18`.
- Novo `js/gpu3d.js`: WebGL2 nativo, modelos 3D procedurais, bufferização da
  topologia, cores e conexões com estado real do motor e pacotes dinâmicos.
- FPS-alvo maior durante o arrasto acelerado e menor em repouso para economizar
  bateria; DPR móvel limitado. Não constitui benchmark real em iPhone.
- Alternância imediata **GPU / 2D** no celular e retorno automático ao 2D
  quando WebGL2 não estiver disponível ou falhar.
- Gesto de pinça para zoom e câmera centralizável, sem tocar na lógica dos módulos.
- Referência de arquitetura estudada: `joaodorast/netverse-redes-vivas`.
  Técnicas adaptadas de forma original, sem copiar arquivos não licenciados.


## 18/11/2026 — WebGL2 no PC, OSI volumétrico, frame pacing e FPS real

- Ativado renderizador GPU também em computadores, mantendo desenho 2D alternativo.
- Reforçadas geometrias de dispositivos e camadas OSI; melhorados cartões e controles com CSS responsivo.
- Corrigidos limites de intervalo que reduziam a fluidez em monitores de 60 Hz: laboratório 17 ms e abertura 19 ms.
- Inserido indicador de FPS medido e qualidade adaptativa, sem garantir FPS fixo em hardware não testado.
- Corrigido indicador de modo em navegadores sem WebGL2 e reorganizada a barra de estado móvel.
- O simulador didático, registros e experimentos não foram substituídos por React.
- Testado em 12 abas, tamanhos PC/celular, GPU simulada e fallback, com validação de sintaxe; benchmark físico ainda pendente.
- Backup: `backup-antes-3d-desktop-60fps-2026-11-18`.
