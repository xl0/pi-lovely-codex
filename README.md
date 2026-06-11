# @xl0/pi-lovely-codex

Pi extension package for Codex/GPT service-tier controls.

## Install

```bash
pi install npm:@xl0/pi-lovely-codex
```

Load without installing:

```bash
pi -e npm:@xl0/pi-lovely-codex
```

## Commands

### `/codex`

Configure GPT mode for OpenAI GPT models:

- `default` -> omits `service_tier`
- `fast` -> sends `service_tier: "priority"` for OpenAI and Codex, accounts for Codex priority pricing
- `fast-codex` -> sends priority only for Codex sub (`openai-codex`), omits `service_tier` for OpenAI

Settings are stored in `~/.pi/agent/xl0-pi-lovely-codex.json` or `.pi/xl0-pi-lovely-codex.json`:

```json
{
  "gptMode": "fast-codex"
}
```

Quick set:

```text
/codex default
/codex fast
/codex fast-codex
```
