# QVAC local model server

This process is the only place BitTasker runs a model. The website and the Cloudflare Worker do not load `@qvac/sdk`. Dev and sandbox Workers forward `/api/qvac/*` to `QVAC_BASE_URL` (`https://qvac-dev.bittasker.com`) and send `QVAC_BEARER_TOKEN` on that hop. The browser never sees the token. Production does not set those variables, and the worker flag stays off there. `QVAC_URL` is still accepted as an alias for a local origin.

The server listens on `127.0.0.1:11434`. Cloudflare cannot reach a loopback port. Keep the process here and put a tunnel you control in front of it. Do not point `QVAC_URL` at OpenAI or any other hosted model API. The worker refuses those hosts.

## Run it

Needs Node `^22.21.0` or `>=24.9.0`, about 4 GB of RAM free (8 GB is comfortable), and 5 GB of disk. Linux needs `libatomic1`. A Vulkan 1.4 GPU is optional; without it the models run on CPU.

```bash
cd services/qvac
npm install
npm start
```

The first start downloads the weights and checks their SHA-256:

| Alias            | SDK constant               | Size           | SHA-256                                                            |
| ---------------- | -------------------------- | -------------- | ------------------------------------------------------------------ |
| `llama`          | `LLAMA_3_2_1B_INST_Q4_0`   | 773,025,824    | `66bfbb2d48bdb77cd56bd03ef820deff3c4a74b1a09de3b917ae13e72c1a70c2` |
| `bergamot-en-es` | `BERGAMOT_EN_ES`           | 31,561,787     | `3b1c399511c01c84c36fae5c0524df44096288efdc8236e182b5c97d7ad2244c` |
| `bergamot-es-en` | `BERGAMOT_ES_EN`           | 31,561,787     | `4aed7734152ae0045d1a69ae49c86cfda18f53c61f90e95e1d1de1c7c7c3b033` |
| `whisper`        | `WHISPER_TINY`             | 77,691,713     | `be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21` |
| `embed`          | `EMBEDDINGGEMMA_300M_Q4_0` | 768 dimensions | loads on the first hybrid-search embed                             |
| `ocr`            | `OCR_LATIN`                | OCR            | loads on the first photo draft                                     |

`embed` and `ocr` stay unloaded until something asks for them. The process that is already running does not pick them up until it is restarted with this config. The live server at `qvac-dev.bittasker.com` was probed without a token and answered 401 on `/v1/models`, so this checkout cannot confirm that those aliases are loaded there. Until `embed` exists, search stays on keyword matching. Until `ocr` exists, the photo button returns that the model could not read the image. Do not point photo drafts at the `llama` alias: that chat route drops image parts. Set `QVAC_VISION_MODEL` only when a separate vision model is loaded.

Llama, English-to-Spanish, and Spanish-to-English load at startup. Whisper loads on the first voice note so it does not sit in RAM the rest of the time. Logs stay at error level and the launcher drops long lines, so prompts and transcripts are not written out.

`qvac serve --openai` keeps the QVAC routes, including `/qvac/v1/translate`. Do not switch that to `qvac serve openai`, which removes translation.

## Restart the live server with embed and OCR

The process already bound to `127.0.0.1:11434` does not load aliases added after it started. On the machine that tunnels `qvac-dev.bittasker.com` to that port:

1. Pull the config in `services/qvac/qvac.config.json`. It adds plugins `@qvac/sdk/llamacpp-embedding/plugin` and `@qvac/sdk/ggml-ocr/plugin`, plus aliases `embed` (`EMBEDDINGGEMMA_300M_Q4_0`, 768 dimensions) and `ocr` (`OCR_LATIN`). Both stay unloaded until the first request (`preload: false`).
2. From `services/qvac`, run `npm install` so those plugins are on disk.
3. Stop the current `qvac` process (the one listening on port 11434) and start it again with `npm start`. That runs `qvac serve --openai --host 127.0.0.1 --port 11434`.
4. Check the model list. Do not print the bearer token.

