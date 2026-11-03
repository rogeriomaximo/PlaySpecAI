# Play Spec AI

Assistente que recomenda jogos de acordo com o PC e o orçamento do usuário.
Frontend em HTML/CSS/JS puro + API em Flask.

## Como rodar

```bash
cd playspec
python -m venv venv

# Windows
venv\Scripts\activate
# Linux/macOS
source venv/bin/activate

pip install -r requirements.txt
python app.py
```

Abra http://127.0.0.1:5000

## Estrutura

```
playspec/
├── app.py          # rotas Flask (/, /api/health, /api/chat, /api/analyze)
├── engine.py       # lógica de recomendação (regras)
├── games.py        # catálogo de jogos (preços aproximados)
├── requirements.txt
└── static/
    ├── index.html
    ├── style.css
    └── app.js
```

## API

| Método | Rota           | Descrição |
|--------|----------------|-----------|
| GET    | `/api/health`  | Verifica se a API está no ar |
| POST   | `/api/chat`    | `{ "message": "...", "config": { "gpu": "RTX 3060", "ram": 16, "budget": 50 } }` → `{ reply, games, config, needs_config }` |
| POST   | `/api/analyze` | `{ "config": {...} }` → compatibilidade de todos os jogos |

## Front em outro lugar

Se abrir o `index.html` fora do Flask, edite `window.PLAYSPEC_API_BASE` no `index.html`
(ex.: `"http://127.0.0.1:5000"`). O CORS já está habilitado em `/api/*`.

## Próximos passos

- Trocar `handle_chat()` em `engine.py` por uma chamada a um LLM (ex.: API do Claude), mantendo o mesmo formato de retorno.
- Buscar preços reais (Steam API) e requisitos oficiais em vez do catálogo fixo.
