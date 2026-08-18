# 网上国网积分签到（Loon）

这是截图中 **@MaYIHEI** 的网上国网积分签到流程：从 App 抓取 Cookie 与签到请求，再由 Loon 定时复用。它不是 Primovist / Yuheng 的电费查询组件，也不需要在 BoxJS 填账号密码。

## 安装

Loon 插件：

```text
https://raw.githubusercontent.com/cc166/scripting-scripts/main/Loon/%E7%BD%91%E4%B8%8A%E5%9B%BD%E7%BD%91/sgcc.lpx
```

MaYIHEI 原版 BoxJS：

```text
https://raw.githubusercontent.com/MaYIHEI/paperclip/main/paperclip.boxjs.json
```

BoxJS 项目 ID 为 `paperclip.sgcc`，数据命名与截图完全一致：

- `sgcc_data`：抓到的 `t`、`userid` 和设备请求头；
- `sgcc_signin`：提交签到接口的加密请求体 `data / skey / path`；
- `sgcc_clear`：清除以上两项，运行一次签到脚本后自动复位；
- `sgcc_debug`：输出请求与响应调试日志。

其中 `sgcc_data`、`sgcc_signin` 是脚本自动写入的数据，不是手填项。BoxJS 页面只提供“清除 Cookie”和“调试模式”两个设置。

## 抓取与签到流程

1. 在 BoxJS 添加上述 MaYIHEI 订阅；
2. 在 Loon 导入并启用 `sgcc.lpx`，开启全局 MITM 总开关，安装并信任 Loon CA 证书；插件内的抓取脚本必须保持启用；
3. 完全退出后重新打开「网上国网」App，进入「我的 / 积分签到」；
4. 等待两条通知：
   - `✅ 网上国网 Cookie 获取成功`
   - `✅ 网上国网 签到请求已抓`
5. 回到 BoxJS 检查 `sgcc_data` 与 `sgcc_signin` 均已有数据；
6. 每天 `08:30` 由 Loon 自动执行签到，也可点 BoxJS 项目右上角运行按钮手动执行。

如果像截图一样只有 `sgcc_data` 有值、`sgcc_signin` 显示“无数据”，说明抓取只完成了一半。保持插件与 MITM 开启，重新进入积分签到页，直到收到第二条“签到请求已抓”通知。

## 实现

- 抓取域名：`csc-service.sgcc.com.cn:28630`；
- 签到接口：`/osg-omgmt1042/member/m1/0103514`；
- `sgcc.cookie.js` 保存身份请求头与原签到请求；
- `sgcc.js` 每次重算时间戳和 SM3 `sign` 后提交；
- 不保存或填写账号密码；
- 没有随机延迟；
- Cookie 失效后，重新进入积分签到页抓取即可。

## 来源

- 上游项目：<https://github.com/MaYIHEI/paperclip/tree/main/app/sgcc>
- 原抓取脚本：<https://raw.githubusercontent.com/MaYIHEI/paperclip/main/app/sgcc/sgcc.cookie.js>
- 原签到脚本：<https://raw.githubusercontent.com/MaYIHEI/paperclip/main/app/sgcc/sgcc.js>
- 原 BoxJS：<https://raw.githubusercontent.com/MaYIHEI/paperclip/main/paperclip.boxjs.json>

本目录只提供 Loon `.lpx` 封装，业务脚本与 BoxJS 均直接使用 MaYIHEI 原版，避免数据键和流程分叉。
