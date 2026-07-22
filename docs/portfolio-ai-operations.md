# Portfolio AI operations guide

This runbook is the production gate for the grounded homepage assistant. Run it from the repository root. Never copy a secret into an issue, commit, terminal command argument, screenshot, or chat message.

## 1. Revoke the exposed design-time credential

1. Sign in to the DeepSeek API console using the account owner session.
2. Locate the key that was shared during design and revoke it immediately.
3. Confirm requests made with that old key are rejected.
4. Review provider usage from the exposure time onward and investigate unexpected traffic.

Do not reuse, display, or record the revoked value.

## 2. Create and store a replacement DeepSeek key

Create a new least-privilege key in the DeepSeek console. Enter it directly into the Vercel project’s **Settings → Environment Variables** as `DEEPSEEK_API_KEY`; enable Preview and Production only. Do not first place it in a local `.env`, clipboard manager, shell history, or this document.

Set the non-secret variables from `.env.example` in the same Vercel screen. Keep `DEEPSEEK_BASE_URL=https://api.deepseek.com`, use the reviewed `DEEPSEEK_MODEL`, and leave `CHAT_ENABLED=true` only after the preview gate passes. If the Vercel CLI is preferred, `npx vercel env add DEEPSEEK_API_KEY preview` uses an interactive secure prompt; type the new value only at that prompt.

## 3. Provision Upstash and the anonymous limits

Create a dedicated Upstash Redis database in the closest appropriate region. In Vercel, enter its REST URL and REST token directly as `RATE_LIMIT_KV_URL` and `RATE_LIMIT_KV_TOKEN`. Generate a unique high-entropy salt in a password manager and enter it directly as `RATE_LIMIT_SALT`; do not print it in a terminal.

Confirm these reviewed non-secret limits:

```text
CHAT_COOLDOWN_SECONDS=3
CHAT_VISITOR_MINUTE_LIMIT=6
CHAT_VISITOR_DAILY_LIMIT=30
CHAT_SITE_DAILY_LIMIT=300
```

Use separate Preview and Production Redis databases or namespaces so smoke traffic does not consume the production allowance.

## 4. Sanitize content, review pixels, and rebuild knowledge

The source résumé must remain outside the repository. Set `RESUME_SOURCE` only for the current shell, then reconstruct the public derivative. The sanitizer verifies the approved source digest and refuses unexpected input.

PowerShell / Windows:

```powershell
python -m pip install -r tools\requirements.txt
$env:RESUME_SOURCE = Read-Host "Absolute path to the private resume PDF"
python tools\sanitize_resume.py --input "$env:RESUME_SOURCE" --output public\documents\zhao-shikuang-resume-public.pdf --public-email zkuang0408@gmail.com
python tools\sanitize_resume.py --audit --input public\documents\zhao-shikuang-resume-public.pdf
$review = Join-Path $env:TEMP "zhao-resume-review"
pdftoppm -f 1 -l 1 -singlefile -png public\documents\zhao-shikuang-resume-public.pdf $review
npm.cmd run knowledge:generate
npm.cmd run knowledge:verify
Remove-Item Env:RESUME_SOURCE
```

Portable shell:

```sh
python -m pip install -r tools/requirements.txt
read -r -p "Absolute path to the private resume PDF: " RESUME_SOURCE
python tools/sanitize_resume.py --input "$RESUME_SOURCE" --output public/documents/zhao-shikuang-resume-public.pdf --public-email zkuang0408@gmail.com
python tools/sanitize_resume.py --audit --input public/documents/zhao-shikuang-resume-public.pdf
pdftoppm -f 1 -l 1 -singlefile -png public/documents/zhao-shikuang-resume-public.pdf "${TMPDIR:-/tmp}/zhao-resume-review"
npm run knowledge:generate
npm run knowledge:verify
unset RESUME_SOURCE
```

Open the generated PNG outside the repository and visually inspect all four edges, the contact block, typography, and absence of private contact data. Repeat the sanitation, render review, index generation, and index verification whenever the résumé or any project PDF changes. Never hand-edit `generated-index.json`.

## 5. Run tests, build, and secret scans

PowerShell / Windows:

```powershell
npm.cmd test
npm.cmd run test:e2e
npm.cmd run build
git grep -n -E 'sk-[A-Za-z0-9]{10,}' -- ':!docs/superpowers/specs/2026-07-20-portfolio-ai-chat-design.md'
git status --short
```

Portable shell:

```sh
npm test
npm run test:e2e
npm run build
git grep -n -E 'sk-[A-Za-z0-9]{10,}' -- ':!docs/superpowers/specs/2026-07-20-portfolio-ai-chat-design.md'
git status --short
```

The expected result is zero unit/E2E/build failures, no secret-scan match, and only reviewed files in `git status`. The build’s client-bundle boundary check must also pass; this proves server-only knowledge and credentials were not emitted into `dist`.

## 6. Deploy Preview, smoke-test, then promote

After Preview variables exist, deploy with `npx vercel` or the Vercel Git integration. Do not use command-line `--env` values because they are retained in shell history. Against the generated Preview URL, verify:

1. `GET /api/chat` returns `405`.
2. A Chinese question streams a Chinese answer; an English question streams an English answer.
3. An unrelated question returns the localized “资料不足” / insufficient-evidence response.
4. Every displayed citation opens its server-owned destination; `INKSEAT · P.08` opens page 8.
5. Profile scrolls to About and résumé opens only `/documents/zhao-shikuang-resume-public.pdf#page=1`.
6. A request with a foreign `Origin` header is rejected.
7. Repeated requests exercise the 3-second cooldown, 6/minute, and visitor/day friendly limit states.
8. Vercel function logs contain status/latency metadata only—never messages, prompts, answers, source passages, raw IPs, or secrets.

Promote that exact reviewed Preview deployment to Production from Vercel only after all checks pass. Re-run a Chinese answer, an English answer, and one exact citation on Production.

## 7. Disable or roll back safely

If DeepSeek, Upstash, rate limiting, or streaming becomes unreliable, set `CHAT_ENABLED=false` in Vercel and redeploy. The portfolio navigation, portrait, About section, and six PDF readers remain available while the assistant shows its localized unavailable state. For a faulty code release, use Vercel’s deployment history to roll back to the last verified deployment. Do not weaken origin checks, remove limits, or expose a provider key as a workaround.

## 8. Keep secrets out of development artifacts

Never paste a key or token into chat, source code, documentation, screenshots, test fixtures, Git commits, `.env` files tracked by Git, or CLI arguments. Enter secrets only in the provider/Vercel secure UI or an interactive secure prompt. Rotate immediately if a value is ever exposed, then repeat the secret scan and redeploy with the replacement.
