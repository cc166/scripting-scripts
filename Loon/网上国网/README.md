# 网上国网（Loon）

将 Primovist 发布的 `wsgw.sgmodule` 整理为 Loon 可导入插件，用于：

- 每日定时查询网上国网电费、电量和阶梯信息；
- 为 Scripting「网上国网」小组件提供 `api.wsgw-rewrite.com/electricity/bill/all` 接口响应。

## 安装

插件地址：

```text
https://raw.githubusercontent.com/cc166/scripting-scripts/main/Loon/%E7%BD%91%E4%B8%8A%E5%9B%BD%E7%BD%91/wsgw.lpx
```

导入后在插件参数中填写网上国网账号、密码。定时查询默认每天 09:00 执行，并在 0～300 秒内随机延迟；填 `0` 可关闭随机延迟。

如果只给 Scripting 小组件提供接口，可以关闭「定时查询」；接口脚本仍会工作。首次接口访问需要联网下载业务核心，之后保留本地缓存以应对 GitHub 临时不可用。

## Scripting 小组件

原 Scripting 项目：

```text
https://github.com/Primovist/Scripting/tree/main/网上国网
```

小组件请求 `http://api.wsgw-rewrite.com/electricity/bill/all` 时，Loon 需要开启本插件及 MITM。插件不内置 `DIRECT`，由主配置决定网络路由。

## 来源

- 配置参考：<https://github.com/Primovist/Scripting/blob/main/wsgw.sgmodule>
- 业务核心：<https://github.com/Yuheng0101/X/blob/main/Tasks/95598/95598.js>
- Scripting 项目：<https://github.com/Primovist/Scripting/tree/main/网上国网>

本目录是非官方 Loon 适配，不代表原作者发布或认可；上游业务逻辑与作者信息保留在文件注释及插件元数据中。
