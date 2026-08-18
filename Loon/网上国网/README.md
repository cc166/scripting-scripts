# 网上国网（Loon）

这是将 Primovist 原版 [`wsgw.sgmodule`](https://raw.githubusercontent.com/Primovist/Scripting/refs/heads/main/wsgw.sgmodule) 按原功能迁移到 Loon 的版本，用于 Scripting「网上国网」小组件查询电费、电量与余量，并保留原模块的可选定时查询。

## 安装地址

Loon 插件：

```text
https://raw.githubusercontent.com/cc166/scripting-scripts/main/Loon/%E7%BD%91%E4%B8%8A%E5%9B%BD%E7%BD%91/wsgw-loon.lpx
```

直接使用 Primovist 原版 BoxJS，不另建配置：

```text
https://raw.githubusercontent.com/Primovist/Scripting/refs/heads/main/boxjs.json
```

BoxJS 项目 ID 为 `yuheng.95598.web`，脚本读取的数据名与原版完全一致：

- `95598_log_debug`：调试日志；
- `95598_recent_elc_fee`：近期用量；
- `95598_notify_type`：通知全部绑定户号；
- `95598_username`：网上国网账号，通常为手机号；
- `95598_password`：网上国网密码；
- `95598_bizrt`：脚本维护的登录态缓存；
- `95598_bindInfo`：脚本维护的绑定户号缓存。

最后两项由脚本自动维护，不要手动填写。

## 首次使用

1. 在 BoxJS 添加上面的 Primovist 原版订阅；
2. 打开 BoxJS 的「网上国网」，填写账号、密码和需要的业务开关；
3. 在 Loon 导入并启用 `wsgw-loon.lpx`，开启 MITM 并信任 Loon CA 证书；
4. 在 Scripting 安装并运行网上国网小组件。小组件请求 `api.wsgw-rewrite.com/electricity/bill/all` 时，Loon 会执行原 `95598.js` 登录并返回数据；
5. 如需每日主动查询通知，在 Loon 插件参数中开启“启用定时查询”。默认时间为每天 `09:00`。

## 与原 Surge 模块的对应关系

| Primovist `wsgw.sgmodule` | Loon `wsgw-loon.lpx` |
|---|---|
| `electricity/bill/all` 接口重写 | 原正则、原 `95598.js`，保持不变 |
| `INFORM="#"` | `cronEnabled=false`，定时任务默认关闭 |
| `CRONEXP="0 9 * * *"` | `cronExp="0 9 * * *"` |
| `TIMEOUT=60` | `scriptTimeout=60` |
| `USERNAME / PASSWORD / 三个业务开关` | 直接读取原 BoxJS 的 `95598_*` 数据 |
| `api.wsgw-rewrite.com` MITM | 保持不变 |

原模块没有随机延迟，本插件也没有添加。插件不包含 `generic`、`[Rule]` 或 `DIRECT`，网络路由由 Loon 主配置决定。

Loon 参数里没有重复放账号、密码和三个业务开关：原 `95598.js` 会优先使用 `$argument`，空参数反而可能覆盖 BoxJS 已保存的数据。统一由 Primovist 原版 BoxJS 管理，才能确保数据名、缓存和运行结果不分叉。

## 来源

- Primovist 原 Surge 模块：<https://raw.githubusercontent.com/Primovist/Scripting/refs/heads/main/wsgw.sgmodule>
- Primovist 原 BoxJS：<https://raw.githubusercontent.com/Primovist/Scripting/refs/heads/main/boxjs.json>
- Yuheng 原业务脚本：<https://raw.githubusercontent.com/Yuheng0101/X/main/Tasks/95598/95598.js>
- Scripting 项目：<https://github.com/Primovist/Scripting>

本目录只做 Surge → Loon 配置语法迁移，不镜像或改写 `95598.js`，避免业务核心与上游分叉。
