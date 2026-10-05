# pi-zenmux

一个精简的 [ZenMux](https://zenmux.ai) provider，用于 [pi](https://pi.dev)。

和官方 `@zenmux/pi-zenmux-oauth` 相比：

- 只注册少量手工维护的模型，元数据（`compat`、`promptCache`、`cost`、`maxTokens`）与 pi 内置的 Anthropic 模型一致，因此 pi 的 **prompt 缓存预热**、**自适应思考**、**严格工具调用**，以及会话中途修改系统消息、工具和思考档位时**保住缓存前缀**都可以正常工作。
- 请求直接走 pi 内置的 `anthropic-messages` 实现，不包装 `streamSimple`。
- 没有远程模型发现、没有本地模型缓存文件、没有动态客户端注册。
- provider id 仍是 `zenmux`，`~/.pi/agent/auth.json` 中已有的登录凭据可以直接沿用。

## 安装

```bash
pi install git:github.com/lishouxian/pi-zenmux
```

如果之前装了官方插件，先移除，避免两个扩展注册同一个 provider：

```bash
pi remove npm:@zenmux/pi-zenmux-oauth
```

然后在 pi 中 `/login zenmux`（已有凭据可跳过），`/model` 选择模型。

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
pi -ne -e ./index.ts --list-models zenmux
```

`pi install` 安装时使用 `--omit=dev`，不会安装这些开发依赖。

## License

MIT
