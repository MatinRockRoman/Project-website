# AI Code Reviewer

## Start

```powershell
Copy-Item .env.example .env.local
```

Set `OPENAI_API_KEY` in `.env.local`, then run:

```powershell
npm.cmd install
npm.cmd run dev
```

Open `http://localhost:3000`.

`OPENAI_API_KEY` stays on the server. Do not put it in frontend code or commit `.env.local`.
