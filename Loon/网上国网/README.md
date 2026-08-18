# 网上国网组件接口（Loon）

这是给 Scripting「网上国网」小组件使用的 Loon 接口插件，只处理：

```text
http://api.wsgw-rewrite.com/electricity/bill/all
```

插件**没有定时任务，也没有随机延迟**。小组件按自己的刷新与当日缓存逻辑请求接口；Loon 命中请求后执行 `95598.js`，返回电费、电量和阶梯数据。

## 安装

插件地址：

```text
https://raw.github.com/cc166/scripting-scripts/main/Loon/%E7%BD%91%E4%B8%8A%E5%9B%BD%E7%BD%91/wsgw.lpx
```

## 登录与 BoxJS

账号密码在 BoxJS 的「网上国网」项目中填写：

- `95598_username`：网上国网登录账号，通常为手机号；
- `95598_password`：网上国网登录密码；
- `95598_log_debug`：调试日志；
- `95598_recent_elc_fee`：近期用量；
- `95598_notify_type`：通知全部户号；
- `95598_bizrt`：脚本自动维护的登录态缓存，不要手动填写。

BoxJS **只是参数设置和持久化页面，不负责登录**。当 Scripting 小组件请求接口时，`95598.js` 从 Loon 的 `$persistentStore` 读取这些 BoxJS key，再登录网上国网并缓存登录态。

BoxJS 订阅：

```text
https://raw.githubusercontent.com/Yuheng0101/X/refs/heads/main/Tasks/boxjs.json
```

## 使用顺序

1. 在 BoxJS 添加上述订阅，进入「网上国网」填写账号和密码；
2. 在 Loon 导入并启用 `wsgw.lpx`，确保 MITM 已启用且证书受信任；
3. 在 Scripting 安装/运行「网上国网」小组件；小组件发起接口请求后自动获取数据。

插件不内置 `DIRECT`，网络路由由 Loon 主配置决定。

## 来源

- Scripting 小组件：<https://github.com/Primovist/Scripting>
- BoxJS 与业务核心：<https://github.com/Yuheng0101/X/tree/main/Tasks/95598>

本目录是非官方 Loon 适配，不代表原作者发布或认可；上游业务逻辑与作者信息保留在文件注释及插件元数据中。
