# Malicious Preview Corpus

<script>window.electron?.ipcRenderer?.send('pwn')</script>

<img src="https://attacker.invalid/track" onerror="alert(1)" style="background:url(https://attacker.invalid/css)">

<a href="javascript:alert(1)">javascript URL</a>

<iframe src="https://attacker.invalid/"></iframe>

![Traversal](../../../../Windows/System32/drivers/etc/hosts)
![HTTP](http://attacker.invalid/image.png)

```mermaid
flowchart TD
  A["<img src=x onerror=alert(1)>"] --> B[Test]
```

$\href{javascript:alert(1)}{unsafe}$