```bash
curl -sS -o /tmp/qvac-models.json -w 'models %{http_code} %{time_total}\n' \
  -H "Authorization: Bearer $QVAC_BEARER_TOKEN" \
  https://qvac-dev.bittasker.com/v1/models
```

`embed` and `ocr` should be in that list. Then time one embed and one chat call:

```bash
curl -sS -o /dev/null -w 'embed %{http_code} %{time_total}\n' \
  -H "Authorization: Bearer $QVAC_BEARER_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"model":"embed","input":"someone to fix my sink"}' \
  https://qvac-dev.bittasker.com/v1/embeddings
curl -sS -o /dev/null -w 'chat %{http_code} %{time_total}\n' \
  -H "Authorization: Bearer $QVAC_BEARER_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"model":"llama","messages":[{"role":"user","content":"Say ok"}],"max_tokens":8}' \
  https://qvac-dev.bittasker.com/v1/chat/completions
```

5. Backfill Typesense. The admin key stays on the indexer host. The script logs counts and milliseconds, not document text or keys.

```bash
QVAC_ENABLED=true \
QVAC_BASE_URL=https://qvac-dev.bittasker.com \
TYPESENSE_HOST=https://typesense-dev.bittasker.com \
TYPESENSE_COLLECTION_PREFIX=rgb_ \
npm run search:embed

TYPESENSE_COLLECTION_PREFIX=dev_ npm run search:embed
```

Set `QVAC_BEARER_TOKEN` and `TYPESENSE_API_KEY` in the environment of that shell. Do not commit them.

GitLab can run the same steps from `.gitlab/ci/qvac-ops.yml`. The jobs are manual and exist only on `sandbox/rgb-wasm-phase0` and `dev`. `master` skips them. Pressing play is the only way they start.

The three jobs use the runner tag `vps`. GitLab does not expand a variable inside `tags:`, so that literal in `.gitlab/ci/qvac-ops.yml` is the only place to change it. The runner starts each job in Docker. QVAC on the host is `http://host.docker.internal:11434` (`QVAC_LOCAL_URL`) and Typesense on the host is `http://host.docker.internal:8108` (`TYPESENSE_LOCAL_URL`). Set either variable when the host or port changes. The runner config has to map `host.docker.internal` to the host gateway.

| Job             | What it needs                                                                                                                                                                                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `qvac-setup`    | Masked `QVAC_BEARER_TOKEN`. It checks embed and ocr at `QVAC_LOCAL_URL`. The container cannot restart the host process. Set `QVAC_SSH_HOST` and `QVAC_SSH_PRIVATE_KEY` to copy `services/qvac` and restart it. `QVAC_SSH_USER` defaults to root and `QVAC_SSH_PORT` to 22. |
| `assistant-key` | `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. It writes `ASSISTANT_NSEC` with `wrangler secret put` and prints the npub.                                                                                                                                             |
| `search-embed`  | Masked `QVAC_BEARER_TOKEN` and masked `TYPESENSE_API_KEY`. It calls `QVAC_LOCAL_URL` and `TYPESENSE_LOCAL_URL` for the `rgb_` and `dev_` collections.                                                                                                                      |

`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are already named in `.gitlab-ci.yml` and `docs/ci/environment-variables.md`. `QVAC_BEARER_TOKEN` and `TYPESENSE_API_KEY` are masked CI variables for these jobs. The container does not read `/opt/bittasker/typesense.env`, and the job stops with a name-only error when `TYPESENSE_API_KEY` is missing. Neither value is printed. `scripts/deploy-typesense-sandbox.sh` still reads the host file over SSH and does not use this CI variable. `TYPESENSE_SSH_HOST` is that deploy path, so `qvac-setup` does not reuse it as the QVAC host.

## Let the sandbox reach it

