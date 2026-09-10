# Examples

```sh
./run make examples/request.json
./run workflow examples/workflow.json my-saved-request
```

Both create five local prompt variations with deterministic silence/static retries. `make` prints variants and attempts; `workflow` prints the complete durable job and reattaches when the same input/key is repeated.

`qa-signal.json` is compatible with offline `analyze`; semantic QA options are removed. `cut.json` illustrates explicit bounds; edit them to fit the original recording. An empty cut request selects the first active region and normalizes its peak to −3 dBFS.

For one explicit cloud generation, set `provider` to `elevenlabs` in workflow JSON. In Studio, **Recreate with ElevenLabs** uses a selected take's exact prompt automatically. See [usage](../docs/usage.md).
