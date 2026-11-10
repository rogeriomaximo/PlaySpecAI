// Play Spec AI - front-end ligado à API Flask (app.py)
(() => {
  "use strict";

  const API = (window.PLAYSPEC_API_BASE || "").replace(/\/$/, "");
  // Os preços vêm em R$ direto das lojas (Steam, Epic Games e Microsoft Store), igual ao orçamento.
  const LS_KEY = "playspec_config";

  const $ = (id) => document.getElementById(id);
  const els = {
    messages: $("messages"), form: $("form"), input: $("input"), send: $("send"),
    newChat: $("newChat"), chips: $("chips"), dialog: $("configDialog"),
    openConfig: $("openConfig"), cfgCancel: $("cfgCancel"), cfgForm: $("configForm"),
    gpu: $("cfgGpu"), cpu: $("cfgCpu"), ram: $("cfgRam"), ddr: $("cfgDdr"),
    mhz: $("cfgMhz"), budget: $("cfgBudget"),
  };

  // ---------- estado ----------
  let config = carregarConfig();
  let modo = null;               // null | "orcamento" | "categoria" | "verificar" | "buscar"
  let ultimaCategoria = null;
  let ultimoResultado = null;
  let dificuldadeAtual = null;
  let acaoPendente = null;       // função a executar depois que o PC for configurado
  let ocupado = false;

  function carregarConfig() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; }
  }
  function salvarConfig() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(config)); } catch {}
  }

  // ---------- UI ----------
  function rolar() { els.messages.scrollTop = els.messages.scrollHeight; window.scrollTo(0, document.body.scrollHeight); }

  function el(tag, texto, cls) {
    const e = document.createElement(tag);
    if (texto != null) e.textContent = texto;
    if (cls) e.className = cls;
    return e;
  }

  function addMsg(tipo, conteudo, botoes) {
    const d = document.createElement("div");
    d.className = "pa-msg " + (tipo === "user" ? "pa-user" : "pa-bot");
    if (typeof conteudo === "string") d.textContent = conteudo;
    else if (conteudo) d.appendChild(conteudo);
    if (botoes && botoes.length) {
      const wrap = el("div", null, "pa-btns");
      botoes.forEach(([rotulo, acao]) => {
        const b = el("button", rotulo, "pa-btn");
        b.type = "button";
        b.addEventListener("click", () => { if (!ocupado) { addMsg("user", rotulo); acao(); } });
        wrap.appendChild(b);
      });
      d.appendChild(wrap);
    }
    els.messages.appendChild(d);
    rolar();
    return d;
  }

  function setOcupado(v) {
    ocupado = v;
    els.send.disabled = v || !els.input.value.trim();
  }

  // ---------- menu e perguntas formais ----------
  function menuPrincipal(textoInicial) {
    modo = null;
    addMsg("bot",
      textoInicial ||
      "Olá! Seja bem-vindo ao Play Spec AI.\nO que você deseja pesquisar hoje?",
      [
        ["💰 Pesquisar por orçamento", iniciarOrcamento],
        ["🎮 Jogos por tipo", iniciarCategoria],
        ["✅ Ver se um jogo roda no meu PC", iniciarVerificar],
        ["🔎 Pesquisar apenas um jogo", iniciarBuscar],
      ]);
  }

  const GENEROS_BOTOES = ["terror", "RPG", "estratégia", "corrida", "aventura", "simulação"];

  function botoesGenero() {
    return GENEROS_BOTOES.map((g) => [g, () => recomendarComPC(g)]);
  }

  function iniciarOrcamento() {
    modo = "orcamento";
    addMsg("bot", "Certamente. Qual é o seu orçamento para o jogo, em reais?\n(Exemplo: 50)");
  }
  function iniciarCategoria() {
    modo = "categoria";
    addMsg("bot",
      "Perfeito. Qual tipo de jogo o senhor(a) procura?\nPode escolher uma das opções abaixo ou digitar outro gênero (ex.: terror, estratégia, RPG). " +
      "Se desejar, informe também a dificuldade: fácil, médio ou difícil.",
      botoesGenero());
  }
  function iniciarVerificar() {
    modo = "verificar";
    addMsg("bot", "Claro. Poderia informar o nome do jogo que deseja verificar?\n(Exemplo: Witcher 3)");
  }
  function iniciarBuscar() {
    modo = "buscar";
    addMsg("bot", "Com prazer. Qual jogo deseja pesquisar?\nMostrarei preço, gêneros, lançamento e requisitos estimados, sem precisar configurar o seu PC.");
  }

  function oferecerMais() {
    modo = null;
    addMsg("bot", "Posso ajudá-lo com mais alguma consulta?", [
      ["💰 Por orçamento", iniciarOrcamento],
      ["🎮 Jogos por tipo", iniciarCategoria],
      ["✅ Roda no meu PC?", iniciarVerificar],
      ["🔎 Pesquisar um jogo", iniciarBuscar],
    ]);
  }

  // ---------- API ----------
  // O servidor tem pouca memória e as lojas podem demorar: cada tentativa tem tempo limite
  // e, se falhar por rede/tempo/erro 5xx, repetimos uma vez (as consultas são seguras de repetir).
  const TEMPO_LIMITE_MS = 25000;
  const TENTATIVAS = 2;
  const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

  async function requisicao(caminho, opcoes) {
    let ultimoErro;
    for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TEMPO_LIMITE_MS);
      try {
        const r = await fetch(API + caminho, { ...opcoes, signal: ctrl.signal });
        let dados = {};
        try { dados = await r.json(); } catch {}
        if (r.ok) return dados;
        const erro = new Error(dados.erro || `Erro ${r.status}`);
        if (r.status < 500) throw erro;          // erro do pedido (4xx): repetir não adianta
        ultimoErro = erro;
      } catch (e) {
        if (e.name === "AbortError") {
          ultimoErro = new Error("O servidor demorou demais para responder. Tente novamente em instantes.");
        } else if (e instanceof TypeError) {
          ultimoErro = new Error("Não consegui me comunicar com o servidor. Verifique se ele está em execução (python app.py).");
        } else {
          throw e;
        }
      } finally { clearTimeout(timer); }
      if (tentativa < TENTATIVAS) await esperar(1200);
    }
    throw ultimoErro;
  }
  const chamar = (caminho, corpo) => requisicao(caminho, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo),
  });
  const consultar = (caminho) => requisicao(caminho, { method: "GET" });

  function pcCompleto() { return !!(config.cpu && config.gpu && config.ram); }
  function orcamentoDefinido() { return config.orcamento_brl != null && config.orcamento_brl !== ""; }

  function corpoBase() {
    const hw = { cpu: config.cpu, gpu: config.gpu, ram: Number(config.ram) };
    if (config.geracao_ram) hw.geracao_ram = config.geracao_ram;
    if (config.mhz) hw.mhz = Number(config.mhz);
    return { orcamento: Number(config.orcamento_brl), hardware: hw };
  }

  const brl = (v) => v == null ? "preço indisponível" : v === 0 ? "Grátis" : "R$ " + Number(v).toFixed(2).replace(".", ",");
  const urlSegura = (u) => typeof u === "string" && /^https:\/\//i.test(u);

  // Garante PC + orçamento; senão pede de forma educada e retoma a ação depois.
  function exigirConfig(acao) {
    if (pcCompleto() && orcamentoDefinido()) return true;
    acaoPendente = acao;
    addMsg("bot",
      "Para esta consulta, preciso conhecer o seu computador e o seu orçamento. " +
      "Poderia preencher a configuração do PC? Assim que concluir, continuo de onde paramos.",
      [["⚙️ Configurar PC", abrirConfig]]);
    return false;
  }

  // ---------- renderização ----------
  // Foto da loja (vem da API) e botões com o link de cada loja onde o jogo aparece.
  function foto(j) {
    if (!urlSegura(j.imagem)) return null;
    const img = document.createElement("img");
    img.src = j.imagem; img.alt = j.nome || "Jogo"; img.loading = "lazy"; img.className = "pa-img";
    img.addEventListener("error", () => img.remove());
    return img;
  }

  function linksLojas(j) {
    const ofertas = (j.ofertas && j.ofertas.length) ? j.ofertas : (j.link ? [{ loja: j.loja, preco: j.preco ?? j.valor, link: j.link }] : []);
    if (!ofertas.length) return null;
    const box = el("div", null, "pa-lojas");
    ofertas.forEach((o) => {
      if (!urlSegura(o.link)) return;
      const a = el("a", `${o.loja} · ${brl(o.preco)}`, "pa-loja");
      a.href = o.link; a.target = "_blank"; a.rel = "noopener noreferrer";
      box.appendChild(a);
    });
    return box.children.length ? box : null;
  }

  // Avisa quando alguma loja não respondeu (as outras continuam funcionando).
  function avisoLojas(status) {
    const falhas = Object.entries(status || {}).filter(([, v]) => !v.ok).map(([l]) => l);
    if (!falhas.length) return null;
    return el("small", "⚠️ Não consegui consultar: " + falhas.join(", ") + ". Os resultados abaixo vêm das demais lojas.", "pa-aviso");
  }

  function moldura(j, info) {
    const d = el("div", null, "pa-game");
    const linha = el("div", null, "pa-row");
    const f = foto(j);
    if (f) linha.appendChild(f);
    info.classList.add("pa-info");
    linha.appendChild(info);
    d.appendChild(linha);
    return d;
  }

  function cardJogo(a) {
    const info = el("div");
    info.appendChild(el("strong", `${a.nome} — ${brl(a.valor)}`));
    const linha = el("small", `Dificuldade: ${a.dificuldade || "—"} · CPU: ${a.cpu_classificacao} · GPU: ${a.gpu_classificacao}`);
    info.appendChild(el("span", a.status, "pa-tag " + (a.status === "Roda" ? "pa-ok" : "pa-bad")));
    info.appendChild(linha);
    (a.explicacoes || []).forEach((e) => {
      if (e.severidade !== "info" || a.status === "Roda") info.appendChild(el("small", "• " + e.mensagem));
    });
    const lj = linksLojas(a);
    if (lj) info.appendChild(lj);
    return moldura(a, info);
  }

  function secao(box, titulo, lista) {
    if (!lista || !lista.length) return;
    box.appendChild(el("h4", titulo));
    lista.forEach((a) => box.appendChild(cardJogo(a)));
  }

  function renderRecomendacao(r) {
    const box = document.createElement("div");
    box.appendChild(el("div",
      `Categoria "${r.categoria}"${r.dificuldade ? " · dificuldade " + r.dificuldade : ""}: analisei os ${r.avaliados} mais bem avaliados (de ${r.total_na_categoria}).\n` +
      `✅ ${r.resumo.rodam} rodam · 💸 ${r.resumo.fora_orcamento} fora do orçamento · ⚠️ ${r.resumo.pc_nao_suporta} seu PC não suporta`));
    const av = avisoLojas(r.lojas_status);
    if (av) box.appendChild(av);
    secao(box, "✅ Rodam no seu PC", r.rodam);
    secao(box, "💸 Fora do orçamento", r.fora_orcamento);
    secao(box, "⚠️ PC não suporta", r.pc_nao_suporta);
    (r.hardware?.observacoes_ram || []).forEach((o) => box.appendChild(el("small", "RAM: " + o)));
    box.appendChild(el("small", r.aviso));
    return box;
  }

  function renderVerificacao(r) {
    const box = document.createElement("div");
    const av = avisoLojas(r.lojas_status);
    if (av) box.appendChild(av);
    box.appendChild(cardJogo(r.avaliacao));
    const q = r.jogo.requisitos_estimados;
    box.appendChild(el("small", `Requisitos estimados: CPU ${q.cpu}, GPU ${q.gpu}, ${q.ram_gb}GB RAM`));
    if (r.outros_resultados?.length) {
      box.appendChild(el("small", "Também encontrei: " + r.outros_resultados.map((o) => o.nome).join(", ")));
    }
    box.appendChild(el("small", r.aviso));
    return box;
  }

  function renderBusca(resultados, status) {
    const box = document.createElement("div");
    box.appendChild(el("div", `Encontrei ${resultados.length} resultado(s) nas lojas:`));
    const av = avisoLojas(status);
    if (av) box.appendChild(av);
    resultados.forEach((j) => {
      const info = el("div");
      info.appendChild(el("strong", `${j.nome} — ${brl(j.preco)}`));
      info.appendChild(el("small", `Lançamento: ${j.lancamento || "—"} · Dificuldade: ${j.dificuldade || "—"}`));
      if (j.generos) info.appendChild(el("small", "Gêneros: " + j.generos));
      const q = j.requisitos_estimados;
      info.appendChild(el("small", `Requisitos estimados: CPU ${q.cpu}, GPU ${q.gpu}, ${q.ram_gb}GB RAM`));
      const lj = linksLojas(j);
      if (lj) info.appendChild(lj);
      box.appendChild(moldura(j, info));
    });
    box.appendChild(el("small", "Requisitos estimados a partir de gêneros, ano e preço (as lojas não os informam)."));
    return box;
  }

  // ---------- ações ----------
  async function executar(carregandoTxt, fn) {
    const carregando = addMsg("bot", carregandoTxt);
    setOcupado(true);
    // se demorar, avisa que ainda está trabalhando (em vez de parecer travado)
    const aviso = setTimeout(() => {
      carregando.textContent = carregandoTxt + "\n⏳ As lojas estão demorando um pouco; continuo tentando…";
    }, 6000);
    try {
      const resultado = await fn();
      carregando.replaceChildren(resultado);
      return true;
    } catch (e) {
      carregando.textContent = "⚠️ " + e.message;
      return false;
    } finally { clearTimeout(aviso); setOcupado(false); rolar(); }
  }

  async function recomendarComPC(categoria) {
    if (!exigirConfig(() => recomendarComPC(categoria))) return;
    ultimaCategoria = categoria;
    const ok = await executar("Analisando os jogos para o seu PC, um momento…", async () => {
      const r = await chamar("/jogos/recomendar", { ...corpoBase(), categoria, limite: 10, dificuldade: dificuldadeAtual });
      ultimoResultado = r;
      return renderRecomendacao(r);
    });
    if (ok) oferecerMais();
  }

  async function verificar(nome) {
    if (!exigirConfig(() => verificar(nome))) return;
    const ok = await executar(`Verificando "${nome}", um momento…`, async () =>
      renderVerificacao(await chamar("/jogos/verificar", { ...corpoBase(), nome })));
    if (ok) oferecerMais();
  }

  async function buscarJogo(nome) {
    const ok = await executar(`Pesquisando "${nome}"…`, async () => {
      const r = await consultar(`/jogos/buscar?nome=${encodeURIComponent(nome)}&limite=5`);
      if (!r.resultados.length) {
        const falhas = Object.entries(r.lojas_status || {}).filter(([, v]) => !v.ok).map(([l]) => l);
        throw new Error(`Não encontrei nenhum jogo com o nome "${nome}" na Steam, Epic Games ou Microsoft Store.` +
          (falhas.length ? ` (Sem resposta de: ${falhas.join(", ")}.)` : "") + " Poderia tentar outro termo ou sigla?");
      }
      return renderBusca(r.resultados, r.lojas_status);
    });
    if (ok) oferecerMais();
  }

  function responderFps() {
    if (!ultimoResultado) {
      return addMsg("bot", "Primeiro, informe um tipo de jogo (ex.: corrida) e destacarei os que rodam com mais folga no seu PC.",
        [["🎮 Jogos por tipo", iniciarCategoria]]);
    }
    const melhores = ultimoResultado.rodam.filter(
      (a) => a.cpu_classificacao === "Roda muito bem" && a.gpu_classificacao === "Roda muito bem");
    const box = document.createElement("div");
    if (!melhores.length) {
      box.appendChild(el("div", "Nenhum jogo da última busca está com grande folga no seu PC. Estes são os que rodam:"));
      ultimoResultado.rodam.slice(0, 5).forEach((a) => box.appendChild(cardJogo(a)));
    } else {
      box.appendChild(el("div", "Estes jogos têm mais folga de hardware (tendem a render mais FPS):"));
      melhores.forEach((a) => box.appendChild(cardJogo(a)));
    }
    box.appendChild(el("small", "O sistema compara níveis estimados; não mede FPS real."));
    addMsg("bot", box);
  }

  // ---------- interpretação ----------
  const GENEROS_EN = ["action", "adventure", "rpg", "strategy", "simulation", "racing", "sports", "horror",
    "puzzle", "platformer", "shooter", "fighting", "survival", "indie", "co-op", "multiplayer", "farming",
    "open world", "casual", "roguelike", "fps", "sandbox", "visual novel"];
  const GENEROS_PT = ["terror", "estratégia", "estrategia", "corrida", "esportes", "esporte", "aventura", "ação",
    "acao", "simulação", "simulacao", "plataforma", "quebra-cabeça", "quebra-cabeca", "mundo aberto", "luta",
    "tiro", "pixel", "cooperativo", "multijogador", "sobrevivência", "sobrevivencia", "fazenda",
    // gírias de gênero (o servidor traduz para as tags da Steam)
    "souls", "soulslike", "moba", "battle royale", "zumbi", "zumbis", "porradaria", "pancadaria",
    "fazendinha", "terrorzinho", "metroidvania", "gacha", "mmo", "mmorpg", "jrpg", "cozy", "roguelite",
    "futebol", "carro", "carros", "coop", "furtivo", "anime", "boomer shooter", "bullet hell"];

  function extrairNumero(t) {
    const m = t.match(/(\d+(?:[.,]\d+)?)/);
    return m ? parseFloat(m[1].replace(",", ".")) : null;
  }

  function extrairOrcamento(t) {
    const m = t.match(/(?:abaixo de|at[eé]|menos de|no m[aá]ximo|or[cç]amento(?: de)?|por)\s*(?:r\$|reais)?\s*(\d+(?:[.,]\d+)?)/i)
      || t.match(/r\$\s*(\d+(?:[.,]\d+)?)/i)
      || t.match(/(\d+(?:[.,]\d+)?)\s*reais/i);
    return m ? parseFloat(m[1].replace(",", ".")) : null;
  }

  function extrairDificuldade(t) {
    const m = t.toLowerCase().match(/\b(f[aá]ci(?:l|s)|m[eé]di(?:o|os)|dif[ií]ci(?:l|s)|leves?|pesados?)\b/);
    if (!m) return null;
    const p = m[1];
    if (/^f|^leve/.test(p)) return "fácil";
    if (/^m/.test(p)) return "médio";
    return "difícil";
  }

  function extrairJogoRoda(t) {
    if (/\bjogos\b/i.test(t)) return null;
    const m = t.match(/(?:roda|rodar|rodo|verificar|ser[aá] que roda|consigo rodar|meu pc roda)\s+(?:o |a )?(.+?)\s*\??$/i);
    if (!m) return null;
    const nome = m[1].replace(/\s+no meu (pc|computador)$/i, "").trim();
    return nome.length >= 2 ? nome : null;
  }

  function extrairBusca(t) {
    if (/\bjogos?\s+de\b/i.test(t)) return null;
    const m = t.match(/(?:pesquisar|pesquise|buscar|busque|procurar|procure|informa[cç][aãoõe]+s?\s+(?:sobre|do|da|de)|detalhes\s+(?:do|da|de)|sobre)\s+(?:o jogo |o |a )?(.+?)\s*\??$/i);
    if (!m) return null;
    const nome = m[1].trim();
    return nome.length >= 2 ? nome : null;
  }

  function extrairCategoria(t) {
    const baixo = t.toLowerCase();
    for (const g of [...GENEROS_PT, ...GENEROS_EN].sort((a, b) => b.length - a.length)) {
      if (new RegExp("(^|[^a-zà-ú])" + g.replace(/[-]/g, "\\-") + "([^a-zà-ú]|$)", "i").test(baixo)) return g;
    }
    const m = t.match(/jogos?\s+de\s+([a-zà-ú\- ]+?)(?:\s+(?:abaixo|at[eé]|por|menos|que|f[aá]ceis?|m[eé]dios?|dif[ií]ceis)\b|[?.,!]|$)/i);
    return m ? m[1].trim().toLowerCase() : null;
  }

  const SAUDACAO = /^(oi+|ol[aá]+|e a[ií]|bom dia|boa tarde|boa noite|hey|hello|menu|in[ií]cio|come[cç]ar)\b/i;
  const AGRADECIMENTO = /\b(obrigad[oa]|valeu|agrade[cç]o|muito grato)\b/i;
  const DESPEDIDA = /^(tchau|at[eé] (mais|logo)|adeus|encerrar)\b/i;

  async function processar(texto) {
    const t = texto.trim();
    if (!t) return;
    addMsg("user", t);

    if (DESPEDIDA.test(t)) { modo = null; return addMsg("bot", "Foi um prazer atendê-lo. Até a próxima e bons jogos! 🎮"); }
    if (AGRADECIMENTO.test(t) && t.length < 40) {
      return addMsg("bot", "Disponha! Estou à sua inteira disposição. Deseja realizar outra consulta?",
        [["Sim, nova consulta", () => menuPrincipal("Certamente. O que você deseja pesquisar?")]]);
    }
    if (SAUDACAO.test(t) && t.length < 30) {
      return menuPrincipal("Olá! Seja bem-vindo ao Play Spec AI.\nO que você deseja pesquisar hoje?");
    }

    if (/\bfps\b|mais r[aá]pid/i.test(t) && !extrairCategoria(t.replace(/fps/gi, ""))) return responderFps();

    const dif = extrairDificuldade(t);
    if (dif) dificuldadeAtual = dif;

    const orc = extrairOrcamento(t);
    if (orc != null && modo !== "buscar" && modo !== "verificar") {
      config.orcamento_brl = orc;
      salvarConfig();
    }

    // 1) frases explícitas têm prioridade
    const jogoRoda = extrairJogoRoda(t);
    if (jogoRoda) { modo = null; return verificar(jogoRoda); }

    const busca = extrairBusca(t);
    if (busca && !GENEROS_PT.includes(busca.toLowerCase()) && !GENEROS_EN.includes(busca.toLowerCase())) {
      modo = null; return buscarJogo(busca);
    }

    // 2) resposta à pergunta feita pelo assistente
    if (modo === "orcamento") {
      const valor = orc ?? extrairNumero(t);
      if (valor == null) return addMsg("bot", "Perdoe-me, não consegui identificar o valor. Poderia informar apenas o número, em reais? (ex.: 50)");
      config.orcamento_brl = valor;
      salvarConfig();
      modo = "categoria";
      return addMsg("bot", `Perfeito, orçamento de R$ ${valor} registrado. Agora, qual tipo de jogo o senhor(a) deseja?`, botoesGenero());
    }
    if (modo === "verificar") { modo = null; return verificar(t.replace(/\?$/, "")); }
    if (modo === "buscar") { modo = null; return buscarJogo(t.replace(/\?$/, "")); }

    let categoria = extrairCategoria(t);
    if (!categoria && modo === "categoria" && !/^\d+$/.test(t)) categoria = t.toLowerCase().replace(/^jogos? de /, "");
    if (!categoria && orc != null && ultimaCategoria) categoria = ultimaCategoria;
    if (categoria) { modo = null; return recomendarComPC(categoria); }

    if (/jogos? .*(rodam|roda|rodar)|meu pc/i.test(t)) return iniciarCategoria();

    // 2.5) texto curto sem outro sentido (ex.: "gta 5", "re4", "csgo"): trata como nome/gíria de jogo
    if (orc == null && t.split(/\s+/).length <= 4 && t.length >= 2 && !/^(sim|n[aã]o|ok|certo|beleza|talvez)$/i.test(t)) {
      return buscarJogo(t.replace(/\?$/, ""));
    }

    // 3) não entendi: volta ao menu com educação
    if (orc != null) {
      modo = "categoria";
      return addMsg("bot", `Orçamento atualizado para R$ ${orc}. Qual tipo de jogo deseja pesquisar?`, botoesGenero());
    }
    menuPrincipal("Desculpe, não compreendi completamente o seu pedido. Como posso ajudá-lo?");
  }

  // ---------- diálogo de configuração ----------
  function abrirConfig() {
    els.gpu.value = config.gpu || "";
    els.cpu.value = config.cpu || "";
    els.ram.value = config.ram || "";
    els.ddr.value = config.geracao_ram || "";
    els.mhz.value = config.mhz || "";
    els.budget.value = config.orcamento_brl ?? "";
    els.dialog.showModal();
  }

  els.openConfig.addEventListener("click", abrirConfig);
  els.cfgCancel.addEventListener("click", () => els.dialog.close());

  els.cfgForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const nova = {
      gpu: els.gpu.value.trim(), cpu: els.cpu.value.trim(),
      ram: els.ram.value, geracao_ram: els.ddr.value, mhz: els.mhz.value,
      orcamento_brl: els.budget.value,
    };
    if (!nova.gpu || !nova.cpu || !nova.ram || nova.orcamento_brl === "") {
      alert("Preencha GPU, processador, RAM e orçamento.");
      return;
    }
    config = nova;
    salvarConfig();
    els.dialog.close();

    try {
      const r = await chamar("/hardware/avaliar", { hardware: corpoBase().hardware });
      const linhas = [
        `CPU: ${r.cpu.encontrada || "NÃO encontrada (" + r.cpu.consulta + ")"}`,
        `GPU: ${r.gpu.encontrada || "NÃO encontrada (" + r.gpu.consulta + ")"}`,
        `RAM: ${r.ram_gb}GB${r.geracao_ram ? " " + r.geracao_ram : ""}${r.mhz ? " " + r.mhz + "MHz" : ""}`,
        ...r.observacoes_ram.map((o) => "⚠️ " + o),
      ];
      addMsg("bot", "Configuração concluída ✅\n" + linhas.join("\n"));
      if (acaoPendente && r.cpu.encontrada && r.gpu.encontrada) {
        const a = acaoPendente; acaoPendente = null; a();
      }
    } catch (e) {
      addMsg("bot", "⚠️ " + e.message);
    }
  });

  // ---------- eventos gerais ----------
  els.form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    if (ocupado) return;
    const t = els.input.value;
    els.input.value = "";
    autoAjustar();
    els.send.disabled = true;
    processar(t);
  });

  els.input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); els.form.requestSubmit(); }
  });
  function autoAjustar() {
    els.input.style.height = "auto";
    els.input.style.height = Math.min(els.input.scrollHeight, 120) + "px";
  }
  els.input.addEventListener("input", () => {
    autoAjustar();
    els.send.disabled = ocupado || !els.input.value.trim();
  });

  els.chips.addEventListener("click", (ev) => {
    const c = ev.target.closest(".chip");
    if (c && !ocupado) processar(c.textContent);
  });

  els.newChat.addEventListener("click", () => {
    modo = null; ultimaCategoria = null; ultimoResultado = null; dificuldadeAtual = null; acaoPendente = null;
    els.messages.innerHTML = "";
    menuPrincipal();
  });

  menuPrincipal();
})();