1. Start a tunnel to `http://127.0.0.1:11434`, for example `cloudflared tunnel --url http://127.0.0.1:11434`.
2. Put that public hostname in `serve.allowedHosts` in `qvac.config.json` and restart. The process stays bound to loopback, so it does not need an API key.
3. On the dev and sandbox Workers, `QVAC_BASE_URL` is `https://qvac-dev.bittasker.com` and `QVAC_ENABLED` is `true`. Set the secret with `npx wrangler secret put QVAC_BEARER_TOKEN --env sandbox` (and `--env dev`). Leave both unset on production.
4. The assistant key is a separate secret. Generate an nsec outside the repo and store it with `npx wrangler secret put ASSISTANT_NSEC --env sandbox` and `--env dev`. The worker reads `ASSISTANT_NSEC`. The browser only receives the public key from `GET /api/qvac/assistant`. Do not commit the nsec and do not put it in a `VITE_` variable.

Until the flag is on, the translate button stays hidden. Until the origin is set, the helpers answer that the local model is not connected.

## Try the four helpers

- Create a task, a service, or a buy/sell/rent listing: the rough-idea box and **Help me write this** fill the title, description, category, and a suggested USD price. **Speak the task** (or **Speak it** on the other forms) records in the browser, transcribes with Whisper, then runs the same draft. **Use a photo** reads the image with OCR and drafts the same fields. Nothing is published until the person submits the form.
- Search embeds task, service, shift, and listing text at index time (`POST /v1/embeddings`, model alias `embed`, 768 dimensions) and queries Typesense with `vector_query`. A failed embed, or a vector field the collection does not have yet, falls back to the keyword search. Backfill existing rows with `npm run search:embed` on a machine that has `QVAC_ENABLED`, `QVAC_BASE_URL`, `TYPESENSE_HOST`, and `TYPESENSE_API_KEY`. Sandbox collections use the prefix `rgb_`. Dev collections use `dev_`. The script logs counts and milliseconds only.
- BitTasker Assistant is a kind 4 direct-message contact. The app encrypts with NIP-44 and can still open older NIP-04 notes. It does not use NIP-17 gift wrap. The worker reads only a verified kind 4 note whose `p` tag is the assistant, replies in the UI language, and publishes that reply to the same DM relays the client reads. On `rgb.bittasker.com` the chat relay is `wss://relay2.bittasker.com`. `wss://nos.lol` and `wss://relay.damus.io` are tried only when relay2 does not accept the event. `ASSISTANT_RELAYS` overrides the list. Task and service writes stay on `wss://relay.bittasker.com`. The contact is pinned at the top of Messages. The help bubble on every page opens that same thread and sends the current path as context. Each reply includes at most one link into the app. Eight replies per public key are allowed in ten minutes, in memory on the isolate. If QVAC is down, the bubble links to `/faq`. The assistant explains screens and never moves funds, signs, posts a listing, or accepts a bid.
- Leave the category empty, type a title, and leave the field. A chip offers a category. It changes the form only after **Use this**. The same chip is on create-service.
- Open a task or a service. **Translate to Spanish** or **Translate to English** follows the language you are reading. The second tap shows the original and does not call the model again.

## What it costs

QVAC's own check asks for at least 2 GB of RAM and recommends 4 GB. Below 4 GB the 1B model often fails to load. Plan on about 2 GB once Llama 3.2 1B Q4 and both Bergamot models are resident, and another few hundred MB while Whisper tiny is loaded. CPU inference is the normal path. A Vulkan GPU is faster and is not required.

These times are CPU estimates for this 1B model, plus the hop from the browser to Cloudflare to your machine. A GPU is several times faster. The first request also waits for the download and the load.

| Helper             | Work                         | Typical CPU time                                        |
| ------------------ | ---------------------------- | ------------------------------------------------------- |
| Help me write this | about 150–250 tokens         | 8–25 s                                                  |
| Category chip      | about 40 tokens              | 2–8 s                                                   |
| Translate          | Bergamot, one short text     | under a second. QVAC's own short example reports 41 ms  |
| Speak the task     | Whisper tiny, then the draft | near real time for the audio, then the draft time above |
