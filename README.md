# pi-zenmux

一个精简的 [ZenMux](https://zenmux.ai) provider，用于 [pi](https://pi.dev)。

和官方 `@zenmux/pi-zenmux-oauth` 相比：

- 只注册少量手工维护的模型，元数据（`compat`、`promptCache`、`cost`、`maxTokens`）与 pi 内置的 Anthropic 模型一致，因此 pi 的 **prompt 缓存预热**、**自适应思考**、**严格工具调用**，以及会话中途修改系统消息、工具和思考档位时**保住缓存前缀**都可以正常工作。
- 请求直接走 pi 内置的 `anthropic-messages` 实现，不包装 `streamSimple`。
- 没有远程模型发现、没有本地模型缓存文件、没有动态客户端注册。
- provider id 是 `ZenMux`，pi 的 `/model` 列表和底栏都按这个写法显示。

## 安装

```bash
pi install git:github.com/lishouxian/pi-zenmux
```

如果之前装了官方插件，先移除，避免 `/model` 里出现两套 ZenMux 模型：

```bash
pi remove npm:@zenmux/pi-zenmux-oauth
```

然后在 pi 中 `/login ZenMux`，`/model` 选择模型。

### 从 0.1.x 升级

0.1.x 的 provider id 是小写的 `zenmux`，0.2.0 起改为 `ZenMux`。pi 按 id 保存凭据和默认模型，升级后需要：

1. 把 `~/.pi/agent/auth.json` 中的 `"zenmux"` 键改名为 `"ZenMux"`（或重新 `/login ZenMux`）；
2. 把 `~/.pi/agent/settings.json` 中 `defaultProvider`、`enabledModels` 里的 `zenmux` 改为 `ZenMux`；
3. 在 pi 中 `/reload`，再用 `/model` 重新选择模型。

旧会话记录里的模型是 `zenmux/…`，恢复旧会话时需要重新选一次模型。

## 模型

| ID | 说明 |
|---|---|
| `anthropic/claude-opus-5.5` | Claude Opus 5.5 |
| `anthropic/claude-sonnet-5.5` | Claude Sonnet 5.5 |

价格按 Anthropic 官方标价填写，仅用于 pi 的费用显示和缓存预热的收益估算（订阅用户不会据此计费）。

新增模型：在 `index.ts` 的 `MODELS` 里加一行 `claude(id, name, cost)`；非 Claude 模型请按实际能力单独填写元数据。

## 缓存预热

在 `~/.pi/agent/settings.json` 中设置：

```json
{ "cacheWarming": "idle" }
```

`/session` 中可查看预热状态。

## 开发

```bash
npm install                               # 类型检查所需的 devDependencies
npm run check                             # tsc --noEmit
pi -ne -e ./index.ts --list-models ZenMux
```

`pi install` 安装时使用 `--omit=dev`，不会安装这些开发依赖。

## License

MIT
