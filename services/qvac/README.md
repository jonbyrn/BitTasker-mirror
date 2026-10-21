# QVAC local model server

This process is the only place BitTasker runs a model. The website and the Cloudflare Worker do not load `@qvac/sdk`. The sandbox Worker forwards `/api/qvac/*` to the origin in `QVAC_URL`. Production does not set that variable, and the worker flag stays off there.

The server listens on `127.0.0.1:11434`. Cloudflare cannot reach a loopback port. Keep the process here and put a tunnel you control in front of it. Do not point `QVAC_URL` at OpenAI or any other hosted model API. The worker refuses those hosts.

## Run it

Needs Node `^22.21.0` or `>=24.9.0`, about 4 GB of RAM free (8 GB is comfortable), and 5 GB of disk. Linux needs `libatomic1`. A Vulkan 1.4 GPU is optional; without it the models run on CPU.

```bash
cd services/qvac
npm install
npm start
```

The first start downloads the weights and checks their SHA-256:

| Alias | SDK constant | Size | SHA-256 |
| --- | --- | --- | --- |
| `llama` | `LLAMA_3_2_1B_INST_Q4_0` | 773,025,824 | `66bfbb2d48bdb77cd56bd03ef820deff3c4a74b1a09de3b917ae13e72c1a70c2` |
| `bergamot-en-es` | `BERGAMOT_EN_ES` | 31,561,787 | `3b1c399511c01c84c36fae5c0524df44096288efdc8236e182b5c97d7ad2244c` |
| `bergamot-es-en` | `BERGAMOT_ES_EN` | 31,561,787 | `4aed7734152ae0045d1a69ae49c86cfda18f53c61f90e95e1d1de1c7c7c3b033` |
| `whisper` | `WHISPER_TINY` | 77,691,713 | `be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21` |

Llama, English-to-Spanish, and Spanish-to-English load at startup. Whisper loads on the first voice note so it does not sit in RAM the rest of the time. Logs stay at error level and the launcher drops long lines, so prompts and transcripts are not written out.

`qvac serve --openai` keeps the QVAC routes, including `/qvac/v1/translate`. Do not switch that to `qvac serve openai`, which removes translation.

## Let the sandbox reach it

1. Start a tunnel to `http://127.0.0.1:11434`, for example `cloudflared tunnel --url http://127.0.0.1:11434`.
2. Put that public hostname in `serve.allowedHosts` in `qvac.config.json` and restart. The process stays bound to loopback, so it does not need an API key.
3. On the Cloudflare worker `bittasker-sandbox` only, set `QVAC_URL` to `https://that-host` with no path. `QVAC_ENABLED` is already `true` on the sandbox. Leave both unset on production.

Until `QVAC_URL` is set, https://rgb.bittasker.com shows the helpers and they answer that the local model is not connected.

## Try the four helpers

- Create a task: the rough-idea box and **Help me write this** fill the title, description, category, and a price in the middle of an El Salvador range. **Speak the task** records in the browser, transcribes with Whisper, then runs the same draft.
- Leave the category empty, type a title, and leave the field. A chip offers a category. It changes the form only after **Use this**. The same chip is on create-service.
- Open a task or a service. **Translate to Spanish** or **Translate to English** follows the language you are reading. The second tap shows the original and does not call the model again.

## What it costs

QVAC's own check asks for at least 2 GB of RAM and recommends 4 GB. Below 4 GB the 1B model often fails to load. Plan on about 2 GB once Llama 3.2 1B Q4 and both Bergamot models are resident, and another few hundred MB while Whisper tiny is loaded. CPU inference is the normal path. A Vulkan GPU is faster and is not required.

These times are CPU estimates for this 1B model, plus the hop from the browser to Cloudflare to your machine. A GPU is several times faster. The first request also waits for the download and the load.

| Helper | Work | Typical CPU time |
| --- | --- | --- |
| Help me write this | about 150–250 tokens | 8–25 s |
| Category chip | about 40 tokens | 2–8 s |
| Translate | Bergamot, one short text | under a second. QVAC's own short example reports 41 ms |
| Speak the task | Whisper tiny, then the draft | near real time for the audio, then the draft time above |
