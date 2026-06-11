# @xl0/pi-lovely-codex

Pi extension package for better experience with GPT models / Codex sub

## Commands

### `/codex`

Configure GPT mode for OpenAI GPT models:

- `default` -> omits `service_tier`
- `fast` -> sends `service_tier: "priority"` for OpenAI and Codex, accounts for Codex priority pricing
- `fast-codex` -> sends priority only for Codex sub (`openai-codex`), omits `service_tier` for OpenAI API

Non-default modes show `🏎️` in the status line.

Settings are stored in User `~/.pi/agent/xl0-pi-lovely-codex.json` and Workspace `.pi/xl0-pi-lovely-codex.json`. Workspace overrides User. Omit `gptMode` (`unset` in UI) to inherit lower scope/default:

```json
{
  "gptMode": "fast-codex"
}
```

Run `/codex` for tabbed User/Workspace settings.


## Install

```bash
pi install npm:@xl0/pi-lovely-codex
```

Load without installing:

```bash
pi -e npm:@xl0/pi-lovely-codex
```
