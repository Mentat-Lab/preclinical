# Vapi Target Agent (Mock)

Local mock implementation of the Vapi `/chat` API so `provider: vapi` can be tested without external dependencies.

## Run

```bash
cd target-agents/vapi
npm install
npm start
```

Server:
- `POST /chat`
- `GET /health`

Default port: `9200` (`TARGET_VAPI_PORT` to override)
