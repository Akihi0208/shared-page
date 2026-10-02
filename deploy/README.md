# 雾灯手帐部署

这套部署把网页和 MCP 都限制在服务器本机端口，然后只用 Tailscale 的独立 `8443` HTTPS 端口发布网页。它不会改 nginx、Caddy 或现有的 `443` 配置。

## 安装或更新

在仓库根目录运行：

```bash
chmod +x deploy/install.sh deploy/publish-private.sh
sudo ./deploy/install.sh
./deploy/publish-private.sh
```

脚本第一次安装时会自动生成访问密钥，之后更新会保留原来的密钥和 `/opt/wudeng-handbook/data` 数据。

查看状态：

```bash
systemctl status wudeng-web wudeng-mcp
tailscale serve status
```

网页在服务器本机的地址是 `http://127.0.0.1:8791`，MCP 是 `http://127.0.0.1:8792/mcp`。手机地址由 `publish-private.sh` 打印，默认形如 `https://服务器名.ts.net:8443/`。

网页第一次打开，点右上角齿轮，把下面命令显示的密钥填进去：

```bash
sudo sed -n 's/^CALENDAR_TOKEN=//p' /etc/wudeng-handbook/wudeng.env
```

密钥只保存在设备浏览器里。不要截图或发到群聊。

## 数据和回退

- 数据库：`/opt/wudeng-handbook/data/calendar.db`
- 页面图：`/opt/wudeng-handbook/data/pages/`
- 服务配置：`/etc/wudeng-handbook/wudeng.env`

更新脚本不会删除这些内容。部署新版本前可以直接复制 `data` 目录做备份。

