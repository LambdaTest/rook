# Harbor Care — QE runtime setup

[Agent overview and diagrams](agents-overview.md) · [Application walkthrough](README.md)

You'll need Node.js 22 or later, [Rook](https://github.com/LambdaTest/rook), and an OpenAI API key. The URLs and model are already configured.

## Start the app

From the collection root (`samples/industry-agents`):

```bash
npm ci
cd demos/04-healthcare-no-code
npm run setup
```

`npm ci` installs the packages needed by the application using the repository's saved versions. Run it once for a fresh checkout. Setup creates this folder's .env without changing existing settings.

Add your key to .env:

```dotenv
MODEL_API_KEY=your-openai-api-key
```

Or use your terminal's environment:

```bash
export MODEL_API_KEY="your-openai-api-key"
```

An exported key takes priority over the file. The .env file must still exist. Only MODEL_API_KEY is read automatically; keys named OPENAI_API_KEY or GEMINI_API_KEY need to be assigned to MODEL_API_KEY.

```bash
npm start
```

Open **http://127.0.0.1:4313**, or the address printed in the terminal. Keep it running. To check your key separately, use `npm run check:llm`; this makes a model request.

## Open interactive Rook

In a second terminal at the collection root (`samples/industry-agents`), prepare a fresh workspace:

```bash
npm run rook:prepare -- healthcare-agent /tmp/healthcare-agent
cd /tmp/healthcare-agent
rook login
rook project create "Agent Assurance"
rook
```

Choose another empty directory if it already exists. For an existing project, use `rook project use PROJECT_ID`.

Inside Rook, explore the supplied material, generate and review scenarios, then create and test the connection:

```text
/explore .
/generate --total 6 --class functional,non_functional,adversarial
/profile add http --from connection.md
/profile show http
/profile test http
/run --test --only <scenario-id> --profile http
/report
```

Use an ID from the generated scenarios. Files and run evidence stay under `.testmuai/rook/`. The `--test` run stays out of the hosted timeline. To share a separate run, use `/sync`, then `/run` without `--test`, then `/ui` for the hosted Web UI.

The [interactive guide](../../docs/testing-with-rook.md) covers service conditions, MCP and repair comparisons. For the supplied 18-case pack, run `npm run rook:setup` and `npm run rook` from the selected edition's folder.

## Common questions

| Question | Answer |
|---|---|
| Do I need to change the other .env values? | No. OpenAI, gpt-4.1-mini and this app's URL are preset. |
| Why isn't my new key being used? | Restart the app. An exported value wins, even if empty; `unset MODEL_API_KEY` returns to the file's value. |
| What if the key is missing? | Startup explains which setting is missing. It does not switch to scripted responses. |
| What if the provider returns an error? | Check your key, account permissions and available quota. |
| The port is already in use. | Run `export DEMO_PORT=14320` in both terminals before starting the app and Rook. |
| Rook says the workspace is not empty. | Choose an empty folder for exploration, or reopen the existing workspace with `rook`. |
| Can I share my configuration? | Share .env.example. Your .env, conversations and local reports are excluded from Git. |

For another provider, a separate workspace or connection changes, see [integration details](../../docs/rook-integration.md).
