# @kaneo/api

The Hono API: domain behavior, authorization, database access, events, integrations,
MCP HTTP routes, and WebSockets. See the repository `AGENTS.md` for the operating
guide and `apps/docs` for user-facing documentation.

```bash
pnpm --filter @kaneo/api dev            # run the API
pnpm --filter @kaneo/api test           # unit tests (tests/api)
pnpm --filter @kaneo/api test:integration  # PostgreSQL-backed tests (tests/api-integration)
pnpm --filter @kaneo/api db:generate    # generate a migration after a schema change
pnpm --filter @kaneo/api openapi:export # refresh apps/docs/openapi.json
```

## Agent activity connector

External agents — capsule stands, CI runners, autonomous coding agents — report what
they are doing on a task so boards can show it live. Agents are not people: they
authenticate with an API key, never a session.

### Get a key

An agent uses an API key belonging to a Kaneo user. Create one in **Settings →
Account → API Keys** and copy it once; it is never shown again. The agent gets
exactly the access that user has: the key's owner must be a member of the task's
workspace with the `task: update` permission (member role or higher). A scoped key
must include `task: update` as well.

Send the key as `x-api-key: <key>` or `Authorization: Bearer <key>`.

### Report a status

`POST /api/agent-activity`

| Field       | Type    | Required | Notes                                                          |
| ----------- | ------- | -------- | -------------------------------------------------------------- |
| `taskId`    | string  | yes      | Task the agent is working on                                    |
| `agent`     | string  | yes      | Display name, e.g. `капсула s03 · постановщик` (max 120)        |
| `agentId`   | string  | no       | Stable id of the agent; **send it** so ticks deduplicate cleanly |
| `state`     | enum    | yes      | `started` \| `progress` \| `blocked` \| `finished` \| `failed`  |
| `message`   | string  | no       | What is happening right now (max 2000)                          |
| `progress`  | number  | no       | 0–100                                                           |
| `avatarUrl` | string  | no       | Absolute URL                                                    |
| `url`       | string  | no       | Absolute URL of the live session or log                         |

```bash
curl -X POST https://your-kaneo-instance.com/api/agent-activity \
  -H "x-api-key: $KANEO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "cm7x2k9p0000abcdef123456",
    "agent": "капсула s03 · постановщик",
    "agentId": "capsule-s03",
    "state": "progress",
    "message": "Прогоняю тесты после правки роутера",
    "progress": 60,
    "url": "https://capsules.example.com/s03/live"
  }'
```

Responses: `200` with the agent's current state, `400` invalid payload, `401` missing
or invalid key, `403` no access to the task's workspace or missing `task: update`,
`404` no such task.

Ticking every few seconds is the expected usage. Each agent keeps **one** activity row
per task, upserted on `(task_id, external_source, external_url)`, so a long run leaves a
single line in the task history instead of thousands. Two agents on one task keep two
rows; the same agent re-running a task reuses its row.

### Read current state

`GET /api/agent-activity/:projectId` returns every agent lane in a project. Boards call
it once on load, then follow the WebSocket.

### Live updates

Every tick is broadcast to `GET /api/ws/:projectId` subscribers as an `AGENT_ACTIVITY`
message. Unlike the other WebSocket messages, it carries its state inline so a client
renders the badge without refetching the task:

```json
{
  "type": "AGENT_ACTIVITY",
  "projectId": "project-id",
  "taskId": "task-id",
  "agentActivity": {
    "activityId": "activity-id",
    "taskId": "task-id",
    "projectId": "project-id",
    "agent": "капсула s03 · постановщик",
    "agentId": "capsule-s03",
    "agentKey": "capsule-s03",
    "state": "progress",
    "message": "Прогоняю тесты после правки роутера",
    "progress": 60,
    "avatarUrl": null,
    "url": "https://capsules.example.com/s03/live",
    "updatedAt": "2026-08-26T09:12:44.101Z"
  }
}
```

`agentKey` is the deduplication identity (`agentId` when supplied, otherwise a
normalized display name). Ticks are batched over 100 ms: repeated ticks from one agent
on one task collapse to the latest state, while different agents stay separate. Nobody
is excluded from delivery — an observing board is never the initiator of an agent tick.
