## 18/11/2026 — Volta ao 3D clássico + animação mais fluida

- Restauração completa das cenas originais Canvas 2D nas 12 abas (sem caixas simplificadas WebGL).
- Correção do corte de quadros por intervalos 17–19 ms em telas de 60 Hz.
- Controle adaptativo de resolução interno para manter desenho detalhado sem perder desempenho.
- Abertura e 3D responsivos preservados, incluindo navegador que se monta por pacotes.
- Documentação de validações e backups de rollback.

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
